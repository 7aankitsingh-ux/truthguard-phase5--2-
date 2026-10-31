import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const Spinner = ({ label = 'Loading' }) => <span className="spinner" role="status" aria-label={label} />;

export function Button({ variant = 'default', block, loading, children, ...props }) {
  const cls = ['btn', variant === 'primary' && 'btn-primary', variant === 'danger' && 'btn-danger', block && 'btn-block'].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={loading || props.disabled} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Field({ label, id, error, hint, multiline, ...props }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <Tag id={id} className="input" aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} {...props} />
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="field-error" id={`${id}-err`} role="alert">{error}</div>}
    </div>
  );
}

export const ErrorMessage = ({ children }) => (children ? <div className="alert alert-error" role="alert">{children}</div> : null);
export const Notice = ({ children }) => <div className="alert alert-info">{children}</div>;

export const EmptyState = ({ title, description, action }) => (
  <div className="empty">
    <div className="empty-icon" aria-hidden="true">🔍</div>
    <h3>{title}</h3>
    <p>{description}</p>
    {action}
  </div>
);

export const LoadingState = ({ message = 'Loading details...' }) => (
  <div className="center stack" role="status" aria-busy="true">
    <Spinner />
    <span className="small muted">{message}</span>
  </div>
);

export const ProcessingState = ({ message = 'Analyzing and verifying evidence in background...', progress, details }) => (
  <div className="processing-state card stack" role="status" aria-live="polite">
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <Spinner label="Processing" />
      <div>
        <strong>{message}</strong>
        {details && <div className="small muted">{details}</div>}
      </div>
    </div>
    {progress != null && (
      <div className="meter-track" style={{ width: '100%', height: 6 }}>
        <div className="meter-fill" style={{ width: `${Math.min(100, Math.max(5, progress))}%` }} />
      </div>
    )}
  </div>
);

export const ServerErrorState = ({ error, onRetry }) => (
  <div className="alert alert-error stack" role="alert">
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
      <div>
        <strong>System Error:</strong>
        <p style={{ margin: '0.25rem 0 0' }}>{error || 'An unexpected server error occurred. Please try again.'}</p>
      </div>
      {onRetry && (
        <Button variant="default" onClick={onRetry}>
          🔄 Retry
        </Button>
      )}
    </div>
  </div>
);

export const ValidationErrorState = ({ message = 'Please review the highlighted validation errors.', fields }) => (
  <div className="alert alert-error" role="alert">
    <strong>Validation Error:</strong> {message}
    {fields && Object.keys(fields).length > 0 && (
      <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
        {Object.entries(fields).map(([k, v]) => (
          <li key={k}>{v}</li>
        ))}
      </ul>
    )}
  </div>
);

export const UnauthorizedState = ({ message = 'Your session has expired or requires authentication.', onLogin }) => (
  <div className="card empty stack">
    <div style={{ fontSize: '2rem' }}>🔒</div>
    <h3>Authentication Required</h3>
    <p className="muted">{message}</p>
    <div>
      <Button variant="primary" onClick={onLogin || (() => window.location.href = '/login')}>
        Sign In to Continue
      </Button>
    </div>
  </div>
);

export const UnsupportedFileState = ({ file, supportedTypes = 'JPG, PNG, WebP', onDismiss }) => (
  <div className="alert alert-error stack" role="alert">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <strong>Unsupported File:</strong>
        <p style={{ margin: '0.2rem 0' }}>
          {file ? `"${file.name}"` : 'Selected file'} has an unsupported extension or file format.
        </p>
        <span className="small">Supported formats: <strong>{supportedTypes}</strong></span>
      </div>
      {onDismiss && (
        <button className="btn small" onClick={onDismiss} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
          ✕
        </button>
      )}
    </div>
  </div>
);

export const FailedVerificationCard = ({ error, requestId, onRetry }) => (
  <div className="card alert-error stack" style={{ border: '1px solid #d19799', background: 'var(--danger-bg)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '1.3rem' }}>⚠️</span>
      <strong style={{ fontSize: '1rem', color: 'var(--danger)' }}>Verification Processing Failed</strong>
    </div>
    <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text)' }}>
      {error || 'Unable to complete verification due to an unrecoverable input or network retrieval failure.'}
    </p>
    {requestId && <div className="small muted">Request ID: <span className="id-pill">{requestId}</span></div>}
    {onRetry && (
      <div style={{ paddingTop: '0.5rem' }}>
        <Button variant="danger" onClick={onRetry}>
          Try Again
        </Button>
      </div>
    )}
  </div>
);

export const SuccessState = ({ title, description, action }) => (
  <div className="success-state">
    <div className="mark" aria-hidden="true">✓</div>
    <h3>{title}</h3>
    <p className="muted">{description}</p>
    {action}
  </div>
);

export function Table({ columns, rows, empty, rowKey = 'id' }) {
  if (!rows.length) return <div className="card">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[rowKey]}>{columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ open, title, onClose, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="modal-title">
      <h2 id="modal-title">{title}</h2>
      <div>{children}</div>
      <div className="modal-actions">{actions}</div>
    </dialog>
  );
}

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'info') => {
    const id = crypto.randomUUID();
    setItems((s) => [...s, { id, message, type }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}
