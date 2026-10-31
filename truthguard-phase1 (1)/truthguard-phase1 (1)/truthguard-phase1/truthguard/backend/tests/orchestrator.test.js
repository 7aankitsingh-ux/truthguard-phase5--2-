import './env.js';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pool, query } from '../src/db.js';
import { VerificationOrchestrator } from '../src/services/verification/VerificationOrchestrator.js';

let testUserId;

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
});

beforeEach(async () => {
  await query('TRUNCATE users CASCADE');
  const { rows } = await query(
    `INSERT INTO users (email, name, password_hash) VALUES ('test@example.com', 'Tester', 'hash') RETURNING id`
  );
  testUserId = rows[0].id;
});

after(() => pool.end());

test('VerificationOrchestrator - text verification request lifecycle (synchronous)', async () => {
  const orchestrator = new VerificationOrchestrator();

  const response = await orchestrator.submitVerification({
    userId: testUserId,
    type: 'text',
    inputText: 'Water boils at 100 degrees Celsius.',
  });

  assert.ok(response.id);
  assert.equal(response.userId, testUserId);
  assert.equal(response.type, 'text');
  assert.equal(response.status, 'completed');
  assert.ok(response.result);
  assert.equal(response.result.verdict, 'SUPPORTED');

  // Verify DB state
  const dbReq = await orchestrator.getRequest(response.id, testUserId);
  assert.equal(dbReq.id, response.id);
  assert.equal(dbReq.status, 'completed');
  assert.equal(dbReq.result.verdict, 'SUPPORTED');
  assert.ok(dbReq.result.evidenceSources.length > 0);
});

test('VerificationOrchestrator - image verification request lifecycle', async () => {
  const orchestrator = new VerificationOrchestrator();

  const samplePng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
  );

  const response = await orchestrator.submitVerification({
    userId: testUserId,
    type: 'image',
    fileBuffer: samplePng,
    originalName: 'test.png',
    mimeType: 'image/png',
  });

  assert.equal(response.status, 'completed');
  assert.ok(response.result);

  const dbReq = await orchestrator.getRequest(response.id, testUserId);
  assert.equal(dbReq.uploadedFile?.original_name, 'test.png');
  assert.equal(dbReq.uploadedFile?.mime_type, 'image/png');
});

test('VerificationOrchestrator - asynchronous background processing execution', async () => {
  const orchestrator = new VerificationOrchestrator();

  const tempVideo = 'test_async_video.mp4';
  const fs = await import('node:fs/promises');
  await fs.writeFile(tempVideo, 'mp4 content for async test');

  // Mock video verification service to resolve after short delay
  orchestrator.videoService = {
    verifyVideo: async () => {
      await new Promise((r) => setTimeout(r, 100));
      return {
        verdict: 'authentic_unmodified',
        confidence: 0.85,
        summary: 'Video frames consistent.',
        reasoning: ['Encoding parameters verified.'],
        keyframes: [],
        evidenceSources: [],
      };
    },
  };

  try {
    const response = await orchestrator.submitVerification({
      userId: testUserId,
      type: 'video',
      filePath: tempVideo,
      originalName: 'clip.mp4',
      mimeType: 'video/mp4',
      asyncProcessing: true,
    });

    assert.equal(response.status, 'processing');
    assert.equal(response.isAsync, true);

    // Initial DB check while processing
    const inProgress = await orchestrator.getRequest(response.id, testUserId);
    assert.ok(['processing', 'completed'].includes(inProgress.status));

    // Wait for background job promise to complete
    const job = orchestrator.activeJobs.get(response.id);
    if (job) await job;

    // DB check after background completion
    const completed = await orchestrator.getRequest(response.id, testUserId);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.result.verdict, 'authentic_unmodified');
  } finally {
    await fs.unlink(tempVideo).catch(() => {});
  }
});

test('VerificationOrchestrator - handles and persists failure state cleanly', async () => {
  const orchestrator = new VerificationOrchestrator();

  // Submitting invalid text that fails
  await assert.rejects(
    () =>
      orchestrator.submitVerification({
        userId: testUserId,
        type: 'text',
        inputText: '',
      }),
    /required and cannot be empty/
  );

  // Verify the failure was recorded in DB
  const { rows } = await query(
    `SELECT * FROM verification_requests WHERE user_id = $1 AND status = 'failed'`,
    [testUserId]
  );
  assert.ok(rows.length > 0);
  assert.ok(rows[0].error_message.includes('required and cannot be empty'));
});
