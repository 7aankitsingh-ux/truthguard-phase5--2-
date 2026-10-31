import './env.js';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { URLVerificationService } from '../src/services/verification/URLVerificationService.js';

const app = createApp();
const origin = 'http://localhost:5173';
const user = { email: 'integration_tester@example.com', name: 'Integration Tester', password: 'WorkflowPassword123!' };
const testVideoPath = path.resolve('test_integration_sample.mp4');

const samplePng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));

  // Generate a valid short mp4 video for the video workflow test
  await new Promise((resolve, reject) => {
    const p = spawn(ffmpegStatic, [
      '-f', 'lavfi',
      '-i', 'testsrc=duration=1:size=160x120:rate=10',
      '-pix_fmt', 'yuv420p',
      '-y',
      testVideoPath,
    ]);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg testsrc exited code ${c}`))));
    p.on('error', reject);
  });
});

beforeEach(async () => {
  await query('TRUNCATE users CASCADE');
});

after(async () => {
  try {
    await unlink(testVideoPath);
  } catch {}
  await pool.end();
});

const registerAndLogin = async (creds) => {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').set('Origin', origin).send(creds);
  return agent;
};

/* ==========================================================================
   WORKFLOW 1: TEXT VERIFICATION WORKFLOW
   User submits text → claims are extracted → evidence is retrieved →
   evidence is evaluated → verdict is generated → report is saved →
   feedback & explanation are requested.
   ========================================================================== */

test('Integration Workflow 1: End-to-End Text Verification Workflow', async () => {
  const agent = await registerAndLogin(user);

  // 1. Submit text with clear factual claims
  const textInput = 'Water boils at 100 degrees Celsius under standard atmospheric pressure. NASA confirmed astronauts landed on the Moon in 1969.';
  const verifyRes = await agent.post('/api/verify/text').set('Origin', origin).send({ text: textInput });
  assert.equal(verifyRes.status, 200);

  // Inspect extraction & verdict output
  const { id: requestId, resultId, result } = verifyRes.body;
  assert.ok(requestId, 'Should return a valid request ID');
  assert.ok(resultId, 'Should return a valid result ID');
  assert.equal(verifyRes.body.status, 'completed');

  // Verify claims extracted
  assert.ok(Array.isArray(result.claims));
  assert.ok(result.claims.length >= 1, 'Should extract at least one claim');

  // Verify verdict and evidence evaluation
  assert.equal(result.verdict, 'SUPPORTED');
  assert.ok(result.confidence > 0.5, 'Confidence should reflect strong supporting evidence');
  assert.ok(Array.isArray(result.evidenceSources));
  assert.ok(result.evidenceSources.length > 0, 'Should include retrieved evidence sources');

  // Verify 6-dimension confidence assessment
  assert.ok(result.confidenceAssessment);
  assert.ok(result.confidenceAssessment.dimensions);
  assert.ok(result.confidenceAssessment.dimensions.sourceQuality);

  // 2. Save the result as a Report
  const saveRes = await agent.post('/api/reports').set('Origin', origin).send({
    resultId,
    title: 'Scientific Fact Check: Water Boiling & Lunar Missions',
    notes: 'Verified against authoritative physics reference and NASA records.'
  });
  assert.equal(saveRes.status, 201);
  const reportId = saveRes.body.id;
  assert.ok(reportId);

  // 3. Retrieve saved reports and verify the newly saved report is listed
  const listRes = await agent.get('/api/reports');
  assert.equal(listRes.status, 200);
  assert.ok(listRes.body.items.some(r => r.id === reportId));

  // 4. Generate public share token for the report
  const shareRes = await agent.post(`/api/reports/${reportId}/share`).set('Origin', origin);
  assert.equal(shareRes.status, 200);
  const shareToken = shareRes.body.shareToken;
  assert.ok(shareToken);

  // 5. Access public share endpoint anonymously
  const publicAgent = request(app);
  const publicRes = await publicAgent.get(`/api/reports/shared/${shareToken}`);
  assert.equal(publicRes.status, 200);
  assert.equal(publicRes.body.title, 'Scientific Fact Check: Water Boiling & Lunar Missions');
  assert.equal(publicRes.body.result.verdict, 'SUPPORTED');

  // 6. Request detailed explanation and audit trail
  const explainRes = await agent.post(`/api/verify/${requestId}/explain`).set('Origin', origin);
  assert.equal(explainRes.status, 200);
  assert.ok(explainRes.body.verdict);
  assert.ok(Array.isArray(explainRes.body.deepDiveContext));
  assert.ok(explainRes.body.deepDiveContext.length > 0);

  // 7. Submit user dispute / feedback
  const disputeRes = await agent.post(`/api/verify/${requestId}/dispute`).set('Origin', origin).send({
    rating: 5,
    comment: 'Rigorous and complete verification with cited sources.',
  });
  assert.equal(disputeRes.status, 201);
});

/* ==========================================================================
   WORKFLOW 2: IMAGE VERIFICATION WORKFLOW
   User uploads image → file is validated → metadata and image analysis
   are performed → findings are evaluated → report is generated → PDF downloaded.
   ========================================================================== */

test('Integration Workflow 2: End-to-End Image Verification Workflow', async () => {
  const agent = await registerAndLogin(user);

  // 1. Upload valid image
  const uploadRes = await agent
    .post('/api/verify/image')
    .set('Origin', origin)
    .attach('image', samplePng, 'test_image.png');

  assert.equal(uploadRes.status, 200);
  const { id: requestId, resultId, result } = uploadRes.body;
  assert.ok(requestId);
  assert.ok(resultId);
  assert.equal(uploadRes.body.type, 'image');
  assert.equal(uploadRes.body.status, 'completed');

  // Verify image metadata and integrity analysis results
  assert.ok(result.fileInfo);
  assert.equal(result.fileInfo.format.toLowerCase(), 'png');
  assert.ok(result.fileInfo.sha256);
  assert.ok(result.verdict);
  assert.ok(Array.isArray(result.reasoning));

  // 2. Save image verification report
  const saveRes = await agent.post('/api/reports').set('Origin', origin).send({
    resultId,
    title: 'Image Authenticity Audit',
    notes: 'Magic bytes validated, checked for AI artifacts and software signatures.'
  });
  assert.equal(saveRes.status, 201);
  const reportId = saveRes.body.id;

  // 3. Download generated PDF report
  const pdfRes = await agent.get(`/api/reports/${reportId}/pdf`);
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers['content-type'], 'application/pdf');
  assert.ok(pdfRes.body.length > 500, 'PDF buffer should contain generated document');
});

/* ==========================================================================
   WORKFLOW 3: VIDEO VERIFICATION WORKFLOW
   User uploads video → metadata is extracted → keyframes are generated →
   frames are analyzed → findings are evaluated → report is generated.
   ========================================================================== */

test('Integration Workflow 3: End-to-End Video Verification Workflow', async () => {
  const agent = await registerAndLogin(user);

  // 1. Submit video for verification (asynchronous execution)
  const uploadRes = await agent
    .post('/api/verify/video')
    .set('Origin', origin)
    .attach('video', testVideoPath);

  assert.equal(uploadRes.status, 202, 'Video upload should return 202 Accepted for async job');
  const requestId = uploadRes.body.id;
  assert.ok(requestId);

  // 2. Poll status until background task completes (max 10 seconds)
  let completedReq = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const statusRes = await agent.get(`/api/verify/${requestId}`);
    assert.equal(statusRes.status, 200);
    if (statusRes.body.status === 'completed') {
      completedReq = statusRes.body;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  assert.ok(completedReq, 'Video processing must complete within timeout');
  assert.equal(completedReq.status, 'completed');
  assert.ok(completedReq.resultId);

  // Verify keyframe analysis
  const result = completedReq.result;
  assert.ok(result);
  assert.ok(Array.isArray(result.keyframes));
  assert.ok(result.keyframes.length > 0, 'Keyframes should be extracted');
  assert.ok(result.keyframes[0].timestampSeconds !== undefined, 'Keyframe must contain timestampSeconds');
  assert.ok(result.keyframes[0].formattedTimestamp, 'Keyframe must contain formattedTimestamp');

  // 3. Check dashboard reflects video verification count
  const dashRes = await agent.get('/api/dashboard');
  assert.equal(dashRes.status, 200);
  assert.ok(dashRes.body.byType.video >= 1);
});

/* ==========================================================================
   WORKFLOW 4: URL VERIFICATION WORKFLOW
   User submits URL → URL is validated → article is retrieved →
   claims are extracted → evidence is compared → verdict is generated.
   ========================================================================== */

test('Integration Workflow 4: End-to-End URL Verification Workflow', async () => {
  const agent = await registerAndLogin(user);

  // Mock safeFetch and validateAndResolveUrl to test URL workflow hermetically
  const originalFetch = URLVerificationService.prototype.safeFetch;
  const originalValidate = URLVerificationService.prototype.validateAndResolveUrl;

  URLVerificationService.prototype.validateAndResolveUrl = async function (url) {
    return { resolvedUrl: new URL(url), ip: '93.184.216.34' };
  };

  URLVerificationService.prototype.safeFetch = async function (url) {
    return {
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Global Scientific Breakthrough: Water Boiling Point Physics Confirmed</title>
            <meta property="og:title" content="Global Scientific Breakthrough: Water Boiling Point Physics Confirmed" />
            <meta property="og:site_name" content="Science Daily Review" />
            <meta name="author" content="Dr. Jane Smith" />
          </head>
          <body>
            <article>
              <p>Water boils at 100 degrees Celsius under standard atmospheric pressure. Extensive lab trials confirm this thermal constant across multiple international laboratories.</p>
            </article>
          </body>
        </html>
      `,
      finalUrl: url,
    };
  };

  try {
    const urlInput = 'https://sciencedaily.example.com/articles/water-boiling-constant';
    const verifyRes = await agent.post('/api/verify/url').set('Origin', origin).send({ url: urlInput });
    assert.equal(verifyRes.status, 200);

    const { id: requestId, resultId, result } = verifyRes.body;
    assert.ok(requestId);
    assert.ok(resultId);
    assert.equal(verifyRes.body.type, 'url');
    assert.equal(verifyRes.body.status, 'completed');

    // Verify article extraction details
    assert.equal(result.article.title, 'Global Scientific Breakthrough: Water Boiling Point Physics Confirmed');
    assert.equal(result.article.publisher, 'Science Daily Review');

    // Verify extracted claims and verdict
    assert.ok(Array.isArray(result.claims));
    assert.equal(result.verdict, 'SUPPORTED');
    assert.ok(result.confidence > 0.5);

    // Save and retrieve report
    const saveRes = await agent.post('/api/reports').set('Origin', origin).send({
      resultId,
      title: 'Web Article Verification: Science Daily Review',
      notes: 'SSRF passed, article parsed, claims compared against empirical facts.'
    });
    assert.equal(saveRes.status, 201);
  } finally {
    URLVerificationService.prototype.safeFetch = originalFetch;
    URLVerificationService.prototype.validateAndResolveUrl = originalValidate;
  }
});
