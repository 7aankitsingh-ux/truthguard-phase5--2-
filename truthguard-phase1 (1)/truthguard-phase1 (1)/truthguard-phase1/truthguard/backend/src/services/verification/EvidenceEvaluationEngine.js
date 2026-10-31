const CROSS_LINGUAL_SYNONYMS = {
  'पृथ्वी': ['earth', 'globe', 'planet', 'spheroid'],
  'चपटी': ['flat', 'disc'],
  'सूर्य': ['sun', 'solar', 'heliocentric'],
  'सूरज': ['sun', 'solar', 'heliocentric'],
  'चांद': ['moon', 'lunar', 'apollo'],
  'चंद्रमा': ['moon', 'lunar', 'apollo'],
  'टीका': ['vaccine', 'vaccination', 'immunization'],
  'वैक्सीन': ['vaccine', 'vaccination', 'immunization'],
  'ऑटिज्म': ['autism', 'autistic'],
  'पानी': ['water', 'boil', 'celsius'],
  'उबलना': ['boil', 'boiling', 'temperature'],
  'तापमान': ['temperature', 'celsius'],
  'earth': ['पृथ्वी', 'संसार'],
  'flat': ['चपटी', 'सपाट'],
  'sun': ['सूर्य', 'सूरज'],
  'moon': ['चांद', 'चंद्रमा'],
  'vaccine': ['टीका', 'वैक्सीन'],
  'water': ['पानी', 'जल'],
  'boil': ['उबलना'],
};

/**
 * Central intelligence engine that evaluates collected evidence for a claim,
 * analyzing relevance, independence, temporal freshness, and conflicts.
 * Kept strictly independent from verdict generation.
 */
export class EvidenceEvaluationEngine {
  /**
   * Evaluates evidence items for a given claim.
   *
   * @param {string} claimText
   * @param {Array<Object>} sources
   * @param {Object} [options]
   * @param {string[]} [options.missingContextNotes=[]]
   * @returns {Object}
   */
  evaluateClaimEvidence(claimText, sources = [], options = {}) {
    const cleanClaim = (claimText || '').trim();
    const missingContextNotes = [...(options.missingContextNotes || [])];

    if (!cleanClaim || !sources || sources.length === 0) {
      return {
        claimText: cleanClaim,
        supporting: [],
        contradicting: [],
        neutral: [],
        relevanceScore: 0,
        sourceIndependence: {
          totalSources: 0,
          uniqueIndependentCount: 0,
          syndicatedCount: 0,
          isCircularReportingRisk: false,
        },
        temporalAnalysis: {
          newestDate: null,
          oldestDate: null,
          isFresh: false,
        },
        conflicts: [],
        missingContext: missingContextNotes,
        limitations: ['No independent evidence available to evaluate.'],
        hasSufficientEvidence: false,
      };
    }

    // 1. Partition evidence by stance
    const supporting = [];
    const contradicting = [];
    const neutral = [];

    for (const src of sources) {
      if (src.stance === 'supports') supporting.push(src);
      else if (src.stance === 'contradicts') contradicting.push(src);
      else neutral.push(src);
    }

    // 2. Evaluate Topical Relevance
    const relevance = this._evaluateRelevance(cleanClaim, sources);

    // 3. Examine Source Independence (Circular Reporting / Syndication)
    const independence = this._examineSourceIndependence(sources);

    // 4. Temporal Analysis (Publication dates and freshness)
    const temporal = this._analyzePublicationDates(sources);

    // 5. Identify Conflicting Information
    const conflicts = this._identifyConflicts(supporting, contradicting);

    // 6. Record Limitations
    const limitations = this._recordLimitations(sources, independence, temporal);

    // Sufficiency check: requires at least one independent source with sufficient relevance
    const hasSufficientEvidence =
      independence.uniqueIndependentCount >= 1 &&
      (relevance.maxScore >= 0.35 || relevance.averageScore >= 0.25);

    return {
      claimText: cleanClaim,
      supporting,
      contradicting,
      neutral,
      relevanceScore: relevance.averageScore,
      relevanceDetails: relevance,
      sourceIndependence: independence,
      temporalAnalysis: temporal,
      conflicts,
      missingContext: missingContextNotes,
      limitations,
      hasSufficientEvidence,
    };
  }

  _evaluateRelevance(claimText, sources) {
    const claimWords = new Set(
      claimText
        .toLowerCase()
        .replace(/[^a-z0-9\u0900-\u097F\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

    // Expand search terms with cross-lingual synonyms and morphological stems
    const expandedWords = new Set(claimWords);
    for (const w of claimWords) {
      if (w.endsWith('s') && w.length > 3) {
        expandedWords.add(w.slice(0, -1));
      }
      if (w.endsWith('es') && w.length > 4) {
        expandedWords.add(w.slice(0, -2));
      }
      if (w.endsWith('ing') && w.length > 5) {
        expandedWords.add(w.slice(0, -3));
      }
      if (CROSS_LINGUAL_SYNONYMS[w]) {
        for (const syn of CROSS_LINGUAL_SYNONYMS[w]) {
          expandedWords.add(syn.toLowerCase());
        }
      }
    }

    let totalScore = 0;
    let maxScore = 0;
    const scores = [];

    for (const src of sources) {
      const srcText = `${src.title || ''} ${src.summary || ''} ${src.publisher || ''}`.toLowerCase();
      let matchCount = 0;
      for (const word of expandedWords) {
        if (srcText.includes(word)) matchCount++;
      }
      const score = expandedWords.size > 0 ? Math.min(1, matchCount / Math.max(expandedWords.size * 0.35, 1)) : 0.5;
      const rounded = Math.round(score * 100) / 100;
      if (rounded > maxScore) maxScore = rounded;
      scores.push({ url: src.url, score: rounded });
      totalScore += rounded;
    }

    const averageScore = sources.length > 0 ? Math.round((totalScore / sources.length) * 100) / 100 : 0;

    return {
      averageScore,
      maxScore,
      evaluatedSourcesCount: sources.length,
      individualScores: scores,
    };
  }

  _examineSourceIndependence(sources) {
    const publishers = new Set();
    let uniqueIndependentCount = 0;
    let syndicatedCount = 0;
    const syndicationNotices = [];

    for (const src of sources) {
      if (src.isSyndicated) {
        syndicatedCount++;
        syndicationNotices.push(src.syndicationNotice || `Syndicated content from ${src.publisher}`);
      } else {
        if (src.publisher && !publishers.has(src.publisher.toLowerCase())) {
          publishers.add(src.publisher.toLowerCase());
          uniqueIndependentCount++;
        }
      }
    }

    const isCircularReportingRisk = syndicatedCount > 0 && uniqueIndependentCount <= 1;

    return {
      totalSources: sources.length,
      uniqueIndependentCount,
      syndicatedCount,
      publishers: Array.from(publishers),
      isCircularReportingRisk,
      syndicationNotices,
    };
  }

  _analyzePublicationDates(sources) {
    const dates = sources
      .map((s) => s.publishedDate)
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()));

    if (dates.length === 0) {
      return {
        newestDate: null,
        oldestDate: null,
        datesCount: 0,
        isFresh: false,
        summary: 'Publication dates could not be extracted from available source headers.',
      };
    }

    dates.sort((a, b) => b - a);
    const newestDate = dates[0].toISOString().split('T')[0];
    const oldestDate = dates[dates.length - 1].toISOString().split('T')[0];

    // Consider fresh if newest is within the last 3 years
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000);
    const isFresh = dates[0] >= threeYearsAgo;

    return {
      newestDate,
      oldestDate,
      datesCount: dates.length,
      isFresh,
      summary: `Evidence spans from ${oldestDate} to ${newestDate}.`,
    };
  }

  _identifyConflicts(supporting, contradicting) {
    const conflicts = [];
    if (supporting.length > 0 && contradicting.length > 0) {
      conflicts.push({
        conflictType: 'direct_contradiction',
        description: `Direct factual contradiction between ${supporting.length} supporting source(s) and ${contradicting.length} contradicting source(s).`,
        supportingPublishers: supporting.map((s) => s.publisher).filter(Boolean),
        contradictingPublishers: contradicting.map((s) => s.publisher).filter(Boolean),
      });
    }
    return conflicts;
  }

  _recordLimitations(sources, independence, temporal) {
    const limitations = [];

    if (independence.isCircularReportingRisk) {
      limitations.push(
        'Circular reporting notice: Multiple reporting outlets trace back to a single shared wire service. Independent corroboration is limited to 1 primary source.'
      );
    }

    const hasTier1 = sources.some((s) => s.tier?.tier === 1);
    const hasTier2 = sources.some((s) => s.tier?.tier === 2);
    if (!hasTier1 && !hasTier2 && sources.length > 0) {
      limitations.push(
        'Available evidence relies primarily on secondary news reports without direct peer-reviewed or statutory gazette citations.'
      );
    }

    if (temporal.datesCount === 0) {
      limitations.push('Specific publication timestamps were omitted in metadata headers of inspected sources.');
    }

    limitations.push('Verification is bounded by indexed public records and does not cover sealed, non-public proceedings.');

    return limitations;
  }
}

