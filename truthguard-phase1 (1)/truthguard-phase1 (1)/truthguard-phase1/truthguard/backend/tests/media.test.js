import './env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { MediaProcessingService } from '../src/services/verification/MediaProcessingService.js';

const samplePng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

const sampleJpeg = Buffer.from(
  'ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9',
  'hex'
);

const sampleWebp = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8L', 'ascii'),
  Buffer.from([0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0x00]),
]);

const testVideoPath = path.resolve('test_media_sample.mp4');

before(async () => {
  // Generate a valid 1-second mp4 file for testing ffprobe and keyframes
  await new Promise((resolve, reject) => {
    const p = spawn(ffmpegStatic, [
      '-f', 'lavfi',
      '-i', 'testsrc=duration=1:size=160x120:rate=10',
      '-pix_fmt', 'yuv420p',
      '-y',
      testVideoPath,
    ]);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg testsrc failed with code ${c}`))));
    p.on('error', reject);
  });
});

after(async () => {
  try {
    await fs.unlink(testVideoPath);
    await fs.rm(path.resolve('test_sample.mp4'), { force: true });
  } catch {}
});

test('MediaProcessingService - validates image formats via magic bytes', () => {
  const service = new MediaProcessingService();

  // Valid formats
  assert.equal(service.validateImage(sampleJpeg, 'test.jpg').valid, true);
  assert.equal(service.validateImage(sampleJpeg, 'test.jpg').format, 'jpeg');

  assert.equal(service.validateImage(samplePng, 'test.png').valid, true);
  assert.equal(service.validateImage(samplePng, 'test.png').format, 'png');

  assert.equal(service.validateImage(sampleWebp, 'test.webp').valid, true);
  assert.equal(service.validateImage(sampleWebp, 'test.webp').format, 'webp');

  // Invalid formats
  const textBuffer = Buffer.from('Plain text file masquerading as image');
  const invalidRes = service.validateImage(textBuffer, 'fake.jpg');
  assert.equal(invalidRes.valid, false);
  assert.match(invalidRes.error, /Unsupported image format/);

  const emptyRes = service.validateImage(Buffer.alloc(0), 'empty.png');
  assert.equal(emptyRes.valid, false);
});

test('MediaProcessingService - validates video formats via container headers', () => {
  const service = new MediaProcessingService();

  // MP4 container header (ftyp box)
  const mp4Header = Buffer.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ...ftyp
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // isom...
  ]);
  assert.equal(service.validateVideo(mp4Header, 'clip.mp4').valid, true);
  assert.equal(service.validateVideo(mp4Header, 'clip.mp4').format, 'mp4');

  // WebM container header
  const webmHeader = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.from('webm', 'ascii'),
    Buffer.alloc(20),
  ]);
  assert.equal(service.validateVideo(webmHeader, 'clip.webm').valid, true);
  assert.equal(service.validateVideo(webmHeader, 'clip.webm').format, 'webm');

  // Invalid video
  const invalidRes = service.validateVideo(Buffer.from('not a video at all'), 'bad.mp4');
  assert.equal(invalidRes.valid, false);
  assert.match(invalidRes.error, /Unsupported video format/);
});

test('MediaProcessingService - extracts image metadata, dimensions and computes hash', async () => {
  const service = new MediaProcessingService();

  const hash = await service.computeHash(samplePng);
  assert.ok(hash.length === 64);

  const meta = await service.extractImageMetadata(samplePng);
  assert.equal(meta.dimensions?.width, 1);
  assert.equal(meta.dimensions?.height, 1);
});

test('MediaProcessingService - detects generative AI signatures in image chunks', async () => {
  const service = new MediaProcessingService();

  // Create PNG with embedded Stable Diffusion generation parameters chunk
  const aiChunk = Buffer.from(
    'parameters\0Steps: 25, Sampler: Euler a, CFG scale: 7, Seed: 12345, Model: v1-5-pruned',
    'utf8'
  );
  const aiBuffer = Buffer.concat([samplePng.slice(0, 33), aiChunk, samplePng.slice(33)]);

  const meta = await service.extractImageMetadata(aiBuffer);
  assert.ok(meta.aiSignatures.length > 0);
  assert.match(meta.aiSignatures[0], /Stable Diffusion/i);
});

test('MediaProcessingService - extracts video metadata and keyframes with timestamps', async () => {
  const service = new MediaProcessingService();

  const meta = await service.extractVideoMetadata(testVideoPath);
  assert.ok(meta.duration > 0);
  assert.equal(meta.video?.width, 160);
  assert.equal(meta.video?.height, 120);

  const keyframes = await service.extractKeyframes(testVideoPath, 'test-req-123', { maxFrames: 2 });
  assert.ok(keyframes.length > 0);
  assert.ok(keyframes[0].timestampSeconds >= 0);
  assert.ok(keyframes[0].formattedTimestamp.includes(':'));
  assert.ok(keyframes[0].relativePath.includes('test-req-123'));
});

