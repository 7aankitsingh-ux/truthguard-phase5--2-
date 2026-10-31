import './env.js';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { EvidenceRetrievalEngine, SOURCE_TIERS } from '../src/services/verification/EvidenceRetrievalEngine.js';
import { EvidenceEvaluationEngine } from '../src/services/verification/EvidenceEvaluationEngine.js';
import { VerdictGenerationEngine, VERDICTS } from '../src/services/verification/VerdictGenerationEngine.js';
import { ConfidenceAssessmentService } from '../src/services/verification/ConfidenceAssessmentService.js';
import { ReportManagementService } from '../src/services/verification/ReportManagementService.js';

const app = createApp();
const origin = 'http://localhost:5173';
const userA = { email: 'user_a@example.com', name: 'User A', password: 'password-123-A' };
const userB = { email: 'user_b@example.com', name: 'User B', password: 'password-123-B' };

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
   1. EVIDENCE RETRIEVAL ENGINE TESTS
   ========================================================================== */

test('EvidenceRetrievalEngine - prioritizes primary & academic sources and extracts metadata', async () => {
  const engine = new EvidenceRetrievalEngine();
  const res = await engine.retrieveEvidence('Water boils at 100 degrees Celsius.');

  assert.ok(res.sources.length >= 1);
  assert.ok(res.uniqueIndependentSourcesCount >= 1);
  assert.ok(res.retrievedAt);

  const firstSource = res.sources[0];
  assert.ok(firstSource.url);
  assert.ok(firstSource.publisher);
  assert.ok(firstSource.tier);
  // Prioritization: Tier 1 / 2 comes before Tier 3 / 4
  assert.ok(firstSource.tier.tier <= 2);
  assert.ok(firstSource.authorityScore >= 0.85);
  assert.equal(firstSource.stance, 'supports');
});

test('EvidenceRetrievalEngine - identifies duplicates and avoids treating syndicated wire reports as independent', async () => {
  const engine = new EvidenceRetrievalEngine();

  // Create a synthetic set of sources with duplicate URLs and syndicated wire stories
  const rawSources = [
    {
      url: 'https://news-site-a.com/article-1?utm_source=twitter',
      title: 'Reuters: Landmark Study Released',
      publisher: 'News Site A',
      wireService: 'Reuters',
      stance: 'supports',
      publishedDate: '2024-01-10',
    },
    {
      url: 'https://news-site-b.com/article-1?utm_source=facebook',
      title: 'Reuters: Landmark Study Released',
      publisher: 'News Site B',
      wireService: 'Reuters',
      stance: 'supports',
      publishedDate: '2024-01-10',
    },
    {
      url: 'https://news-site-c.com/article-1',
      title: 'Reuters: Landmark Study Released',
      publisher: 'News Site C',
      wireService: 'Reuters',
      stance: 'supports',
      publishedDate: '2024-01-10',
    },
    {
      url: 'https://news-site-a.com/article-1?utm_source=twitter', // exact duplicate URL
      title: 'News Site A duplicate',
      publisher: 'News Site A',
      stance: 'supports',
    },
    {
      url: 'https://independent-science-daily.org/review',
      title: 'Independent Research Editorial',
      publisher: 'Science Daily',
      stance: 'supports',
      publishedDate: '2024-01-12',
    },
  ];

  const { processedSources, uniqueIndependentCount, syndicatedGroupsCount } =
    engine._analyzeDuplicatesAndSyndication(rawSources);

  // Exact URL duplicate was discarded
  assert.equal(processedSources.length, 4);

  // First Reuters instance is marked independent confirmation
  assert.equal(processedSources[0].isSyndicated, false);
  assert.equal(processedSources[0].isIndependentConfirmation, true);

  // Subsequent Reuters reprints are flagged as syndicated and NOT independent confirmation
  assert.equal(processedSources[1].isSyndicated, true);
  assert.equal(processedSources[1].isIndependentConfirmation, false);
  assert.match(processedSources[1].syndicationNotice, /Syndicated wire report originating from Reuters/);

  assert.equal(processedSources[2].isSyndicated, true);
  assert.equal(processedSources[2].isIndependentConfirmation, false);

  // Science Daily is an independent source
  assert.equal(processedSources[3].isSyndicated, false);
  assert.equal(processedSources[3].isIndependentConfirmation, true);

  // Total unique independent sources = 2 (1 wire root + 1 independent site), NOT 4!
  assert.equal(uniqueIndependentCount, 2);
  assert.equal(syndicatedGroupsCount, 2);
});

/* ==========================================================================
   2. EVIDENCE EVALUATION ENGINE TESTS
   ========================================================================== */

test('EvidenceEvaluationEngine - evaluates relevance, independence, temporal freshness, and conflicts', () => {
  const engine = new EvidenceEvaluationEngine();

  const mockSources = [
    {
      url: 'https://www.cdc.gov/vaccinesafety',
      title: 'CDC Vaccine Safety Data',
      publisher: 'CDC',
      stance: 'contradicts',
      publishedDate: '2025-05-01',
      tier: SOURCE_TIERS.TIER_1_PRIMARY_OFFICIAL,
      isPrimary: true,
      isSyndicated: false,
    },
    {
      url: 'https://www.nejm.org/vaccine-study',
      title: 'New England Journal of Medicine Vaccine Study',
      publisher: 'NEJM',
      stance: 'contradicts',
      publishedDate: '2024-08-15',
      tier: SOURCE_TIERS.TIER_2_RESEARCH_ACADEMIC,
      isPrimary: true,
      isSyndicated: false,
    },
  ];

  const evalResult = engine.evaluateClaimEvidence('Vaccines cause autism', mockSources, {
    missingContextNotes: ['Wakefield paper was retracted for data falsification.'],
  });

  assert.equal(evalResult.contradicting.length, 2);
  assert.equal(evalResult.supporting.length, 0);
  assert.ok(evalResult.relevanceScore > 0);
  assert.equal(evalResult.sourceIndependence.uniqueIndependentCount, 2);
  assert.equal(evalResult.sourceIndependence.isCircularReportingRisk, false);
  assert.ok(evalResult.temporalAnalysis.isFresh);
  assert.equal(evalResult.missingContext.length, 1);
  assert.equal(evalResult.hasSufficientEvidence, true);
});

test('EvidenceEvaluationEngine - flags circular reporting risk when multiple outlets only repeat one wire', () => {
  const engine = new EvidenceEvaluationEngine();

  const circularSources = [
    {
      url: 'https://outlet1.com/wire-post',
      title: 'Breaking wire post',
      publisher: 'Outlet 1',
      stance: 'supports',
      isSyndicated: false,
    },
    {
      url: 'https://outlet2.com/wire-post',
      title: 'Breaking wire post',
      publisher: 'Outlet 2',
      stance: 'supports',
      isSyndicated: true,
      syndicationNotice: 'Syndicated wire report originating from Associated Press.',
    },
  ];

  const evalResult = engine.evaluateClaimEvidence('Some breaking claim', circularSources);
  assert.equal(evalResult.sourceIndependence.isCircularReportingRisk, true);
  assert.ok(evalResult.limitations.some((lim) => lim.includes('Circular reporting notice')));
});

/* ==========================================================================
   3. VERDICT GENERATION ENGINE TESTS
   ========================================================================== */

test('VerdictGenerationEngine - enforces strict 4 categories and never forces verdict on insufficient evidence', () => {
  const engine = new VerdictGenerationEngine();

  // 1. Insufficient evidence -> UNVERIFIED (Never forced)
  const insufficientEval = {
    hasSufficientEvidence: false,
    supporting: [],
    contradicting: [],
    sourceIndependence: { uniqueIndependentCount: 0 },
    limitations: ['No independent evidence available to evaluate.'],
  };
  const unverifiedVerdict = engine.generateVerdict(insufficientEval);
  assert.equal(unverifiedVerdict.verdict, VERDICTS.UNVERIFIED);
  assert.match(unverifiedVerdict.shortExplanation, /insufficient/i);
  assert.ok(unverifiedVerdict.recommendedNextSteps.length > 0);

  // 2. Reliable supporting evidence -> SUPPORTED
  const supportedEval = {
    hasSufficientEvidence: true,
    supporting: [{ publisher: 'NASA', isPrimary: true, tier: { tier: 1 } }],
    contradicting: [],
    sourceIndependence: { uniqueIndependentCount: 1 },
    missingContext: [],
  };
  const supportedVerdict = engine.generateVerdict(supportedEval);
  assert.equal(supportedVerdict.verdict, VERDICTS.SUPPORTED);
  assert.match(supportedVerdict.shortExplanation, /supports/i);
  assert.equal(supportedVerdict.traceableSources.length, 1);

  // 3. Reliable contradicting evidence -> CONTRADICTED
  const contradictedEval = {
    hasSufficientEvidence: true,
    supporting: [],
    contradicting: [{ publisher: 'ISRO', isPrimary: true, tier: { tier: 1 } }],
    sourceIndependence: { uniqueIndependentCount: 1 },
    missingContext: [],
  };
  const contradictedVerdict = engine.generateVerdict(contradictedEval);
  assert.equal(contradictedVerdict.verdict, VERDICTS.CONTRADICTED);
  assert.match(contradictedVerdict.shortExplanation, /contradicts/i);

  // 4. Significant supporting AND contradicting evidence -> MIXED
  const mixedEval = {
    hasSufficientEvidence: true,
    supporting: [{ publisher: 'Study A' }],
    contradicting: [{ publisher: 'Study B' }],
    conflicts: [{ description: 'Contradictory findings between longitudinal trials.' }],
    sourceIndependence: { uniqueIndependentCount: 2 },
  };
  const mixedVerdict = engine.generateVerdict(mixedEval);
  assert.equal(mixedVerdict.verdict, VERDICTS.MIXED);
  assert.match(mixedVerdict.shortExplanation, /Significant supporting and contradicting evidence/i);
});

/* ==========================================================================
   4. CONFIDENCE ASSESSMENT SERVICE TESTS
   ========================================================================== */

test('ConfidenceAssessmentService - assesses 6 dimensions and explicitly disclaims subjective percentages', () => {
  const service = new ConfidenceAssessmentService();

  const evaluation = {
    hasSufficientEvidence: true,
    supporting: [
      { publisher: 'NASA Earth Observatory', tier: SOURCE_TIERS.TIER_1_PRIMARY_OFFICIAL, isPrimary: true },
      { publisher: 'ISRO Planetary Science', tier: SOURCE_TIERS.TIER_1_PRIMARY_OFFICIAL, isPrimary: true },
    ],
    contradicting: [],
    relevanceScore: 0.9,
    sourceIndependence: { uniqueIndependentCount: 2, isCircularReportingRisk: false },
    temporalAnalysis: { isFresh: true, newestDate: '2023-10-01', oldestDate: '2021-05-01', datesCount: 2 },
  };

  const confidence = service.assessConfidence(evaluation, VERDICTS.SUPPORTED);

  assert.equal(confidence.level, 'HIGH');
  assert.ok(confidence.compositeScore >= 0.75);
  assert.ok(confidence.explanation);

  // Verifying all 6 explicit dimensions
  const dims = confidence.dimensions;
  assert.ok(dims.sourceQuality);
  assert.ok(dims.evidenceRelevance);
  assert.ok(dims.sourceIndependence);
  assert.ok(dims.evidenceConsistency);
  assert.ok(dims.evidenceFreshness);
  assert.ok(dims.informationAvailability);

  // Methodology disclaimer rule: never present subjective AI percentages as statistical probabilities
  assert.match(confidence.methodologyNotice, /does not present subjective AI/i);
});

/* ==========================================================================
   5. REPORT MANAGEMENT, PDF EXPORT, AND SECURE SHARING
   ========================================================================== */

test('ReportManagementService - end-to-end report saving, privacy enforcement, sharing, and PDF download', async () => {
  const agentA = await registerAndLogin(userA);
  const agentB = await registerAndLogin(userB);

  // 1. Submit text verification as User A
  const verifyRes = await agentA
    .post('/api/verify/text')
    .set('Origin', origin)
    .send({ text: 'Water boils at 100 degrees Celsius under standard atmospheric pressure.' });

  assert.equal(verifyRes.status, 200);
  const requestId = verifyRes.body.id;
  assert.ok(requestId);

  // 2. Save report to User A's library
  const saveRes = await agentA
    .post('/api/reports')
    .set('Origin', origin)
    .send({
      requestId,
      title: 'Water Boiling Point Verification',
      notes: 'Verified via IUPAC and NIST thermophysical documentation.',
    });

  assert.equal(saveRes.status, 201);
  const reportId = saveRes.body.id;
  assert.ok(reportId);

  // 3. User A can view private report
  const getRepA = await agentA.get(`/api/reports/${reportId}`);
  assert.equal(getRepA.status, 200);
  assert.equal(getRepA.body.title, 'Water Boiling Point Verification');
  assert.equal(getRepA.body.result.verdict, 'SUPPORTED');
  assert.ok(getRepA.body.result.evidenceSources.length > 0);

  // 4. Privacy Enforcement: User B CANNOT access User A's private report
  const getRepB = await agentB.get(`/api/reports/${reportId}`);
  assert.equal(getRepB.status, 404);

  // 5. Generate secure share link
  const shareRes = await agentA.post(`/api/reports/${reportId}/share`).set('Origin', origin);
  assert.equal(shareRes.status, 200);
  const shareToken = shareRes.body.shareToken;
  assert.ok(shareToken);
  assert.equal(shareRes.body.isPublic, true);

  // 6. Public unauthenticated access to shared report via share token
  const unauthAgent = request(app);
  const publicRep = await unauthAgent.get(`/api/reports/shared/${shareToken}`);
  assert.equal(publicRep.status, 200);
  assert.equal(publicRep.body.title, 'Water Boiling Point Verification');
  assert.equal(publicRep.body.result.verdict, 'SUPPORTED');
  // Does not leak user's private email/password or account info
  assert.equal(publicRep.body.user, undefined);
  assert.equal(publicRep.body.userId, undefined);

  // 7. Clipboard Summary formatting
  const summaryRes = await agentA.get(`/api/reports/${reportId}/summary`);
  assert.equal(summaryRes.status, 200);
  assert.ok(summaryRes.body.plainText.includes('TruthGuard AI Verification Report'));
  assert.ok(summaryRes.body.plainText.includes('Verdict: SUPPORTED'));

  // 8. Download PDF document
  const pdfRes = await agentA.get(`/api/reports/${reportId}/pdf`);
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers['content-type'], 'application/pdf');
  assert.ok(pdfRes.body.length > 500);
  // Verify PDF header magic bytes "%PDF-"
  const pdfHeader = pdfRes.body.slice(0, 5).toString('utf8');
  assert.equal(pdfHeader, '%PDF-');

  // 9. Dispute / Feedback submission for incorrect result
  const disputeRes = await agentA
    .post(`/api/verify/${requestId}/dispute`)
    .set('Origin', origin)
    .send({
      rating: 4,
      comment: 'Results are accurate, but note elevation dependencies.',
      disputedClaim: 'Boiling point',
    });
  assert.equal(disputeRes.status, 201);
  assert.equal(disputeRes.body.status, 'dispute_recorded');

  // 10. Request on-demand deeper explanation
  const explainRes = await agentA.post(`/api/verify/${requestId}/explain`).set('Origin', origin);
  assert.equal(explainRes.status, 200);
  assert.equal(explainRes.body.verdict, 'SUPPORTED');
  assert.ok(explainRes.body.deepDiveContext.length >= 2);

  // 11. Revoke public share link
  const revokeRes = await agentA.delete(`/api/reports/${reportId}/share`).set('Origin', origin);
  assert.equal(revokeRes.status, 200);
  assert.equal(revokeRes.body.isPublic, false);

  // Public access is now revoked (returns 404)
  const revokedPublicRep = await unauthAgent.get(`/api/reports/shared/${shareToken}`);
  assert.equal(revokedPublicRep.status, 404);

  // 12. Delete report
  const deleteRes = await agentA.delete(`/api/reports/${reportId}`).set('Origin', origin);
  assert.equal(deleteRes.status, 200);
  assert.equal(deleteRes.body.deleted, true);

  // Confirm deletion
  const verifyDeleted = await agentA.get(`/api/reports/${reportId}`);
  assert.equal(verifyDeleted.status, 404);
});
