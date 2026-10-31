import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageVerificationService } from '../src/services/verification/ImageVerificationService.js';

const samplePng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

const sampleJpeg = Buffer.from(
  'ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9',
  'hex'
);

test('ImageVerificationService - verifies image and handles inconclusive verdict with limitations', async () => {
  const service = new ImageVerificationService();
  const res = await service.verifyImage(sampleJpeg, 'photo.jpg');

  assert.equal(res.fileInfo.format, 'jpeg');
  assert.equal(res.fileInfo.sizeBytes, sampleJpeg.length);
  assert.equal(res.verdict, 'inconclusive');
  assert.ok(res.limitations.length >= 2);
  assert.ok(res.limitations[0].includes('absence of manipulation artifacts does not guarantee authenticity'));
});

test('ImageVerificationService - detects generative AI generation signatures', async () => {
  const service = new ImageVerificationService();

  const aiChunk = Buffer.from('parameters\0Steps: 20, Sampler: DPM++ 2M, CFG scale: 7, Seed: 999', 'utf8');
  const aiPng = Buffer.concat([samplePng.slice(0, 33), aiChunk, samplePng.slice(33)]);

  const res = await service.verifyImage(aiPng, 'generated.png');
  assert.equal(res.verdict, 'ai_generated');
  assert.equal(res.aiDetection.isLikelyAiGenerated, true);
  assert.ok(res.aiDetection.indicators.some((i) => i.includes('Stable Diffusion')));
  assert.ok(res.aiDetection.disclaimer.includes('never independently determine factual accuracy'));
});

test('ImageVerificationService - detects software editing tools in metadata', async () => {
  // Mock media service returning Photoshop software
  const mockMediaService = {
    validateImage: () => ({ valid: true, format: 'jpeg', mimeType: 'image/jpeg' }),
    computeHash: async () => 'mockhash1234567890abcdef',
    extractImageMetadata: async () => ({
      dimensions: { width: 800, height: 600 },
      software: 'Adobe Photoshop 2024 (Windows)',
      camera: null,
      gps: null,
      timestamps: {
        dateTimeOriginal: '2026-01-01T10:00:00Z',
        modifyDate: '2026-01-02T15:00:00Z',
      },
      aiSignatures: [],
    }),
  };

  const service = new ImageVerificationService(mockMediaService);
  const res = await service.verifyImage(sampleJpeg, 'edited.jpg');

  assert.equal(res.verdict, 'manipulated');
  assert.equal(res.manipulationAnalysis.isManipulated, true);
  assert.ok(res.manipulationAnalysis.indicators.some((i) => i.includes('Adobe Photoshop')));
});

test('ImageVerificationService - reverse image search identifies unconfigured status clearly', async () => {
  const service = new ImageVerificationService();
  const res = await service.verifyImage(samplePng, 'test.png');

  assert.equal(res.reverseImageSearch.status, 'unavailable');
  assert.ok(res.reverseImageSearch.reason.includes('REVERSE_IMAGE_API_KEY'));
  assert.equal(res.reverseImageSearch.matches.length, 0);
});

test('ImageVerificationService - rejects invalid, corrupt, or non-image files', async () => {
  const service = new ImageVerificationService();

  const corrupt = Buffer.from('NOT AN IMAGE FILE');
  await assert.rejects(() => service.verifyImage(corrupt, 'fake.jpg'), /Unsupported image format/);

  await assert.rejects(() => service.verifyImage(Buffer.alloc(0), 'empty.jpg'), /File is empty/);
});

