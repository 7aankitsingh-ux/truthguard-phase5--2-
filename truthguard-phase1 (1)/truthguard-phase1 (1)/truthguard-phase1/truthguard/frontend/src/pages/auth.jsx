import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Button, ErrorMessage, Field, SuccessState } from '../components/ui.jsx';

function useSubmit(action) {
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError(''); setFields({}); setBusy(true);
    try {
      await action(Object.fromEntries(new FormData(e.currentTarget)));
    } catch (err) {
      setError(Object.keys(err.fields || {}).length ? '' : err.message);
      setFields(err.fields || {});
    } finally {
      setBusy(false);
    }
  };
  return { submit, error, fields, busy };
}

const AuthCard = ({ title, children }) => (
  <div className="auth-page"><div className="card auth-card"><h1>{title}</h1>{children}</div></div>
);

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from || '/app';
  const { submit, error, fields, busy } = useSubmit(async (v) => { await login(v); navigate(from, { replace: true }); });
  return (
    <AuthCard title="Log in">
      <form onSubmit={submit} noValidate>
        <ErrorMessage>{error}</ErrorMessage>
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" required error={fields.email} />
        <Field id="password" name="password" type="password" label="Password" autoComplete="current-password" required error={fields.password} />
        <Button variant="primary" block loading={busy} type="submit">Log in</Button>
      </form>
      <p className="small muted" style={{ marginTop: '1rem' }}>
        <Link to="/forgot-password">Forgot password?</Link> · <Link to="/signup">Create account</Link>
      </p>
    </AuthCard>
  );
}

export function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { submit, error, fields, busy } = useSubmit(async (v) => { await register(v); navigate('/app', { replace: true }); });
  return (
    <AuthCard title="Create your account">
      <form onSubmit={submit} noValidate>
        <ErrorMessage>{error}</ErrorMessage>
        <Field id="name" name="name" label="Full name" autoComplete="name" required error={fields.name} />
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" required error={fields.email} />
        <Field id="password" name="password" type="password" label="Password" autoComplete="new-password" required error={fields.password} hint="At least 10 characters, with a letter and a number." />
        <Button variant="primary" block loading={busy} type="submit">Create account</Button>
      </form>
      <p className="small muted" style={{ marginTop: '1rem' }}>By signing up you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>. Already registered? <Link to="/login">Log in</Link></p>
    </AuthCard>
  );
}

export function ResetRequest() {
  const [sent, setSent] = useState(false);
  const { submit, error, fields, busy } = useSubmit(async (v) => {
    const { api } = await import('../api.js');
    await api('/auth/password-reset/request', { method: 'POST', body: v });
    setSent(true);
  });
  if (sent) return <AuthCard title="Check your email"><SuccessState title="Request received" description="If an account exists for that address, a reset link has been issued." action={<Link to="/login">Back to log in</Link>} /></AuthCard>;
  return (
    <AuthCard title="Reset your password">
      <form onSubmit={submit} noValidate>
        <ErrorMessage>{error}</ErrorMessage>
        <Field id="email" name="email" type="email" label="Email" autoComplete="email" required error={fields.email} />
        <Button variant="primary" block loading={busy} type="submit">Send reset link</Button>
      </form>
    </AuthCard>
  );
}

export function ResetConfirm() {
  const [params] = useSearchParams();
  const [done, setDone] = useState(false);
  const token = params.get('token') || '';
  const { submit, error, fields, busy } = useSubmit(async (v) => {
    const { api } = await import('../api.js');
    await api('/auth/password-reset/confirm', { method: 'POST', body: { token, password: v.password } });
    setDone(true);
  });
  if (done) return <AuthCard title="Password updated"><SuccessState title="Password changed" description="You can now log in with your new password." action={<Link className="btn btn-primary" to="/login">Log in</Link>} /></AuthCard>;
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} noValidate>
        <ErrorMessage>{token ? error : 'This reset link is missing its token.'}</ErrorMessage>
        <Field id="password" name="password" type="password" label="New password" autoComplete="new-password" required error={fields.password} hint="At least 10 characters, with a letter and a number." />
        <Button variant="primary" block loading={busy} disabled={!token} type="submit">Update password</Button>
      </form>
    </AuthCard>
  );
}
