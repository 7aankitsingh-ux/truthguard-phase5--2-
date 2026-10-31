import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, GuestRoute, ProtectedRoute } from './auth.jsx';
import { ToastProvider } from './components/ui.jsx';
import { AppLayout, PublicLayout } from './components/layout.jsx';
import { About, FAQ, HowItWorks, Landing, Privacy, Terms, SharedReport } from './pages/public.jsx';
import { Login, ResetConfirm, ResetRequest, Signup } from './pages/auth.jsx';
import { Dashboard, History, Profile, Reports, Settings, Workspace } from './pages/app.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Landing />} />
              <Route path="about" element={<About />} />
              <Route path="how-it-works" element={<HowItWorks />} />
              <Route path="faq" element={<FAQ />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="login" element={<GuestRoute><Login /></GuestRoute>} />
              <Route path="signup" element={<GuestRoute><Signup /></GuestRoute>} />
              <Route path="forgot-password" element={<GuestRoute><ResetRequest /></GuestRoute>} />
              <Route path="reset-password" element={<GuestRoute><ResetConfirm /></GuestRoute>} />
              <Route path="shared/report/:token" element={<SharedReport />} />
              <Route path="report/:token" element={<SharedReport />} />
            </Route>
            <Route path="app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="verify" element={<Workspace />}>
                <Route index element={<Navigate to="text" replace />} />
                <Route path=":mode" element={null} />
              </Route>
              <Route path="history" element={<History />} />
              <Route path="reports" element={<Reports />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
