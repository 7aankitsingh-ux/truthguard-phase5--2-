import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Button } from './ui.jsx';
import { Logo } from './Logo.jsx';

export function PublicLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="site-header">
        <div className="container">
          <Link to="/" className="brand">
            <Logo size={24} />
            <span>TruthGuard AI</span>
          </Link>
          <nav className={`nav ${open ? 'open' : ''}`} aria-label="Primary" onClick={() => setOpen(false)}>
            <NavLink to="/how-it-works">How it works</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/faq">FAQ</NavLink>
          </nav>
          <div className="header-actions">
            {user ? <Link className="btn btn-primary" to="/app">Dashboard</Link> : (
              <>
                <Link className="btn" to="/login">Log in</Link>
                <Link className="btn btn-primary" to="/signup">Sign up</Link>
              </>
            )}
          </div>
          <button className="btn menu-btn" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="site-footer">
        <div className="container small muted">
          <span>© {new Date().getFullYear()} TruthGuard AI</span>
          <div className="footer-links">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms and Conditions</Link>
          </div>
        </div>
      </footer>
    </>
  );
}

const links = [
  ['/app', 'Dashboard', true],
  ['/app/verify', 'Verify', false],
  ['/app/history', 'History', false],
  ['/app/reports', 'Saved reports', false],
  ['/app/profile', 'Profile', false],
  ['/app/settings', 'Settings', false],
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Sidebar">
        <Link to="/" className="brand">
          <Logo size={24} />
          <span>TruthGuard AI</span>
        </Link>
        <nav className="side-nav" aria-label="Application" onClick={() => setOpen(false)}>
          {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <button className="btn menu-btn" aria-label="Open navigation" onClick={() => setOpen(true)}>Menu</button>
          <span className="muted small">{user.name}</span>
          <Button onClick={signOut} loading={busy}>Log out</Button>
        </header>
        <div className="app-content"><Outlet /></div>
        <div className="scrim" onClick={() => setOpen(false)} />
      </div>
    </div>
  );
}
