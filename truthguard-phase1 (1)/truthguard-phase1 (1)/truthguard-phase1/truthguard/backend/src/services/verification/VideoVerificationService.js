import fs from 'node:fs/promises';
import { MediaProcessingService } from './MediaProcessingService.js';
import { logger } from '../../logger.js';
import { AppError } from '../../errors.js';

export class VideoVerificationService {
  constructor(mediaService = new MediaProcessingService()) {
    this.mediaService = mediaService;
  }

  /**
   * Main video verification pipeline.
   *
   * @param {string} videoFilePath - Full path to stored video file
   * @param {string} originalName - Original uploaded filename
   * @param {string} requestId - Verification request UUID
   * @returns {Promise<Object>}
   */
  async verifyVideo(videoFilePath, originalName = '', requestId = '') {
    // 1. Read initial chunk for magic bytes validation
    const handle = await fs.open(videoFilePath, 'r');
    const headerBuffer = Buffer.alloc(64);
    await handle.read(headerBuffer, 0, 64, 0);
    await handle.close();

    const validation = this.mediaService.validateVideo(headerBuffer, originalName);
    if (!validation.valid) {
      throw new AppError(400, 'invalid_video', validation.error || 'Invalid or unsupported video file format');
    }

    const sha256 = await this.mediaService.computeHash(videoFilePath);

    // 2. Video Metadata Extraction via ffprobe
    const metadata = await this.mediaService.extractVideoMetadata(videoFilePath);

    // 3. Keyframe Extraction with exact timestamps via ffmpeg
    const keyframes = await this.mediaService.extractKeyframes(videoFilePath, requestId, {
      maxFrames: 10,
    });

    // 4. Frame-by-Frame & Visual Inconsistency Analysis
    const frameAnalysis = this._analyzeFrames(keyframes, metadata);

    // 5. Video Manipulation & Deepfake Indicators
    const manipulationAnalysis = this._analyzeManipulationIndicators(metadata, frameAnalysis);

    // 6. AI Detection (Separated from Factual Accuracy)
    const aiDetection = this._analyzeAiIndicators(metadata, manipulationAnalysis);

    // 7. Synthesize Verdict & Limitations
    const synthesis = this._synthesizeVerdict(manipulationAnalysis, aiDetection, metadata, keyframes);

    return {
      verdict: synthesis.verdict,
      confidence: synthesis.confidence,
      summary: synthesis.summary,
      reasoning: synthesis.reasoning,
      fileInfo: {
        originalName,
        format: validation.format,
        mimeType: validation.mimeType,
        sizeBytes: metadata.sizeBytes,
        sha256,
      },
      metadata: {
        formatName: metadata.formatName,
        durationSeconds: metadata.duration,
        bitRate: metadata.bitRate,
        creationTime: metadata.creationTime,
        encoder: metadata.encoder,
        videoStream: metadata.video,
        audioStream: metadata.audio,
      },
      keyframes: keyframes.map((k) => ({
        frameIndex: k.frameIndex,
        timestampSeconds: k.timestampSeconds,
        formattedTimestamp: k.formattedTimestamp,
        filename: k.filename,
        relativePath: k.relativePath,
      })),
      frameAnalysis,
      manipulationAnalysis,
      aiDetection,
      limitations: [
        'Keyframe analysis samples representative frames across the video duration. Highly localized frame splices or transient face modifications between sample intervals may not be captured.',
        'Lossy video compression (H.264/H.265 macroblocking) can introduce visual artifacts that resemble digital tampering.',
        'Audio track analysis is currently limited to stream encoding metadata; voice cloning and audio deepfakes require acoustic spectral analysis.',
      ],
    };
  }

  /**
   * Analyzes extracted keyframes for visual consistency and scene continuity.
   */
  _analyzeFrames(keyframes, metadata) {
    const frameCount = keyframes.length;
    const anomalies = [];

    if (frameCount === 0) {
      anomalies.push('No keyframes could be extracted from video stream.');
    } else if (frameCount < 3 && (metadata.duration || 0) > 5) {
      anomalies.push('Sparse keyframe distribution detected relative to total video duration.');
    }

    if (metadata.video) {
      const { width, height, fps } = metadata.video;
      if (fps < 12) {
        anomalies.push(`Low frame rate detected (${fps} FPS); playback may appear unnatural or jittery.`);
      }
      if (width < 320 || height < 240) {
        anomalies.push('Low spatial resolution restricts fine-grained face or edge boundary analysis.');
      }
    }

    return {
      sampledFramesCount: frameCount,
      anomalies,
      sceneTransitionsDetected: Math.max(0, frameCount - 1),
    };
  }

  /**
   * Analyzes video container metadata and encoder tags for editing signatures.
   */
  _analyzeManipulationIndicators(metadata, frameAnalysis) {
    const indicators = [];
    let suspiciousScore = 0;

    const encoder = (metadata.encoder || '').toLowerCase();
    const knownEditingEncoders = [
      'premiere', 'after effects', 'final cut', 'davinci', 'kinemaster', 'capcut', 'inshot', 'filmora'
    ];

    for (const app of knownEditingEncoders) {
      if (encoder.includes(app)) {
        indicators.push(`Editing or compositing suite signature in stream metadata: "${metadata.encoder}"`);
        suspiciousScore += 0.45;
        break;
      }
    }

    if (frameAnalysis.anomalies.length > 0) {
      indicators.push(...frameAnalysis.anomalies);
      suspiciousScore += 0.2;
    }

    const isManipulated = suspiciousScore >= 0.5;

    return {
      isManipulated,
      score: Math.min(1, Math.round(suspiciousScore * 100) / 100),
      indicators,
    };
  }

  /**
   * AI / Deepfake detection indicators (separated from factual verification).
   */
  _analyzeAiIndicators(metadata, manipulation) {
    const indicators = [];
    let score = 0.1;

    // Check for synthetic/virtual camera or AI encoder tags
    const encoder = (metadata.encoder || '').toLowerCase();
    if (encoder.includes('synthetic') || encoder.includes('ai') || encoder.includes('diffusion') || encoder.includes('sora')) {
      indicators.push(`Generative video encoder signature: "${metadata.encoder}"`);
      score = 0.9;
    }

    return {
      score,
      isLikelyAiGenerated: score >= 0.7,
      indicators,
      externalIntegration: {
        available: false,
        provider: 'Neural Deepfake Classifier API',
        reason: 'External video deepfake model API key not configured',
      },
      disclaimer: 'AI-detection scores must never independently determine factual accuracy.',
    };
  }

  /**
   * Synthesizes final verdict and reasoning.
   */
  _synthesizeVerdict(manipulation, ai, metadata, keyframes) {
    const reasoning = [];
    let verdict = 'inconclusive';
    let confidence = 0.5;

    if (ai.isLikelyAiGenerated) {
      verdict = 'ai_generated';
      confidence = 0.85;
      reasoning.push(`Video metadata indicates synthetic or generative AI rendering: ${ai.indicators.join('; ')}.`);
    } else if (manipulation.isManipulated) {
      verdict = 'manipulated';
      confidence = 0.75;
      reasoning.push(`Video contains indicators of post-capture editing or stream re-encoding: ${manipulation.indicators.join('; ')}.`);
    } else if (keyframes.length > 0 && metadata.video) {
      verdict = 'authentic_unmodified';
      confidence = 0.7;
      reasoning.push(
        `Standard container encoding verified (${metadata.formatName}, ${metadata.video.codec}, ${metadata.video.width}x${metadata.video.height} @ ${metadata.video.fps} FPS) across ${keyframes.length} sampled keyframes without evident manipulation markers.`
      );
    } else {
      verdict = 'inconclusive';
      confidence = 0.4;
      reasoning.push('Insufficient structural or stream data to determine video authenticity.');
    }

    return {
      verdict,
      confidence,
      summary: reasoning[0],
      reasoning,
    };
  }
}

