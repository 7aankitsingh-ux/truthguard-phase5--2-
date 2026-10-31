import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../errors.js';
import { shareLimiter } from '../middleware/security.js';
import { audit } from '../services/audit.js';
import { ReportManagementService } from '../services/verification/ReportManagementService.js';
import { VerificationOrchestrator } from '../services/verification/VerificationOrchestrator.js';
import { query } from '../db.js';

const router = Router();
const reportService = new ReportManagementService();
const orchestrator = new VerificationOrchestrator();

/**
 * PUBLIC ENDPOINT:
 * GET /api/reports/shared/:shareToken
 * Allows public access to a specific report via unguessable share token.
 * Does not expose user details or any other private records.
 */
router.get('/shared/:shareToken', shareLimiter, async (req, res, next) => {
  try {
    const report = await reportService.getSharedReport(req.params.shareToken);
    if (!report) {
      throw new AppError(404, 'not_found', 'Shared report not found or link has been revoked');
    }
    res.json(report);
  } catch (err) {
    next(err);
  }
});

// All subsequent report management routes require authentication
router.use(requireAuth);

/**
 * GET /api/reports
 * Lists user's private saved reports with search, filters, sorting, and pagination.
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      search,
      verdict,
      access,
      fromDate,
      toDate,
      sort = 'newest',
      page = 1,
      limit = 10,
    } = req.query;

    const conditions = ['sr.user_id = $1'];
    const params = [userId];
    let idx = 2;

    // Search filter across title, notes, or input content
    if (search && search.trim()) {
      conditions.push(`(sr.title ILIKE $${idx} OR sr.notes ILIKE $${idx} OR r.input_text ILIKE $${idx} OR r.input_url ILIKE $${idx})`);
      params.push(`%${search.trim()}%`);
      idx++;
    }

    // Verdict filter
    if (verdict && verdict !== 'all') {
      const v = verdict.toUpperCase();
      if (v === 'SUPPORTED') {
        conditions.push(`res.verdict IN ('SUPPORTED', 'verified_true', 'authentic_unmodified')`);
      } else if (v === 'CONTRADICTED') {
        conditions.push(`res.verdict IN ('CONTRADICTED', 'verified_false', 'manipulated', 'ai_generated')`);
      } else if (v === 'MIXED') {
        conditions.push(`res.verdict IN ('MIXED', 'partially_true', 'misleading')`);
      } else if (v === 'UNVERIFIED') {
        conditions.push(`res.verdict IN ('UNVERIFIED', 'unverified', 'inconclusive')`);
      }
    }

    // Access filter (public / shared vs private)
    if (access && access !== 'all') {
      if (access === 'public') {
        conditions.push('sr.is_public = true');
      } else if (access === 'private') {
        conditions.push('(sr.is_public = false OR sr.is_public IS NULL)');
      }
    }

    // Date filters
    if (fromDate && !isNaN(new Date(fromDate).getTime())) {
      conditions.push(`sr.created_at >= $${idx}`);
      params.push(new Date(fromDate).toISOString());
      idx++;
    }
    if (toDate && !isNaN(new Date(toDate).getTime())) {
      const endOfDay = new Date(new Date(toDate).setHours(23, 59, 59, 999)).toISOString();
      conditions.push(`sr.created_at <= $${idx}`);
      params.push(endOfDay);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    // 1. Total count
    const { rows: countRows } = await query(
      `SELECT count(*)::int as total
       FROM saved_reports sr
       JOIN verification_results res ON res.id = sr.result_id
       JOIN verification_requests r ON r.id = res.request_id
       WHERE ${whereClause}`,
      params
    );

    const totalCount = countRows[0]?.total || 0;
    const cleanLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const totalPages = Math.ceil(totalCount / cleanLimit) || 1;
    const cleanPage = Math.max(1, Math.min(totalPages, parseInt(page, 10) || 1));
    const offset = (cleanPage - 1) * cleanLimit;

    // Sorting
    let orderByClause = 'sr.created_at DESC';
    if (sort === 'oldest') orderByClause = 'sr.created_at ASC';
    else if (sort === 'title_asc') orderByClause = 'sr.title ASC';
    else if (sort === 'title_desc') orderByClause = 'sr.title DESC';

    // 2. Query paginated results
    const { rows } = await query(
      `SELECT sr.id, sr.title, sr.result_id, sr.share_token, sr.is_public, sr.notes, sr.created_at,
              r.id as request_id, r.type, r.input_text, r.input_url,
              res.verdict, res.confidence, res.summary
       FROM saved_reports sr
       JOIN verification_results res ON res.id = sr.result_id
       JOIN verification_requests r ON r.id = res.request_id
       WHERE ${whereClause}
       ORDER BY ${orderByClause}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, cleanLimit, offset]
    );

    res.json({
      items: rows,
      pagination: {
        page: cleanPage,
        limit: cleanLimit,
        totalCount,
        totalPages,
        hasNext: cleanPage < totalPages,
        hasPrev: cleanPage > 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/reports
 * Saves a report to user's library.
 */
router.post('/', async (req, res, next) => {
  try {
    const { resultId, requestId, title, notes } = req.body || {};
    let targetResultId = resultId;
    if (!targetResultId && requestId) {
      const { rows } = await query(
        'SELECT id FROM verification_results WHERE request_id = $1',
        [requestId]
      );
      if (rows.length > 0) {
        targetResultId = rows[0].id;
      }
    }

    if (!targetResultId) {
      throw new AppError(400, 'validation_error', 'resultId or requestId is required');
    }
    const report = await reportService.saveReport(req.user.id, targetResultId, title, notes);
    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/:id
 * Retrieves single private saved report.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT sr.id, sr.title, sr.result_id, sr.share_token, sr.is_public, sr.notes, sr.created_at,
              r.id as request_id, r.type, r.input_text, r.input_url,
              res.verdict, res.confidence, res.summary, res.model_info
       FROM saved_reports sr
       JOIN verification_results res ON res.id = sr.result_id
       JOIN verification_requests r ON r.id = res.request_id
       WHERE sr.id = $1 AND sr.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      throw new AppError(404, 'not_found', 'Report not found or unauthorized');
    }

    const rep = rows[0];
    const { rows: sourceRows } = await query(
      `SELECT id, url, title, publisher, stance, retrieved_at FROM evidence_sources WHERE result_id = $1`,
      [rep.result_id]
    );

    const parsedResult = rep.model_info
      ? typeof rep.model_info === 'string'
        ? JSON.parse(rep.model_info)
        : rep.model_info
      : { verdict: rep.verdict, confidence: Number(rep.confidence), summary: rep.summary };

    res.json({
      id: rep.id,
      title: rep.title,
      notes: rep.notes,
      shareToken: rep.share_token,
      isPublic: Boolean(rep.is_public),
      createdAt: rep.created_at,
      requestId: rep.request_id,
      type: rep.type,
      submittedContent: rep.input_text || rep.input_url,
      result: {
        ...parsedResult,
        evidenceSources: parsedResult.evidenceSources || sourceRows,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/reports/:id
 * Updates report title and/or notes.
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { title, notes } = req.body || {};
    const updated = await reportService.updateReport(req.user.id, req.params.id, { title, notes });
    await audit(req.user.id, 'report.update', req, { reportId: req.params.id, title, notes });
    res.json(updated);
  } catch (err) {
    if (err.message?.includes('not found') || err.message?.includes('unauthorized')) {
      return next(new AppError(404, 'not_found', 'Report not found or unauthorized'));
    }
    next(err);
  }
});

/**
 * DELETE /api/reports/:id
 * Deletes user's saved report.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await reportService.deleteReport(req.user.id, req.params.id);
    res.json(result);
  } catch (err) {
    if (err.message?.includes('not found') || err.message?.includes('unauthorized')) {
      return next(new AppError(404, 'not_found', 'Report not found or unauthorized'));
    }
    next(err);
  }
});

/**
 * POST /api/reports/:id/share
 * Generates a secure share link for the report.
 */
router.post('/:id/share', async (req, res, next) => {
  try {
    const shareInfo = await reportService.generateShareLink(req.user.id, req.params.id);
    res.json(shareInfo);
  } catch (err) {
    if (err.message?.includes('not found') || err.message?.includes('unauthorized')) {
      return next(new AppError(404, 'not_found', 'Report not found or unauthorized'));
    }
    next(err);
  }
});

/**
 * DELETE /api/reports/:id/share
 * Revokes public access for the report.
 */
router.delete('/:id/share', async (req, res, next) => {
  try {
    const result = await reportService.revokeShareLink(req.user.id, req.params.id);
    res.json(result);
  } catch (err) {
    if (err.message?.includes('not found') || err.message?.includes('unauthorized')) {
      return next(new AppError(404, 'not_found', 'Report not found or unauthorized'));
    }
    next(err);
  }
});

/**
 * GET /api/reports/:id/pdf
 * Downloads report as an official PDF document.
 */
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT sr.id, sr.title, r.id as request_id, r.type, r.input_text, r.input_url, r.created_at,
              res.id as result_id, res.verdict, res.confidence, res.summary, res.model_info
       FROM saved_reports sr
       JOIN verification_results res ON res.id = sr.result_id
       JOIN verification_requests r ON r.id = res.request_id
       WHERE sr.id = $1 AND sr.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      throw new AppError(404, 'not_found', 'Report not found or unauthorized');
    }

    const rep = rows[0];
    const { rows: sourceRows } = await query(
      `SELECT id, url, title, publisher, stance, retrieved_at FROM evidence_sources WHERE result_id = $1`,
      [rep.result_id]
    );

    const parsedResult = rep.model_info
      ? typeof rep.model_info === 'string'
        ? JSON.parse(rep.model_info)
        : rep.model_info
      : { verdict: rep.verdict, confidence: Number(rep.confidence), summary: rep.summary };

    parsedResult.evidenceSources = parsedResult.evidenceSources || sourceRows;

    const pdfBuffer = await reportService.generatePdfReport({
      id: rep.id,
      requestId: rep.request_id,
      type: rep.type,
      inputText: rep.input_text,
      inputUrl: rep.input_url,
      createdAt: rep.created_at,
      result: parsedResult,
    });

    const safeTitle = (rep.title || 'Report').replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="TruthGuard_${safeTitle}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/:id/summary
 * Formats report summary text for clipboard copying.
 */
router.get('/:id/summary', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT sr.id, sr.title, r.id as request_id, r.type, r.input_text, r.input_url, r.created_at,
              res.id as result_id, res.verdict, res.confidence, res.summary, res.model_info
       FROM saved_reports sr
       JOIN verification_results res ON res.id = sr.result_id
       JOIN verification_requests r ON r.id = res.request_id
       WHERE sr.id = $1 AND sr.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      throw new AppError(404, 'not_found', 'Report not found or unauthorized');
    }

    const rep = rows[0];
    const parsedResult = rep.model_info
      ? typeof rep.model_info === 'string'
        ? JSON.parse(rep.model_info)
        : rep.model_info
      : { verdict: rep.verdict, confidence: Number(rep.confidence), summary: rep.summary };

    const summary = reportService.formatReportSummary({
      id: rep.id,
      requestId: rep.request_id,
      result: parsedResult,
    });

    res.json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;

