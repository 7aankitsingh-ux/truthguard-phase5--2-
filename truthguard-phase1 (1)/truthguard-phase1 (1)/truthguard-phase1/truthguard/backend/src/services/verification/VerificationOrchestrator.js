import { query } from '../../db.js';
import { audit } from '../audit.js';
import { logger } from '../../logger.js';
import { TextVerificationService } from './TextVerificationService.js';
import { ImageVerificationService } from './ImageVerificationService.js';
import { VideoVerificationService } from './VideoVerificationService.js';
import { URLVerificationService } from './URLVerificationService.js';
import { EvidenceRetrievalService } from './EvidenceRetrievalService.js';
import { MediaProcessingService } from './MediaProcessingService.js';

export class VerificationOrchestrator {
  constructor(services = {}) {
    this.evidenceService = services.evidenceService || new EvidenceRetrievalService();
    this.mediaService = services.mediaService || new MediaProcessingService();
    this.textService = services.textService || new TextVerificationService(this.evidenceService);
    this.imageService = services.imageService || new ImageVerificationService(this.mediaService);
    this.videoService = services.videoService || new VideoVerificationService(this.mediaService);
    this.urlService = services.urlService || new URLVerificationService(this.textService);

    // Active in-memory tracking of background task promises
    this.activeJobs = new Map();
  }

  /**
   * Submits a verification request and orchestrates execution.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {'text'|'image'|'video'|'url'} params.type
   * @param {string} [params.inputText]
   * @param {string} [params.inputUrl]
   * @param {Buffer} [params.fileBuffer]
   * @param {string} [params.filePath]
   * @param {string} [params.originalName]
   * @param {string} [params.mimeType]
   * @param {boolean} [params.asyncProcessing=false]
   * @param {Object} [params.req] - Express request for auditing
   * @returns {Promise<Object>}
   */
  async submitVerification({
    userId,
    type,
    inputText,
    inputUrl,
    fileBuffer,
    filePath,
    originalName,
    mimeType,
    asyncProcessing = false,
    req = null,
  }) {
    if (!userId) throw new Error('User ID is required');
    if (!['text', 'image', 'video', 'url'].includes(type)) {
      throw new Error(`Invalid verification type: ${type}`);
    }

    // 1. Create DB request entry
    const { rows } = await query(
      `INSERT INTO verification_requests (user_id, type, input_text, input_url, status)
       VALUES ($1, $2, $3, $4, 'processing')
       RETURNING id, user_id, type, status, created_at`,
      [userId, type, inputText || null, inputUrl || null]
    );
    const request = rows[0];

    // If file is provided, record in uploaded_files
    if (fileBuffer || filePath) {
      const sha256 = await this.mediaService.computeHash(fileBuffer || filePath);
      const sizeBytes = fileBuffer ? fileBuffer.length : (await (await import('node:fs/promises')).stat(filePath)).size;
      const safeOriginalName = this.mediaService.sanitizeFilename(originalName || 'file');
      const storageKey = `${request.id}_${safeOriginalName}`;

      await query(
        `INSERT INTO uploaded_files (user_id, request_id, original_name, mime_type, size_bytes, storage_key, sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, request.id, safeOriginalName, mimeType || 'application/octet-stream', sizeBytes, storageKey, sha256]
      );
    }

    await audit(userId, `verification.submit.${type}`, req, { requestId: request.id });

    // 2. Decide whether to process synchronously or via background job
    // Videos are always processed in background due to ffmpeg/ffprobe duration
    const isAsync = asyncProcessing || type === 'video';

    if (isAsync) {
      // Launch background worker
      const jobPromise = this._processJob({
        requestId: request.id,
        userId,
        type,
        inputText,
        inputUrl,
        fileBuffer,
        filePath,
        originalName,
        req,
      });

      this.activeJobs.set(request.id, jobPromise);

      // Return immediate response with processing status
      return {
        id: request.id,
        userId: request.user_id,
        type: request.type,
        status: 'processing',
        createdAt: request.created_at,
        isAsync: true,
        message: 'Verification task submitted and is running in the background.',
      };
    }

    // Synchronous execution (text, url, image)
    try {
      const result = await this._executeVerification({
        requestId: request.id,
        type,
        inputText,
        inputUrl,
        fileBuffer,
        filePath,
        originalName,
      });

      const resultId = await this._saveCompletedResult(request.id, userId, result, req);

      return {
        id: request.id,
        userId: request.user_id,
        type: request.type,
        status: 'completed',
        createdAt: request.created_at,
        resultId,
        result,
        error: null,
      };
    } catch (err) {
      await this._saveFailedResult(request.id, userId, err.message, req);
      throw err;
    }
  }

  /**
   * Internal worker function that runs a verification pipeline.
   */
  async _executeVerification({ requestId, type, inputText, inputUrl, fileBuffer, filePath, originalName }) {
    switch (type) {
      case 'text':
        return await this.textService.verifyText(inputText);

      case 'url':
        return await this.urlService.verifyUrl(inputUrl);

      case 'image':
        return await this.imageService.verifyImage(fileBuffer, originalName);

      case 'video':
        return await this.videoService.verifyVideo(filePath, originalName, requestId);

      default:
        throw new Error(`Unhandled verification type: ${type}`);
    }
  }

  /**
   * Background job executor.
   */
  async _processJob({ requestId, userId, type, inputText, inputUrl, fileBuffer, filePath, originalName, req }) {
    try {
      logger.info({ requestId, type }, 'Background verification job started');
      const result = await this._executeVerification({
        requestId,
        type,
        inputText,
        inputUrl,
        fileBuffer,
        filePath,
        originalName,
      });

      await this._saveCompletedResult(requestId, userId, result, req);
      logger.info({ requestId, type, verdict: result.verdict }, 'Background verification job completed');
    } catch (err) {
      logger.error({ requestId, type, err: err.message }, 'Background verification job failed');
      await this._saveFailedResult(requestId, userId, err.message, req);
    } finally {
      this.activeJobs.delete(requestId);
    }
  }

  /**
   * Saves completed results and evidence sources to DB.
   */
  async _saveCompletedResult(requestId, userId, result, req) {
    // 1. Update verification_requests status
    await query(
      `UPDATE verification_requests
       SET status = 'completed', updated_at = now()
       WHERE id = $1`,
      [requestId]
    );

    // 2. Insert into verification_results
    const { rows: resultRows } = await query(
      `INSERT INTO verification_results (request_id, verdict, confidence, summary, model_info)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (request_id) DO UPDATE
       SET verdict = EXCLUDED.verdict, confidence = EXCLUDED.confidence,
           summary = EXCLUDED.summary, model_info = EXCLUDED.model_info
       RETURNING id`,
      [
        requestId,
        result.verdict || 'unverified',
        result.confidence || 0.5,
        result.summary || '',
        JSON.stringify(result),
      ]
    );

    const resultId = resultRows[0]?.id;

    // 3. Insert retrieved evidence sources
    if (resultId && Array.isArray(result.evidenceSources)) {
      for (const src of result.evidenceSources) {
        if (src.url) {
          const stance = ['supports', 'contradicts', 'neutral'].includes(src.stance) ? src.stance : 'neutral';
          await query(
            `INSERT INTO evidence_sources (result_id, url, title, publisher, stance)
             VALUES ($1, $2, $3, $4, $5)`,
            [resultId, src.url, src.title || null, src.publisher || null, stance]
          );
        }
      }
    }

    await audit(userId, 'verification.complete', req, {
      requestId,
      verdict: result.verdict,
      confidence: result.confidence,
    });

    return resultId;
  }

  /**
   * Saves failure state to DB.
   */
  async _saveFailedResult(requestId, userId, errorMessage, req) {
    try {
      await query(
        `UPDATE verification_requests
         SET status = 'failed', error_message = $2, updated_at = now()
         WHERE id = $1`,
        [requestId, errorMessage || 'Verification failed']
      );
      await audit(userId, 'verification.failed', req, { requestId, error: errorMessage });
    } catch (dbErr) {
      logger.error({ dbErr: dbErr.message }, 'Failed to save failure status to DB');
    }
  }

  /**
   * Retrieves status and full results for a verification request.
   *
   * @param {string} requestId
   * @param {string} userId
   * @returns {Promise<Object|null>}
   */
  async getRequest(requestId, userId) {
    const { rows } = await query(
      `SELECT r.id, r.user_id, r.type, r.input_text, r.input_url, r.status,
              r.error_message, r.created_at, r.updated_at,
              res.id as result_id, res.verdict, res.confidence, res.summary, res.model_info
       FROM verification_requests r
       LEFT JOIN verification_results res ON res.request_id = r.id
       WHERE r.id = $1 AND r.user_id = $2`,
      [requestId, userId]
    );

    if (rows.length === 0) return null;
    const req = rows[0];

    // Fetch evidence sources if completed
    let evidenceSources = [];
    if (req.result_id) {
      const { rows: sourceRows } = await query(
        `SELECT id, url, title, publisher, stance, retrieved_at
         FROM evidence_sources WHERE result_id = $1`,
        [req.result_id]
      );
      evidenceSources = sourceRows;
    }

    // Fetch uploaded file if any
    const { rows: fileRows } = await query(
      `SELECT id, original_name, mime_type, size_bytes, sha256, created_at
       FROM uploaded_files WHERE request_id = $1`,
      [req.id]
    );

    return {
      id: req.id,
      userId: req.user_id,
      type: req.type,
      status: req.status,
      resultId: req.result_id || null,
      errorMessage: req.error_message || null,
      inputText: req.input_text,
      inputUrl: req.input_url,
      createdAt: req.created_at,
      updatedAt: req.updated_at,
      uploadedFile: fileRows[0] || null,
      result: req.model_info
        ? typeof req.model_info === 'string'
          ? JSON.parse(req.model_info)
          : req.model_info
        : req.verdict
        ? {
            verdict: req.verdict,
            confidence: Number(req.confidence),
            summary: req.summary,
            evidenceSources,
          }
        : null,
    };
  }
}

