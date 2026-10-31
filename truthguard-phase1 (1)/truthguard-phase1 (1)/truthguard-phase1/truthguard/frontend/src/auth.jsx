import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { Spinner } from './components/ui.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (body) => setUser((await api('/auth/login', { method: 'POST', body })).user), []);
  const register = useCallback(async (body) => setUser((await api('/auth/register', { method: 'POST', body })).user), []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, setUser, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center"><Spinner /></div>;
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center"><Spinner /></div>;
  return user ? <Navigate to="/app" replace /> : children;
}
