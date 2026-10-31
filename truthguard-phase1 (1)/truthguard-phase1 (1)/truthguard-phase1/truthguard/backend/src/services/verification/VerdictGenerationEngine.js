export const VERDICTS = {
  SUPPORTED: 'SUPPORTED',
  CONTRADICTED: 'CONTRADICTED',
  UNVERIFIED: 'UNVERIFIED',
  MIXED: 'MIXED',
};

/**
 * Generates transparent, traceable verification verdicts from evaluated claim evidence.
 * Enforces the strict rule: NEVER force a verdict when evidence is insufficient.
 */
export class VerdictGenerationEngine {
  /**
   * Generates final verdict, explanation, reasoning, and recommended next steps.
   *
   * @param {Object} evaluation - Output from EvidenceEvaluationEngine
   * @param {Object} [options]
   * @param {string} [options.language='en']
   * @returns {{
   *   verdict: 'SUPPORTED' | 'CONTRADICTED' | 'UNVERIFIED' | 'MIXED',
   *   shortExplanation: string,
   *   detailedReasoning: string[],
   *   traceableSources: Array<Object>,
   *   recommendedNextSteps: string[]
   * }}
   */
  generateVerdict(evaluation, options = {}) {
    const lang = options.language || 'en';
    const { supporting = [], contradicting = [], hasSufficientEvidence, sourceIndependence, conflicts, missingContext } = evaluation;

    const supCount = supporting.length;
    const conCount = contradicting.length;

    // Strict Rule: Never force a verdict when evidence is insufficient
    if (!hasSufficientEvidence || (supCount === 0 && conCount === 0)) {
      return this._buildUnverifiedVerdict(evaluation, lang);
    }

    // Significant evidence on both sides -> MIXED
    if (supCount > 0 && conCount > 0) {
      return this._buildMixedVerdict(evaluation, lang);
    }

    // Contradicting evidence only -> CONTRADICTED
    if (conCount > 0 && supCount === 0) {
      return this._buildContradictedVerdict(evaluation, lang);
    }

    // Supporting evidence only -> SUPPORTED
    if (supCount > 0 && conCount === 0) {
      return this._buildSupportedVerdict(evaluation, lang);
    }

    return this._buildUnverifiedVerdict(evaluation, lang);
  }

  _buildSupportedVerdict(evaluation, lang) {
    const { supporting, sourceIndependence, missingContext } = evaluation;
    const primaryCount = supporting.filter((s) => s.isPrimary || s.tier?.tier <= 2).length;
    const publishers = Array.from(new Set(supporting.map((s) => s.publisher).filter(Boolean))).join(', ');

    const isHi = lang === 'hi';
    const shortExplanation = isHi
      ? `विश्वसनीय उपलब्ध साक्ष्य (${publishers || 'आधिकारिक स्रोत'}) इस दावे का समर्थन करते हैं।`
      : `Reliable available evidence from ${publishers || 'authoritative sources'} supports the claim.`;

    const detailedReasoning = [
      isHi
        ? `कुल ${supporting.length} स्रोतों (जिनमें ${sourceIndependence.uniqueIndependentCount} स्वतंत्र संगठन शामिल हैं) ने इस दावे की तथ्यात्मक पुष्टि की है।`
        : `Corroborated across ${supporting.length} documented source(s) encompassing ${sourceIndependence.uniqueIndependentCount} independent publication(s).`,
      primaryCount > 0
        ? isHi
          ? `${primaryCount} आधिकारिक अथवा सहकर्मी-समीक्षित प्राथमिक स्रोतों द्वारा प्रमाणित।`
          : `Corroborated by ${primaryCount} Tier-1/Tier-2 primary or peer-reviewed institutional source(s).`
        : isHi
        ? 'दावा स्थापित समाचार और तथ्य-जांच संगठनों की रिपोर्टों पर आधारित है।'
        : 'Based on established institutional and accredited news reporting consensus.',
    ];

    if (missingContext && missingContext.length > 0) {
      detailedReasoning.push(
        isHi
          ? `संदर्भ सूचना: ${missingContext.join(' ')}`
          : `Important context: ${missingContext.join(' ')}`
      );
    }

    const recommendedNextSteps = [
      'Cross-reference specific quantitative figures or dates with the cited primary documentation.',
      'Review the original institutional publication link for full methodology and contextual background.',
    ];

    return {
      verdict: VERDICTS.SUPPORTED,
      shortExplanation,
      detailedReasoning,
      traceableSources: supporting,
      recommendedNextSteps,
    };
  }

  _buildContradictedVerdict(evaluation, lang) {
    const { contradicting, sourceIndependence, missingContext } = evaluation;
    const primaryCount = contradicting.filter((s) => s.isPrimary || s.tier?.tier <= 2).length;
    const publishers = Array.from(new Set(contradicting.map((s) => s.publisher).filter(Boolean))).join(', ');

    const isHi = lang === 'hi';
    const shortExplanation = isHi
      ? `विश्वसनीय उपलब्ध साक्ष्य (${publishers || 'आधिकारिक स्रोत'}) इस दावे का खंडन करते हैं।`
      : `Reliable available evidence from ${publishers || 'authoritative records'} contradicts the claim.`;

    const detailedReasoning = [
      isHi
        ? `कुल ${contradicting.length} स्वतंत्र स्रोतों ने इस दावे को गलत या भ्रामक पाया है।`
        : `Directly refuted across ${contradicting.length} verified record(s) from ${sourceIndependence.uniqueIndependentCount} independent publisher(s).`,
      primaryCount > 0
        ? isHi
          ? `आधिकारिक वैज्ञानिक व संस्थागत साक्ष्य (${primaryCount} प्राथमिक रिकॉर्ड) दावे का स्पष्ट खंडन करते हैं।`
          : `Definitive Tier-1 / Tier-2 empirical or statutory records (${primaryCount} primary source[s]) disprove the assertion.`
        : isHi
        ? 'मान्यता प्राप्त तथ्य-जांचकर्ताओं और अंतरराष्ट्रीय एजेंसियों ने इस दावे को खारिज किया है।'
        : 'Accredited fact-checkers and established investigative reporting refute the claimed event.',
    ];

    if (missingContext && missingContext.length > 0) {
      detailedReasoning.push(
        isHi
          ? `छूटी हुई संदर्भ जानकारी: ${missingContext.join(' ')}`
          : `Missing context omitted in original claim: ${missingContext.join(' ')}`
      );
    }

    const recommendedNextSteps = [
      'Do not recirculate this claim without corrective context.',
      'Consult the provided official fact-check debunking records for detailed timeline breakdowns.',
    ];

    return {
      verdict: VERDICTS.CONTRADICTED,
      shortExplanation,
      detailedReasoning,
      traceableSources: contradicting,
      recommendedNextSteps,
    };
  }

  _buildMixedVerdict(evaluation, lang) {
    const { supporting, contradicting, conflicts } = evaluation;
    const isHi = lang === 'hi';

    const shortExplanation = isHi
      ? `इस दावे के पक्ष और विपक्ष दोनों में महत्वपूर्ण साक्ष्य मौजूद हैं।`
      : `Significant supporting and contradicting evidence exists across available sources.`;

    const detailedReasoning = [
      isHi
        ? `साक्ष्यों में विरोधाभास: ${supporting.length} स्रोत समर्थन करते हैं और ${contradicting.length} स्रोत खंडन करते हैं।`
        : `Evidentiary divergence: ${supporting.length} source(s) support the premise while ${contradicting.length} source(s) record contradictions or caveats.`,
      conflicts[0]?.description || 'Differing methodologies, definitions, or reporting periods yield conflicting conclusions.',
    ];

    const recommendedNextSteps = [
      'Examine the specific methodological differences between supporting and contradicting publications.',
      'Await further independent replication or statutory audit before adopting a definitive conclusion.',
    ];

    return {
      verdict: VERDICTS.MIXED,
      shortExplanation,
      detailedReasoning,
      traceableSources: [...supporting, ...contradicting],
      recommendedNextSteps,
    };
  }

  _buildUnverifiedVerdict(evaluation, lang) {
    const isHi = lang === 'hi';

    const shortExplanation = isHi
      ? 'दावे की पुष्टि अथवा खंडन के लिए उपलब्ध साक्ष्य अपर्याप्त हैं।'
      : 'Available evidence is insufficient to substantiate or refute the claim.';

    const detailedReasoning = [
      isHi
        ? 'पर्याप्त आधिकारिक साक्ष्य, सहकर्मी-समीक्षित अध्ययन या स्वतंत्र स्रोत उपलब्ध नहीं हैं। सत्यगार्ड अपुष्ट निष्कर्षों पर निर्णय बाध्य नहीं करता।'
        : 'Independent evidence corpus is currently insufficient to establish factual accuracy. TruthGuard does not force a verdict in the absence of verified corroboration.',
      'Content may involve emerging breaking news, private events, or subjective statements that lack indexed public documentation.',
    ];

    const recommendedNextSteps = [
      'Monitor established statutory or institutional newsrooms for forthcoming official statements.',
      'Submit specific secondary evidence links or document references if available.',
    ];

    return {
      verdict: VERDICTS.UNVERIFIED,
      shortExplanation,
      detailedReasoning,
      traceableSources: [],
      recommendedNextSteps,
    };
  }
}

