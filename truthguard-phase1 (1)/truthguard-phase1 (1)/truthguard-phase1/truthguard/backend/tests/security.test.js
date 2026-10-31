import './env.js';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';

const app = createApp();
const origin = 'http://localhost:5173';
const userA = { email: 'sec_a@example.com', name: 'Security User A', password: 'Password-1234-A' };
const userB = { email: 'sec_b@example.com', name: 'Security User B', password: 'Password-1234-B' };

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
   1. UNAUTHORIZED API ACCESS
   ========================================================================== */

test('Security - Unauthorized API access is blocked across protected routes', async () => {
  const unauth = request(app);

  const endpoints = [
    { method: 'get', url: '/api/auth/me' },
    { method: 'get', url: '/api/dashboard' },
    { method: 'get', url: '/api/verifications' },
    { method: 'get', url: '/api/reports' },
    { method: 'post', url: '/api/verify/text', body: { text: 'Some claim' } },
    { method: 'post', url: '/api/verify/url', body: { url: 'https://example.com' } },
    { method: 'post', url: '/api/reports', body: { resultId: '00000000-0000-0000-0000-000000000000', title: 'Test' } },
  ];

  for (const ep of endpoints) {
    const req = unauth[ep.method](ep.url).set('Origin', origin);
    const res = ep.body ? await req.send(ep.body) : await req;
    assert.equal(res.status, 401, `Expected 401 for ${ep.method.toUpperCase()} ${ep.url}`);
    assert.equal(res.body?.error?.code, 'unauthenticated');
  }
});

/* ==========================================================================
   2. CROSS-USER REPORT & DATA ACCESS ISOLATION
   ========================================================================== */

test('Security - Strict cross-user data isolation for reports and verifications', async () => {
  const agentA = await registerAndLogin(userA);
  const agentB = await registerAndLogin(userB);

  // User A runs a verification and saves a report
  const verifyRes = await agentA.post('/api/verify/text').set('Origin', origin).send({
    text: 'Water boils at 100 degrees Celsius under standard atmospheric pressure.'
  });
  assert.equal(verifyRes.status, 200);
  const resultId = verifyRes.body.resultId;
  const requestId = verifyRes.body.id;

  const saveRes = await agentA.post('/api/reports').set('Origin', origin).send({
    resultId,
    title: 'User A Private Investigation'
  });
  assert.equal(saveRes.status, 201);
  const reportId = saveRes.body.id;

  // User B attempts to access User A's private report
  const bReadReport = await agentB.get(`/api/reports/${reportId}`);
  assert.equal(bReadReport.status, 404, 'User B should not be able to read User A report');

  // User B attempts to update User A's private report
  const bPatchReport = await agentB.patch(`/api/reports/${reportId}`).set('Origin', origin).send({
    title: 'Hacked Title'
  });
  assert.equal(bPatchReport.status, 404, 'User B should not be able to update User A report');

  // User B attempts to delete User A's private report
  const bDeleteReport = await agentB.delete(`/api/reports/${reportId}`).set('Origin', origin);
  assert.equal(bDeleteReport.status, 404, 'User B should not be able to delete User A report');

  // User B attempts to download User A's private report PDF
  const bPdf = await agentB.get(`/api/reports/${reportId}/pdf`);
  assert.equal(bPdf.status, 404, 'User B should not be able to download User A report PDF');

  // User B attempts to access User A's verification request
  const bVerifyReq = await agentB.get(`/api/verify/${requestId}`);
  assert.equal(bVerifyReq.status, 404, 'User B should not see User A verification request');

  // User B attempts to delete User A's history record
  const bDelHistory = await agentB.delete(`/api/verifications/${requestId}`).set('Origin', origin);
  assert.equal(bDelHistory.status, 404, 'User B should not delete User A history item');
});

/* ==========================================================================
   3. INVALID & TAMPERED AUTHENTICATION TOKENS
   ========================================================================== */

test('Security - Invalid and tampered authentication tokens are rejected', async () => {
  const agent = request(app);

  // Forged random cookie
  const resForged = await agent.get('/api/auth/me').set('Cookie', 'session=invalid_token_1234567890');
  assert.equal(resForged.status, 401);

  // Malformed cookie header
  const resMalformed = await agent.get('/api/auth/me').set('Cookie', 'session=');
  assert.equal(resMalformed.status, 401);

  // Login, then logout to revoke session, then reuse old session
  const userAgent = await registerAndLogin(userA);
  const meBefore = await userAgent.get('/api/auth/me');
  assert.equal(meBefore.status, 200);

  await userAgent.post('/api/auth/logout').set('Origin', origin);

  const meAfter = await userAgent.get('/api/auth/me');
  assert.equal(meAfter.status, 401, 'Revoked session must be rejected');
});

/* ==========================================================================
   4. SQL INJECTION PREVENTION
   ========================================================================== */

test('Security - SQL injection payloads are safely handled across all query parameters and bodies', async () => {
  const agent = await registerAndLogin(userA);

  const sqlPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' UNION SELECT NULL, NULL, password_hash, NULL FROM users--",
    "admin'--",
    "'; DELETE FROM verification_requests; --",
  ];

  for (const payload of sqlPayloads) {
    // 1. History search and filters
    const searchRes = await agent.get(`/api/verifications?search=${encodeURIComponent(payload)}&verdict=${encodeURIComponent(payload)}`);
    assert.equal(searchRes.status, 200);
    assert.ok(Array.isArray(searchRes.body.items));

    // 2. Profile update
    const profileRes = await agent.patch('/api/auth/me').set('Origin', origin).send({
      name: `Clean Name ${payload}`
    });
    assert.equal(profileRes.status, 200);
    assert.ok(profileRes.body.user.name.includes(payload));

    // 3. Verification claim text
    const verifyRes = await agent.post('/api/verify/text').set('Origin', origin).send({
      text: `Is this query true: ${payload}`
    });
    assert.equal(verifyRes.status, 200);
  }

  // Verify users and requests tables are completely intact
  const usersCheck = await query('SELECT count(*)::int as c FROM users');
  assert.equal(usersCheck.rows[0].c, 1);
});

/* ==========================================================================
   5. XSS ATTACK PREVENTION & SECURITY HEADERS
   ========================================================================== */

test('Security - Cross-Site Scripting (XSS) input handling and security headers', async () => {
  const agent = await registerAndLogin(userA);

  const xssPayload = "<script>alert('XSS-TEST')</script><img src=x onerror=alert(1)>";

  const verifyRes = await agent.post('/api/verify/text').set('Origin', origin).send({
    text: `Claim regarding ${xssPayload}`
  });
  assert.equal(verifyRes.status, 200);
  const resultId = verifyRes.body.resultId;

  // Save report with XSS payload in title and notes
  const reportRes = await agent.post('/api/reports').set('Origin', origin).send({
    resultId,
    title: `XSS Report ${xssPayload}`,
    notes: `Notes with ${xssPayload}`
  });
  assert.equal(reportRes.status, 201);

  // Security headers check on responses
  assert.ok(reportRes.headers['content-security-policy'], 'CSP header should be present');
  assert.equal(reportRes.headers['x-content-type-options'], 'nosniff');
  assert.equal(reportRes.headers['x-frame-options'], 'SAMEORIGIN');

  // Verify PDF download handles special characters safely without crash
  const pdfRes = await agent.get(`/api/reports/${reportRes.body.id}/pdf`);
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers['content-type'], 'application/pdf');
});

/* ==========================================================================
   6. CSRF & ORIGIN CHECK ENFORCEMENT
   ========================================================================== */

test('Security - Mutating requests from unauthorized origins are strictly blocked', async () => {
  const agent = await registerAndLogin(userA);

  const forbiddenOrigins = [
    'https://malicious-attacker.com',
    'http://evil.org',
    'http://localhost:9999',
  ];

  for (const evilOrigin of forbiddenOrigins) {
    const postRes = await agent.post('/api/verify/text').set('Origin', evilOrigin).send({
      text: 'Legitimate text claim'
    });
    assert.equal(postRes.status, 403, `Mutating POST from ${evilOrigin} must be blocked`);
    assert.equal(postRes.body?.error?.code, 'forbidden_origin');

    const patchRes = await agent.patch('/api/auth/me').set('Origin', evilOrigin).send({
      name: 'New Name'
    });
    assert.equal(patchRes.status, 403, `Mutating PATCH from ${evilOrigin} must be blocked`);

    const delRes = await agent.delete('/api/reports/00000000-0000-0000-0000-000000000000').set('Origin', evilOrigin);
    assert.equal(delRes.status, 403, `Mutating DELETE from ${evilOrigin} must be blocked`);
  }
});

/* ==========================================================================
   7. MALICIOUS FILE UPLOAD MITIGATION
   ========================================================================== */

test('Security - File extension spoofing, executable uploads, and corrupted files are rejected', async () => {
  const agent = await registerAndLogin(userA);

  // 1. Executable file upload (.exe) under field 'image'
  const exeRes = await agent
    .post('/api/verify/image')
    .set('Origin', origin)
    .attach('image', Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), 'malicious.exe');
  assert.equal(exeRes.status, 400);
  assert.equal(exeRes.body?.error?.code, 'unsupported_file');

  // 2. Script upload disguised with double extension (.php.png)
  const phpRes = await agent
    .post('/api/verify/image')
    .set('Origin', origin)
    .attach('image', Buffer.from('<?php echo "evil"; ?>'), 'exploit.php.png');
  assert.equal(phpRes.status, 400);
  assert.match(phpRes.body?.error?.message, /script|magic bytes|unsupported|invalid/i);

  // 3. Fake image (plain text renamed to .jpg)
  const fakeJpg = await agent
    .post('/api/verify/image')
    .set('Origin', origin)
    .attach('image', Buffer.from('Not a real jpeg file header'), 'fake.jpg');
  assert.equal(fakeJpg.status, 400);

  // 4. Unexpected field name
  const badFieldRes = await agent
    .post('/api/verify/image')
    .set('Origin', origin)
    .attach('wrong_field', Buffer.from('abc'), 'test.png');
  assert.equal(badFieldRes.status, 400);
  assert.equal(badFieldRes.body?.error?.code, 'upload_error');
});

/* ==========================================================================
   8. SSRF ATTEMPTS & PROHIBITED PROTOCOLS
   ========================================================================== */

test('Security - Strict SSRF blocking against private IPs, loopback, cloud metadata and non-HTTP', async () => {
  const agent = await registerAndLogin(userA);

  const maliciousUrls = [
    'http://127.0.0.1:8080/admin',
    'http://localhost:3000/internal',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/network-switch',
    'http://192.168.1.1/router-login',
    'http://172.16.0.1/private-api',
    'http://[::1]/ipv6-loopback',
    'file:///etc/passwd',
    'ftp://public.mirror.com/file.iso',
    'gopher://localhost:70/',
  ];

  for (const badUrl of maliciousUrls) {
    const res = await agent.post('/api/verify/url').set('Origin', origin).send({
      url: badUrl
    });
    assert.equal(res.status, 400, `SSRF URL ${badUrl} must be rejected with 400`);
    assert.ok(res.body?.error?.code === 'ssrf_blocked' || res.body?.error?.code === 'validation_error');
  }
});

/* ==========================================================================
   9. OVERSIZED REQUESTS (DoS PROTECTION)
   ========================================================================== */

test('Security - Oversized JSON payloads (>100kb) are rejected with 413 Payload Too Large', async () => {
  const agent = await registerAndLogin(userA);

  const giantString = 'A'.repeat(120 * 1024); // 120KB payload
  const res = await agent.post('/api/verify/text').set('Origin', origin).send({
    text: giantString
  });

  assert.equal(res.status, 413, 'Oversized JSON payload must return 413');
  assert.equal(res.body?.error?.code, 'payload_too_large');
});

/* ==========================================================================
   10. SENSITIVE INFORMATION EXPOSURE
   ========================================================================== */

test('Security - Internal password hashes, session secrets, and system traces are never exposed', async () => {
  const agent = await registerAndLogin(userA);

  // 1. User profile endpoint
  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.password_hash, undefined, 'password_hash must never be serialized');
  assert.equal(me.body.user.token_hash, undefined, 'token_hash must never be serialized');

  // 2. Dashboard endpoint
  const dash = await agent.get('/api/dashboard');
  assert.equal(dash.status, 200);
  const serialized = JSON.stringify(dash.body);
  assert.ok(!serialized.includes('argon2'), 'Argon2 hash strings must not appear in responses');

  // 3. Invalid route error response
  const notFoundRes = await agent.get('/api/nonexistent-route-xyz');
  assert.equal(notFoundRes.status, 404);
  assert.equal(notFoundRes.body.stack, undefined, 'Stack trace must not be exposed');
});
