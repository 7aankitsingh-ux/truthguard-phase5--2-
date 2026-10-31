import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { verifyLimiter } from '../middleware/security.js';
import { AppError } from '../errors.js';
import { config } from '../config.js';
import { VerificationOrchestrator } from '../services/verification/VerificationOrchestrator.js';

const router = Router();
const orchestrator = new VerificationOrchestrator();

const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.mkv', '.avi'];

// Multer memory storage for images (max 25MB)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext && !ALLOWED_IMAGE_EXTS.includes(ext)) {
      return cb(new AppError(400, 'unsupported_file', `Unsupported image file extension (${ext}). Allowed: JPG, PNG, WebP.`));
    }
    cb(null, true);
  },
});

// Multer disk storage for videos (max configured MB)
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(config.STORAGE_DIR, 'videos');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}`);
  },
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext && !ALLOWED_VIDEO_EXTS.includes(ext)) {
      return cb(new AppError(400, 'unsupported_file', `Unsupported video file extension (${ext}). Allowed: MP4, WebM, MOV, MKV, AVI.`));
    }
    cb(null, true);
  },
});

/**
 * POST /api/verify/text
 * Submits text or long paragraphs for claim extraction and verification.
 */
router.post(
  '/text',
  verifyLimiter,
  validate(
    z.object({
      text: z.string().min(1, 'Text to verify is required').max(30000, 'Text exceeds maximum length of 30,000 characters'),
    })
  ),
  async (req, res, next) => {
    try {
      const response = await orchestrator.submitVerification({
        userId: req.user.id,
        type: 'text',
        inputText: req.body.text,
        req,
      });
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/verify/url
 * Submits a URL for SSRF-protected safe retrieval and fact checking.
 */
router.post(
  '/url',
  verifyLimiter,
  validate(
    z.object({
      url: z.string().url('A valid HTTP or HTTPS URL is required').max(2048),
    })
  ),
  async (req, res, next) => {
    try {
      const response = await orchestrator.submitVerification({
        userId: req.user.id,
        type: 'url',
        inputUrl: req.body.url,
        req,
      });
      res.json(response);
    } catch (err) {
      if (err.name === 'SSRFProtectionError') {
        return next(new AppError(400, 'ssrf_blocked', err.message));
      }
      next(err);
    }
  }
);

/**
 * POST /api/verify/image
 * Uploads image (JPG, JPEG, PNG, WebP) for metadata and manipulation analysis.
 */
router.post(
  '/image',
  verifyLimiter,
  (req, res, next) => {
    imageUpload.single('image')(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(400, 'file_too_large', 'Image exceeds maximum allowed size of 25MB'));
      }
      if (err) return next(err);
      next();
    });
  },
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        throw new AppError(400, 'file_missing', 'Image file is required under field "image"');
      }

      const response = await orchestrator.submitVerification({
        userId: req.user.id,
        type: 'image',
        fileBuffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        req,
      });
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/verify/video
 * Uploads video (MP4, WebM, MOV, MKV, AVI) for background keyframe and anomaly processing.
 */
router.post(
  '/video',
  verifyLimiter,
  (req, res, next) => {
    videoUpload.single('video')(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(400, 'file_too_large', `Video exceeds maximum allowed size of ${config.MAX_FILE_SIZE_MB}MB`));
      }
      if (err) return next(err);
      next();
    });
  },
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        throw new AppError(400, 'file_missing', 'Video file is required under field "video"');
      }

      const response = await orchestrator.submitVerification({
        userId: req.user.id,
        type: 'video',
        filePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        asyncProcessing: true,
        req,
      });
      // Return 202 Accepted for background processing
      res.status(202).json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/verify/:id
 * Retrieves status and complete result of a verification request.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const request = await orchestrator.getRequest(req.params.id, req.user.id);
    if (!request) {
      throw new AppError(404, 'not_found', 'Verification request not found');
    }
    res.json(request);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/verify/:id/keyframes/:filename
 * Serves extracted keyframe image safely.
 */
router.get('/:id/keyframes/:filename', async (req, res, next) => {
  try {
    const { id, filename } = req.params;
    // Validate filename characters to prevent path traversal
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      throw new AppError(400, 'invalid_path', 'Invalid keyframe filename');
    }

    // Verify ownership
    const request = await orchestrator.getRequest(id, req.user.id);
    if (!request) {
      throw new AppError(404, 'not_found', 'Verification request not found');
    }

    const filePath = path.join(config.STORAGE_DIR, 'keyframes', id, filename);
    if (!fs.existsSync(filePath)) {
      throw new AppError(404, 'not_found', 'Keyframe not found');
    }

    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/verify/:id/pdf
 * Downloads verification result directly as PDF document.
 */
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const request = await orchestrator.getRequest(req.params.id, req.user.id);
    if (!request) {
      throw new AppError(404, 'not_found', 'Verification request not found');
    }
    const { ReportManagementService } = await import('../services/verification/ReportManagementService.js');
    const reportService = new ReportManagementService();
    const pdfBuffer = await reportService.generatePdfReport(request);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="TruthGuard_${request.id.slice(0, 8)}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/verify/:id/summary
 * Formats report summary text for clipboard copying.
 */
router.get('/:id/summary', async (req, res, next) => {
  try {
    const request = await orchestrator.getRequest(req.params.id, req.user.id);
    if (!request) {
      throw new AppError(404, 'not_found', 'Verification request not found');
    }
    const { ReportManagementService } = await import('../services/verification/ReportManagementService.js');
    const reportService = new ReportManagementService();
    const summary = reportService.formatReportSummary(request);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/verify/:id/dispute
 * Records user dispute / feedback for incorrect result.
 */
router.post(
  '/:id/dispute',
  validate(
    z.object({
      rating: z.number().int().min(1).max(5).default(1),
      comment: z.string().min(1, 'Please provide details for the dispute').max(2000),
      disputedClaim: z.string().optional().default(''),
    })
  ),
  async (req, res, next) => {
    try {
      const request = await orchestrator.getRequest(req.params.id, req.user.id);
      if (!request) {
        throw new AppError(404, 'not_found', 'Verification request not found');
      }
      const { ReportManagementService } = await import('../services/verification/ReportManagementService.js');
      const reportService = new ReportManagementService();
      // Need resultId from DB
      const { rows } = await (await import('../db.js')).query(
        'SELECT id FROM verification_results WHERE request_id = $1',
        [request.id]
      );
      if (rows.length === 0) {
        throw new AppError(400, 'no_result', 'Cannot dispute a verification that has no completed result');
      }
      const feedback = await reportService.submitFeedback(
        req.user.id,
        rows[0].id,
        req.body.rating,
        req.body.comment,
        req.body.disputedClaim
      );
      res.status(201).json({ status: 'dispute_recorded', feedback });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/verify/:id/explain
 * Requests additional in-depth contextual explanation on demand.
 */
router.post('/:id/explain', async (req, res, next) => {
  try {
    const request = await orchestrator.getRequest(req.params.id, req.user.id);
    if (!request) {
      throw new AppError(404, 'not_found', 'Verification request not found');
    }
    const { ReportManagementService } = await import('../services/verification/ReportManagementService.js');
    const reportService = new ReportManagementService();
    const explanation = await reportService.requestExplanation(request);
    res.json(explanation);
  } catch (err) {
    next(err);
  }
});

export default router;

