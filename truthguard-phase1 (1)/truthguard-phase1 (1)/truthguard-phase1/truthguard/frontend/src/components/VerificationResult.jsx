import { useState } from 'react';
import { api } from '../api.js';
import { Button, Modal, Field, useToast } from './ui.jsx';

const verdictConfig = {
  SUPPORTED: { label: 'Supported', cls: 'badge-supported', color: '#295255', desc: 'Reliable available evidence supports the claim.' },
  CONTRADICTED: { label: 'Contradicted', cls: 'badge-contradicted', color: '#162623', desc: 'Reliable available evidence conflicts with the claim.' },
  UNVERIFIED: { label: 'Unverified', cls: 'badge-unverified', color: '#577877', desc: 'Available evidence is insufficient to establish the claim.' },
  MIXED: { label: 'Mixed', cls: 'badge-mixed', color: '#295255', desc: 'Significant supporting and contradicting evidence exists.' },
  // Media / Legacy fallbacks
  verified_true: { label: 'Verified True', cls: 'badge-supported', color: '#295255' },
  verified_false: { label: 'Debunked / False', cls: 'badge-contradicted', color: '#162623' },
  partially_true: { label: 'Partially True', cls: 'badge-mixed', color: '#295255' },
  authentic_unmodified: { label: 'Authentic Capture', cls: 'badge-supported', color: '#295255' },
  manipulated: { label: 'Digitally Manipulated', cls: 'badge-contradicted', color: '#162623' },
  ai_generated: { label: 'AI-Generated Content', cls: 'badge-ai', color: '#295255' },
  inconclusive: { label: 'Inconclusive', cls: 'badge-unverified', color: '#577877' },
  unverified: { label: 'Unverified', cls: 'badge-unverified', color: '#577877' },
};

const tierLabels = {
  1: { label: 'Tier 1: Primary Official', cls: 'tier-1' },
  2: { label: 'Tier 2: Research Paper', cls: 'tier-2' },
  3: { label: 'Tier 3: Established News', cls: 'tier-3' },
  4: { label: 'Tier 4: Secondary Source', cls: 'tier-4' },
};

export function VerificationResult({ request, onSaved, isSharedView = false }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Modals state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);

  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeSuccess, setDisputeSuccess] = useState(false);

  const [explainModalOpen, setExplainModalOpen] = useState(false);
  const [explainData, setExplainData] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);

  if (!request) return null;

  const result = request.result || {};
  const verdictKey = (result.verdict || 'UNVERIFIED').toUpperCase();
  const verdict = verdictConfig[verdictKey] || verdictConfig[result.verdict] || {
    label: (result.verdict || 'Unverified').replace(/_/g, ' '),
    cls: 'badge-unverified',
    color: '#475467',
  };

  const verificationId = request.id || request.requestId || request.request_id || 'N/A';
  const submittedContent =
    request.inputText ||
    request.input_text ||
    request.inputUrl ||
    request.input_url ||
    (request.uploadedFile?.original_name ? `Uploaded File: ${request.uploadedFile.original_name}` : 'Document Submission');

  const conf = result.confidenceAssessment || null;
  const confidenceScore = result.confidence != null ? Math.round(Number(result.confidence) * 100) : 50;

  // Separate evidence into Supporting and Contradicting
  const rawSources = result.evidenceSources || [];
  const supportingSources = rawSources.filter((s) => s.stance === 'supports');
  const contradictingSources = rawSources.filter((s) => s.stance === 'contradicts');
  const otherSources = rawSources.filter((s) => s.stance !== 'supports' && s.stance !== 'contradicts');

  // Copy Verification ID
  const copyVerificationId = () => {
    navigator.clipboard.writeText(verificationId);
    toast('Verification ID copied to clipboard', 'success');
  };

  // Copy Formatted Summary
  const copySummary = async () => {
    try {
      const res = await api(`/verify/${verificationId}/summary`);
      if (res?.plainText) {
        navigator.clipboard.writeText(res.plainText);
        toast('Verification summary copied to clipboard', 'success');
      }
    } catch {
      // Fallback client summary
      const text = `[TruthGuard AI Verification]\nID: ${verificationId}\nVerdict: ${verdict.label}\nExplanation: ${
        result.shortExplanation || result.summary || ''
      }`;
      navigator.clipboard.writeText(text);
      toast('Verification summary copied to clipboard', 'success');
    }
  };

  // Download PDF
  const downloadPdf = () => {
    const url = `/api/verify/${verificationId}/pdf`;
    window.open(url, '_blank');
  };

  // Save Report
  const handleSaveReport = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      const title =
        result.shortExplanation?.slice(0, 80) ||
        result.summary?.slice(0, 80) ||
        `${(request.type || 'text').toUpperCase()} Verification (${new Date(
          request.createdAt || Date.now()
        ).toLocaleDateString()})`;

      await api('/reports', {
        method: 'POST',
        body: {
          requestId: verificationId,
          resultId: request.resultId || request.result_id,
          title,
        },
      });
      setSaved(true);
      toast('Report saved to your library', 'success');
      if (onSaved) onSaved();
    } catch (err) {
      toast(err.message || 'Failed to save report', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Generate / Open Share Modal
  const openShareModal = async () => {
    setShareModalOpen(true);
    setShareBusy(true);
    try {
      // If we don't have a saved report yet, save first or check existing
      let repId = request.reportId || request.report_id;
      if (!repId) {
        const title =
          result.shortExplanation?.slice(0, 80) ||
          result.summary?.slice(0, 80) ||
          `Verification Report ${verificationId.slice(0, 8)}`;
        const savedRep = await api('/reports', {
          method: 'POST',
          body: { requestId: verificationId, resultId: request.resultId || request.result_id, title },
        });
        repId = savedRep.id;
        setSaved(true);
      }
      const share = await api(`/reports/${repId}/share`, { method: 'POST' });
      const fullUrl = `${window.location.origin}/report/${share.shareToken}`;
      setShareData({ ...share, fullUrl, reportId: repId });
    } catch (err) {
      toast(err.message || 'Failed to generate share link', 'error');
    } finally {
      setShareBusy(false);
    }
  };

  // Revoke Share Link
  const revokeShareLink = async () => {
    if (!shareData?.reportId) return;
    setShareBusy(true);
    try {
      await api(`/reports/${shareData.reportId}/share`, { method: 'DELETE' });
      setShareData(null);
      toast('Share link revoked. Public access is disabled.', 'success');
      setShareModalOpen(false);
    } catch (err) {
      toast(err.message || 'Failed to revoke link', 'error');
    } finally {
      setShareBusy(false);
    }
  };

  // Deep Explanation Request
  const openExplainModal = async () => {
    setExplainModalOpen(true);
    if (!explainData) {
      setExplainLoading(true);
      try {
        const data = await api(`/verify/${verificationId}/explain`, { method: 'POST' });
        setExplainData(data);
      } catch (err) {
        toast(err.message || 'Failed to retrieve detailed explanation', 'error');
      } finally {
        setExplainLoading(false);
      }
    }
  };

  // Submit Result Dispute
  const handleDisputeSubmit = async (e) => {
    e.preventDefault();
    setDisputeBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api(`/verify/${verificationId}/dispute`, {
        method: 'POST',
        body: {
          rating: Number(fd.get('rating')),
          disputedClaim: fd.get('disputedClaim') || '',
          comment: fd.get('comment'),
        },
      });
      setDisputeSuccess(true);
      toast('Dispute feedback submitted to review audit queue', 'success');
      setTimeout(() => setDisputeModalOpen(false), 1600);
    } catch (err) {
      toast(err.message || 'Failed to submit dispute', 'error');
    } finally {
      setDisputeBusy(false);
    }
  };

  return (
    <div className="card stack result-container" style={{ marginTop: '1.25rem' }}>
      {/* 1. Original Submitted Content & Verification ID Card */}
      <div className="submission-card">
        <div className="submission-meta">
          <div>
            <strong>ORIGINAL SUBMISSION</strong> ({request.type ? request.type.toUpperCase() : 'TEXT'}) •{' '}
            {new Date(request.createdAt || request.created_at || Date.now()).toLocaleString()}
          </div>
          <div className="id-pill" title="Click to copy Verification ID" onClick={copyVerificationId} style={{ cursor: 'pointer' }}>
            <span>ID: {verificationId.slice(0, 18)}...</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>📋 Copy</span>
          </div>
        </div>
        <p style={{ margin: 0, fontStyle: 'italic', fontSize: '1rem', color: 'var(--text)' }}>
          "{submittedContent}"
        </p>
      </div>

      {/* 2. Verdict Header & Short Explanation */}
      <div className="verdict-header">
        <div className="verdict-title">
          <span className={`badge ${verdict.cls}`} style={{ fontSize: '0.95rem', padding: '0.35rem 0.85rem' }}>
            {verdict.label}
          </span>
          {result.language && (
            <span className="badge badge-unverified" title="Detected Language">
              {result.language === 'hi' ? 'Hindi (हिंदी)' : 'English'}
            </span>
          )}
          {conf && (
            <span className="badge badge-unverified" title="Evidence Confidence Level">
              {conf.label}
            </span>
          )}
        </div>

        <div className="confidence-meter" title="Evidence-based composite confidence">
          <span>Confidence: {confidenceScore}%</span>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${confidenceScore}%`, backgroundColor: verdict.color }} />
          </div>
        </div>
      </div>

      {/* Short Explanation */}
      {(result.shortExplanation || result.summary) && (
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderLeft: `4px solid ${verdict.color}`, padding: '0.85rem 1rem', borderRadius: '4px' }}>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', color: 'var(--text)' }}>Summary Verdict</h3>
          <p style={{ margin: 0, fontSize: '0.96rem', lineHeight: 1.5, color: 'var(--text)' }}>
            {result.shortExplanation || result.summary}
          </p>
        </div>
      )}

      {/* Interactive Action Bar (Save, Copy, PDF, Share, Explain, Dispute) */}
      {!isSharedView && (
        <div className="result-actions-bar">
          <Button variant="default" onClick={handleSaveReport} loading={saving} disabled={saved}>
            {saved ? 'Saved ✓' : '💾 Save to Library'}
          </Button>
          <Button variant="default" onClick={copySummary}>
            📋 Copy Summary
          </Button>
          <Button variant="default" onClick={downloadPdf}>
            📄 Download PDF
          </Button>
          <Button variant="default" onClick={openShareModal}>
            🔗 Share Link
          </Button>
          <Button variant="default" onClick={openExplainModal}>
            🔍 Deep Explanation
          </Button>
          <Button variant="default" onClick={() => { setDisputeSuccess(false); setDisputeModalOpen(true); }}>
            ⚠️ Report Incorrect
          </Button>
        </div>
      )}

      {/* 3. Detailed Step-by-Step Reasoning */}
      {result.detailedReasoning && result.detailedReasoning.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <h4 style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Detailed Evidentiary Reasoning ({result.detailedReasoning.length})
          </h4>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.92rem', lineHeight: 1.6 }}>
            {result.detailedReasoning.map((r, i) => (
              <li key={i} style={{ marginBottom: '0.35rem' }}>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. Extracted Claims Breakdown (for Multi-Claim Submissions) */}
      {result.claims && result.claims.length > 1 && (
        <div style={{ marginTop: '0.5rem' }}>
          <h4 style={{ margin: '0.75rem 0 0.4rem', fontSize: '0.9rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Extracted Factual Claims ({result.claims.length})
          </h4>
          <div className="claims-list">
            {result.claims.map((c, idx) => {
              const claimV = (c.verdict || 'UNVERIFIED').toUpperCase();
              const badgeClass =
                claimV === 'SUPPORTED' ? 'badge-supported' : claimV === 'CONTRADICTED' ? 'badge-contradicted' : 'badge-unverified';
              return (
                <div key={idx} className="claim-card">
                  <div className="claim-card-header">
                    <div style={{ fontWeight: 500, fontSize: '0.93rem' }}>{c.claimText}</div>
                    <span className={`badge ${badgeClass}`}>{claimV}</span>
                  </div>
                  {c.shortExplanation && <div className="small muted">{c.shortExplanation}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Supporting Evidence Section */}
      {supportingSources.length > 0 && (
        <div className="evidence-section">
          <div className="evidence-section-title" style={{ color: 'var(--option-selection)' }}>
            <span>✓ Supporting Evidence ({supportingSources.length})</span>
          </div>
          <div className="evidence-list">
            {supportingSources.map((src, i) => (
              <EvidenceCard key={i} source={src} />
            ))}
          </div>
        </div>
      )}

      {/* 6. Contradicting Evidence Section */}
      {contradictingSources.length > 0 && (
        <div className="evidence-section">
          <div className="evidence-section-title" style={{ color: 'var(--main-headings)' }}>
            <span>✗ Contradicting Evidence ({contradictingSources.length})</span>
          </div>
          <div className="evidence-list">
            {contradictingSources.map((src, i) => (
              <EvidenceCard key={i} source={src} />
            ))}
          </div>
        </div>
      )}

      {/* 7. Contextual / Neutral Sources */}
      {otherSources.length > 0 && (
        <div className="evidence-section">
          <div className="evidence-section-title" style={{ color: 'var(--rest-anything)' }}>
            <span>ℹ Contextual Sources ({otherSources.length})</span>
          </div>
          <div className="evidence-list">
            {otherSources.map((src, i) => (
              <EvidenceCard key={i} source={src} />
            ))}
          </div>
        </div>
      )}

      {/* 8. Multi-Dimensional Confidence Assessment Panel */}
      {conf && conf.dimensions && (
        <div className="confidence-box">
          <div className="confidence-box-header">
            <div>
              <strong style={{ fontSize: '0.95rem' }}>Multi-Dimensional Evidence Confidence</strong>
              <div className="small muted">{conf.explanation}</div>
            </div>
            <span className={`badge ${conf.level === 'HIGH' ? 'badge-supported' : conf.level === 'MODERATE' ? 'badge-mixed' : 'badge-unverified'}`}>
              {conf.label}
            </span>
          </div>

          <div className="confidence-grid">
            <DimensionCard title="Source Quality" data={conf.dimensions.sourceQuality} />
            <DimensionCard title="Evidence Relevance" data={conf.dimensions.evidenceRelevance} />
            <DimensionCard title="Source Independence" data={conf.dimensions.sourceIndependence} />
            <DimensionCard title="Evidence Consistency" data={conf.dimensions.evidenceConsistency} />
            <DimensionCard title="Evidence Freshness" data={conf.dimensions.evidenceFreshness} />
            <DimensionCard title="Information Availability" data={conf.dimensions.informationAvailability} />
          </div>

          <div className="methodology-banner">
            ℹ <strong>Methodology Notice:</strong> {conf.methodologyNotice}
          </div>
        </div>
      )}

      {/* 9. Video Keyframes Gallery (for video verifications) */}
      {result.keyframes && result.keyframes.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ margin: '0.75rem 0 0.4rem', fontSize: '0.9rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
            Sampled Keyframes with Exact Timestamps ({result.keyframes.length})
          </h4>
          <div className="keyframes-gallery">
            {result.keyframes.map((kf, i) => (
              <div key={i} className="keyframe-box">
                <img
                  src={`/api/verify/${verificationId}/keyframes/${kf.filename}`}
                  alt={`Keyframe at ${kf.formattedTimestamp}`}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="kf-time">{kf.formattedTimestamp}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 10. AI-Generated Content Analysis Panel */}
      {result.aiDetection && (
        <div className="ai-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <strong>AI-Generation Analysis: {Math.round(result.aiDetection.score * 100)}% Synthetic Indicator</strong>
            <span className={`badge ${result.aiDetection.isLikelyAiGenerated ? 'badge-ai' : 'badge-unverified'}`}>
              {result.aiDetection.isLikelyAiGenerated ? 'Likely AI-Generated' : 'Human / Low AI Variance'}
            </span>
          </div>
          {result.aiDetection.indicators && result.aiDetection.indicators.length > 0 && (
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.88rem' }}>
              {result.aiDetection.indicators.map((ind, i) => (
                <li key={i}>{ind}</li>
              ))}
            </ul>
          )}
          <div className="ai-disclaimer">
            ⚠️ {result.aiDetection.disclaimer || 'AI-detection scores must never independently determine factual accuracy.'}
          </div>
        </div>
      )}

      {/* 11. Limitations Box */}
      {result.limitations && result.limitations.length > 0 && (
        <div className="limitations-note">
          <strong>Analysis & Evidence Limitations:</strong>
          <ul>
            {result.limitations.map((lim, i) => (
              <li key={i}>{lim}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 12. Recommended Next Steps */}
      {result.recommendedNextSteps && result.recommendedNextSteps.length > 0 && (
        <div className="recommendations-note">
          <strong>Recommended Next Steps:</strong>
          <ul>
            {result.recommendedNextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Modals */}
      {/* Share Modal */}
      <Modal
        open={shareModalOpen}
        title="Secure Report Sharing"
        onClose={() => setShareModalOpen(false)}
        actions={
          <>
            {shareData && (
              <Button variant="danger" onClick={revokeShareLink} loading={shareBusy}>
                Revoke Public Link
              </Button>
            )}
            <Button variant="default" onClick={() => setShareModalOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="muted small">
            Anyone with this secure unguessable link can view this transparent verification report. Your private account details and other reports remain completely protected.
          </p>
          {shareData ? (
            <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', padding: '0.85rem', borderRadius: '4px' }}>
              <div className="small muted" style={{ marginBottom: '0.3rem' }}>
                Public Share URL:
              </div>
              <input
                type="text"
                readOnly
                className="input"
                value={shareData.fullUrl}
                onClick={(e) => e.target.select()}
              />
              <div style={{ marginTop: '0.5rem' }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    navigator.clipboard.writeText(shareData.fullUrl);
                    toast('Share link copied to clipboard', 'success');
                  }}
                >
                  📋 Copy Share Link
                </Button>
              </div>
            </div>
          ) : (
            <div>Generating secure share token...</div>
          )}
        </div>
      </Modal>

      {/* Deep Explanation Modal */}
      <Modal
        open={explainModalOpen}
        title="In-Depth Verification Audit Trail"
        onClose={() => setExplainModalOpen(false)}
        actions={<Button variant="default" onClick={() => setExplainModalOpen(false)}>Close</Button>}
      >
        <div className="stack">
          {explainLoading ? (
            <div>Auditing evidence trail...</div>
          ) : explainData ? (
            <div>
              <p>
                <strong>Verdict:</strong> {explainData.verdict}
              </p>
              <h4>Methodology & Evidentiary Trace</h4>
              <ul style={{ paddingLeft: '1.2rem', fontSize: '0.92rem' }}>
                {explainData.deepDiveContext?.map((ctx, idx) => (
                  <li key={idx} style={{ marginBottom: '0.4rem' }}>
                    {ctx}
                  </li>
                ))}
              </ul>
              <div className="small muted" style={{ marginTop: '0.75rem' }}>
                Total Evaluated Sources: {explainData.evidenceSourcesCount} • Evaluated at: {new Date(explainData.timestamp).toLocaleString()}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Dispute Modal */}
      <Modal
        open={disputeModalOpen}
        title="Report Incorrect Result / Submit Dispute"
        onClose={() => setDisputeModalOpen(false)}
        actions={<Button variant="default" onClick={() => setDisputeModalOpen(false)}>Cancel</Button>}
      >
        {disputeSuccess ? (
          <div className="alert alert-success">
            Thank you. Your dispute and feedback have been submitted for independent audit review.
          </div>
        ) : (
          <form className="stack" onSubmit={handleDisputeSubmit}>
            <p className="muted small">
              TruthGuard verification welcomes scrutiny. If you believe this verdict is inaccurate or missing critical evidence, please provide details below.
            </p>
            <Field
              id="disputedClaim"
              name="disputedClaim"
              label="Specific Claim Disputed"
              defaultValue={submittedContent.slice(0, 120)}
              required
            />
            <Field
              id="rating"
              name="rating"
              type="number"
              min="1"
              max="5"
              defaultValue="2"
              label="Accuracy Rating (1 = completely incorrect, 5 = accurate)"
              required
            />
            <Field
              id="comment"
              name="comment"
              multiline
              label="Reason for Dispute & Supporting Counter-Citations"
              placeholder="Cite specific sources, contradictory findings, or context omitted by the automated engine."
              required
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="primary" type="submit" loading={disputeBusy}>
                Submit Dispute
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function EvidenceCard({ source }) {
  const tier = source.tier?.tier || 4;
  const tierInfo = tierLabels[tier] || tierLabels[4];
  const stance = (source.stance || 'neutral').toUpperCase();
  const stanceCls = stance === 'SUPPORTS' ? 'badge-supported' : stance === 'CONTRADICTS' ? 'badge-contradicted' : 'badge-unverified';

  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="evidence-card">
      <div className="evidence-card-header">
        <div>
          <span className={`tier-badge ${tierInfo.cls}`} style={{ marginRight: '0.5rem' }}>
            {tierInfo.label}
          </span>
          <span style={{ fontWeight: 600, color: 'var(--option-selection)', fontSize: '0.95rem' }}>
            {source.title || source.url} ↗
          </span>
        </div>
        <span className={`badge ${stanceCls}`} style={{ flexShrink: 0 }}>
          {stance}
        </span>
      </div>

      {source.summary && (
        <div style={{ fontSize: '0.88rem', color: 'var(--text)', marginTop: '0.35rem', lineHeight: 1.45 }}>
          "{source.summary}"
        </div>
      )}

      {/* Wire service syndication alert */}
      {source.isSyndicated && (
        <div className="syndication-alert">
          ⚠️ {source.syndicationNotice || `Syndicated wire report originating from ${source.wireService || 'wire agency'}. Does not count as separate confirmation.`}
        </div>
      )}

      <div className="evidence-meta-row">
        <span><strong>Publisher:</strong> {source.publisher || 'Independent Publisher'}</span>
        <span>•</span>
        <span><strong>Published:</strong> {source.publishedDate ? new Date(source.publishedDate).toLocaleDateString() : 'Not stated'}</span>
        <span>•</span>
        <span><strong>Retrieved:</strong> {source.retrievedAt ? new Date(source.retrievedAt).toLocaleDateString() : 'Active crawl'}</span>
        {source.authorityScore && (
          <>
            <span>•</span>
            <span><strong>Authority:</strong> {Math.round(source.authorityScore * 100)}%</span>
          </>
        )}
      </div>
    </a>
  );
}

function DimensionCard({ title, data }) {
  if (!data) return null;
  return (
    <div className="dim-card">
      <div className="dim-card-head">
        <span className="dim-title">{title}</span>
        <span className="dim-rating">{data.rating}</span>
      </div>
      <div className="dim-notes">{data.notes}</div>
    </div>
  );
}
