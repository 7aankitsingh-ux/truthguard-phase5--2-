import { EvidenceRetrievalEngine } from './EvidenceRetrievalEngine.js';
import { EvidenceEvaluationEngine } from './EvidenceEvaluationEngine.js';
import { VerdictGenerationEngine, VERDICTS } from './VerdictGenerationEngine.js';
import { ConfidenceAssessmentService } from './ConfidenceAssessmentService.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

export class TextVerificationService {
  constructor(options = {}) {
    this.retrievalEngine = options.retrievalEngine || new EvidenceRetrievalEngine();
    this.evaluationEngine = options.evaluationEngine || new EvidenceEvaluationEngine();
    this.verdictEngine = options.verdictEngine || new VerdictGenerationEngine();
    this.confidenceService = options.confidenceService || new ConfidenceAssessmentService();
    this.externalAiApiKey = config.EXTERNAL_AI_DETECTOR_API_KEY || '';
  }

  /**
   * Detects whether text is primarily English, Hindi, or mixed.
   *
   * @param {string} text
   * @returns {'hi' | 'en'}
   */
  detectLanguage(text = '') {
    if (!text) return 'en';
    const devanagariMatches = text.match(/[\u0900-\u097F]/g);
    const devanagariCount = devanagariMatches ? devanagariMatches.length : 0;
    const totalChars = text.replace(/\s+/g, '').length;

    if (totalChars > 0 && devanagariCount / totalChars > 0.15) {
      return 'hi';
    }
    return 'en';
  }

  /**
   * Extracts testable factual claims from short or long paragraph input.
   * Filters out subjective opinions, rhetorical questions, and greetings.
   */
  extractClaims(text = '', lang = 'en') {
    if (!text || typeof text !== 'string') return [];

    const normalized = text.normalize('NFC').trim();
    if (!normalized) return [];

    const rawSentences = normalized
      .split(/(?<=[.!?।\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    const claims = [];

    for (const raw of rawSentences) {
      const sentence = raw.replace(/\n+/g, ' ').trim();
      if (!sentence) continue;

      const factuality = this._evaluateFactuality(sentence, lang);
      if (factuality.score >= 0.35) {
        claims.push({
          claimText: sentence,
          isFactual: factuality.isFactual,
          verifiabilityScore: factuality.score,
          category: factuality.category,
          entities: factuality.entities,
        });
      }
    }

    if (claims.length === 0 && normalized.length > 0) {
      const factuality = this._evaluateFactuality(normalized, lang);
      claims.push({
        claimText: normalized,
        isFactual: factuality.isFactual,
        verifiabilityScore: factuality.score,
        category: factuality.category,
        entities: factuality.entities,
      });
    }

    return claims;
  }

  _evaluateFactuality(sentence, lang) {
    const s = sentence.trim();
    const sLower = s.toLowerCase();

    // Greetings and conversational filler
    const greetingsEn = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'welcome', 'bye', 'goodbye', 'thanks', 'thank you'];
    const greetingsHi = ['नमस्ते', 'नमस्कार', 'प्रणाम', 'स्वागत', 'अलविदा', 'धन्यवाद', 'शुक्रिया'];
    const greetings = lang === 'hi' ? greetingsHi : greetingsEn;
    const isGreeting = greetings.some((g) => sLower.startsWith(g) || sLower.replace(/[!.,।]/g, '').trim() === g);
    if (isGreeting) {
      return { isFactual: false, score: 0.1, category: 'conversational', entities: [] };
    }

    const opinionMarkersEn = [
      'i think', 'in my opinion', 'i feel', 'i believe', 'personally', 'maybe', 'perhaps',
      'i prefer', 'seems to me', 'i hope', 'what if', 'how about',
    ];
    const opinionMarkersHi = [
      'मुझे लगता है', 'मेरे विचार से', 'मेरी राय में', 'शायद', 'हो सकता है', 'मुझे पसंद है',
    ];

    const markers = lang === 'hi' ? opinionMarkersHi : opinionMarkersEn;
    const isOpinion = markers.some((m) => sLower.includes(m.toLowerCase()));

    const isQuestion = s.endsWith('?') || s.startsWith('what ') || s.startsWith('why ') || s.startsWith('how ') || sLower.includes('क्या ');

    const hasNumbers = /\d+/.test(s);
    const hasDateOrYear = /\b(19\d\d|20\d\d|january|february|march|april|may|june|july|august|september|october|november|december|ईस्वी|वर्ष|साल)\b/i.test(s);
    const hasScienceTerms = /\b(boil|celsius|degree|planet|earth|sun|nasa|isro|cdc|who|study|research|vaccine|dna|temperature|water|oxygen|gravity|वैज्ञानिक|शोध|अध्ययन|तापमान|पृथ्वी|सूर्य|चांद|नासा|इसरो)\b/i.test(s);
    const hasAssertionEn = /\b(is|are|was|were|has|have|caused|causes|proven|found|confirmed|announced|discovered|launched|walked|built|destroyed)\b/i.test(s);
    const hasAssertionHi = /(है|हैं|था|थे|किया गया|पाया गया|घोषित|दावा|साबित|हुआ)/.test(s);

    let score = 0.2;
    if (hasNumbers) score += 0.2;
    if (hasDateOrYear) score += 0.25;
    if (hasScienceTerms) score += 0.25;
    if (hasAssertionEn || hasAssertionHi) score += 0.25;
    if (isOpinion) score -= 0.35;
    if (isQuestion) score -= 0.3;

    score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));

    const entities = [];
    const numberMatches = s.match(/\b\d+(\.\d+)?\b/g);
    if (numberMatches) entities.push(...numberMatches.slice(0, 3));
    const properNouns = s.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (properNouns) entities.push(...properNouns.slice(0, 3));

    let category = 'general';
    if (hasScienceTerms) category = 'science_health';
    else if (hasDateOrYear) category = 'historical';
    else if (hasNumbers) category = 'statistical';

    return {
      isFactual: score >= 0.45,
      score,
      category,
      entities: Array.from(new Set(entities)),
    };
  }

  /**
   * Analyzes text for AI-generated characteristics using statistical heuristics.
   * STRICT SEPARATION: AI-detection scores never independently determine factual accuracy.
   */
  analyzeAiGeneratedContent(text = '') {
    if (!text || text.trim().length < 20) {
      return {
        score: 0,
        isLikelyAiGenerated: false,
        confidence: 0,
        indicators: ['Text too short for reliable statistical AI pattern analysis (minimum 20 characters required)'],
        externalIntegration: this._getExternalAiStatus(),
        disclaimer: 'AI-detection scores must never independently determine factual accuracy.',
      };
    }

    const words = text
      .trim()
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, ''))
      .filter((w) => w.length > 0);

    const totalWords = words.length;
    if (totalWords < 5) {
      return {
        score: 0,
        isLikelyAiGenerated: false,
        confidence: 0,
        indicators: ['Insufficient word count for statistical analysis'],
        externalIntegration: this._getExternalAiStatus(),
        disclaimer: 'AI-detection scores must never independently determine factual accuracy.',
      };
    }

    const uniqueWords = new Set(words);
    const ttr = uniqueWords.size / totalWords;

    const sentences = text
      .split(/[.!?।\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const sentenceLengths = sentences.map((s) => s.split(/\s+/).length);

    let variance = 0;
    let avgLen = totalWords;
    if (sentenceLengths.length > 1) {
      avgLen = totalWords / sentenceLengths.length;
      variance = sentenceLengths.reduce((acc, len) => acc + Math.pow(len - avgLen, 2), 0) / sentenceLengths.length;
    }

    const aiFormulaicPhrases = [
      'furthermore', 'moreover', 'in conclusion', 'it is important to note',
      'it is worth noting', 'delve', 'testament to', 'beacon of', 'pivotal role',
      'comprehensive guide', 'crucial aspect', 'in summary',
      'महत्वपूर्ण बात यह है', 'निष्कर्ष के रूप में', 'ध्यान देने योग्य'
    ];
    const textLower = text.toLowerCase();
    const formulaicHits = aiFormulaicPhrases.filter((p) => textLower.includes(p.toLowerCase()));

    const indicators = [];
    let aiScore = 0.2;

    if (sentenceLengths.length >= 3 && variance < 4) {
      aiScore += 0.25;
      indicators.push('Low sentence length variance (uniform burstiness profile characteristic of synthetic text)');
    } else if (variance > 15) {
      aiScore -= 0.15;
      indicators.push('High sentence length variance (bursty rhythm characteristic of human writing)');
    }

    if (ttr < 0.45 && totalWords > 40) {
      aiScore += 0.2;
      indicators.push('Low vocabulary diversity (repetitive token distribution)');
    } else if (ttr > 0.75) {
      indicators.push('High lexical variety (rich vocabulary)');
    }

    if (formulaicHits.length > 0) {
      aiScore += Math.min(0.3, formulaicHits.length * 0.1);
      indicators.push(`Formulaic AI transition markers detected: "${formulaicHits.join('", "')}"`);
    }

    aiScore = Math.max(0.05, Math.min(0.95, Math.round(aiScore * 100) / 100));

    return {
      score: aiScore,
      isLikelyAiGenerated: aiScore >= 0.7,
      confidence: Math.min(0.9, Math.round((totalWords / 100) * 100) / 100),
      metrics: {
        totalWords,
        uniqueWords: uniqueWords.size,
        typeTokenRatio: Math.round(ttr * 100) / 100,
        sentenceCount: sentences.length,
        sentenceLengthVariance: Math.round(variance * 100) / 100,
      },
      indicators,
      externalIntegration: this._getExternalAiStatus(),
      disclaimer: 'AI-detection scores must never independently determine factual accuracy.',
    };
  }

  _getExternalAiStatus() {
    if (this.externalAiApiKey) {
      return { available: true, provider: 'External AI Detection API' };
    }
    return {
      available: false,
      provider: 'External AI Detection API',
      reason: 'External AI detector API key not configured (set EXTERNAL_AI_DETECTOR_API_KEY in environment)',
    };
  }

  /**
   * End-to-end Text and Claim verification pipeline.
   * Integrates Retrieval, Evaluation, Verdict Generation, and Confidence Assessment.
   *
   * @param {string} text
   * @returns {Promise<Object>}
   */
  async verifyText(text = '') {
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('Verification text input is required and cannot be empty');
    }

    const language = this.detectLanguage(text);
    const claims = this.extractClaims(text, language);
    const aiDetection = this.analyzeAiGeneratedContent(text);

    const verifiedClaims = [];
    const allSources = [];
    const collectedMissingContext = [];

    // Step 1 & 2: Retrieve and Evaluate evidence for each factual claim
    for (const claim of claims) {
      if (claim.isFactual) {
        const retrieval = await this.retrievalEngine.retrieveEvidence(claim.claimText, { language });
        const evaluation = this.evaluationEngine.evaluateClaimEvidence(claim.claimText, retrieval.sources, {
          missingContextNotes: retrieval.missingContextNotes,
        });
        const claimVerdict = this.verdictEngine.generateVerdict(evaluation, { language });

        verifiedClaims.push({
          ...claim,
          verdict: claimVerdict.verdict,
          shortExplanation: claimVerdict.shortExplanation,
          detailedReasoning: claimVerdict.detailedReasoning,
          summary: claimVerdict.shortExplanation,
          evidenceSources: retrieval.sources,
          evaluation,
        });

        allSources.push(...retrieval.sources);
        if (retrieval.missingContextNotes?.length) {
          collectedMissingContext.push(...retrieval.missingContextNotes);
        }
      } else {
        verifiedClaims.push({
          ...claim,
          verdict: VERDICTS.UNVERIFIED,
          shortExplanation: language === 'hi' ? 'व्यक्तिगत राय या सामान्य वाक्य।' : 'Subjective opinion or conversational statement.',
          summary: language === 'hi' ? 'व्यक्तिगत राय या सामान्य वाक्य।' : 'Subjective opinion or conversational statement.',
          detailedReasoning: [
            language === 'hi'
              ? 'यह कथन सत्यापन योग्य तथ्यात्मक दावे के बजाय व्यक्तिगत अभिव्यक्ति है।'
              : 'Statement is an expression of opinion or dialogue rather than a verifiable empirical assertion.',
          ],
          evidenceSources: [],
        });
      }
    }

    // Deduplicate sources by URL
    const uniqueSourcesMap = new Map();
    for (const src of allSources) {
      if (src.url && !uniqueSourcesMap.has(src.url)) {
        uniqueSourcesMap.set(src.url, src);
      }
    }
    const uniqueSources = Array.from(uniqueSourcesMap.values());

    // Step 3: Evaluate overall passage evidence
    const overallEvaluation = this.evaluationEngine.evaluateClaimEvidence(text, uniqueSources, {
      missingContextNotes: collectedMissingContext,
    });

    // Step 4: Generate Verdict
    const verdictResult = this.verdictEngine.generateVerdict(overallEvaluation, { language });

    // Step 5: Multi-Dimensional Confidence Assessment
    const confidenceAssessment = this.confidenceService.assessConfidence(overallEvaluation, verdictResult.verdict);

    return {
      verdict: verdictResult.verdict,
      shortExplanation: verdictResult.shortExplanation,
      summary: verdictResult.shortExplanation,
      detailedReasoning: verdictResult.detailedReasoning,
      reasoning: verdictResult.detailedReasoning,
      confidenceAssessment,
      confidence: confidenceAssessment.compositeScore,
      claims: verifiedClaims,
      evidenceSources: uniqueSources,
      sourceIndependence: overallEvaluation.sourceIndependence,
      missingContext: overallEvaluation.missingContext,
      limitations: overallEvaluation.limitations,
      recommendedNextSteps: verdictResult.recommendedNextSteps,
      aiDetection,
      language,
    };
  }
}
