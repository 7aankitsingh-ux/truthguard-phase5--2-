import './env.js';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { createResetToken } from '../src/services/sessions.js';

const app = createApp();
const creds = { email: 'tester@example.com', name: 'Test User', password: 'correct-horse-9' };
const origin = 'http://localhost:5173';

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
});
beforeEach(() => query('TRUNCATE users CASCADE'));
after(() => pool.end());

const register = async () => {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').set('Origin', origin).send(creds);
  return { agent, r };
};

test('database connectivity', async () => {
  assert.equal((await request(app).get('/api/health')).status, 200);
});

test('register creates user, sets HttpOnly cookie, stores argon2id hash', async () => {
  const { r } = await register();
  assert.equal(r.status, 201);
  assert.match(r.headers['set-cookie'][0], /HttpOnly/);
  const { rows } = await query('SELECT password_hash FROM users');
  assert.match(rows[0].password_hash, /^\$argon2id\$/);
});

test('duplicate email is rejected', async () => {
  await register();
  assert.equal((await register()).r.status, 409);
});

test('weak password is rejected', async () => {
  const r = await request(app).post('/api/auth/register').send({ ...creds, password: 'short' });
  assert.equal(r.status, 400);
});

test('protected routes require a session', async () => {
  assert.equal((await request(app).get('/api/dashboard')).status, 401);
  assert.equal((await request(app).get('/api/auth/me')).status, 401);
});

test('login, session access, logout, session revoked', async () => {
  await register();
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/auth/login').send({ email: creds.email, password: 'wrong-pass-1' })).status, 401);
  assert.equal((await agent.post('/api/auth/login').send({ email: creds.email, password: creds.password })).status, 200);
  assert.equal((await agent.get('/api/dashboard')).status, 200);
  assert.equal((await agent.post('/api/auth/logout')).status, 204);
  assert.equal((await agent.get('/api/dashboard')).status, 401);
});

test('expired session is rejected', async () => {
  const { agent } = await register();
  await query(`UPDATE user_sessions SET expires_at = now() - interval '1 minute'`);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('cross-origin mutating requests are blocked', async () => {
  const r = await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send(creds);
  assert.equal(r.status, 403);
});

test('password reset revokes sessions and token is single use', async () => {
  const { agent } = await register();
  const { rows } = await query('SELECT id FROM users');
  const token = await createResetToken(rows[0].id);
  const password = 'brand-new-pass-7';
  assert.equal((await request(app).post('/api/auth/password-reset/confirm').send({ token, password })).status, 204);
  assert.equal((await request(app).post('/api/auth/password-reset/confirm').send({ token, password })).status, 400);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
  assert.equal((await request(app).post('/api/auth/login').send({ email: creds.email, password })).status, 200);
});

test('reset request does not reveal whether an account exists', async () => {
  const r = await request(app).post('/api/auth/password-reset/request').send({ email: 'nobody@example.com' });
  assert.equal(r.status, 200);
});

test('new accounts have empty history and no fabricated data', async () => {
  const { agent } = await register();
  assert.deepEqual((await agent.get('/api/verifications')).body.items, []);
  const dash = (await agent.get('/api/dashboard')).body;
  assert.equal(dash.verifications, 0);
  assert.equal(dash.savedReports, 0);
  assert.equal(dash.supportedClaims, 0);
  assert.equal(dash.contradictedClaims, 0);
  assert.equal(dash.unverifiedClaims, 0);
  assert.equal(dash.mixedResults, 0);
  assert.deepEqual(dash.recentActivity, []);
});
