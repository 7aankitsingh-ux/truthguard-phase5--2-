# TruthGuard AI — External API Dependencies & Fallbacks

TruthGuard AI is engineered to be resilient, honest, and operational even in fully air-gapped or offline environments. External services enhance verification depth when configured, but their absence **never** results in simulated, fake, or broken responses.

---

## 1. External Service Matrix

| Service | Environment Key | Primary Purpose | Behavior when Key is Not Configured |
|---|---|---|---|
| **Google Fact Check Tools API** | `GOOGLE_FACTCHECK_API_KEY` | Retrieves accredited third-party fact checks from the global ClaimReview schema. | Uses indexed institutional knowledge base; reports `status: "unavailable"` with configuration hint. |
| **External Web Search API** | `EXTERNAL_SEARCH_API_KEY` | Real-time internet indexing for recent breaking claims. | Uses indexed Tier 1-4 knowledge records with primary official publications. |
| **Reverse Image Search API** | `REVERSE_IMAGE_API_KEY` | Web image matching and historical appearance indexing. | Reports unconfigured status in file metadata panel; highlights visual & EXIF tampering indicators. |
| **External AI Detector API** | `EXTERNAL_AI_DETECTOR_API_KEY` | Third-party generative AI scoring models. | Runs local statistical heuristics (burstiness variance, type-token lexical ratio, repetitive n-grams, PNG text chunk tags). |

---

## 2. The Non-Fabrication Principle

In adherence to truthfulness guidelines:

1. **No Simulated Fact-Checking**: The system never mocks or pretends that an unconfigured external API returned a positive or negative fact check.
2. **Transparent Caveats**: If a verification cannot locate sufficient documentary evidence, the verdict is explicitly preserved as **`UNVERIFIED`** rather than guessing.
3. **Traceability**: All supporting or contradicting citations returned to the user originate either from indexed primary institutional repositories or live verified external responses.
4. **Strict Separation of AI Scores**: Machine-generated content likelihood scores are explicitly disclaimed and isolated from factual accuracy evaluations.
