import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceRetrievalService } from '../src/services/verification/EvidenceRetrievalService.js';

test('EvidenceRetrievalService - empty or invalid inputs', async () => {
  const service = new EvidenceRetrievalService();

  const resEmpty = await service.retrieveEvidence('');
  assert.equal(resEmpty.sources.length, 0);
  assert.equal(resEmpty.supportingCount, 0);
  assert.equal(resEmpty.contradictingCount, 0);
  assert.equal(resEmpty.externalIntegration.available, false);
  assert.match(resEmpty.externalIntegration.reason, /API key not configured/);

  const resWhitespace = await service.retrieveEvidence('    ');
  assert.equal(resWhitespace.sources.length, 0);

  const comparisonEmpty = service.compareSources([]);
  assert.equal(comparisonEmpty.consensus, 'insufficient_evidence');
  assert.equal(comparisonEmpty.supportRatio, 0);
});

test('EvidenceRetrievalService - retrieves contradicting evidence for debunked claim (English)', async () => {
  const service = new EvidenceRetrievalService();
  const res = await service.retrieveEvidence('The Earth is flat');

  assert.ok(res.sources.length > 0);
  assert.ok(res.contradictingCount > 0);
  assert.equal(res.sources[0].stance, 'contradicts');

  const comparison = service.compareSources(res.sources);
  assert.equal(comparison.consensus, 'contradicts');
  assert.equal(comparison.supportRatio, 0);
  assert.match(comparison.summary, /refute|contradict/i);
});

test('EvidenceRetrievalService - retrieves contradicting evidence in Hindi', async () => {
  const service = new EvidenceRetrievalService();
  const res = await service.retrieveEvidence('पृथ्वी चपटी है', { language: 'hi' });

  assert.ok(res.sources.length > 0);
  assert.ok(res.contradictingCount > 0);
  const comparison = service.compareSources(res.sources);
  assert.equal(comparison.consensus, 'contradicts');
});

test('EvidenceRetrievalService - retrieves supporting evidence for verified facts', async () => {
  const service = new EvidenceRetrievalService();
  const res = await service.retrieveEvidence('Water boils at 100 degrees Celsius');

  assert.ok(res.sources.length > 0);
  assert.ok(res.supportingCount > 0);
  assert.equal(res.sources[0].stance, 'supports');

  const comparison = service.compareSources(res.sources);
  assert.equal(comparison.consensus, 'supports');
  assert.equal(comparison.supportRatio, 1);
});

test('EvidenceRetrievalService - clearly identifies unavailable external integration without simulating', async () => {
  const service = new EvidenceRetrievalService();
  const res = await service.retrieveEvidence('Some arbitrary obscure unindexed statement');

  assert.equal(res.externalIntegration.available, false);
  assert.equal(res.externalIntegration.provider, 'Google Fact Check Tools API');
  assert.ok(res.externalIntegration.reason.includes('GOOGLE_FACTCHECK_API_KEY'));
  assert.equal(res.sources.length, 0);
});

test('EvidenceRetrievalService - source comparison handles mixed and neutral stances', () => {
  const service = new EvidenceRetrievalService();

  const mixed = [
    { url: 'https://a.com', stance: 'supports', publisher: 'Source A', authority: 0.8 },
    { url: 'https://b.com', stance: 'contradicts', publisher: 'Source B', authority: 0.8 },
  ];
  const comparison = service.compareSources(mixed);
  assert.equal(comparison.consensus, 'mixed');
  assert.equal(comparison.supportRatio, 0.5);

  const neutralOnly = [
    { url: 'https://c.com', stance: 'neutral', publisher: 'Source C', authority: 0.5 },
  ];
  const compNeutral = service.compareSources(neutralOnly);
  assert.equal(compNeutral.consensus, 'insufficient_evidence');
});

