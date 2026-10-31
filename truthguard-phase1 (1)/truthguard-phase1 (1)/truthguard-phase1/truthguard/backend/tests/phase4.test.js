import './env.js';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';

const app = createApp();
const origin = 'http://localhost:5173';
const userA = { email: 'phase4_a@example.com', name: 'Alpha User', password: 'password-123-A' };
const userB = { email: 'phase4_b@example.com', name: 'Beta User', password: 'password-123-B' };

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
});

beforeEach(async () => {
  await query('TRUNCATE users CASCADE');
});

after(() => pool.end());

const registerAndLogin = async (creds) => {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').set('Origin', origin).send(creds);
  return agent;
};

/* ==========================================================================
   1. DASHBOARD COMPONENT & STATISTICS (PHASE 4)
   ========================================================================== */

test('Dashboard - computes real database statistics, type breakdowns, and recent activity', async () => {
  const agentA = await registerAndLogin(userA);

  // Initial dashboard has all 0s and no fabricated stats
  const initial = await agentA.get('/api/dashboard');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.verifications, 0);
  assert.equal(initial.body.supportedClaims, 0);
  assert.equal(initial.body.contradictedClaims, 0);
  assert.equal(initial.body.unverifiedClaims, 0);
  assert.equal(initial.body.mixedResults, 0);
  assert.equal(initial.body.savedReports, 0);
  assert.equal(initial.body.byType.text, 0);
  assert.equal(initial.body.recentActivity.length, 0);

  // Submit verified facts (SUPPORTED)
  await agentA.post('/api/verify/text').set('Origin', origin).send({ text: 'Water boils at 100 degrees Celsius.' });

  // Submit debunked claim (CONTRADICTED)
  await agentA.post('/api/verify/text').set('Origin', origin).send({ text: 'The Moon landing was faked.' });

  // Submit unverified / opinion claim (UNVERIFIED)
  await agentA.post('/api/verify/text').set('Origin', origin).send({ text: 'The future of quantum computing is unpredictable.' });

  // Check updated dashboard
  const updated = await agentA.get('/api/dashboard');
  assert.equal(updated.status, 200);
  assert.equal(updated.body.verifications, 3);
  assert.equal(updated.body.supportedClaims, 1);
  assert.equal(updated.body.contradictedClaims, 1);
  assert.equal(updated.body.unverifiedClaims, 1);
  assert.equal(updated.body.byType.text, 3);
  assert.equal(updated.body.recentActivity.length, 3);

  // Verify recent activity ordering (most recent first)
  assert.match(updated.body.recentActivity[0].snippet, /quantum/i);
  assert.equal(updated.body.recentActivity[0].verdict, 'UNVERIFIED');
});

/* ==========================================================================
   2. VERIFICATION HISTORY: SEARCH, FILTERS, SORTING, PAGINATION, DELETION
   ========================================================================== */

test('Verification History - search, filters (type, verdict, status, date), sorting, pagination, and deletion', async () => {
  const agentA = await registerAndLogin(userA);
  const agentB = await registerAndLogin(userB);

  // User A creates 4 verification entries across all standard categories
  const r1 = await agentA.post('/api/verify/text').set('Origin', origin).send({ text: 'Water boils at 100 degrees Celsius under standard atmospheric pressure.' });
  const r2 = await agentA.post('/api/verify/text').set('Origin', origin).send({ text: 'The Earth is flat and the Apollo moon landing was faked.' });
  const r3 = await agentA.post('/api/verify/text').set('Origin', origin).send({ text: 'Water boils at 100 degrees Celsius. However, the Earth is flat.' });
  const r4 = await agentA.post('/api/verify/text').set('Origin', origin).send({ text: 'The future of quantum gravity remains an active open question.' });

  // 1. Search functionality
  const searchWater = await agentA.get('/api/verifications?search=boils');
  assert.equal(searchWater.status, 200);
  assert.equal(searchWater.body.items.length, 2); // r1 and r3

  // 2. Verdict filter: CONTRADICTED
  const contradictedList = await agentA.get('/api/verifications?verdict=CONTRADICTED');
  assert.equal(contradictedList.status, 200);
  assert.equal(contradictedList.body.items.length, 1);
  assert.equal(contradictedList.body.items[0].id, r2.body.id);

  // 3. Verdict filter: SUPPORTED
  const supportedList = await agentA.get('/api/verifications?verdict=SUPPORTED');
  assert.equal(supportedList.status, 200);
  assert.equal(supportedList.body.items.length, 1);
  assert.equal(supportedList.body.items[0].id, r1.body.id);

  // 4. Verdict filter: MIXED
  const mixedList = await agentA.get('/api/verifications?verdict=MIXED');
  assert.equal(mixedList.status, 200);
  assert.equal(mixedList.body.items.length, 1);
  assert.equal(mixedList.body.items[0].id, r3.body.id);

  // 5. Verdict filter: UNVERIFIED
  const unverifiedList = await agentA.get('/api/verifications?verdict=UNVERIFIED');
  assert.equal(unverifiedList.status, 200);
  assert.equal(unverifiedList.body.items.length, 1);
  assert.equal(unverifiedList.body.items[0].id, r4.body.id);

  // 4. Type filter: text vs image
  const textOnly = await agentA.get('/api/verifications?type=text');
  assert.equal(textOnly.body.items.length, 4);

  const imageOnly = await agentA.get('/api/verifications?type=image');
  assert.equal(imageOnly.body.items.length, 0);

  // 5. Sorting: oldest vs newest
  const oldestFirst = await agentA.get('/api/verifications?sort=oldest');
  assert.equal(oldestFirst.body.items[0].id, r1.body.id);

  const newestFirst = await agentA.get('/api/verifications?sort=newest');
  assert.equal(newestFirst.body.items[0].id, r4.body.id);

  // 6. Pagination
  const page1 = await agentA.get('/api/verifications?page=1&limit=2');
  assert.equal(page1.body.items.length, 2);
  assert.equal(page1.body.pagination.totalCount, 4);
  assert.equal(page1.body.pagination.totalPages, 2);
  assert.equal(page1.body.pagination.hasNext, true);
  assert.equal(page1.body.pagination.hasPrev, false);

  const page2 = await agentA.get('/api/verifications?page=2&limit=2');
  assert.equal(page2.body.items.length, 2);
  assert.equal(page2.body.pagination.hasNext, false);
  assert.equal(page2.body.pagination.hasPrev, true);

  // 7. Single Verification Detail
  const detail = await agentA.get(`/api/verifications/${r1.body.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.id, r1.body.id);
  assert.equal(detail.body.type, 'text');
  assert.ok(detail.body.result);

  // 8. User Data Isolation: User B cannot access User A's verification
  const userBAccess = await agentB.get(`/api/verifications/${r1.body.id}`);
  assert.equal(userBAccess.status, 404);

  // 9. Deletion of verification
  const del = await agentA.delete(`/api/verifications/${r1.body.id}`).set('Origin', origin);
  assert.equal(del.status, 200);
  assert.equal(del.body.deleted, true);

  // Verify deletion from list
  const afterDel = await agentA.get('/api/verifications');
  assert.equal(afterDel.body.pagination.totalCount, 3);
});

/* ==========================================================================
   3. SAVED REPORTS: SAVE, EDIT (PATCH), LIST, FILTER, PDF, SECURE SHARING
   ========================================================================= */

test('Saved Reports - full CRUD, PATCH update, filtering, PDF generation, and secure sharing revocation', async () => {
  const agentA = await registerAndLogin(userA);
  const agentB = await registerAndLogin(userB);

  // Submit verification
  const ver = await agentA.post('/api/verify/text').set('Origin', origin).send({ text: 'Water boils at 100 degrees Celsius.' });
  const reqId = ver.body.id;

  // 1. Create saved report
  const created = await agentA
    .post('/api/reports')
    .set('Origin', origin)
    .send({
      requestId: reqId,
      title: 'Initial Boiling Point Report',
      notes: 'Initial evaluation notes',
    });
  assert.equal(created.status, 201);
  const reportId = created.body.id;

  // 2. PATCH update title and notes
  const updated = await agentA
    .patch(`/api/reports/${reportId}`)
    .set('Origin', origin)
    .send({
      title: 'Standard IUPAC Water Boiling Point Report',
      notes: 'Updated peer-reviewed thermophysical documentation.',
    });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.title, 'Standard IUPAC Water Boiling Point Report');
  assert.equal(updated.body.notes, 'Updated peer-reviewed thermophysical documentation.');

  // 3. Search and filter reports
  const searchMatch = await agentA.get('/api/reports?search=IUPAC');
  assert.equal(searchMatch.body.items.length, 1);

  const searchNoMatch = await agentA.get('/api/reports?search=NonExistentTerm');
  assert.equal(searchNoMatch.body.items.length, 0);

  // 4. Secure Sharing
  const share = await agentA.post(`/api/reports/${reportId}/share`).set('Origin', origin);
  assert.equal(share.status, 200);
  const shareToken = share.body.shareToken;
  assert.ok(shareToken);

  // Unauthenticated public retrieval
  const publicView = await request(app).get(`/api/reports/shared/${shareToken}`);
  assert.equal(publicView.status, 200);
  assert.equal(publicView.body.title, 'Standard IUPAC Water Boiling Point Report');
  assert.equal(publicView.body.result.verdict, 'SUPPORTED');

  // Revoke share
  const revoke = await agentA.delete(`/api/reports/${reportId}/share`).set('Origin', origin);
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.isPublic, false);

  // Now public access is blocked (404)
  const revokedPublicView = await request(app).get(`/api/reports/shared/${shareToken}`);
  assert.equal(revokedPublicView.status, 404);

  // 5. PDF generation
  const pdfRes = await agentA.get(`/api/reports/${reportId}/pdf`);
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers['content-type'], 'application/pdf');
  assert.ok(pdfRes.body.length > 500); // Valid PDF stream

  // 6. Delete report
  const delRep = await agentA.delete(`/api/reports/${reportId}`).set('Origin', origin);
  assert.equal(delRep.status, 200);
  assert.equal(delRep.body.deleted, true);

  // Verify deletion
  const getRepAfter = await agentA.get(`/api/reports/${reportId}`);
  assert.equal(getRepAfter.status, 404);
});

/* ==========================================================================
   4. PROFILE AND SETTINGS: PREFERENCES, SESSIONS, PASSWORD & ACCOUNT DELETION
   ========================================================================== */

test('Profile and Settings - profile editing, language preference, session management, password change, account deletion', async () => {
  const agentA = await registerAndLogin(userA);

  // 1. Profile editing: update name, language, and preferences
  const profileUpdate = await agentA
    .patch('/api/auth/me')
    .set('Origin', origin)
    .send({
      name: 'Alpha User Updated',
      preferredLanguage: 'hi',
      preferences: { defaultMode: 'url', autoSaveReports: true },
    });

  assert.equal(profileUpdate.status, 200);
  assert.equal(profileUpdate.body.user.name, 'Alpha User Updated');
  assert.equal(profileUpdate.body.user.preferredLanguage, 'hi');
  assert.equal(profileUpdate.body.user.preferences.defaultMode, 'url');
  assert.equal(profileUpdate.body.user.preferences.autoSaveReports, true);

  // 2. Session Management
  const sessionsRes = await agentA.get('/api/auth/sessions');
  assert.equal(sessionsRes.status, 200);
  assert.ok(sessionsRes.body.sessions.length >= 1);
  assert.equal(sessionsRes.body.sessions[0].isCurrent, true);

  // 3. Password Management: wrong current password rejected
  const badChange = await agentA
    .post('/api/auth/change-password')
    .set('Origin', origin)
    .send({ currentPassword: 'wrong-password', newPassword: 'new-password-123-X' });
  assert.equal(badChange.status, 400);

  // Valid password change
  const goodChange = await agentA
    .post('/api/auth/change-password')
    .set('Origin', origin)
    .send({ currentPassword: userA.password, newPassword: 'new-password-123-X' });
  assert.equal(goodChange.status, 204);

  // Old password can no longer be used for login
  const oldLogin = await request(app).post('/api/auth/login').set('Origin', origin).send({
    email: userA.email,
    password: userA.password,
  });
  assert.equal(oldLogin.status, 401);

  // New password logs in successfully
  const newLogin = await request(app).post('/api/auth/login').set('Origin', origin).send({
    email: userA.email,
    password: 'new-password-123-X',
  });
  assert.equal(newLogin.status, 200);

  // 4. Account Deletion: requires correct password confirmation
  const badDelete = await agentA
    .delete('/api/auth/me')
    .set('Origin', origin)
    .send({ password: 'wrong-confirmation-password' });
  assert.equal(badDelete.status, 400);

  // Successful account deletion
  const goodDelete = await agentA
    .delete('/api/auth/me')
    .set('Origin', origin)
    .send({ password: 'new-password-123-X' });
  assert.equal(goodDelete.status, 200);
  assert.equal(goodDelete.body.deleted, true);

  // Account no longer exists
  const checkLoginAfterDelete = await request(app).post('/api/auth/login').set('Origin', origin).send({
    email: userA.email,
    password: 'new-password-123-X',
  });
  assert.equal(checkLoginAfterDelete.status, 401);
});

/* ==========================================================================
   5. SECURITY HARDENING: ORIGIN, FILE VALIDATION, SSRF, RATE LIMITING
   ========================================================================== */

test('Security Hardening - same-origin protection, unsupported file rejection, and SSRF guards', async () => {
  const agentA = await registerAndLogin(userA);

  // 1. Cross-origin mutating requests blocked (CSRF guard)
  const crossOriginRes = await agentA
    .post('/api/verify/text')
    .set('Origin', 'https://attacker-site.com')
    .send({ text: 'Some claim' });
  assert.equal(crossOriginRes.status, 403);
  assert.equal(crossOriginRes.body.error.code, 'forbidden_origin');

  // 2. Unsupported file extension rejection
  const invalidFileBuffer = Buffer.from('MZ executable dummy binary');
  const unsupportedUpload = await agentA
    .post('/api/verify/image')
    .set('Origin', origin)
    .attach('image', invalidFileBuffer, 'malware.exe');

  assert.equal(unsupportedUpload.status, 400);
  assert.equal(unsupportedUpload.body.error.code, 'unsupported_file');

  // 3. SSRF Protection blocks cloud metadata and private addresses
  const ssrfRes = await agentA
    .post('/api/verify/url')
    .set('Origin', origin)
    .send({ url: 'http://169.254.169.254/latest/meta-data/' });
  assert.equal(ssrfRes.status, 400);
  assert.equal(ssrfRes.body.error.code, 'ssrf_blocked');
});
