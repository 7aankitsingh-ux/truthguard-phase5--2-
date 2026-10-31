import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { audit } from '../services/audit.js';
import { config } from '../config.js';

const router = Router();
const handle = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/dashboard
 * Computes dashboard statistics and recent activity directly from database records.
 * No hardcoded stats.
 */
router.get(
  '/dashboard',
  handle(async (req) => {
    const userId = req.user.id;

    // 1. Compute aggregate statistics
    const { rows: statsRows } = await query(
      `SELECT
         (SELECT count(*)::int FROM verification_requests WHERE user_id = $1) AS verifications,
         (SELECT count(*)::int FROM saved_reports WHERE user_id = $1) AS saved_reports,
         (SELECT count(*)::int
          FROM verification_requests r
          JOIN verification_results res ON res.request_id = r.id
          WHERE r.user_id = $1 AND (res.verdict IN ('SUPPORTED', 'verified_true', 'authentic_unmodified'))) AS supported_claims,
         (SELECT count(*)::int
          FROM verification_requests r
          JOIN verification_results res ON res.request_id = r.id
          WHERE r.user_id = $1 AND (res.verdict IN ('CONTRADICTED', 'verified_false', 'manipulated', 'ai_generated'))) AS contradicted_claims,
         (SELECT count(*)::int
          FROM verification_requests r
          LEFT JOIN verification_results res ON res.request_id = r.id
          WHERE r.user_id = $1 AND (res.verdict IN ('UNVERIFIED', 'unverified', 'inconclusive') OR res.verdict IS NULL)) AS unverified_claims,
         (SELECT count(*)::int
          FROM verification_requests r
          JOIN verification_results res ON res.request_id = r.id
          WHERE r.user_id = $1 AND (res.verdict IN ('MIXED', 'partially_true', 'misleading'))) AS mixed_results,
         (SELECT count(*)::int FROM verification_requests WHERE user_id = $1 AND type = 'text') AS text_count,
         (SELECT count(*)::int FROM verification_requests WHERE user_id = $1 AND type = 'url') AS url_count,
         (SELECT count(*)::int FROM verification_requests WHERE user_id = $1 AND type = 'image') AS image_count,
         (SELECT count(*)::int FROM verification_requests WHERE user_id = $1 AND type = 'video') AS video_count,
         (SELECT count(*)::int FROM verification_requests WHERE user_id = $1 AND status = 'completed') AS completed_count,
         (SELECT count(*)::int FROM verification_requests WHERE user_id = $1 AND status = 'processing') AS processing_count,
         (SELECT count(*)::int FROM verification_requests WHERE user_id = $1 AND status = 'pending') AS pending_count,
         (SELECT count(*)::int FROM verification_requests WHERE user_id = $1 AND status = 'failed') AS failed_count`,
      [userId]
    );

    const s = statsRows[0] || {};
    const unwrap = (val) => (Array.isArray(val) ? Number(val[0]) : Number(val ?? 0));

    // 2. Fetch recent verification activities
    const { rows: recentRows } = await query(
      `SELECT r.id, r.type, r.status, r.input_text, r.input_url, r.error_message, r.created_at,
              res.verdict, res.confidence, res.summary
       FROM verification_requests r
       LEFT JOIN verification_results res ON res.request_id = r.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC
       LIMIT 8`,
      [userId]
    );

    const recentActivity = recentRows.map((r) => {
      let snippet = r.input_text || r.input_url;
      if (!snippet && r.type === 'image') snippet = 'Image analysis';
      else if (!snippet && r.type === 'video') snippet = 'Video keyframe verification';
      return {
        id: r.id,
        type: r.type,
        status: r.status,
        errorMessage: r.error_message || null,
        verdict: r.verdict || 'UNVERIFIED',
        confidence: r.confidence ? Number(r.confidence) : null,
        snippet: snippet ? snippet.slice(0, 90) : 'Verification submission',
        summary: r.summary || null,
        createdAt: r.created_at,
      };
    });

    return {
      verifications: unwrap(s.verifications),
      savedReports: unwrap(s.saved_reports),
      supportedClaims: unwrap(s.supported_claims),
      contradictedClaims: unwrap(s.contradicted_claims),
      unverifiedClaims: unwrap(s.unverified_claims),
      mixedResults: unwrap(s.mixed_results),
      byType: {
        text: unwrap(s.text_count),
        url: unwrap(s.url_count),
        image: unwrap(s.image_count),
        video: unwrap(s.video_count),
      },
      byStatus: {
        completed: unwrap(s.completed_count),
        processing: unwrap(s.processing_count),
        pending: unwrap(s.pending_count),
        failed: unwrap(s.failed_count),
      },
      recentActivity,
    };
  })
);

/**
 * GET /api/verifications
 * Verification history with search, type filter, verdict filter, date range, sorting, and pagination.
 */
router.get(
  '/verifications',
  handle(async (req) => {
    const userId = req.user.id;
    const {
      search,
      type,
      verdict,
      status,
      fromDate,
      toDate,
      sort = 'newest',
      page = 1,
      limit = 10,
    } = req.query;

    const conditions = ['r.user_id = $1'];
    const params = [userId];
    let idx = 2;

    // Search filter across input text, url, summary
    if (search && search.trim()) {
      conditions.push(`(r.input_text ILIKE $${idx} OR r.input_url ILIKE $${idx} OR res.summary ILIKE $${idx})`);
      params.push(`%${search.trim()}%`);
      idx++;
    }

    // Type filter
    if (type && type !== 'all' && ['text', 'image', 'video', 'url'].includes(type)) {
      conditions.push(`r.type = $${idx}`);
      params.push(type);
      idx++;
    }

    // Status filter
    if (status && status !== 'all' && ['pending', 'processing', 'completed', 'failed'].includes(status)) {
      conditions.push(`r.status = $${idx}`);
      params.push(status);
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
        conditions.push(`(res.verdict IN ('UNVERIFIED', 'unverified', 'inconclusive') OR res.verdict IS NULL)`);
      }
    }

    // Date filters
    if (fromDate && !isNaN(new Date(fromDate).getTime())) {
      conditions.push(`r.created_at >= $${idx}`);
      params.push(new Date(fromDate).toISOString());
      idx++;
    }
    if (toDate && !isNaN(new Date(toDate).getTime())) {
      // Include the entire end date day
      const endOfDay = new Date(new Date(toDate).setHours(23, 59, 59, 999)).toISOString();
      conditions.push(`r.created_at <= $${idx}`);
      params.push(endOfDay);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    // 1. Get total count
    const { rows: countRows } = await query(
      `SELECT count(*)::int as total
       FROM verification_requests r
       LEFT JOIN verification_results res ON res.request_id = r.id
       WHERE ${whereClause}`,
      params
    );

    const totalCount = countRows[0]?.total || 0;
    const cleanLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const totalPages = Math.ceil(totalCount / cleanLimit) || 1;
    const cleanPage = Math.max(1, Math.min(totalPages, parseInt(page, 10) || 1));
    const offset = (cleanPage - 1) * cleanLimit;

    // Sorting
    let orderByClause = 'r.created_at DESC';
    if (sort === 'oldest') {
      orderByClause = 'r.created_at ASC';
    } else if (sort === 'confidence_desc') {
      orderByClause = 'res.confidence DESC NULLS LAST, r.created_at DESC';
    } else if (sort === 'confidence_asc') {
      orderByClause = 'res.confidence ASC NULLS LAST, r.created_at DESC';
    }

    // 2. Query paginated results
    const { rows } = await query(
      `SELECT r.id, r.type, r.input_text, r.input_url, r.status, r.error_message, r.created_at,
              res.id as result_id, res.verdict, res.confidence, res.summary
       FROM verification_requests r
       LEFT JOIN verification_results res ON res.request_id = r.id
       WHERE ${whereClause}
       ORDER BY ${orderByClause}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, cleanLimit, offset]
    );

    return {
      items: rows,
      pagination: {
        page: cleanPage,
        limit: cleanLimit,
        totalCount,
        totalPages,
        hasNext: cleanPage < totalPages,
        hasPrev: cleanPage > 1,
      },
    };
  })
);

/**
 * GET /api/verifications/:id
 * Retrieves full details of a single verification request.
 */
router.get(
  '/verifications/:id',
  handle(async (req) => {
    const { rows } = await query(
      `SELECT r.id, r.user_id, r.type, r.input_text, r.input_url, r.status, r.error_message, r.created_at,
              res.id as result_id, res.verdict, res.confidence, res.summary, res.model_info
       FROM verification_requests r
       LEFT JOIN verification_results res ON res.request_id = r.id
       WHERE r.id = $1 AND r.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) {
      throw new AppError(404, 'not_found', 'Verification request not found or unauthorized');
    }
    const item = rows[0];
    let evidenceSources = [];
    if (item.result_id) {
      const { rows: sources } = await query(
        `SELECT id, url, title, publisher, stance, retrieved_at FROM evidence_sources WHERE result_id = $1`,
        [item.result_id]
      );
      evidenceSources = sources;
    }

    const parsedResult = item.model_info
      ? typeof item.model_info === 'string'
        ? JSON.parse(item.model_info)
        : item.model_info
      : item.verdict
      ? {
          verdict: item.verdict,
          confidence: Number(item.confidence),
          summary: item.summary,
          evidenceSources,
        }
      : null;

    return {
      ...item,
      resultId: item.result_id,
      result: parsedResult ? { ...parsedResult, evidenceSources: parsedResult.evidenceSources || evidenceSources } : null,
      evidenceSources,
    };
  })
);

/**
 * DELETE /api/verifications/:id
 * Deletes a verification request and all associated results/files.
 */
router.delete(
  '/verifications/:id',
  handle(async (req) => {
    const userId = req.user.id;
    const requestId = req.params.id;

    // Check ownership
    const { rows: existing } = await query(
      'SELECT id, type FROM verification_requests WHERE id = $1 AND user_id = $2',
      [requestId, userId]
    );

    if (existing.length === 0) {
      throw new AppError(404, 'not_found', 'Verification request not found or unauthorized');
    }

    // Delete uploaded files on disk if any
    try {
      const keyframesDir = path.join(config.STORAGE_DIR, 'keyframes', requestId);
      await fs.rm(keyframesDir, { recursive: true, force: true });
    } catch {}

    // Cascade delete in database
    await query('DELETE FROM verification_requests WHERE id = $1 AND user_id = $2', [requestId, userId]);
    await audit(userId, 'verification.delete', req, { requestId, type: existing[0].type });

    return { deleted: true, id: requestId };
  })
);

export default router;
