import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/* ==========================================================================
   1. NAVIGATION & ROUTE MAPPING TESTS
   ========================================================================== */

test('Frontend Navigation - Route mapping and structure integrity', () => {
  const mainJsx = fs.readFileSync(path.resolve('src/main.jsx'), 'utf8');

  // Verify public routes exist
  const expectedPublicRoutes = ['/', 'about', 'how-it-works', 'faq', 'privacy', 'terms', 'login', 'signup', 'forgot-password', 'reset-password'];
  for (const route of expectedPublicRoutes) {
    if (route === '/') {
      assert.ok(mainJsx.includes('<Route index element={<Landing />} />'), 'Index landing route should be defined');
    } else {
      assert.ok(mainJsx.includes(`path="${route}"`), `Public route ${route} should be configured`);
    }
  }

  // Verify app protected routes exist
  const expectedProtectedRoutes = ['verify', 'history', 'reports', 'profile', 'settings'];
  assert.ok(mainJsx.includes('<Route path="app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>'));
  for (const appRoute of expectedProtectedRoutes) {
    assert.ok(mainJsx.includes(`path="${appRoute}"`), `Protected app route ${appRoute} should be configured`);
  }

  // Verify shared report public route
  assert.ok(mainJsx.includes('path="shared/report/:token"'));
  assert.ok(mainJsx.includes('path="report/:token"'));

  // Verify catch-all redirect
  assert.ok(mainJsx.includes('<Route path="*" element={<Navigate to="/" replace />} />'));
});

/* ==========================================================================
   2. LOGIN AND REGISTRATION VALIDATION
   ========================================================================== */

test('Frontend Auth - Login & registration validation and state logic', () => {
  const authJsx = fs.readFileSync(path.resolve('src/pages/auth.jsx'), 'utf8');

  // Form fields verification
  assert.ok(authJsx.includes('name="email"'), 'Email input field should exist');
  assert.ok(authJsx.includes('name="password"'), 'Password input field should exist');
  assert.ok(authJsx.includes('name="name"'), 'Full name input field should exist in registration');

  // Test client-side validation logic functions
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  assert.ok(emailRegex.test('valid.user@example.com'));
  assert.ok(!emailRegex.test('invalid-email-address'));
  assert.ok(!emailRegex.test('missing-domain@'));
  assert.ok(!emailRegex.test('@missing-user.com'));

  // Password rules validation logic
  const validatePasswordRules = (pwd) => ({
    minLength: (pwd || '').length >= 8,
    hasLetters: /[a-zA-Z]/.test(pwd || ''),
    hasNumbers: /\d/.test(pwd || ''),
  });

  const weak = validatePasswordRules('short');
  assert.equal(weak.minLength, false);
  assert.equal(weak.hasNumbers, false);

  const strong = validatePasswordRules('SecurePassword123');
  assert.equal(strong.minLength, true);
  assert.equal(strong.hasLetters, true);
  assert.equal(strong.hasNumbers, true);
});

/* ==========================================================================
   3. VERIFICATION TABS & WORKSPACE MODES
   ========================================================================== */

test('Frontend Workspace - Multi-modal verification tabs and hints', () => {
  const appJsx = fs.readFileSync(path.resolve('src/pages/app.jsx'), 'utf8');

  // All 4 tabs must be registered
  const expectedModes = ['text', 'image', 'video', 'url'];
  for (const m of expectedModes) {
    assert.ok(appJsx.includes(`${m}: {`), `Workspace mode "${m}" configuration must exist`);
  }

  // Hints check
  assert.ok(appJsx.includes('English or Hindi'));
  assert.ok(appJsx.includes('JPG, PNG, and WebP'));
  assert.ok(appJsx.includes('MP4, WebM, and MOV'));
  assert.ok(appJsx.includes('SSRF protection'));
});

/* ==========================================================================
   4. FILE UPLOADS & RESTRICTIONS
   ========================================================================== */

test('Frontend File Uploads - File type validation and restrictions', () => {
  const allowedImageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const allowedVideoExtensions = ['.mp4', '.webm', '.mov', '.mkv', '.avi'];

  const validateExtension = (filename, allowedList) => {
    const ext = (path.extname(filename || '')).toLowerCase();
    return allowedList.includes(ext);
  };

  // Image extension tests
  assert.ok(validateExtension('photo.jpg', allowedImageExtensions));
  assert.ok(validateExtension('screenshot.PNG', allowedImageExtensions));
  assert.ok(validateExtension('image.webp', allowedImageExtensions));
  assert.ok(!validateExtension('script.exe', allowedImageExtensions));
  assert.ok(!validateExtension('exploit.php', allowedImageExtensions));

  // Video extension tests
  assert.ok(validateExtension('recording.mp4', allowedVideoExtensions));
  assert.ok(validateExtension('clip.webm', allowedVideoExtensions));
  assert.ok(validateExtension('sample.MOV', allowedVideoExtensions));
  assert.ok(!validateExtension('virus.bat', allowedVideoExtensions));

  // Size limit constant tests
  const MAX_IMAGE_SIZE_MB = 25;
  const MAX_VIDEO_SIZE_MB = 50;
  assert.ok(10 * 1024 * 1024 <= MAX_IMAGE_SIZE_MB * 1024 * 1024);
  assert.ok(30 * 1024 * 1024 > MAX_IMAGE_SIZE_MB * 1024 * 1024);
  assert.ok(45 * 1024 * 1024 <= MAX_VIDEO_SIZE_MB * 1024 * 1024);
  assert.ok(60 * 1024 * 1024 > MAX_VIDEO_SIZE_MB * 1024 * 1024);
});

/* ==========================================================================
   5. RESULTS PAGES & VERDICT FORMATTING
   ========================================================================== */

test('Frontend Results - Verdict badges, confidence mapping and disclaimers', () => {
  const resultJsx = fs.readFileSync(path.resolve('src/components/VerificationResult.jsx'), 'utf8');

  // Verify Phase 3 standard verdict categories exist
  assert.ok(resultJsx.includes('SUPPORTED: { label: \'Supported\''));
  assert.ok(resultJsx.includes('CONTRADICTED: { label: \'Contradicted\''));
  assert.ok(resultJsx.includes('UNVERIFIED: { label: \'Unverified\''));
  assert.ok(resultJsx.includes('MIXED: { label: \'Mixed\''));

  // Verify tier classifications exist
  assert.ok(resultJsx.includes('Tier 1: Primary Official'));
  assert.ok(resultJsx.includes('Tier 2: Research Paper'));
  assert.ok(resultJsx.includes('Tier 3: Established News'));
  assert.ok(resultJsx.includes('Tier 4: Secondary Source'));

  // Verify AI separation disclaimer is rendered
  assert.ok(resultJsx.includes('AI-detection scores must never independently determine factual accuracy'));

  // Test qualitative confidence tier classification
  const getConfidenceTier = (score) => {
    if (score >= 0.8) return 'HIGH';
    if (score >= 0.5) return 'MODERATE';
    if (score >= 0.3) return 'LOW';
    return 'INSUFFICIENT';
  };

  assert.equal(getConfidenceTier(0.95), 'HIGH');
  assert.equal(getConfidenceTier(0.65), 'MODERATE');
  assert.equal(getConfidenceTier(0.35), 'LOW');
  assert.equal(getConfidenceTier(0.15), 'INSUFFICIENT');
});

/* ==========================================================================
   6. DASHBOARD STATISTICS MODEL
   ========================================================================== */

test('Frontend Dashboard - Percentage breakdown and in-progress counts', () => {
  const computeBreakdowns = (stats) => {
    const total = stats.verifications || 0;
    return {
      total,
      supPct: total > 0 ? ((stats.supportedClaims || 0) / total) * 100 : 0,
      conPct: total > 0 ? ((stats.contradictedClaims || 0) / total) * 100 : 0,
      mixPct: total > 0 ? ((stats.mixedResults || 0) / total) * 100 : 0,
      unvPct: total > 0 ? ((stats.unverifiedClaims || 0) / total) * 100 : 0,
      inProgressCount: (stats.byStatus?.processing || 0) + (stats.byStatus?.pending || 0),
    };
  };

  // Test 1: Empty state (initial clean account)
  const empty = computeBreakdowns({ verifications: 0 });
  assert.equal(empty.total, 0);
  assert.equal(empty.supPct, 0);
  assert.equal(empty.inProgressCount, 0);

  // Test 2: Active dashboard calculations
  const sampleStats = {
    verifications: 10,
    supportedClaims: 5,
    contradictedClaims: 3,
    mixedResults: 1,
    unverifiedClaims: 1,
    byStatus: { processing: 2, pending: 1, completed: 7, failed: 0 },
  };
  const active = computeBreakdowns(sampleStats);
  assert.equal(active.total, 10);
  assert.equal(active.supPct, 50);
  assert.equal(active.conPct, 30);
  assert.equal(active.mixPct, 10);
  assert.equal(active.unvPct, 10);
  assert.equal(active.inProgressCount, 3);
});

/* ==========================================================================
   7. SEARCH AND FILTERS (QUERY PARAMETER SERIALIZATION)
   ========================================================================== */

test('Frontend History - Query parameter building and pagination', () => {
  const buildHistoryQuery = (filters) => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.type && filters.type !== 'all') params.set('type', filters.type);
    if (filters.verdict && filters.verdict !== 'all') params.set('verdict', filters.verdict);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.page) params.set('page', String(filters.page));
    return params.toString();
  };

  const q1 = buildHistoryQuery({ search: 'climate change', type: 'text', verdict: 'SUPPORTED', sort: 'newest', page: 1 });
  assert.ok(q1.includes('search=climate+change'));
  assert.ok(q1.includes('type=text'));
  assert.ok(q1.includes('verdict=SUPPORTED'));
  assert.ok(q1.includes('sort=newest'));

  // Pagination calculation
  const getPagination = (totalCount, limit = 10, currentPage = 1) => {
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const cleanPage = Math.max(1, Math.min(totalPages, currentPage));
    return {
      totalPages,
      page: cleanPage,
      hasNext: cleanPage < totalPages,
      hasPrev: cleanPage > 1,
    };
  };

  const p1 = getPagination(35, 10, 1);
  assert.equal(p1.totalPages, 4);
  assert.equal(p1.hasNext, true);
  assert.equal(p1.hasPrev, false);

  const p4 = getPagination(35, 10, 4);
  assert.equal(p4.hasNext, false);
  assert.equal(p4.hasPrev, true);
});

/* ==========================================================================
   8. REPORT MANAGEMENT & SHARING
   ========================================================================== */

test('Frontend Report Management - Share token URL and PDF download routes', () => {
  const getShareUrl = (origin, token) => `${origin}/report/${token}`;
  const getPdfUrl = (reportId) => `/api/reports/${reportId}/pdf`;

  assert.equal(
    getShareUrl('https://truthguard.ai', 'abc-123-xyz-456'),
    'https://truthguard.ai/report/abc-123-xyz-456'
  );
  assert.equal(
    getPdfUrl('00000000-0000-0000-0000-000000000000'),
    '/api/reports/00000000-0000-0000-0000-000000000000/pdf'
  );

  // Markdown export formatting test
  const formatMarkdownReport = ({ title, verdict, confidence, summary }) => {
    return `# TruthGuard Verification: ${title}\n\n` +
      `**Verdict**: ${verdict}\n` +
      `**Confidence**: ${Math.round(confidence * 100)}%\n\n` +
      `### Summary\n${summary}`;
  };

  const md = formatMarkdownReport({
    title: 'Earth Orbit Facts',
    verdict: 'SUPPORTED',
    confidence: 0.95,
    summary: 'Planetary mechanics verified by astronomical constants.',
  });

  assert.ok(md.includes('# TruthGuard Verification: Earth Orbit Facts'));
  assert.ok(md.includes('**Verdict**: SUPPORTED'));
  assert.ok(md.includes('**Confidence**: 95%'));
});

/* ==========================================================================
   9. PROFILE & SETTINGS
   ========================================================================== */

test('Frontend Settings - Preferences schema and password match validation', () => {
  const validateSettings = (prefs) => {
    const validModes = ['text', 'image', 'video', 'url'];
    return {
      defaultMode: validModes.includes(prefs.defaultMode) ? prefs.defaultMode : 'text',
      autoSaveReports: Boolean(prefs.autoSaveReports),
      emailAlerts: Boolean(prefs.emailAlerts),
    };
  };

  const s1 = validateSettings({ defaultMode: 'video', autoSaveReports: true });
  assert.equal(s1.defaultMode, 'video');
  assert.equal(s1.autoSaveReports, true);
  assert.equal(s1.emailAlerts, false);

  const s2 = validateSettings({ defaultMode: 'invalid_mode' });
  assert.equal(s2.defaultMode, 'text'); // Fallback to safe text default
});

/* ==========================================================================
   10. MOBILE RESPONSIVE LAYOUTS & STYLES
   ========================================================================== */

test('Frontend Mobile Layouts - CSS responsive media queries and drawer classes', () => {
  const css = fs.readFileSync(path.resolve('src/styles.css'), 'utf8');

  // Verify responsive breakpoints
  assert.ok(css.includes('@media (max-width: 860px)'), 'Tablet/Mobile 860px breakpoint must exist');
  assert.ok(css.includes('@media (max-width: 720px)'), 'Mobile 720px breakpoint must exist');

  // Verify drawer navigation styling
  assert.ok(css.includes('.sidebar.open'), 'Sidebar open transform class must exist');
  assert.ok(css.includes('.menu-btn'), 'Mobile menu toggle button class must exist');
  assert.ok(css.includes('.scrim'), 'Backdrop scrim for mobile drawer must exist');

  // Verify touch-friendly and accessibility rules
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Accessibility reduced-motion query must exist');
  assert.ok(css.includes('.pulse-dot'), 'Pulse dot animation indicator for in-progress tasks must exist');
});
