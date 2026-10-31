import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TextVerificationService } from '../src/services/verification/TextVerificationService.js';

test('TextVerificationService - detects English and Hindi accurately', () => {
  const service = new TextVerificationService();

  assert.equal(service.detectLanguage('The Earth is a planet in the solar system.'), 'en');
  assert.equal(service.detectLanguage('पृथ्वी सौर मंडल का एक ग्रह है।'), 'hi');
  assert.equal(service.detectLanguage(''), 'en');
});

test('TextVerificationService - claim extraction identifies factual statements and filters opinions', () => {
  const service = new TextVerificationService();

  const passage = `
    Hello everyone! In my personal opinion, space exploration is fascinating.
    NASA launched the Apollo 11 mission in July 1969.
    Twelve astronauts walked on the Moon between 1969 and 1972.
    I really hope we visit Mars soon!
  `;

  const claims = service.extractClaims(passage, 'en');
  assert.ok(claims.length >= 2);

  // Check that NASA Apollo 11 was extracted as factual
  const apolloClaim = claims.find((c) => c.claimText.includes('Apollo 11'));
  assert.ok(apolloClaim);
  assert.equal(apolloClaim.isFactual, true);
  assert.ok(apolloClaim.verifiabilityScore >= 0.5);

  // Check that greeting and opinion were filtered out or marked non-factual
  const greetingClaim = claims.find((c) => c.claimText.toLowerCase().includes('hello everyone'));
  assert.equal(greetingClaim, undefined);
});

test('TextVerificationService - extracts Hindi factual claims with Devanagari punctuation', () => {
  const service = new TextVerificationService();

  const hindiPassage = `
    नमस्ते दोस्तों। मुझे लगता है कि विज्ञान बहुत कठिन है।
    पानी 100 डिग्री सेल्सियस पर उबलता है।
    वैज्ञानिक शोध ने इस तथ्य की पुष्टि की है।
  `;

  const claims = service.extractClaims(hindiPassage, 'hi');
  assert.ok(claims.length >= 1);

  const waterClaim = claims.find((c) => c.claimText.includes('100'));
  assert.ok(waterClaim);
  assert.equal(waterClaim.isFactual, true);
});

test('TextVerificationService - verifies debunked claim and returns CONTRADICTED with reasoning (English)', async () => {
  const service = new TextVerificationService();
  const result = await service.verifyText('The Earth is flat and the Apollo moon landing was faked.');

  assert.equal(result.verdict, 'CONTRADICTED');
  assert.ok(result.confidence >= 0.7);
  assert.ok(result.reasoning.length > 0);
  assert.ok(result.evidenceSources.length > 0);
  assert.equal(result.language, 'en');
});

test('TextVerificationService - verifies debunked claim and returns CONTRADICTED with reasoning (Hindi)', async () => {
  const service = new TextVerificationService();
  const result = await service.verifyText('पृथ्वी चपटी है।');

  assert.equal(result.verdict, 'CONTRADICTED');
  assert.equal(result.language, 'hi');
  assert.ok(result.reasoning.length > 0);
});

test('TextVerificationService - verifies true scientific fact and returns SUPPORTED', async () => {
  const service = new TextVerificationService();
  const result = await service.verifyText('Water boils at 100 degrees Celsius under standard atmospheric pressure.');

  assert.equal(result.verdict, 'SUPPORTED');
  assert.ok(result.confidence >= 0.75);
  assert.ok(result.evidenceSources.some((s) => s.stance === 'supports'));
});

test('TextVerificationService - verifies mixed claims and returns MIXED', async () => {
  const service = new TextVerificationService();
  const result = await service.verifyText('Water boils at 100 degrees Celsius. However, the Earth is flat.');

  assert.equal(result.verdict, 'MIXED');
  assert.ok(result.confidence >= 0.5);
  assert.ok(result.evidenceSources.length >= 2);
});

test('TextVerificationService - AI detection is strictly separated from factual verdict', async () => {
  const service = new TextVerificationService();

  // Synthetic uniform text snippet
  const uniformText = `
    Furthermore, water boils at 100 degrees Celsius under normal atmospheric conditions.
    Moreover, it is important to note that extensive research corroborates this finding.
    In conclusion, the thermal physical properties of water are well documented.
  `;

  const result = await service.verifyText(uniformText);

  // 1. Factuality is determined by evidence, NOT by AI score
  assert.equal(result.verdict, 'SUPPORTED');

  // 2. AI detection is a separate sub-object
  assert.ok(result.aiDetection);
  assert.ok(typeof result.aiDetection.score === 'number');
  assert.ok(result.aiDetection.disclaimer.includes('never independently determine factual accuracy'));
  assert.equal(result.aiDetection.externalIntegration.available, false);
});

test('TextVerificationService - rejects empty or whitespace input', async () => {
  const service = new TextVerificationService();

  await assert.rejects(() => service.verifyText(''), /required and cannot be empty/);
  await assert.rejects(() => service.verifyText('    '), /required and cannot be empty/);
});

