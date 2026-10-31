import { config } from '../../config.js';
import { logger } from '../../logger.js';

/**
 * Curated reference knowledge base containing verified facts and debunked claims
 * in both English and Hindi. This serves as an authoritative baseline when external
 * API keys are not provided, ensuring repeatable verification without simulating external APIs.
 */
const VERIFIED_KNOWLEDGE_BASE = [
  // Solar System / Science
  {
    topics: ['earth', 'flat', 'shape', 'sphere', 'पृथ्वी', 'गोल', 'चपटी'],
    claimPatterns: [/earth is flat/i, /पृथ्वी चपटी है/i, /flat earth/i],
    verdict: 'false',
    summary: 'The Earth is an oblate spheroid. Overwhelming empirical evidence from orbital satellite photography, geodesy, and centuries of navigation confirms its spherical shape.',
    sources: [
      {
        title: 'NASA Earth Observatory: Planetary Geodesy',
        url: 'https://earthobservatory.nasa.gov',
        publisher: 'NASA',
        stance: 'contradicts',
        summary: 'Satellite observation and orbital physics confirm Earth is an oblate spheroid.',
        authority: 0.99,
      },
      {
        title: 'नासा: पृथ्वी का आकार और उपग्रह आंकड़े',
        url: 'https://science.nasa.gov',
        publisher: 'नासा (NASA)',
        stance: 'contradicts',
        summary: 'नासा और इसरो के उपग्रह आंकड़े पुष्टि करते हैं कि पृथ्वी गोल है।',
        authority: 0.98,
      },
    ],
  },
  {
    topics: ['vaccine', 'autism', 'टीका', 'ऑटिज्म', 'वैक्सीन'],
    claimPatterns: [/vaccines? cause(s)? autism/i, /टीके से ऑटिज्म होता है/i, /vaccine.*autism/i],
    verdict: 'false',
    summary: 'Extensive worldwide epidemiological studies involving millions of children have found no causal link between MMR vaccines and autism. The original 1998 Wakefield paper was fully retracted for data falsification.',
    sources: [
      {
        title: 'CDC Vaccine Safety Studies',
        url: 'https://www.cdc.gov/vaccinesafety/concerns/autism.html',
        publisher: 'Centers for Disease Control and Prevention',
        stance: 'contradicts',
        summary: 'Multiple rigorous scientific reviews confirm no link between vaccines and autism.',
        authority: 0.98,
      },
      {
        title: 'विश्व स्वास्थ्य संगठन: टीका सुरक्षा समीक्षा',
        url: 'https://www.who.int',
        publisher: 'WHO / विश्व स्वास्थ्य संगठन',
        stance: 'contradicts',
        summary: 'वैज्ञानिक अध्ययनों में टीकों और ऑटिज्म के बीच कोई संबंध नहीं पाया गया।',
        authority: 0.97,
      },
    ],
  },
  {
    topics: ['moon', 'landing', 'apollo', 'अपोलो', 'चांद', 'चंद्रमा'],
    claimPatterns: [/moon landing was faked/i, /apollo 11 hoax/i, /चांद पर कभी कोई नहीं गया/i, /अपोलो मून लैंडिंग झूठी/i],
    verdict: 'false',
    summary: 'Six Apollo missions landed twelve astronauts on the Moon between 1969 and 1972. Corroborating evidence includes retroreflectors still used by international observatories, 382 kg of lunar samples verified globally, and high-resolution tracking by modern international orbiters (LRO, Chandrayaan-2).',
    sources: [
      {
        title: 'Apollo Lunar Surface Journal & Artifacts',
        url: 'https://www.nasa.gov/mission_pages/apollo',
        publisher: 'NASA History Division',
        stance: 'contradicts',
        summary: 'Photographic, telemetry, lunar sample, and independent Soviet tracking corroborate lunar landings.',
        authority: 0.98,
      },
      {
        title: 'इसरो चंद्रयान-2: अपोलो लैंडिंग साइट्स की तस्वीरें',
        url: 'https://www.isro.gov.in',
        publisher: 'ISRO (इसरो)',
        stance: 'contradicts',
        summary: 'ऑर्बिटर उच्च-रिज़ॉल्यूशन कैमरों ने चंद्रमा पर अपोलो 11 और 12 के मॉड्यूल ट्रैक दर्ज किए हैं।',
        authority: 0.97,
      },
    ],
  },
  {
    topics: ['water', 'boiling', 'temperature', 'पानी', 'उबलना'],
    claimPatterns: [/water boils at 100/i, /पानी 100 डिग्री पर उबलता है/i],
    verdict: 'true',
    summary: 'At standard atmospheric pressure (1 atm / 101.3 kPa), pure water boils at 100 degrees Celsius (212 degrees Fahrenheit).',
    sources: [
      {
        title: 'NIST Chemistry WebBook: Thermophysical Properties of Water',
        url: 'https://webbook.nist.gov',
        publisher: 'National Institute of Standards and Technology',
        stance: 'supports',
        summary: 'Standard thermodynamic properties establish 100°C as boiling point at 1 atm.',
        authority: 0.99,
      },
    ],
  },
  {
    topics: ['sun', 'center', 'solar system', 'सूरज', 'सूर्य', 'सौर मंडल'],
    claimPatterns: [/earth revolves around the sun/i, /heliocentric/i, /पृथ्वी सूर्य के चारों ओर घूमती है/i],
    verdict: 'true',
    summary: 'In the solar system, Earth and other planets orbit the Sun in elliptical trajectories governed by gravitational physics.',
    sources: [
      {
        title: 'NASA Solar System Dynamics',
        url: 'https://ssd.jpl.nasa.gov',
        publisher: 'NASA JPL',
        stance: 'supports',
        summary: 'Planetary ephemerides confirm heliocentric orbital mechanics.',
        authority: 0.99,
      },
    ],
  },
];

export class EvidenceRetrievalService {
  constructor() {
    this.googleApiKey = config.GOOGLE_FACTCHECK_API_KEY || '';
    this.externalApiKey = config.EXTERNAL_SEARCH_API_KEY || '';
  }

  /**
   * Main evidence search entry point.
   * Checks external APIs if configured, otherwise uses authoritative baseline
   * knowledge and clearly labels external integration status.
   *
   * @param {string} claimText
   * @param {Object} [options]
   * @param {string} [options.language='en']
   * @returns {Promise<{
   *   sources: Array<{url: string, title: string, publisher: string, stance: 'supports'|'contradicts'|'neutral', quote?: string, authority: number}>,
   *   externalIntegration: { available: boolean, provider: string, reason?: string },
   *   supportingCount: number,
   *   contradictingCount: number,
   *   neutralCount: number
   * }>}
   */
  async retrieveEvidence(claimText, options = {}) {
    const lang = options.language || 'en';
    const cleanClaim = (claimText || '').trim();

    if (!cleanClaim) {
      return {
        sources: [],
        externalIntegration: this._getExternalIntegrationStatus(),
        supportingCount: 0,
        contradictingCount: 0,
        neutralCount: 0,
      };
    }

    // Try external Google Fact Check Tools API if key provided
    if (this.googleApiKey) {
      try {
        const externalResult = await this._queryGoogleFactCheck(cleanClaim, lang);
        if (externalResult && externalResult.sources.length > 0) {
          return externalResult;
        }
      } catch (err) {
        logger.warn({ err: err.message, claim: cleanClaim }, 'Google Fact Check Tools query failed, falling back to local registry');
      }
    }

    // Match against local verified knowledge base
    const matchedSources = this._matchKnowledgeBase(cleanClaim, lang);

    const supportingCount = matchedSources.filter((s) => s.stance === 'supports').length;
    const contradictingCount = matchedSources.filter((s) => s.stance === 'contradicts').length;
    const neutralCount = matchedSources.filter((s) => s.stance === 'neutral').length;

    return {
      sources: matchedSources,
      externalIntegration: this._getExternalIntegrationStatus(),
      supportingCount,
      contradictingCount,
      neutralCount,
    };
  }

  /**
   * Reports the real configuration status of external integrations.
   * Never fabricates results for unavailable third-party APIs.
   */
  _getExternalIntegrationStatus() {
    if (this.googleApiKey) {
      return {
        available: true,
        provider: 'Google Fact Check Tools API',
      };
    }
    return {
      available: false,
      provider: 'Google Fact Check Tools API',
      reason: 'API key not configured (set GOOGLE_FACTCHECK_API_KEY in backend environment to enable live Google Fact Check querying)',
    };
  }

  /**
   * Queries Google Fact Check Tools API when configured.
   */
  async _queryGoogleFactCheck(claimText, languageCode) {
    const endpoint = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(
      claimText
    )}&languageCode=${encodeURIComponent(languageCode)}&key=${encodeURIComponent(this.googleApiKey)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    try {
      const resp = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) {
        throw new Error(`FactCheck API HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const sources = [];

      for (const item of data.claims || []) {
        for (const review of item.claimReview || []) {
          const textualRating = (review.textualRating || '').toLowerCase();
          let stance = 'neutral';
          if (/false|incorrect|fake|hoax|misleading|disproven|गलत|झूठ/i.test(textualRating)) {
            stance = 'contradicts';
          } else if (/true|correct|accurate|verified|सत्य|सही/i.test(textualRating)) {
            stance = 'supports';
          }

          sources.push({
            url: review.url || '',
            title: review.title || item.text || 'Fact Check Review',
            publisher: review.publisher?.name || 'Fact Checker',
            stance,
            quote: review.textualRating ? `Rating: ${review.textualRating}` : undefined,
            authority: 0.9,
          });
        }
      }

      const supportingCount = sources.filter((s) => s.stance === 'supports').length;
      const contradictingCount = sources.filter((s) => s.stance === 'contradicts').length;
      const neutralCount = sources.filter((s) => s.stance === 'neutral').length;

      return {
        sources,
        externalIntegration: { available: true, provider: 'Google Fact Check Tools API' },
        supportingCount,
        contradictingCount,
        neutralCount,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Matches claim against curated knowledge base.
   */
  _matchKnowledgeBase(claimText, lang) {
    const textLower = claimText.toLowerCase();
    const results = [];

    for (const entry of VERIFIED_KNOWLEDGE_BASE) {
      let matched = false;
      for (const pattern of entry.claimPatterns) {
        if (pattern.test(claimText)) {
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Keyword overlap check
        const hitCount = entry.topics.filter((topic) => textLower.includes(topic.toLowerCase())).length;
        if (hitCount >= 2) {
          matched = true;
        }
      }

      if (matched) {
        for (const source of entry.sources) {
          results.push({ ...source });
        }
      }
    }

    return results;
  }

  /**
   * Compares multiple sources to analyze consensus or dispute.
   *
   * @param {Array<Object>} sources
   * @returns {{
   *   consensus: 'supports' | 'contradicts' | 'mixed' | 'insufficient_evidence',
   *   supportRatio: number,
   *   topSupporting: Array<Object>,
   *   topContradicting: Array<Object>,
   *   summary: string
   * }}
   */
  compareSources(sources = []) {
    if (!sources || sources.length === 0) {
      return {
        consensus: 'insufficient_evidence',
        supportRatio: 0,
        topSupporting: [],
        topContradicting: [],
        summary: 'No independent evidence sources could be retrieved to corroborate or refute this claim.',
      };
    }

    const supporting = sources.filter((s) => s.stance === 'supports');
    const contradicting = sources.filter((s) => s.stance === 'contradicts');
    const total = supporting.length + contradicting.length;

    let consensus = 'mixed';
    let supportRatio = 0.5;

    if (total === 0) {
      consensus = 'insufficient_evidence';
      supportRatio = 0;
    } else if (contradicting.length > 0 && supporting.length === 0) {
      consensus = 'contradicts';
      supportRatio = 0.0;
    } else if (supporting.length > 0 && contradicting.length === 0) {
      consensus = 'supports';
      supportRatio = 1.0;
    } else {
      supportRatio = supporting.length / total;
      if (supportRatio >= 0.75) {
        consensus = 'supports';
      } else if (supportRatio <= 0.25) {
        consensus = 'contradicts';
      } else {
        consensus = 'mixed';
      }
    }

    return {
      consensus,
      supportRatio: Math.round(supportRatio * 100) / 100,
      topSupporting: supporting.slice(0, 5),
      topContradicting: contradicting.slice(0, 5),
      summary:
        consensus === 'supports'
          ? `Authoritative sources consistently corroborate this claim (${supporting.length} supporting, 0 contradicting).`
          : consensus === 'contradicts'
          ? `Authoritative sources refute this claim (${contradicting.length} contradicting, 0 supporting).`
          : consensus === 'mixed'
          ? `Disputed claim: sources provide conflicting evidence (${supporting.length} supporting, ${contradicting.length} contradicting).`
          : 'Insufficient independent evidence available.',
    };
  }
}

