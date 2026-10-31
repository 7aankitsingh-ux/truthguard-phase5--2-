import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { query } from '../../db.js';
import { logger } from '../../logger.js';

export class ReportManagementService {
  /**
   * Saves a report to user's library.
   */
  async saveReport(userId, resultId, title, notes = '') {
    if (!userId || !resultId) {
      throw new Error('userId and resultId are required');
    }

    const { rows } = await query(
      `INSERT INTO saved_reports (user_id, result_id, title, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, result_id) DO UPDATE
       SET title = EXCLUDED.title, notes = EXCLUDED.notes
       RETURNING id, user_id, result_id, title, share_token, is_public, notes, created_at`,
      [userId, resultId, title || 'Verification Report', notes || null]
    );

    return rows[0];
  }

  /**
   * Updates title and/or notes for a saved report.
   */
  async updateReport(userId, reportId, { title, notes } = {}) {
    if (!userId || !reportId) {
      throw new Error('userId and reportId are required');
    }
    const updates = [];
    const values = [reportId, userId];
    let idx = 3;

    if (title !== undefined) {
      updates.push(`title = $${idx++}`);
      values.push(title);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${idx++}`);
      values.push(notes);
    }

    if (updates.length === 0) {
      const { rows } = await query(
        'SELECT id, user_id, result_id, title, share_token, is_public, notes, created_at FROM saved_reports WHERE id = $1 AND user_id = $2',
        [reportId, userId]
      );
      if (rows.length === 0) throw new Error('Report not found or unauthorized');
      return rows[0];
    }

    const { rows } = await query(
      `UPDATE saved_reports SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, result_id, title, share_token, is_public, notes, created_at`,
      values
    );

    if (rows.length === 0) {
      throw new Error('Report not found or unauthorized');
    }
    return rows[0];
  }

  /**
   * Generates or retrieves a secure shareable token for a report.
   */
  async generateShareLink(userId, reportId) {
    // Verify report ownership
    const { rows: existing } = await query(
      `SELECT id, share_token, is_public FROM saved_reports WHERE id = $1 AND user_id = $2`,
      [reportId, userId]
    );

    if (existing.length === 0) {
      throw new Error('Report not found or unauthorized');
    }

    let shareToken = existing[0].share_token;
    if (!shareToken) {
      shareToken = crypto.randomBytes(24).toString('base64url');
      await query(
        `UPDATE saved_reports SET share_token = $1, is_public = true WHERE id = $2`,
        [shareToken, reportId]
      );
    } else if (!existing[0].is_public) {
      await query(`UPDATE saved_reports SET is_public = true WHERE id = $1`, [reportId]);
    }

    return {
      shareToken,
      shareUrl: `/shared/report/${shareToken}`,
      isPublic: true,
    };
  }

  /**
   * Revokes a shareable link.
   */
  async revokeShareLink(userId, reportId) {
    const { rows } = await query(
      `UPDATE saved_reports SET is_public = false WHERE id = $1 AND user_id = $2 RETURNING id`,
      [reportId, userId]
    );
    if (rows.length === 0) {
      throw new Error('Report not found or unauthorized');
    }
    return { isPublic: false };
  }

  /**
   * Retrieves a publicly shared report by its secure share token.
   * Does NOT leak private user account information.
   */
  async getSharedReport(shareToken) {
    if (!shareToken || typeof shareToken !== 'string') {
      throw new Error('Valid share token is required');
    }

    const { rows } = await query(
      `SELECT sr.id as report_id, sr.title, sr.created_at as saved_at,
              r.id as request_id, r.type, r.input_text, r.input_url, r.created_at as submitted_at,
              res.id as result_id, res.verdict, res.confidence, res.summary, res.model_info
       FROM saved_reports sr
       JOIN verification_results res ON res.id = sr.result_id
       JOIN verification_requests r ON r.id = res.request_id
       WHERE sr.share_token = $1 AND sr.is_public = true`,
      [shareToken]
    );

    if (rows.length === 0) return null;
    const report = rows[0];

    // Fetch evidence sources
    const { rows: sourceRows } = await query(
      `SELECT id, url, title, publisher, stance, retrieved_at FROM evidence_sources WHERE result_id = $1`,
      [report.result_id]
    );

    const parsedResult = report.model_info
      ? typeof report.model_info === 'string'
        ? JSON.parse(report.model_info)
        : report.model_info
      : {
          verdict: report.verdict,
          confidence: Number(report.confidence),
          summary: report.summary,
        };

    return {
      reportId: report.report_id,
      title: report.title,
      savedAt: report.saved_at,
      requestId: report.request_id,
      type: report.type,
      submittedContent: report.input_text || report.input_url || 'Media File',
      submittedAt: report.submitted_at,
      result: {
        ...parsedResult,
        evidenceSources: parsedResult.evidenceSources || sourceRows,
      },
    };
  }

  /**
   * Deletes a saved report.
   */
  async deleteReport(userId, reportId) {
    const { rows } = await query(
      `DELETE FROM saved_reports WHERE id = $1 AND user_id = $2 RETURNING id`,
      [reportId, userId]
    );
    if (rows.length === 0) {
      throw new Error('Report not found or unauthorized');
    }
    return { deleted: true, id: reportId };
  }

  /**
   * Records user dispute / feedback for an incorrect result.
   */
  async submitFeedback(userId, resultId, rating, comment, disputedClaim = '') {
    if (!userId || !resultId) {
      throw new Error('userId and resultId are required');
    }
    const cleanRating = Math.max(1, Math.min(5, Number(rating) || 3));

    const { rows } = await query(
      `INSERT INTO user_feedback (user_id, result_id, rating, comment, disputed_claim, status)
       VALUES ($1, $2, $3, $4, $5, 'submitted')
       RETURNING id, user_id, result_id, rating, comment, disputed_claim, status, created_at`,
      [userId, resultId, cleanRating, comment || null, disputedClaim || null]
    );

    return rows[0];
  }

  /**
   * Generates a formatted plain-text and Markdown summary suitable for clipboard copying.
   */
  formatReportSummary(verification) {
    const res = verification.result || {};
    const verdict = (res.verdict || 'UNVERIFIED').toUpperCase();
    const conf = res.confidenceAssessment ? res.confidenceAssessment.label : `${Math.round((res.confidence || 0.5) * 100)}%`;
    const explanation = res.shortExplanation || res.summary || 'No summary available.';
    const id = verification.id || verification.requestId || 'N/A';

    let summaryText = `[TruthGuard AI Verification Report]\n`;
    summaryText += `Verification ID: ${id}\n`;
    summaryText += `Verdict: ${verdict}\n`;
    summaryText += `Confidence: ${conf}\n`;
    summaryText += `Explanation: ${explanation}\n\n`;

    if (res.detailedReasoning && res.detailedReasoning.length > 0) {
      summaryText += `Reasoning:\n`;
      for (const r of res.detailedReasoning) {
        summaryText += `- ${r}\n`;
      }
      summaryText += `\n`;
    }

    if (res.evidenceSources && res.evidenceSources.length > 0) {
      summaryText += `Key Cited Sources:\n`;
      for (const s of res.evidenceSources.slice(0, 4)) {
        summaryText += `- [${s.stance?.toUpperCase()}] ${s.publisher || 'Source'}: ${s.url}\n`;
      }
      summaryText += `\n`;
    }

    summaryText += `Note: Verified via TruthGuard Evidence Engine. AI detection never independently determines factual accuracy.`;

    return {
      plainText: summaryText,
      verdict,
      confidence: conf,
      explanation,
    };
  }

  /**
   * Generates a high-quality PDF verification document buffer via PDFKit.
   *
   * @param {Object} verification
   * @returns {Promise<Buffer>}
   */
  async generatePdfReport(verification) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 45, size: 'A4' });
        const chunks = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        const res = verification.result || {};
        const verdict = (res.verdict || 'UNVERIFIED').toUpperCase();
        const conf = res.confidenceAssessment || {};

        // Colors
        const primaryColor = '#1d4f91';
        const darkText = '#1b2430';
        const mutedText = '#5d6b7c';

        let verdictColor = '#475467';
        if (verdict === 'SUPPORTED') verdictColor = '#027a48';
        else if (verdict === 'CONTRADICTED') verdictColor = '#b42318';
        else if (verdict === 'MIXED') verdictColor = '#b54708';

        // 1. Header
        doc.rect(45, 45, 505, 5).fill(primaryColor);
        doc.moveDown(0.8);
        doc.fillColor(primaryColor).fontSize(20).text('TRUTHGUARD AI', { characterSpacing: 1 });
        doc.fillColor(mutedText).fontSize(10).text('Independent Verification & Evidence Analysis Report', { lineGap: 10 });

        doc.strokeColor('#dfe3e8').lineWidth(1).moveTo(45, 95).lineTo(550, 95).stroke();
        doc.moveDown(0.6);

        // 2. Metadata Block
        doc.fontSize(9).fillColor(darkText);
        doc.text(`Verification ID: ${verification.id || verification.requestId || 'N/A'}`);
        doc.text(`Submitted: ${new Date(verification.createdAt || verification.created_at || Date.now()).toLocaleString()}`);
        doc.text(`Submission Type: ${(verification.type || 'text').toUpperCase()}`);
        doc.moveDown(0.5);

        // 3. Submitted Content Snippet
        const submitted = verification.inputText || verification.inputUrl || (verification.uploadedFile?.original_name ? `Uploaded File: ${verification.uploadedFile.original_name}` : 'Document / Media Submission');
        doc.fillColor(mutedText).fontSize(9).text('SUBMITTED CONTENT:', { underline: true });
        doc.fillColor(darkText).fontSize(10).text(`"${submitted.slice(0, 300)}${submitted.length > 300 ? '...' : ''}"`, { oblique: true });
        doc.moveDown(0.8);

        // 4. Verdict Box
        doc.rect(45, doc.y, 505, 55).fillAndStroke(verdictColor === '#027a48' ? '#ecfdf3' : verdictColor === '#b42318' ? '#fef3f2' : verdictColor === '#b54708' ? '#fffaeb' : '#f2f4f7', verdictColor);
        const boxTop = doc.y;
        doc.fillColor(verdictColor).fontSize(14).text(`VERDICT: ${verdict}`, 60, boxTop + 12);
        doc.fillColor(darkText).fontSize(9).text(`Confidence Assessment: ${conf.label || 'Standard Evidence Basis'}`, 60, boxTop + 32);
        doc.y = boxTop + 65;
        doc.moveDown(0.5);

        // 5. Short Explanation & Detailed Reasoning
        doc.fillColor(primaryColor).fontSize(12).text('Explanation & Evidentiary Reasoning');
        doc.fillColor(darkText).fontSize(10).text(res.shortExplanation || res.summary || 'No explanation recorded.', { lineGap: 3 });
        doc.moveDown(0.4);

        if (res.detailedReasoning && res.detailedReasoning.length > 0) {
          for (const reason of res.detailedReasoning) {
            doc.fillColor(darkText).fontSize(9).text(`•  ${reason}`, { indent: 10, lineGap: 2 });
          }
          doc.moveDown(0.6);
        }

        // 6. Multi-Dimensional Confidence Dimensions
        if (conf.dimensions) {
          doc.fillColor(primaryColor).fontSize(11).text('Evidence Quality Dimensions');
          doc.fontSize(8.5).fillColor(mutedText);
          doc.text(`• Source Quality: ${conf.dimensions.sourceQuality?.rating} (${conf.dimensions.sourceQuality?.notes || ''})`, { indent: 10 });
          doc.text(`• Source Independence: ${conf.dimensions.sourceIndependence?.rating} (${conf.dimensions.sourceIndependence?.notes || ''})`, { indent: 10 });
          doc.text(`• Evidence Consistency: ${conf.dimensions.evidenceConsistency?.rating} (${conf.dimensions.evidenceConsistency?.notes || ''})`, { indent: 10 });
          doc.text(`• Evidence Freshness: ${conf.dimensions.evidenceFreshness?.rating} (${conf.dimensions.evidenceFreshness?.notes || ''})`, { indent: 10 });
          doc.moveDown(0.6);
        }

        // 7. Cited Evidence Sources Table
        if (res.evidenceSources && res.evidenceSources.length > 0) {
          doc.fillColor(primaryColor).fontSize(11).text(`Cited Evidence Sources (${res.evidenceSources.length})`);
          doc.moveDown(0.3);

          for (const src of res.evidenceSources.slice(0, 5)) {
            const stance = (src.stance || 'neutral').toUpperCase();
            const stanceColor = stance === 'SUPPORTS' ? '#027a48' : stance === 'CONTRADICTS' ? '#b42318' : '#475467';
            doc.fillColor(stanceColor).fontSize(8.5).text(`[${stance}] `, { continued: true });
            doc.fillColor(darkText).text(`${src.title || src.url} `);
            doc.fillColor(mutedText).fontSize(8).text(`   Publisher: ${src.publisher || 'Unknown'} | Published: ${src.publishedDate || 'N/A'} | Retrieved: ${src.retrievedAt ? src.retrievedAt.split('T')[0] : 'N/A'}`);
            if (src.syndicationNotice) {
              doc.fillColor('#b54708').fontSize(7.5).text(`   ⚠️ ${src.syndicationNotice}`);
            }
            doc.moveDown(0.25);
          }
          doc.moveDown(0.5);
        }

        // 8. Limitations & Recommended Next Steps
        if (res.limitations && res.limitations.length > 0) {
          doc.fillColor(mutedText).fontSize(8).text('Limitations: ' + res.limitations.join(' | '), { lineGap: 2 });
          doc.moveDown(0.4);
        }

        if (res.recommendedNextSteps && res.recommendedNextSteps.length > 0) {
          doc.fillColor(primaryColor).fontSize(9.5).text('Recommended Next Steps:');
          for (const step of res.recommendedNextSteps) {
            doc.fillColor(darkText).fontSize(8.5).text(`- ${step}`, { indent: 10 });
          }
          doc.moveDown(0.5);
        }

        // 9. Footer
        doc.strokeColor('#dfe3e8').lineWidth(0.5).moveTo(45, 770).lineTo(550, 770).stroke();
        doc.fontSize(7.5).fillColor(mutedText).text(
          'TruthGuard AI — Evidence Engine. AI-detection scores never independently determine factual accuracy.',
          45,
          775,
          { align: 'center', width: 505 }
        );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generates additional in-depth contextual explanation on demand.
   */
  async requestExplanation(verification) {
    const res = verification.result || {};
    const verdict = res.verdict || 'UNVERIFIED';

    const deeperContext = [
      `The verdict was established through empirical evidence comparison against indexed primary institutions and accredited wire services.`,
      `Verification evaluated ${res.evidenceSources?.length || 0} document(s), analyzing semantic stance, citation provenance, and temporal validity.`,
      `All conclusions adhere to TruthGuard's non-forcing rule: unverified status is preserved whenever documentary corroboration does not meet institutional thresholds.`,
    ];

    return {
      verdict,
      deepDiveContext: deeperContext,
      evidenceSourcesCount: res.evidenceSources?.length || 0,
      timestamp: new Date().toISOString(),
    };
  }
}

