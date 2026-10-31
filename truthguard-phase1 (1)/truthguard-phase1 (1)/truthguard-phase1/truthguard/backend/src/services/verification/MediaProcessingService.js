import fs from 'node:fs/promises';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import exifr from 'exifr';
import { imageSize } from 'image-size';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

// Get binary paths
const ffmpegPath = ffmpegStatic;
const ffprobePath = ffprobeStatic?.path || ffprobeStatic;

export class MediaProcessingService {
  constructor() {
    this.storageDir = config.STORAGE_DIR;
    this._ensureDirs();
  }

  _ensureDirs() {
    try {
      if (!existsSync(this.storageDir)) {
        mkdirSync(this.storageDir, { recursive: true });
      }
      const keyframesDir = path.join(this.storageDir, 'keyframes');
      if (!existsSync(keyframesDir)) {
        mkdirSync(keyframesDir, { recursive: true });
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to create storage directories');
    }
  }

  /**
   * Computes SHA-256 hash of a file or buffer.
   */
  async computeHash(filePathOrBuffer) {
    if (Buffer.isBuffer(filePathOrBuffer)) {
      return crypto.createHash('sha256').update(filePathOrBuffer).digest('hex');
    }
    const buffer = await fs.readFile(filePathOrBuffer);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Sanitizes uploaded filenames to prevent path traversal or shell injection.
   */
  sanitizeFilename(name = '') {
    if (!name || typeof name !== 'string') return 'unnamed_upload';
    const base = path.basename(name).replace(/\0/g, '').replace(/\.\.+/g, '.');
    const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    return clean || 'unnamed_upload';
  }

  /**
   * Scans buffer for suspicious polyglot executable signatures or script payloads.
   */
  detectSuspiciousFileContent(buffer) {
    if (!buffer || buffer.length < 4) return { suspicious: false };

    // Windows PE/DOS header: 'MZ' (0x4D, 0x5A)
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return { suspicious: true, reason: 'Embedded Windows PE/DOS executable binary signature detected' };
    }

    // Linux ELF header: 0x7F, 'E', 'L', 'F'
    if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
      return { suspicious: true, reason: 'Embedded Linux ELF binary signature detected' };
    }

    // Script shebang in first 128 bytes
    const prefix = buffer.slice(0, 128).toString('latin1');
    if (/^#!(\/usr)?\/bin\//.test(prefix)) {
      return { suspicious: true, reason: 'Embedded shell script executable detected' };
    }

    // PHP or HTML script tag injection
    if (/<\?(php|=)/i.test(prefix) || /<script[\s>]/i.test(prefix)) {
      return { suspicious: true, reason: 'Executable script payload detected in file header' };
    }

    return { suspicious: false };
  }

  /**
   * Validates image format and magic bytes.
   * Supports: JPG, JPEG, PNG, WebP.
   *
   * @param {Buffer} buffer
   * @param {string} originalName
   * @returns {{ valid: boolean, format: string|null, mimeType: string|null, error?: string }}
   */
  validateImage(buffer, originalName = '') {
    if (!buffer || buffer.length < 12) {
      return { valid: false, format: null, mimeType: null, error: 'File is empty or too small to be a valid image' };
    }

    const suspiciousCheck = this.detectSuspiciousFileContent(buffer);
    if (suspiciousCheck.suspicious) {
      return { valid: false, format: null, mimeType: null, error: `Security check failed: ${suspiciousCheck.reason}` };
    }

    // JPEG: 0xFF 0xD8 0xFF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { valid: true, format: 'jpeg', mimeType: 'image/jpeg' };
    }

    // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { valid: true, format: 'png', mimeType: 'image/png' };
    }

    // WebP: 'RIFF' .... 'WEBP'
    if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { valid: true, format: 'webp', mimeType: 'image/webp' };
    }

    const ext = path.extname(originalName).toLowerCase();
    return {
      valid: false,
      format: null,
      mimeType: null,
      error: `Unsupported image format or magic bytes mismatch (file claimed extension: ${ext || 'none'}). Supported formats: JPG, JPEG, PNG, WebP.`,
    };
  }

  /**
   * Validates video format and magic bytes.
   * Supports: MP4, WebM, MOV, MKV, AVI.
   *
   * @param {Buffer} buffer
   * @param {string} originalName
   * @returns {{ valid: boolean, format: string|null, mimeType: string|null, error?: string }}
   */
  validateVideo(buffer, originalName = '') {
    if (!buffer || buffer.length < 16) {
      return { valid: false, format: null, mimeType: null, error: 'File is empty or too small to be a valid video' };
    }

    const suspiciousCheck = this.detectSuspiciousFileContent(buffer);
    if (suspiciousCheck.suspicious) {
      return { valid: false, format: null, mimeType: null, error: `Security check failed: ${suspiciousCheck.reason}` };
    }

    // MP4 / MOV: bytes 4-8 usually 'ftyp' or 'moov'
    const boxType = buffer.toString('ascii', 4, 8);
    if (boxType === 'ftyp' || boxType === 'moov') {
      const brand = buffer.toString('ascii', 8, 12).toLowerCase();
      if (brand.includes('qt')) {
        return { valid: true, format: 'mov', mimeType: 'video/quicktime' };
      }
      return { valid: true, format: 'mp4', mimeType: 'video/mp4' };
    }

    // WebM / Matroska (MKV): 0x1A 0x45 0xDF 0xA3
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      const headText = buffer.slice(0, 64).toString('ascii');
      if (headText.includes('webm')) {
        return { valid: true, format: 'webm', mimeType: 'video/webm' };
      }
      return { valid: true, format: 'mkv', mimeType: 'video/x-matroska' };
    }

    // AVI: 'RIFF' .... 'AVI '
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'AVI ') {
      return { valid: true, format: 'avi', mimeType: 'video/x-msvideo' };
    }

    const ext = path.extname(originalName).toLowerCase();
    return {
      valid: false,
      format: null,
      mimeType: null,
      error: `Unsupported video format or invalid container headers (${ext || 'unknown'}). Supported formats: MP4, WebM, MOV, MKV, AVI.`,
    };
  }

  /**
   * Extracts metadata, dimensions, EXIF, and editing signatures from an image buffer.
   *
   * @param {Buffer} buffer
   * @returns {Promise<Object>}
   */
  async extractImageMetadata(buffer) {
    const result = {
      dimensions: null,
      exif: null,
      software: null,
      camera: null,
      gps: null,
      timestamps: {},
      aiSignatures: [],
      rawHeaders: {},
    };

    // Extract basic dimensions
    try {
      const dimensions = imageSize(buffer);
      result.dimensions = {
        width: dimensions.width,
        height: dimensions.height,
        type: dimensions.type,
        orientation: dimensions.orientation,
      };
    } catch (err) {
      logger.debug({ err: err.message }, 'Failed to parse image dimensions with image-size');
    }

    // Extract EXIF/XMP/IPTC via exifr
    try {
      const parsed = await exifr.parse(buffer, {
        tiff: true,
        xmp: true,
        iptc: true,
        jfif: true,
        exif: true,
        gps: true,
        mergeOutput: true,
      });

      if (parsed) {
        result.exif = parsed;
        if (parsed.Make || parsed.Model) {
          result.camera = {
            make: parsed.Make || null,
            model: parsed.Model || null,
            lens: parsed.LensModel || null,
          };
        }
        if (parsed.Software || parsed.creatorTool || parsed.ProcessingSoftware) {
          result.software = parsed.Software || parsed.creatorTool || parsed.ProcessingSoftware;
        }
        if (parsed.latitude != null && parsed.longitude != null) {
          result.gps = {
            latitude: parsed.latitude,
            longitude: parsed.longitude,
          };
        }
        result.timestamps = {
          dateTimeOriginal: parsed.DateTimeOriginal ? new Date(parsed.DateTimeOriginal).toISOString() : null,
          createDate: parsed.CreateDate ? new Date(parsed.CreateDate).toISOString() : null,
          modifyDate: parsed.ModifyDate ? new Date(parsed.ModifyDate).toISOString() : null,
        };
      }
    } catch (err) {
      logger.debug({ err: err.message }, 'EXIF extraction warning: file may lack metadata chunks');
    }

    // Inspect PNG text chunks for AI generation signatures (Stable Diffusion, ComfyUI, etc.)
    const bufferString = buffer.toString('utf8', 0, Math.min(buffer.length, 65536));
    if (bufferString.includes('parameters') && (bufferString.includes('Steps:') || bufferString.includes('Sampler:'))) {
      result.aiSignatures.push('Stable Diffusion generation parameters detected in image text chunks');
    }
    if (bufferString.includes('Midjourney') || bufferString.includes('midjourney')) {
      result.aiSignatures.push('Midjourney generation signature detected in metadata');
    }
    if (bufferString.includes('DALL-E') || bufferString.includes('dall-e')) {
      result.aiSignatures.push('DALL-E generation signature detected');
    }
    if (bufferString.includes('Adobe Firefly')) {
      result.aiSignatures.push('Adobe Firefly generation tag detected');
    }

    return result;
  }

  /**
   * Extracts detailed video metadata using ffprobe.
   *
   * @param {string} videoFilePath
   * @returns {Promise<Object>}
   */
  async extractVideoMetadata(videoFilePath) {
    if (!ffprobePath) {
      throw new Error('ffprobe binary not found on system');
    }

    return new Promise((resolve, reject) => {
      const args = [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        videoFilePath,
      ];

      const proc = spawn(ffprobePath, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      proc.stderr.on('data', (chunk) => {
        stderr += chunk;
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`ffprobe failed with exit code ${code}: ${stderr}`));
        }
        try {
          const probe = JSON.parse(stdout);
          const format = probe.format || {};
          const videoStream = (probe.streams || []).find((s) => s.codec_type === 'video');
          const audioStream = (probe.streams || []).find((s) => s.codec_type === 'audio');

          // Parse FPS
          let fps = 0;
          if (videoStream?.r_frame_rate) {
            const parts = videoStream.r_frame_rate.split('/');
            fps = parts.length === 2 && Number(parts[1]) > 0 ? Number(parts[0]) / Number(parts[1]) : Number(parts[0]) || 0;
          }

          resolve({
            formatName: format.format_name,
            duration: Number(format.duration) || 0,
            sizeBytes: Number(format.size) || 0,
            bitRate: Number(format.bit_rate) || 0,
            creationTime: format.tags?.creation_time || null,
            encoder: format.tags?.encoder || null,
            video: videoStream
              ? {
                  codec: videoStream.codec_name,
                  width: videoStream.width,
                  height: videoStream.height,
                  fps: Math.round(fps * 100) / 100,
                  pixelFormat: videoStream.pix_fmt,
                  frameCount: Number(videoStream.nb_frames) || null,
                  aspectRatio: videoStream.display_aspect_ratio || null,
                }
              : null,
            audio: audioStream
              ? {
                  codec: audioStream.codec_name,
                  channels: audioStream.channels,
                  sampleRate: audioStream.sample_rate,
                }
              : null,
            streamsCount: probe.streams?.length || 0,
          });
        } catch (parseErr) {
          reject(new Error(`Failed to parse ffprobe JSON output: ${parseErr.message}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });
  }

  /**
   * Extracts keyframes from a video file with accurate timestamps.
   *
   * @param {string} videoFilePath
   * @param {string} requestId
   * @param {Object} [options]
   * @param {number} [options.maxFrames=12]
   * @returns {Promise<Array<{ frameIndex: number, timestampSeconds: number, formattedTimestamp: string, relativePath: string, filename: string }>>}
   */
  async extractKeyframes(videoFilePath, requestId, options = {}) {
    if (!ffmpegPath) {
      throw new Error('ffmpeg binary not found on system');
    }

    const maxFrames = options.maxFrames || 10;
    const keyframesDir = path.join(this.storageDir, 'keyframes', requestId);
    await fs.mkdir(keyframesDir, { recursive: true });

    // Probe duration first
    let duration = 10;
    try {
      const meta = await this.extractVideoMetadata(videoFilePath);
      duration = Math.max(meta.duration || 10, 1);
    } catch {
      // Fallback duration
    }

    // Determine sampling interval
    const interval = Math.max(duration / (maxFrames + 1), 0.5);
    const keyframes = [];

    // Extract frames at calculated timestamps
    for (let i = 0; i < maxFrames; i++) {
      const targetTime = Math.min((i + 1) * interval, Math.max(duration - 0.2, 0.1));
      const formattedTimestamp = this._formatTimestamp(targetTime);
      const filename = `frame_${String(i + 1).padStart(3, '0')}_${Math.round(targetTime * 1000)}ms.jpg`;
      const outputPath = path.join(keyframesDir, filename);

      try {
        await this._extractSingleFrame(videoFilePath, targetTime, outputPath);
        keyframes.push({
          frameIndex: i + 1,
          timestampSeconds: Math.round(targetTime * 100) / 100,
          formattedTimestamp,
          relativePath: `keyframes/${requestId}/${filename}`,
          filename,
        });
      } catch (err) {
        logger.warn({ err: err.message, targetTime }, 'Frame extraction failed at timestamp');
      }
    }

    return keyframes;
  }

  _extractSingleFrame(videoFilePath, timestampSeconds, outputPath) {
    return new Promise((resolve, reject) => {
      const args = [
        '-ss',
        timestampSeconds.toFixed(3),
        '-i',
        videoFilePath,
        '-vframes',
        '1',
        '-q:v',
        '2',
        '-filter:v',
        'scale=640:-1',
        '-y',
        outputPath,
      ];

      const proc = spawn(ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (chunk) => {
        stderr += chunk;
      });

      proc.on('close', (code) => {
        if (code === 0 && existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error(`ffmpeg frame extraction failed (code ${code}): ${stderr}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });
  }

  _formatTimestamp(seconds) {
    const s = Math.floor(seconds);
    const ms = Math.floor((seconds - s) * 1000);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }
}

