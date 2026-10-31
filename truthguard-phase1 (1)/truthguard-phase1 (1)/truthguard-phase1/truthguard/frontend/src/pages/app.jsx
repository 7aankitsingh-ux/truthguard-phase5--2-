import { useEffect, useState, useRef } from 'react';
import { Link, NavLink, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Button,
  EmptyState,
  ErrorMessage,
  Field,
  Modal,
  Notice,
  Spinner,
  Table,
  useToast,
  LoadingState,
  ProcessingState,
  ServerErrorState,
  ValidationErrorState,
  UnauthorizedState,
  UnsupportedFileState,
  FailedVerificationCard,
} from '../components/ui.jsx';
import { VerificationResult } from '../components/VerificationResult.jsx';

function useFetch(path, reloadIndex = 0) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    api(path)
      .then((data) => live && setState({ data, error: '', loading: false }))
      .catch((e) => live && setState({ data: null, error: e.message, loading: false }));
    return () => {
      live = false;
    };
  }, [path, reloadIndex]);
  return state;
}

const Head = ({ title, children }) => (
  <div className="page-head">
    <h1>{title}</h1>
    {children && <p className="muted">{children}</p>}
  </div>
);

const fmt = (d) => (d ? new Date(d).toLocaleString() : 'N/A');

/**
 * 1. DASHBOARD COMPONENT (Phase 4)
 * Displays live database-driven statistics, breakdown ratios, type chips, and recent activity.
 */
export function Dashboard() {
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error, loading } = useFetch('/dashboard', reloadKey);
  const [activeItem, setActiveItem] = useState(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const toast = useToast();

  const openRecent = async (item) => {
    setActiveLoading(true);
    try {
      const detailed = await api(`/verifications/${item.id}`);
      setActiveItem(detailed);
    } catch (err) {
      toast(err.message || 'Failed to load verification result', 'error');
    } finally {
      setActiveLoading(false);
    }
  };

  // Compute breakdown percentages
  const total = data?.verifications || 0;
  const supPct = total > 0 ? ((data.supportedClaims || 0) / total) * 100 : 0;
  const conPct = total > 0 ? ((data.contradictedClaims || 0) / total) * 100 : 0;
  const mixPct = total > 0 ? ((data.mixedResults || 0) / total) * 100 : 0;
  const unvPct = total > 0 ? ((data.unverifiedClaims || 0) / total) * 100 : 0;

  const inProgressCount = (data?.byStatus?.processing || 0) + (data?.byStatus?.pending || 0);

  return (
    <>
      <Head title={`Welcome, ${user.name.split(' ')[0]}`}>
        Your real-time evidence verification activity and library statistics.
      </Head>

      {error ? (
        <ServerErrorState error={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : loading ? (
        <LoadingState message="Loading your dashboard statistics..." />
      ) : (
        data && (
          <div className="stack">
            {/* Background In-Progress Alert Banner */}
            {inProgressCount > 0 && (
              <div className="in-progress-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span className="pulse-dot" />
                  <span>
                    <strong>{inProgressCount} verification(s) processing in background.</strong> Results will populate your history automatically.
                  </span>
                </div>
                <Link to="/app/history?status=processing" className="btn small">
                  View Status
                </Link>
              </div>
            )}

            {/* Real Database Statistics Grid (Interactive Links) */}
            <div className="stat-grid">
              <Link to="/app/history" className="stat-card stat-primary clickable" title="View all verifications">
                <div className="stat-label">Total Verifications</div>
                <div className="stat-num">{data.verifications}</div>
                <div className="small muted">Evaluated requests →</div>
              </Link>
              <Link to="/app/history?verdict=SUPPORTED" className="stat-card stat-supported clickable" title="View supported claims">
                <div className="stat-label">Supported Claims</div>
                <div className="stat-num">{data.supportedClaims}</div>
                <div className="small muted">Verified with evidence →</div>
              </Link>
              <Link to="/app/history?verdict=CONTRADICTED" className="stat-card stat-contradicted clickable" title="View contradicted claims">
                <div className="stat-label">Contradicted Claims</div>
                <div className="stat-num">{data.contradictedClaims}</div>
                <div className="small muted">Debunked / False →</div>
              </Link>
              <Link to="/app/history?verdict=MIXED" className="stat-card stat-mixed clickable" title="View mixed evidence">
                <div className="stat-label">Mixed Evidence</div>
                <div className="stat-num">{data.mixedResults}</div>
                <div className="small muted">Divergent findings →</div>
              </Link>
              <Link to="/app/history?verdict=UNVERIFIED" className="stat-card stat-unverified clickable" title="View unverified claims">
                <div className="stat-label">Unverified</div>
                <div className="stat-num">{data.unverifiedClaims}</div>
                <div className="small muted">Insufficient proof →</div>
              </Link>
              <Link to="/app/reports" className="stat-card clickable" title="View saved reports">
                <div className="stat-label">Saved Reports</div>
                <div className="stat-num">{data.savedReports}</div>
                <div className="small muted">In your library →</div>
              </Link>
            </div>

            {/* Type Breakdown Pills */}
            {data.byType && (
              <div className="type-pills">
                <span className="small muted" style={{ display: 'inline-flex', alignItems: 'center', marginRight: '0.25rem' }}>
                  Filter by Type:
                </span>
                <Link to="/app/history?type=text" className="type-pill" title="Filter text claims">
                  📝 Text ({data.byType.text || 0})
                </Link>
                <Link to="/app/history?type=url" className="type-pill" title="Filter web articles">
                  🔗 URL ({data.byType.url || 0})
                </Link>
                <Link to="/app/history?type=image" className="type-pill" title="Filter image analyses">
                  🖼️ Image ({data.byType.image || 0})
                </Link>
                <Link to="/app/history?type=video" className="type-pill" title="Filter video keyframes">
                  🎥 Video ({data.byType.video || 0})
                </Link>
              </div>
            )}

            {/* Verdict Proportion Breakdown Bar */}
            {total > 0 && (
              <div className="card" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.88rem', textTransform: 'uppercase', color: 'var(--muted)' }}>
                    Evidentiary Verdict Distribution
                  </strong>
                  <span className="small muted">{total} total assertions</span>
                </div>
                <div className="ratio-bar">
                  <div className="ratio-seg-supported" style={{ width: `${supPct}%` }} title={`Supported: ${Math.round(supPct)}%`} />
                  <div className="ratio-seg-contradicted" style={{ width: `${conPct}%` }} title={`Contradicted: ${Math.round(conPct)}%`} />
                  <div className="ratio-seg-mixed" style={{ width: `${mixPct}%` }} title={`Mixed: ${Math.round(mixPct)}%`} />
                  <div className="ratio-seg-unverified" style={{ width: `${unvPct}%` }} title={`Unverified: ${Math.round(unvPct)}%`} />
                </div>
                <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 10, height: 10, background: 'var(--option-selection)', borderRadius: '50%' }} /> Supported ({Math.round(supPct)}%)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 10, height: 10, background: 'var(--main-headings)', borderRadius: '50%' }} /> Contradicted ({Math.round(conPct)}%)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 10, height: 10, background: 'var(--rest-anything)', borderRadius: '50%' }} /> Mixed ({Math.round(mixPct)}%)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 10, height: 10, background: '#D1DFE3', borderRadius: '50%' }} /> Unverified ({Math.round(unvPct)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '0.25rem 0' }}>
              <Link className="btn btn-primary" to="/app/verify/text">
                + Verify Text
              </Link>
              <Link className="btn" to="/app/verify/url">
                + Verify URL
              </Link>
              <Link className="btn" to="/app/verify/image">
                + Verify Image
              </Link>
              <Link className="btn" to="/app/verify/video">
                + Verify Video
              </Link>
              <Link className="btn" to="/app/history">
                View Full History
              </Link>
            </div>

            {/* Recent Verification Activity */}
            <div className="card">
              <h3 style={{ marginBottom: '0.75rem' }}>Recent Verification Activity</h3>
              {data.recentActivity && data.recentActivity.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {data.recentActivity.map((r) => {
                    const v = (r.verdict || 'UNVERIFIED').toUpperCase();
                    const cls =
                      v === 'SUPPORTED'
                        ? 'badge-supported'
                        : v === 'CONTRADICTED'
                        ? 'badge-contradicted'
                        : v === 'MIXED'
                        ? 'badge-mixed'
                        : 'badge-unverified';

                    const isFailed = r.status === 'failed';
                    const isProcessing = r.status === 'processing' || r.status === 'pending';

                    return (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.75rem',
                          padding: '0.75rem 0.85rem',
                          background: 'var(--surface-raised)',
                          borderRadius: 'var(--radius)',
                          border: isFailed ? '1px solid var(--danger)' : '1px solid var(--border)',
                        }}
                      >
                        <div style={{ minWidth: 200, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                            <span className="badge badge-unverified" style={{ fontSize: '0.75rem' }}>
                              {r.type}
                            </span>
                            {isProcessing ? (
                              <span className="badge badge-processing" style={{ fontSize: '0.75rem' }}>
                                <span className="pulse-dot" style={{ width: 6, height: 6 }} /> Processing
                              </span>
                            ) : isFailed ? (
                              <span className="badge badge-failed" style={{ fontSize: '0.75rem' }}>
                                ⚠️ Failed
                              </span>
                            ) : (
                              <span className={`badge ${cls}`} style={{ fontSize: '0.75rem' }}>
                                {v}
                              </span>
                            )}
                            <span className="small muted">{fmt(r.createdAt)}</span>
                          </div>
                          <div style={{ fontWeight: 500, fontSize: '0.92rem' }}>
                            "{r.snippet}"
                          </div>
                          {isFailed && r.errorMessage && (
                            <div className="field-error small" style={{ marginTop: '0.2rem' }}>
                              Failure: {r.errorMessage}
                            </div>
                          )}
                        </div>
                        <button className="btn small" onClick={() => openRecent(r)}>
                          View Details
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No verifications yet"
                  description="Submit statements, articles, images or video keyframes to populate your dashboard and history."
                  action={
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <Link className="btn btn-primary" to="/app/verify/text">Verify Text</Link>
                      <Link className="btn" to="/app/verify/url">Verify URL</Link>
                      <Link className="btn" to="/app/verify/image">Verify Image</Link>
                    </div>
                  }
                />
              )}
            </div>
          </div>
        )
      )}

      {/* Modal for Recent Activity Detail */}
      <Modal
        open={Boolean(activeItem)}
        title={activeItem ? `${activeItem.type?.toUpperCase()} Verification Details` : ''}
        onClose={() => setActiveItem(null)}
        actions={<Button variant="default" onClick={() => setActiveItem(null)}>Close</Button>}
      >
        {activeLoading ? (
          <LoadingState message="Retrieving verification result and evidentiary sources..." />
        ) : (
          activeItem && (
            <div>
              <div className="small muted" style={{ marginBottom: '0.5rem' }}>
                Request ID: {activeItem.id} • Submitted: {fmt(activeItem.created_at || activeItem.createdAt)}
              </div>
              {activeItem.status === 'failed' ? (
                <FailedVerificationCard
                  error={activeItem.error_message || activeItem.errorMessage}
                  requestId={activeItem.id}
                  onRetry={() => {
                    setActiveItem(null);
                    window.location.href = `/app/verify/${activeItem.type}`;
                  }}
                />
              ) : (
                <VerificationResult request={activeItem} />
              )}
            </div>
          )
        )}
      </Modal>
    </>
  );
}

const modes = {
  text: { label: 'Text Verification', hint: 'Verify factual claims, viral messages, or long articles in English or Hindi (हिंदी).' },
  image: { label: 'Image Verification', hint: 'Inspect JPG, PNG, and WebP images for EXIF metadata, editing traces, and synthetic generation.' },
  video: { label: 'Video Verification', hint: 'Analyze MP4, WebM, and MOV videos with background keyframe extraction and inconsistency detection.' },
  url: { label: 'URL Verification', hint: 'Verify online articles safely with SSRF protection, publisher extraction, and fact-checking.' },
};

/**
 * 2. WORKSPACE COMPONENT (Phase 4)
 * Multi-modal verification workspace with robust state handling (loading, processing, unsupported files, errors, and success).
 */
export function Workspace() {
  const { mode = 'text' } = useParams();
  const currentMode = modes[mode] ? mode : 'text';
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unsupportedFile, setUnsupportedFile] = useState(null);
  const [pollStatus, setPollStatus] = useState('');
  const [pollAttempt, setPollAttempt] = useState(0);
  const [currentResult, setCurrentResult] = useState(null);
  const pollTimerRef = useRef(null);

  // Clear result and timers on tab change
  useEffect(() => {
    setError('');
    setUnsupportedFile(null);
    setCurrentResult(null);
    setPollStatus('');
    setPollAttempt(0);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  }, [currentMode]);

  const pollJobStatus = (jobId) => {
    setPollStatus('Background verification processing...');
    let attempts = 0;

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      setPollAttempt(attempts);
      try {
        const req = await api(`/verify/${jobId}`);
        if (req.status === 'completed') {
          clearInterval(pollTimerRef.current);
          setBusy(false);
          setPollStatus('');
          setCurrentResult(req);
          toast('Verification completed successfully', 'success');
        } else if (req.status === 'failed') {
          clearInterval(pollTimerRef.current);
          setBusy(false);
          setPollStatus('');
          setError(req.errorMessage || 'Verification job failed during background media processing');
        } else {
          setPollStatus(`Processing keyframes in background (step ${attempts})...`);
        }
      } catch (err) {
        clearInterval(pollTimerRef.current);
        setBusy(false);
        setPollStatus('');
        setError(err.message);
      }
    }, 1500);
  };

  const handleFileChange = (e, allowedExts, formatLabel) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExts.includes(ext)) {
      setUnsupportedFile({ name: file.name, formatLabel });
      e.target.value = '';
    } else {
      setUnsupportedFile(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUnsupportedFile(null);
    setCurrentResult(null);
    setBusy(true);

    const formData = new FormData(e.currentTarget);

    try {
      if (currentMode === 'text') {
        const text = formData.get('text')?.trim();
        if (!text) throw new Error('Please enter text to verify');
        const res = await api('/verify/text', { method: 'POST', body: { text } });
        setCurrentResult(res);
        setBusy(false);
      } else if (currentMode === 'url') {
        const url = formData.get('url')?.trim();
        if (!url) throw new Error('Please enter a valid HTTP or HTTPS URL');
        const res = await api('/verify/url', { method: 'POST', body: { url } });
        setCurrentResult(res);
        setBusy(false);
      } else if (currentMode === 'image') {
        const file = formData.get('image');
        if (!file || file.size === 0) throw new Error('Please select an image file to upload');
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          throw new Error(`Unsupported image format (${ext}). Supported formats: JPG, PNG, WebP.`);
        }
        const uploadData = new FormData();
        uploadData.append('image', file);
        const res = await api('/verify/image', { method: 'POST', body: uploadData });
        setCurrentResult(res);
        setBusy(false);
      } else if (currentMode === 'video') {
        const file = formData.get('video');
        if (!file || file.size === 0) throw new Error('Please select a video file to upload');
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!['.mp4', '.webm', '.mov', '.mkv', '.avi'].includes(ext)) {
          throw new Error(`Unsupported video format (${ext}). Supported formats: MP4, WebM, MOV, MKV, AVI.`);
        }
        const uploadData = new FormData();
        uploadData.append('video', file);
        const res = await api('/verify/video', { method: 'POST', body: uploadData });
        pollJobStatus(res.id);
      }
    } catch (err) {
      setBusy(false);
      setError(err.message);
    }
  };

  return (
    <>
      <Head title="Verification workspace">{modes[currentMode].hint}</Head>

      <nav className="tabs" aria-label="Verification type">
        {Object.entries(modes).map(([key, m]) => (
          <NavLink key={key} to={`/app/verify/${key}`} className={({ isActive }) => (isActive ? 'active' : '')}>
            {m.label}
          </NavLink>
        ))}
      </nav>

      {/* Unsupported File Warning */}
      {unsupportedFile && (
        <UnsupportedFileState
          file={unsupportedFile}
          supportedTypes={unsupportedFile.formatLabel}
          onDismiss={() => setUnsupportedFile(null)}
        />
      )}

      {/* Error Message */}
      <ErrorMessage>{error}</ErrorMessage>

      {/* Processing State for Async Background Jobs */}
      {busy && pollStatus && (
        <ProcessingState
          message="Running Deep Analysis & Evidence Extraction..."
          progress={Math.min(95, pollAttempt * 12)}
          details={pollStatus}
        />
      )}

      {/* Verification Submission Form */}
      <form className="card stack" onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        {currentMode === 'text' && (
          <Field
            id="text"
            name="text"
            label="Claim or article statement to verify"
            multiline
            placeholder="e.g. 'Water boils at 100 degrees Celsius under standard atmospheric pressure' or paste viral message in English or Hindi (हिंदी)..."
            hint="Supports cross-lingual Devanagari script tokenization, sentence claim decomposition, and multi-tier source retrieval."
            required
          />
        )}

        {currentMode === 'image' && (
          <div className="field">
            <label htmlFor="image">Upload Image File (JPG, PNG, WebP)</label>
            <input
              id="image"
              name="image"
              type="file"
              className="input"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(e) => handleFileChange(e, ['.jpg', '.jpeg', '.png', '.webp'], 'JPG, JPEG, PNG, WebP')}
              required
            />
            <div className="hint">
              Extracts EXIF camera metadata, editing software signatures (Photoshop, Canva, GIMP), and AI generation parameters. Maximum size: 25MB.
            </div>
          </div>
        )}

        {currentMode === 'video' && (
          <div className="field">
            <label htmlFor="video">Upload Video File (MP4, WebM, MOV, MKV, AVI)</label>
            <input
              id="video"
              name="video"
              type="file"
              className="input"
              accept=".mp4,.webm,.mov,.mkv,.avi,video/*"
              onChange={(e) => handleFileChange(e, ['.mp4', '.webm', '.mov', '.mkv', '.avi'], 'MP4, WebM, MOV, MKV, AVI')}
              required
            />
            <div className="hint">
              Processes video streams asynchronously in background. Extracts keyframes with timestamps, examines stream codecs, and analyzes visual consistency. Maximum size: 50MB.
            </div>
          </div>
        )}

        {currentMode === 'url' && (
          <Field
            id="url"
            name="url"
            label="Website or Article URL"
            type="url"
            placeholder="https://example.com/news/article-headline"
            hint="Protected by strict SSRF guards, private IP blocking, DNS resolution inspection, and redirect limits."
            required
          />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
          <Button variant="primary" type="submit" loading={busy}>
            {busy ? 'Verifying...' : `Run ${modes[currentMode].label}`}
          </Button>
          {busy && !pollStatus && <span className="small muted">Retrieving evidence and evaluating facts...</span>}
        </div>
      </form>

      {/* Render Results */}
      {currentResult && <VerificationResult request={currentResult} />}
    </>
  );
}

/**
 * 3. VERIFICATION HISTORY COMPONENT (Phase 4)
 * URL-synced search, date filters, type filters, verdict filters, status filters, sorting, pagination, viewing, and deletion.
 */
export function History() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read state from URL search params
  const search = searchParams.get('search') || '';
  const type = searchParams.get('type') || 'all';
  const verdict = searchParams.get('verdict') || 'all';
  const status = searchParams.get('status') || 'all';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  const [historyState, setHistoryState] = useState({ items: [], pagination: null, loading: true, error: '' });
  const [activeItem, setActiveItem] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(search);

  // Sync search input when URL changes
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== 'page') next.set('page', '1');
    setSearchParams(next);
  };

  const fetchHistory = () => {
    setHistoryState((s) => ({ ...s, loading: true, error: '' }));
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (type !== 'all') params.set('type', type);
    if (verdict !== 'all') params.set('verdict', verdict);
    if (status !== 'all') params.set('status', status);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    params.set('sort', sort);
    params.set('page', page.toString());
    params.set('limit', limit.toString());

    api(`/verifications?${params.toString()}`)
      .then((data) => {
        setHistoryState({
          items: data.items || [],
          pagination: data.pagination || null,
          loading: false,
          error: '',
        });
      })
      .catch((err) => {
        setHistoryState({ items: [], pagination: null, loading: false, error: err.message });
      });
  };

  useEffect(() => {
    fetchHistory();
  }, [search, type, verdict, status, fromDate, toDate, sort, page, limit]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    updateParam('search', searchInput);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearchParams({});
  };

  const applyDatePreset = (days) => {
    const next = new URLSearchParams(searchParams);
    if (days === 0) {
      const today = new Date().toISOString().slice(0, 10);
      next.set('fromDate', today);
      next.set('toDate', today);
    } else {
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - days);
      next.set('fromDate', from.toISOString().slice(0, 10));
      next.set('toDate', to.toISOString().slice(0, 10));
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const openDetail = async (item) => {
    setDetailLoading(true);
    try {
      const detailed = await api(`/verifications/${item.id}`);
      setActiveItem(detailed);
    } catch (err) {
      toast(err.message || 'Failed to retrieve verification details', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm('Delete this verification from your history? Associated results and files will be permanently removed.')) return;
    try {
      await api(`/verifications/${item.id}`, { method: 'DELETE' });
      toast('Verification deleted from history', 'success');
      if (activeItem?.id === item.id) setActiveItem(null);
      fetchHistory();
    } catch (err) {
      toast(err.message || 'Failed to delete verification', 'error');
    }
  };

  const columns = [
    {
      key: 'type',
      label: 'Type',
      render: (r) => (
        <span className="badge badge-unverified" style={{ fontSize: '0.75rem' }}>
          {r.type}
        </span>
      ),
    },
    {
      key: 'content',
      label: 'Submission Snippet',
      render: (r) => {
        const text = r.input_text || r.input_url || (r.type === 'image' ? 'Image Analysis' : r.type === 'video' ? 'Video Keyframes' : 'Document');
        return (
          <div
            style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, cursor: 'pointer' }}
            onClick={() => openDetail(r)}
            title="Click to view full result"
          >
            {text}
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => {
        if (r.status === 'completed') {
          return <span className="badge badge-supported">✓ Completed</span>;
        }
        if (r.status === 'failed') {
          return <span className="badge badge-failed" title={r.error_message || 'Verification failed'}>⚠️ Failed</span>;
        }
        return (
          <span className="badge badge-processing">
            <span className="pulse-dot" style={{ width: 6, height: 6 }} /> Processing
          </span>
        );
      },
    },
    {
      key: 'verdict',
      label: 'Verdict',
      render: (r) => {
        if (r.status === 'failed') {
          return <span className="badge badge-failed">Failed</span>;
        }
        const v = (r.verdict || 'UNVERIFIED').toUpperCase();
        const cls =
          v === 'SUPPORTED' ? 'badge-supported' : v === 'CONTRADICTED' ? 'badge-contradicted' : v === 'MIXED' ? 'badge-mixed' : 'badge-unverified';
        return <span className={`badge ${cls}`}>{v}</span>;
      },
    },
    {
      key: 'confidence',
      label: 'Confidence',
      render: (r) => (r.confidence != null ? `${Math.round(Number(r.confidence) * 100)}%` : '—'),
    },
    { key: 'created_at', label: 'Submitted', render: (r) => fmt(r.created_at) },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="btn small" onClick={() => openDetail(r)}>
            View
          </button>
          <button className="btn small btn-danger" onClick={() => deleteItem(r)} title="Delete record">
            Delete
          </button>
        </div>
      ),
    },
  ];

  const hasActiveFilters = Boolean(search || type !== 'all' || verdict !== 'all' || status !== 'all' || fromDate || toDate);

  return (
    <>
      <Head title="Verification history">
        Inspect, filter, search, and manage your complete verification history.
      </Head>

      {historyState.error && (
        <ServerErrorState error={historyState.error} onRetry={fetchHistory} />
      )}

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: 220 }}>
          <input
            type="text"
            className="filter-input"
            style={{ flex: 1 }}
            placeholder="Search keywords, claims, or URLs..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn small">
            Search
          </button>
        </form>

        <div className="filter-group">
          <label>Type:</label>
          <select className="filter-select" value={type} onChange={(e) => updateParam('type', e.target.value)}>
            <option value="all">All Types</option>
            <option value="text">Text</option>
            <option value="url">URL</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Verdict:</label>
          <select className="filter-select" value={verdict} onChange={(e) => updateParam('verdict', e.target.value)}>
            <option value="all">All Verdicts</option>
            <option value="SUPPORTED">Supported</option>
            <option value="CONTRADICTED">Contradicted</option>
            <option value="MIXED">Mixed</option>
            <option value="UNVERIFIED">Unverified</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Status:</label>
          <select className="filter-select" value={status} onChange={(e) => updateParam('status', e.target.value)}>
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="filter-group">
          <label>From:</label>
          <input
            type="date"
            className="filter-input"
            style={{ width: 130 }}
            value={fromDate}
            onChange={(e) => updateParam('fromDate', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>To:</label>
          <input
            type="date"
            className="filter-input"
            style={{ width: 130 }}
            value={toDate}
            onChange={(e) => updateParam('toDate', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Sort:</label>
          <select className="filter-select" value={sort} onChange={(e) => updateParam('sort', e.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="confidence_desc">Highest Confidence</option>
            <option value="confidence_asc">Lowest Confidence</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button type="button" className="btn small" onClick={handleResetFilters}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Date Quick Presets */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="small muted">Quick Date Presets:</span>
        <button type="button" className="btn small" onClick={() => applyDatePreset(0)}>Today</button>
        <button type="button" className="btn small" onClick={() => applyDatePreset(7)}>Last 7 Days</button>
        <button type="button" className="btn small" onClick={() => applyDatePreset(30)}>Last 30 Days</button>
      </div>

      {/* Table Results */}
      {historyState.loading ? (
        <LoadingState message="Loading verification history records..." />
      ) : (
        <>
          <Table
            columns={columns}
            rows={historyState.items}
            empty={
              hasActiveFilters ? (
                <EmptyState
                  title="No verifications match your criteria"
                  description="Try adjusting or clearing your search filters to view your records."
                  action={
                    <Button variant="default" onClick={handleResetFilters}>
                      Clear Filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="No verification history yet"
                  description="Submit a claim, URL, image, or video in the workspace to create your first verification."
                  action={<Link className="btn btn-primary" to="/app/verify">Open Workspace</Link>}
                />
              )
            }
          />

          {/* Pagination Controls */}
          {historyState.pagination && historyState.pagination.totalPages > 1 && (
            <div className="pagination-bar">
              <div>
                Showing page {historyState.pagination.page} of {historyState.pagination.totalPages} ({historyState.pagination.totalCount} total verifications)
              </div>
              <div className="pagination-controls">
                <Button
                  variant="default"
                  disabled={!historyState.pagination.hasPrev}
                  onClick={() => updateParam('page', Math.max(1, page - 1).toString())}
                >
                  ← Previous
                </Button>
                {Array.from({ length: Math.min(5, historyState.pagination.totalPages) }, (_, i) => {
                  const pNum = i + 1;
                  return (
                    <button
                      key={pNum}
                      className={`btn small ${pNum === page ? 'btn-primary' : ''}`}
                      onClick={() => updateParam('page', pNum.toString())}
                    >
                      {pNum}
                    </button>
                  );
                })}
                <Button
                  variant="default"
                  disabled={!historyState.pagination.hasNext}
                  onClick={() => updateParam('page', (page + 1).toString())}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      <Modal
        open={Boolean(activeItem)}
        title={activeItem ? `${activeItem.type?.toUpperCase()} Verification Details` : ''}
        onClose={() => setActiveItem(null)}
        actions={<Button variant="default" onClick={() => setActiveItem(null)}>Close</Button>}
      >
        {detailLoading ? (
          <LoadingState message="Retrieving full verification report..." />
        ) : (
          activeItem && (
            <div>
              <div className="small muted" style={{ marginBottom: '0.5rem' }}>
                Request ID: {activeItem.id} • Submitted: {fmt(activeItem.created_at || activeItem.createdAt)}
              </div>
              {activeItem.status === 'failed' ? (
                <FailedVerificationCard
                  error={activeItem.error_message || activeItem.errorMessage}
                  requestId={activeItem.id}
                  onRetry={() => {
                    setActiveItem(null);
                    window.location.href = `/app/verify/${activeItem.type}`;
                  }}
                />
              ) : (
                <VerificationResult request={activeItem} />
              )}
            </div>
          )
        )}
      </Modal>
    </>
  );
}

/**
 * 4. SAVED REPORTS COMPONENT (Phase 4)
 * Search, filters, pagination, PDF download, secure sharing, editing, and deletion.
 */
export function Reports() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') || '';
  const verdict = searchParams.get('verdict') || 'all';
  const access = searchParams.get('access') || 'all';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [reportsState, setReportsState] = useState({ items: [], pagination: null, loading: true, error: '' });
  const [activeReport, setActiveReport] = useState(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [shareModalReport, setShareModalReport] = useState(null);
  const [shareTokenUrl, setShareTokenUrl] = useState('');
  const [shareBusy, setShareBusy] = useState(false);

  // Edit Modal State
  const [editModalReport, setEditModalReport] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== 'page') next.set('page', '1');
    setSearchParams(next);
  };

  const loadReports = () => {
    setReportsState((s) => ({ ...s, loading: true, error: '' }));
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (verdict !== 'all') params.set('verdict', verdict);
    if (access !== 'all') params.set('access', access);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    params.set('sort', sort);
    params.set('page', page.toString());
    params.set('limit', '10');

    api(`/reports?${params.toString()}`)
      .then((data) => {
        setReportsState({
          items: data.items || [],
          pagination: data.pagination || null,
          loading: false,
          error: '',
        });
      })
      .catch((e) => setReportsState({ items: [], pagination: null, error: e.message, loading: false }));
  };

  useEffect(() => {
    loadReports();
  }, [search, verdict, access, fromDate, toDate, sort, page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    updateParam('search', searchInput);
  };

  const openReport = async (reportItem) => {
    setActiveLoading(true);
    try {
      const full = await api(`/reports/${reportItem.id}`);
      setActiveReport(full);
    } catch (err) {
      toast(err.message || 'Failed to load report details', 'error');
    } finally {
      setActiveLoading(false);
    }
  };

  const openEdit = (rep) => {
    setEditModalReport(rep);
    setEditTitle(rep.title || '');
    setEditNotes(rep.notes || '');
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editModalReport) return;
    setEditBusy(true);
    try {
      await api(`/reports/${editModalReport.id}`, {
        method: 'PATCH',
        body: { title: editTitle, notes: editNotes },
      });
      toast('Report title and notes updated', 'success');
      setEditModalReport(null);
      loadReports();
    } catch (err) {
      toast(err.message || 'Failed to update report', 'error');
    } finally {
      setEditBusy(false);
    }
  };

  const copyReportSummary = async (reportId) => {
    try {
      const res = await api(`/reports/${reportId}/summary`);
      if (res.plainText) {
        navigator.clipboard.writeText(res.plainText);
        toast('Report summary copied to clipboard', 'success');
      }
    } catch (err) {
      toast(err.message || 'Failed to copy summary', 'error');
    }
  };

  const downloadReportPdf = (reportId) => {
    const url = `/api/reports/${reportId}/pdf`;
    window.open(url, '_blank');
  };

  const openShare = async (rep) => {
    setShareModalReport(rep);
    setShareBusy(true);
    try {
      const res = await api(`/reports/${rep.id}/share`, { method: 'POST' });
      const full = `${window.location.origin}/report/${res.shareToken}`;
      setShareTokenUrl(full);
    } catch (err) {
      toast(err.message || 'Failed to generate share link', 'error');
    } finally {
      setShareBusy(false);
    }
  };

  const revokeShare = async () => {
    if (!shareModalReport) return;
    setShareBusy(true);
    try {
      await api(`/reports/${shareModalReport.id}/share`, { method: 'DELETE' });
      setShareTokenUrl('');
      toast('Share link revoked. Public access disabled.', 'success');
      loadReports();
      setShareModalReport(null);
    } catch (err) {
      toast(err.message || 'Failed to revoke link', 'error');
    } finally {
      setShareBusy(false);
    }
  };

  const deleteReport = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this saved report from your library?')) return;
    try {
      await api(`/reports/${reportId}`, { method: 'DELETE' });
      toast('Report deleted from your library', 'success');
      if (activeReport?.id === reportId) setActiveReport(null);
      loadReports();
    } catch (err) {
      toast(err.message || 'Failed to delete report', 'error');
    }
  };

  const columns = [
    {
      key: 'title',
      label: 'Title',
      render: (r) => (
        <div>
          <span style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => openReport(r)}>
            {r.title}
          </span>
          {r.notes && <div className="small muted">{r.notes}</div>}
        </div>
      ),
    },
    {
      key: 'verdict',
      label: 'Verdict',
      render: (r) => {
        const v = (r.verdict || 'UNVERIFIED').toUpperCase();
        const cls =
          v === 'SUPPORTED' ? 'badge-supported' : v === 'CONTRADICTED' ? 'badge-contradicted' : v === 'MIXED' ? 'badge-mixed' : 'badge-unverified';
        return <span className={`badge ${cls}`}>{v}</span>;
      },
    },
    {
      key: 'share',
      label: 'Access',
      render: (r) => (
        <span className={`badge ${r.is_public ? 'badge-supported' : 'badge-unverified'}`} style={{ fontSize: '0.75rem' }}>
          {r.is_public ? '🔗 Shared' : '🔒 Private'}
        </span>
      ),
    },
    { key: 'created_at', label: 'Saved', render: (r) => fmt(r.created_at) },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button className="btn small" onClick={() => openReport(r)} title="View complete report">
            View
          </button>
          <button className="btn small" onClick={() => openEdit(r)} title="Edit title and notes">
            Edit
          </button>
          <button className="btn small" onClick={() => downloadReportPdf(r.id)} title="Download PDF">
            PDF
          </button>
          <button className="btn small" onClick={() => copyReportSummary(r.id)} title="Copy summary text">
            Copy
          </button>
          <button className="btn small" onClick={() => openShare(r)} title="Manage share link">
            Share
          </button>
          <button className="btn small btn-danger" onClick={() => deleteReport(r.id)} title="Delete report">
            Delete
          </button>
        </div>
      ),
    },
  ];

  const hasActiveFilters = Boolean(search || verdict !== 'all' || access !== 'all' || fromDate || toDate);

  return (
    <>
      <Head title="Saved verification reports">
        Manage your saved private verification reports, copy summaries, download PDF exports, and manage secure share links.
      </Head>

      {reportsState.error && (
        <ServerErrorState error={reportsState.error} onRetry={loadReports} />
      )}

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: 200 }}>
          <input
            type="text"
            className="filter-input"
            style={{ flex: 1 }}
            placeholder="Search report titles or notes..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn small">
            Search
          </button>
        </form>

        <div className="filter-group">
          <label>Verdict:</label>
          <select className="filter-select" value={verdict} onChange={(e) => updateParam('verdict', e.target.value)}>
            <option value="all">All Verdicts</option>
            <option value="SUPPORTED">Supported</option>
            <option value="CONTRADICTED">Contradicted</option>
            <option value="MIXED">Mixed</option>
            <option value="UNVERIFIED">Unverified</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Access:</label>
          <select className="filter-select" value={access} onChange={(e) => updateParam('access', e.target.value)}>
            <option value="all">All Access</option>
            <option value="public">Shared / Public</option>
            <option value="private">Private</option>
          </select>
        </div>

        <div className="filter-group">
          <label>From:</label>
          <input
            type="date"
            className="filter-input"
            style={{ width: 130 }}
            value={fromDate}
            onChange={(e) => updateParam('fromDate', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>To:</label>
          <input
            type="date"
            className="filter-input"
            style={{ width: 130 }}
            value={toDate}
            onChange={(e) => updateParam('toDate', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Sort:</label>
          <select className="filter-select" value={sort} onChange={(e) => updateParam('sort', e.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="title_asc">Title (A-Z)</option>
            <option value="title_desc">Title (Z-A)</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button type="button" className="btn small" onClick={() => setSearchParams({})}>
            Clear Filters
          </button>
        )}
      </div>

      {reportsState.loading ? (
        <LoadingState message="Loading your saved reports..." />
      ) : (
        <>
          <Table
            columns={columns}
            rows={reportsState.items}
            empty={
              hasActiveFilters ? (
                <EmptyState
                  title="No saved reports match your search criteria"
                  description="Try adjusting search terms or clear filters to view your library."
                  action={
                    <Button variant="default" onClick={() => setSearchParams({})}>
                      Clear Filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="No saved reports yet"
                  description="Save verification results from the workspace to create persistent, downloadable reports in your library."
                  action={<Link className="btn btn-primary" to="/app/verify">Open Workspace</Link>}
                />
              )
            }
          />

          {/* Pagination Controls */}
          {reportsState.pagination && reportsState.pagination.totalPages > 1 && (
            <div className="pagination-bar">
              <div>
                Showing page {reportsState.pagination.page} of {reportsState.pagination.totalPages} ({reportsState.pagination.totalCount} total saved reports)
              </div>
              <div className="pagination-controls">
                <Button
                  variant="default"
                  disabled={!reportsState.pagination.hasPrev}
                  onClick={() => updateParam('page', Math.max(1, page - 1).toString())}
                >
                  ← Previous
                </Button>
                <Button
                  variant="default"
                  disabled={!reportsState.pagination.hasNext}
                  onClick={() => updateParam('page', (page + 1).toString())}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Report Modal */}
      <Modal
        open={Boolean(editModalReport)}
        title="Edit Report Details"
        onClose={() => setEditModalReport(null)}
        actions={
          <>
            <Button variant="default" onClick={() => setEditModalReport(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={editBusy} onClick={saveEdit}>
              Save Changes
            </Button>
          </>
        }
      >
        <form className="stack" onSubmit={saveEdit}>
          <Field
            id="editTitle"
            label="Report Title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />
          <Field
            id="editNotes"
            label="Personal Notes"
            multiline
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Add context, archival references, or evaluation notes..."
          />
        </form>
      </Modal>

      {/* View Saved Report Detail Modal */}
      <Modal
        open={Boolean(activeReport)}
        title={activeReport ? activeReport.title : ''}
        onClose={() => setActiveReport(null)}
        actions={
          <>
            {activeReport && (
              <>
                <Button variant="default" onClick={() => downloadReportPdf(activeReport.id)}>
                  📄 Download PDF
                </Button>
                <Button variant="default" onClick={() => copyReportSummary(activeReport.id)}>
                  📋 Copy Summary
                </Button>
                <Button variant="default" onClick={() => openShare(activeReport)}>
                  🔗 Share
                </Button>
              </>
            )}
            <Button variant="default" onClick={() => setActiveReport(null)}>
              Close
            </Button>
          </>
        }
      >
        {activeLoading ? (
          <LoadingState message="Retrieving saved report and evidentiary sources..." />
        ) : activeReport ? (
          <div>
            <div className="small muted" style={{ marginBottom: '0.5rem' }}>
              Report ID: {activeReport.id} • Saved: {fmt(activeReport.createdAt || activeReport.created_at)}
            </div>
            <VerificationResult request={activeReport} />
          </div>
        ) : null}
      </Modal>

      {/* Share Management Modal */}
      <Modal
        open={Boolean(shareModalReport)}
        title="Share Report"
        onClose={() => setShareModalReport(null)}
        actions={
          <>
            {shareTokenUrl && (
              <Button variant="danger" onClick={revokeShare} loading={shareBusy}>
                Revoke Public Link
              </Button>
            )}
            <Button variant="default" onClick={() => setShareModalReport(null)}>
              Done
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="muted small">
            Anyone with this secure unguessable link can view this transparent verification report. Your private account details, email, and other verifications remain completely protected.
          </p>
          {shareBusy ? (
            <LoadingState message="Configuring secure share token..." />
          ) : shareTokenUrl ? (
            <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', padding: '0.85rem', borderRadius: '4px' }}>
              <div className="small muted" style={{ marginBottom: '0.3rem' }}>
                Secure Public Share Link:
              </div>
              <input
                type="text"
                readOnly
                className="input"
                value={shareTokenUrl}
                onClick={(e) => e.target.select()}
              />
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    navigator.clipboard.writeText(shareTokenUrl);
                    toast('Share link copied to clipboard', 'success');
                  }}
                >
                  📋 Copy Link
                </Button>
                <a className="btn" href={shareTokenUrl} target="_blank" rel="noopener noreferrer">
                  ↗ Open in New Tab
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

/**
 * 5. PROFILE COMPONENT (Phase 4)
 * Name editing, language preference, and account customization preferences.
 */
export function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [defaultMode, setDefaultMode] = useState(user.preferences?.defaultMode || 'text');
  const [autoSaveReports, setAutoSaveReports] = useState(Boolean(user.preferences?.autoSaveReports));
  const [emailAlerts, setEmailAlerts] = useState(Boolean(user.preferences?.emailAlerts));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const updated = await api('/auth/me', {
        method: 'PATCH',
        body: {
          name: fd.get('name'),
          preferredLanguage: fd.get('preferredLanguage'),
          preferences: {
            defaultMode,
            autoSaveReports,
            emailAlerts,
          },
        },
      });
      setUser(updated.user);
      toast('Profile updated successfully', 'success');
    } catch (err) {
      setError(err.fields?.name || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head title="Profile">Manage your personal information, language preferences, and verification settings.</Head>
      <form className="card stack" onSubmit={save} style={{ maxWidth: 560 }}>
        <ErrorMessage>{error}</ErrorMessage>
        <Field id="name" name="name" label="Full Name" defaultValue={user.name} required />
        <Field id="email" label="Email Address" value={user.email} readOnly hint="Email address is fixed and verified." />

        <div className="field">
          <label htmlFor="preferredLanguage">Default Verification Language</label>
          <select
            id="preferredLanguage"
            name="preferredLanguage"
            className="input"
            defaultValue={user.preferredLanguage || 'en'}
          >
            <option value="en">English (en)</option>
            <option value="hi">Hindi / हिंदी (hi)</option>
          </select>
          <div className="hint">Preferred language for claim parsing, factual reasoning, and verdict summaries.</div>
        </div>

        {/* Account Customization Preferences */}
        <div className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <h4>Verification & Workspace Preferences</h4>

          <div className="field">
            <label htmlFor="defaultMode">Default Workspace Verification Tab</label>
            <select
              id="defaultMode"
              className="input"
              value={defaultMode}
              onChange={(e) => setDefaultMode(e.target.value)}
            >
              <option value="text">Text Verification</option>
              <option value="url">URL Verification</option>
              <option value="image">Image Verification</option>
              <option value="video">Video Verification</option>
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={autoSaveReports}
              onChange={(e) => setAutoSaveReports(e.target.checked)}
            />
            Automatically save completed verifications to my reports library
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={emailAlerts}
              onChange={(e) => setEmailAlerts(e.target.checked)}
            />
            Send notifications when async background processing completes
          </label>
        </div>

        <div className="muted small">Account created {new Date(user.createdAt).toLocaleDateString()}</div>
        <div>
          <Button variant="primary" loading={busy} type="submit">
            Save Changes
          </Button>
        </div>
      </form>
    </>
  );
}

/**
 * 6. SETTINGS COMPONENT (Phase 4)
 * Password management with checklist, active sessions management, and account deletion.
 */
export function Settings() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // Password state
  const [pwdError, setPwdError] = useState('');
  const [pwdFields, setPwdFields] = useState({});
  const [pwdBusy, setPwdBusy] = useState(false);
  const [newPwdInput, setNewPwdInput] = useState('');
  const [confirmPwdInput, setConfirmPwdInput] = useState('');

  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadSessions = () => {
    setSessionsLoading(true);
    api('/auth/sessions')
      .then((data) => setSessions(data.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // Password validation checks
  const isLen = newPwdInput.length >= 10;
  const hasLetter = /[A-Za-z]/.test(newPwdInput);
  const hasNumber = /\d/.test(newPwdInput);
  const isMatch = newPwdInput.length > 0 && newPwdInput === confirmPwdInput;

  const changePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdFields({});

    if (!isLen || !hasLetter || !hasNumber) {
      setPwdError('New password must meet all security requirements.');
      return;
    }
    if (newPwdInput !== confirmPwdInput) {
      setPwdError('New password and confirmation do not match.');
      return;
    }

    setPwdBusy(true);
    const form = e.currentTarget;
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: form.currentPassword.value,
          newPassword: newPwdInput,
        },
      });
      form.reset();
      setNewPwdInput('');
      setConfirmPwdInput('');
      toast('Password changed successfully. All other active sessions have been revoked.', 'success');
      loadSessions();
    } catch (err) {
      setPwdFields(err.fields || {});
      setPwdError(Object.keys(err.fields || {}).length ? '' : err.message);
    } finally {
      setPwdBusy(false);
    }
  };

  const revokeSession = async (sessionId) => {
    try {
      await api(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
      toast('Session revoked', 'success');
      loadSessions();
    } catch (err) {
      toast(err.message || 'Failed to revoke session', 'error');
    }
  };

  const revokeAllOtherSessions = async () => {
    try {
      const res = await api('/auth/sessions', { method: 'DELETE' });
      toast(`Revoked ${res.revokedCount || 'all other'} sessions`, 'success');
      loadSessions();
    } catch (err) {
      toast(err.message || 'Failed to revoke sessions', 'error');
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError('');
    setDeleteBusy(true);
    try {
      await api('/auth/me', {
        method: 'DELETE',
        body: { password: deletePassword },
      });
      toast('Your account and all associated verification records have been permanently deleted.', 'success');
      await logout();
      navigate('/');
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account');
    } finally {
      setDeleteBusy(false);
    }
  };

  const parseUserAgent = (ua) => {
    if (!ua) return 'Browser Session';
    if (ua.includes('Windows')) return 'Windows Desktop';
    if (ua.includes('Macintosh')) return 'macOS Device';
    if (ua.includes('Linux')) return 'Linux Device';
    if (ua.includes('Android')) return 'Android Mobile';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS Mobile';
    return ua.slice(0, 40);
  };

  return (
    <>
      <Head title="Account Settings">
        Manage password security, active session tokens, and account lifecycle.
      </Head>

      <div className="stack" style={{ maxWidth: 640 }}>
        {/* 1. Password Management */}
        <form className="card stack" onSubmit={changePassword} noValidate>
          <h2>Change Password</h2>
          <ErrorMessage>{pwdError}</ErrorMessage>
          <Field
            id="currentPassword"
            name="currentPassword"
            type="password"
            label="Current Password"
            autoComplete="current-password"
            error={pwdFields.currentPassword}
            required
          />
          <Field
            id="newPassword"
            name="newPassword"
            type="password"
            label="New Password"
            autoComplete="new-password"
            value={newPwdInput}
            onChange={(e) => setNewPwdInput(e.target.value)}
            error={pwdFields.newPassword}
            required
          />

          {/* Interactive Password Strength Checklist */}
          {newPwdInput.length > 0 && (
            <div className="pwd-checklist">
              <div className={`pwd-item ${isLen ? 'valid' : 'invalid'}`}>
                <span>{isLen ? '✓' : '○'}</span> At least 10 characters ({newPwdInput.length}/10)
              </div>
              <div className={`pwd-item ${hasLetter ? 'valid' : 'invalid'}`}>
                <span>{hasLetter ? '✓' : '○'}</span> Contains at least one letter
              </div>
              <div className={`pwd-item ${hasNumber ? 'valid' : 'invalid'}`}>
                <span>{hasNumber ? '✓' : '○'}</span> Contains at least one number
              </div>
            </div>
          )}

          <Field
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirm New Password"
            autoComplete="new-password"
            value={confirmPwdInput}
            onChange={(e) => setConfirmPwdInput(e.target.value)}
            required
          />

          {confirmPwdInput.length > 0 && (
            <div className={`small ${isMatch ? 'color-success' : 'field-error'}`} style={{ marginTop: '-0.5rem' }}>
              {isMatch ? '✓ Passwords match' : '✕ Passwords do not match'}
            </div>
          )}

          <div>
            <Button variant="primary" loading={pwdBusy} type="submit" disabled={!isLen || !hasLetter || !hasNumber || !isMatch}>
              Update Password
            </Button>
          </div>
        </form>

        {/* 2. Active Session Management */}
        <div className="card stack">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2>Active Sessions</h2>
            {sessions.filter((s) => !s.isCurrent).length > 0 && (
              <Button variant="default" onClick={revokeAllOtherSessions}>
                Sign Out All Other Sessions
              </Button>
            )}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Devices and browser sessions currently authenticated with your account.
          </p>

          {sessionsLoading ? (
            <LoadingState message="Loading active sessions..." />
          ) : sessions.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {sessions.map((s) => (
                <div key={s.id} className="session-card">
                  <div className="session-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span className="session-ip">{s.ip || 'Local / Private IP'}</span>
                      {s.isCurrent && (
                        <span className="badge badge-supported" style={{ fontSize: '0.72rem' }}>
                          Current Session
                        </span>
                      )}
                    </div>
                    <div className="small muted">
                      {parseUserAgent(s.userAgent)} • Logged in {fmt(s.createdAt)}
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <Button variant="danger" onClick={() => revokeSession(s.id)}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="small muted">No active sessions found.</p>
          )}
        </div>

        {/* 3. Danger Zone: Account Deletion */}
        <div className="danger-zone stack">
          <h3>Danger Zone: Delete Account</h3>
          <p className="small" style={{ color: 'var(--signal-red-text)', margin: 0 }}>
            Deleting your account is permanent. All your verification requests, evidence sources, uploaded media files, and saved reports will be immediately and irreversibly purged from the system.
          </p>
          <div>
            <Button variant="danger" onClick={() => { setDeleteError(''); setDeletePassword(''); setDeleteModalOpen(true); }}>
              Delete My Account
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        title="Confirm Account Deletion"
        onClose={() => setDeleteModalOpen(false)}
        actions={<Button variant="default" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>}
      >
        <form className="stack" onSubmit={handleDeleteAccount}>
          <div className="alert alert-error">
            ⚠️ This action cannot be undone. Please confirm your password to permanently delete your account and all associated records.
          </div>
          <ErrorMessage>{deleteError}</ErrorMessage>
          <Field
            id="deletePassword"
            name="deletePassword"
            type="password"
            label="Current Password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="Enter your current password"
            required
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="danger" type="submit" loading={deleteBusy}>
              Permanently Delete Account
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
