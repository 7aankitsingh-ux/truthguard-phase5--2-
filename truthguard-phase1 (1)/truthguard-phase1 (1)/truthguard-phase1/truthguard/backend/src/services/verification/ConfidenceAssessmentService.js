export const CONFIDENCE_LEVELS = {
  HIGH: {
    tier: 'HIGH',
    label: 'High Evidence Confidence',
    color: '#027a48',
    description: 'Evidence is drawn from multiple independent Tier-1/Tier-2 primary or accredited institutional records with consistent agreement.',
  },
  MODERATE: {
    tier: 'MODERATE',
    label: 'Moderate Evidence Confidence',
    color: '#b54708',
    description: 'Evidence relies on secondary accredited reporting or limited independent sources, but maintains coherent factual consistency.',
  },
  LOW: {
    tier: 'LOW',
    label: 'Low Evidence Confidence',
    color: '#d92d20',
    description: 'Evidence exhibits high variance, potential circular reporting, lack of primary documentation, or unresolved discrepancies.',
  },
  INSUFFICIENT: {
    tier: 'INSUFFICIENT',
    label: 'Insufficient Evidence Basis',
    color: '#475467',
    description: 'Available evidentiary material is inadequate to form a reliable factual assessment.',
  },
};

/**
 * Multi-dimensional evidence-based confidence assessment service.
 * Enforces the strict rule: NEVER present subjective AI percentages as
 * statistically validated probabilities.
 */
export class ConfidenceAssessmentService {
  /**
   * Assesses confidence based on evaluated evidence and verdict.
   *
   * @param {Object} evaluation - Output from EvidenceEvaluationEngine
   * @param {string} verdict - 'SUPPORTED' | 'CONTRADICTED' | 'UNVERIFIED' | 'MIXED'
   * @returns {{
   *   level: 'HIGH' | 'MODERATE' | 'LOW' | 'INSUFFICIENT',
   *   label: string,
   *   explanation: string,
   *   dimensions: {
   *     sourceQuality: { score: number, rating: string, notes: string },
   *     evidenceRelevance: { score: number, rating: string, notes: string },
   *     sourceIndependence: { score: number, rating: string, notes: string },
   *     evidenceConsistency: { score: number, rating: string, notes: string },
   *     evidenceFreshness: { score: number, rating: string, notes: string },
   *     informationAvailability: { score: number, rating: string, notes: string }
   *   },
   *   methodologyNotice: string
   * }}
   */
  assessConfidence(evaluation, verdict) {
    if (verdict === 'UNVERIFIED' || !evaluation.hasSufficientEvidence) {
      return this._buildInsufficientAssessment();
    }

    const {
      supporting = [],
      contradicting = [],
      relevanceScore = 0,
      sourceIndependence = {},
      temporalAnalysis = {},
    } = evaluation;

    const allSources = [...supporting, ...contradicting];

    // 1. Source Quality: Evaluated from Source Tiers
    const sq = this._assessSourceQuality(allSources);

    // 2. Evidence Relevance: Direct topical correlation to claim
    const er = this._assessEvidenceRelevance(relevanceScore);

    // 3. Source Independence: De-duplicating wire services / circular reporting
    const si = this._assessSourceIndependence(sourceIndependence);

    // 4. Evidence Consistency: Consensus vs conflict
    const ec = this._assessEvidenceConsistency(supporting.length, contradicting.length, verdict);

    // 5. Evidence Freshness: Temporal proximity of source publication dates
    const ef = this._assessEvidenceFreshness(temporalAnalysis);

    // 6. Information Availability: Depth of evidentiary corpus
    const ia = this._assessInformationAvailability(allSources.length);

    // Aggregate weighted score across all 6 dimensions
    const compositeScore =
      sq.score * 0.25 +
      er.score * 0.20 +
      si.score * 0.20 +
      ec.score * 0.15 +
      ef.score * 0.10 +
      ia.score * 0.10;

    let levelInfo = CONFIDENCE_LEVELS.LOW;
    if (compositeScore >= 0.75) {
      levelInfo = CONFIDENCE_LEVELS.HIGH;
    } else if (compositeScore >= 0.50) {
      levelInfo = CONFIDENCE_LEVELS.MODERATE;
    }

    return {
      level: levelInfo.tier,
      label: levelInfo.label,
      compositeScore: Math.round(compositeScore * 100) / 100,
      explanation: levelInfo.description,
      dimensions: {
        sourceQuality: sq,
        evidenceRelevance: er,
        sourceIndependence: si,
        evidenceConsistency: ec,
        evidenceFreshness: ef,
        informationAvailability: ia,
      },
      methodologyNotice:
        'Confidence is derived from verifiable documentary provenance, source independence, and consensus consistency. TruthGuard does not present subjective AI tokens as mathematical probabilities.',
    };
  }

  _assessSourceQuality(sources) {
    if (!sources || sources.length === 0) {
      return { score: 0.1, rating: 'Very Low', notes: 'No verified sources available.' };
    }
    const hasTier1 = sources.some((s) => s.tier?.tier === 1);
    const hasTier2 = sources.some((s) => s.tier?.tier === 2);
    const hasTier3 = sources.some((s) => s.tier?.tier === 3);

    if (hasTier1) {
      return { score: 0.95, rating: 'Exceptional', notes: 'Includes Tier-1 primary government or international statutory records.' };
    }
    if (hasTier2) {
      return { score: 0.88, rating: 'High', notes: 'Includes Tier-2 peer-reviewed academic literature or clinical studies.' };
    }
    if (hasTier3) {
      return { score: 0.78, rating: 'Strong', notes: 'Drawn from Tier-3 accredited international news organizations and fact-checkers.' };
    }
    return { score: 0.50, rating: 'Moderate', notes: 'Relies on Tier-4 secondary media publications without primary institutional documentation.' };
  }

  _assessEvidenceRelevance(relevanceScore) {
    if (relevanceScore >= 0.7) {
      return { score: 0.90, rating: 'Direct', notes: 'Direct and specific evidentiary match addressing the exact core assertion.' };
    }
    if (relevanceScore >= 0.45) {
      return { score: 0.75, rating: 'Substantial', notes: 'Substantial topical correlation to entities and predicates in claim.' };
    }
    return { score: 0.45, rating: 'Partial', notes: 'Indirect or contextual evidence requiring associative deduction.' };
  }

  _assessSourceIndependence(independence) {
    const { uniqueIndependentCount = 0, isCircularReportingRisk } = independence;
    if (isCircularReportingRisk) {
      return {
        score: 0.45,
        rating: 'Low Independence',
        notes: 'Circular reporting detected: multiple outlets repeat a single wire dispatch without separate investigation.',
      };
    }
    if (uniqueIndependentCount >= 3) {
      return { score: 0.95, rating: 'High Independence', notes: 'Corroborated across 3 or more independent editorial organizations.' };
    }
    if (uniqueIndependentCount === 2) {
      return { score: 0.75, rating: 'Moderate Independence', notes: 'Corroborated across 2 separate independent publishing bodies.' };
    }
    return { score: 0.55, rating: 'Single Source', notes: 'Evidence traces back to a single primary reporting source.' };
  }

  _assessEvidenceConsistency(supCount, conCount, verdict) {
    if (verdict === 'MIXED') {
      return { score: 0.50, rating: 'Divergent', notes: 'Significant contradiction exists between credible sources.' };
    }
    if ((supCount > 0 && conCount === 0) || (conCount > 0 && supCount === 0)) {
      return { score: 0.95, rating: 'Unanimous', notes: 'Consensus is unanimous across all evaluated documentation.' };
    }
    return { score: 0.60, rating: 'Predominant', notes: 'Clear majority consensus with minor isolated discrepancies.' };
  }

  _assessEvidenceFreshness(temporal) {
    if (temporal.isFresh) {
      return { score: 0.90, rating: 'Current', notes: `Evidence is fresh (published ${temporal.newestDate || 'recently'}).` };
    }
    if (temporal.datesCount > 0) {
      return { score: 0.75, rating: 'Historical / Established', notes: `Established historical consensus (${temporal.oldestDate} to ${temporal.newestDate}).` };
    }
    return { score: 0.50, rating: 'Unspecified', notes: 'Publication dates could not be verified from source headers.' };
  }

  _assessInformationAvailability(totalCount) {
    if (totalCount >= 3) {
      return { score: 0.90, rating: 'Robust', notes: `${totalCount} verified documents available in evidentiary corpus.` };
    }
    if (totalCount >= 1) {
      return { score: 0.70, rating: 'Adequate', notes: `${totalCount} verified document(s) available in evidentiary corpus.` };
    }
    return { score: 0.20, rating: 'Sparse', notes: 'Limited documentation available.' };
  }

  _buildInsufficientAssessment() {
    const info = CONFIDENCE_LEVELS.INSUFFICIENT;
    return {
      level: info.tier,
      label: info.label,
      compositeScore: 0.15,
      explanation: info.description,
      dimensions: {
        sourceQuality: { score: 0.1, rating: 'Insufficient', notes: 'No verified sources.' },
        evidenceRelevance: { score: 0.1, rating: 'Insufficient', notes: 'No matching evidence found.' },
        sourceIndependence: { score: 0.1, rating: 'Insufficient', notes: 'Zero independent confirmations.' },
        evidenceConsistency: { score: 0.1, rating: 'Uncertain', notes: 'Unable to evaluate consistency without corroboration.' },
        evidenceFreshness: { score: 0.1, rating: 'Unknown', notes: 'No dates available.' },
        informationAvailability: { score: 0.1, rating: 'None', notes: 'Zero public documents indexed.' },
      },
      methodologyNotice:
        'Confidence is derived from verifiable documentary provenance, source independence, and consensus consistency. TruthGuard does not present subjective AI tokens as mathematical probabilities.',
    };
  }
}

