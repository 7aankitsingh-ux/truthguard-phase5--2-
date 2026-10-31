import './env.js';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';

const app = createApp();
const origin = 'http://localhost:5173';
const creds = { email: 'verify_tester@example.com', name: 'Verify Tester', password: 'correct-horse-9' };

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
});

beforeEach(async () => {
  await query('TRUNCATE users CASCADE');
});

after(() => pool.end());

const registerAndLogin = async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').set('Origin', origin).send(creds);
  return agent;
};

test('POST /api/verify/text - verifies English and Hindi text input', async () => {
  const agent = await registerAndLogin();

  // English verification
  const resEn = await agent
    .post('/api/verify/text')
    .set('Origin', origin)
    .send({ text: 'Water boils at 100 degrees Celsius.' });

  assert.equal(resEn.status, 200);
  assert.equal(resEn.body.status, 'completed');
  assert.equal(resEn.body.result.verdict, 'SUPPORTED');
  assert.equal(resEn.body.result.language, 'en');

  // Hindi verification
  const resHi = await agent
    .post('/api/verify/text')
    .set('Origin', origin)
    .send({ text: 'पृथ्वी चपटी है।' });

  assert.equal(resHi.status, 200);
  assert.equal(resHi.body.status, 'completed');
  assert.equal(resHi.body.result.verdict, 'CONTRADICTED');
  assert.equal(resHi.body.result.language, 'hi');
});

test('POST /api/verify/text - rejects empty or missing text', async () => {
  const agent = await registerAndLogin();

  const res = await agent.post('/api/verify/text').set('Origin', origin).send({ text: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'validation_error');
});

test('POST /api/verify/url - blocks SSRF target with 400 ssrf_blocked', async () => {
  const agent = await registerAndLogin();

  // Target local loopback IP
  const resLocal = await agent
    .post('/api/verify/url')
    .set('Origin', origin)
    .send({ url: 'http://127.0.0.1:4000/api/dashboard' });

  assert.equal(resLocal.status, 400);
  assert.equal(resLocal.body.error.code, 'ssrf_blocked');

  // Target cloud metadata IP
  const resMeta = await agent
    .post('/api/verify/url')
    .set('Origin', origin)
    .send({ url: 'http://169.254.169.254/latest/meta-data/' });

  assert.equal(resMeta.status, 400);
  assert.equal(resMeta.body.error.code, 'ssrf_blocked');
});

test('POST /api/verify/image - verifies uploaded image and rejects missing file', async () => {
  const agent = await registerAndLogin();

  const samplePng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
  );

  const resOk = await agent
    .post('/api/verify/image')
    .set('Origin', origin)
    .attach('image', samplePng, 'pixel.png');

  assert.equal(resOk.status, 200);
  assert.equal(resOk.body.status, 'completed');
  assert.equal(resOk.body.result.fileInfo.format, 'png');

  // Missing file
  const resMissing = await agent.post('/api/verify/image').set('Origin', origin);
  assert.equal(resMissing.status, 400);
  assert.equal(resMissing.body.error.code, 'file_missing');
});

test('GET /api/verify/:id - retrieves status and details of request', async () => {
  const agent = await registerAndLogin();

  const submit = await agent
    .post('/api/verify/text')
    .set('Origin', origin)
    .send({ text: 'The Moon landing was faked.' });

  const requestId = submit.body.id;

  const res = await agent.get(`/api/verify/${requestId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, requestId);
  assert.equal(res.body.status, 'completed');
  assert.equal(res.body.result.verdict, 'CONTRADICTED');

  // Non-existent ID returns 404
  const resNotFound = await agent.get('/api/verify/00000000-0000-0000-0000-000000000000');
  assert.equal(resNotFound.status, 404);
});

