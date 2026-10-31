import './env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { VideoVerificationService } from '../src/services/verification/VideoVerificationService.js';

const testVideoFile = path.resolve('test_video_pipeline.mp4');

before(async () => {
  await new Promise((resolve, reject) => {
    const p = spawn(ffmpegStatic, [
      '-f', 'lavfi',
      '-i', 'testsrc=duration=1:size=160x120:rate=10',
      '-pix_fmt', 'yuv420p',
      '-y',
      testVideoFile,
    ]);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg testsrc failed with code ${c}`))));
    p.on('error', reject);
  });
});

after(async () => {
  try {
    await fs.unlink(testVideoFile);
  } catch {}
});

test('VideoVerificationService - end-to-end verification of valid video', async () => {
  const service = new VideoVerificationService();
  const res = await service.verifyVideo(testVideoFile, 'sample.mp4', 'req-vid-1');

  assert.equal(res.fileInfo.format, 'mp4');
  assert.ok(res.metadata.durationSeconds > 0);
  assert.equal(res.metadata.videoStream?.width, 160);
  assert.equal(res.metadata.videoStream?.height, 120);

  // Keyframes
  assert.ok(res.keyframes.length > 0);
  assert.ok(res.keyframes[0].timestampSeconds >= 0);
  assert.ok(res.keyframes[0].formattedTimestamp.includes(':'));

  // Synthesis
  assert.ok(['authentic_unmodified', 'inconclusive'].includes(res.verdict));
  assert.ok(res.confidence > 0);
  assert.ok(res.reasoning.length > 0);

  // Limitations
  assert.ok(res.limitations.length >= 2);
  assert.ok(res.limitations[0].includes('Keyframe analysis'));

  // AI separation
  assert.ok(res.aiDetection);
  assert.ok(res.aiDetection.disclaimer.includes('never independently determine factual accuracy'));
});

test('VideoVerificationService - detects editing suite signatures in stream encoder metadata', async () => {
  const mockMediaService = {
    validateVideo: () => ({ valid: true, format: 'mp4', mimeType: 'video/mp4' }),
    computeHash: async () => 'mockhashvideo123',
    extractVideoMetadata: async () => ({
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      duration: 10,
      sizeBytes: 1024000,
      encoder: 'Adobe Premiere Pro 2024',
      video: { codec: 'h264', width: 1920, height: 1080, fps: 30 },
      audio: { codec: 'aac' },
    }),
    extractKeyframes: async () => [
      { frameIndex: 1, timestampSeconds: 1.0, formattedTimestamp: '00:01.000', filename: 'f1.jpg', relativePath: 'k/1.jpg' },
      { frameIndex: 2, timestampSeconds: 2.0, formattedTimestamp: '00:02.000', filename: 'f2.jpg', relativePath: 'k/2.jpg' },
    ],
  };

  const service = new VideoVerificationService(mockMediaService);
  const res = await service.verifyVideo(testVideoFile, 'edited.mp4', 'req-vid-2');

  assert.equal(res.verdict, 'manipulated');
  assert.equal(res.manipulationAnalysis.isManipulated, true);
  assert.ok(res.manipulationAnalysis.indicators.some((i) => i.includes('Adobe Premiere Pro')));
});

test('VideoVerificationService - rejects invalid container or corrupted video file', async () => {
  const service = new VideoVerificationService();
  const badPath = path.resolve('bad_file.mp4');
  await fs.writeFile(badPath, 'corrupted data not video');

  try {
    await assert.rejects(() => service.verifyVideo(badPath, 'bad_file.mp4', 'req-err'), /Unsupported video format/);
  } finally {
    await fs.unlink(badPath);
  }
});

