import dns from 'node:dns/promises';
import { URL } from 'node:url';
import * as cheerio from 'cheerio';
import { TextVerificationService } from './TextVerificationService.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

export class SSRFProtectionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SSRFProtectionError';
    this.code = 'ssrf_blocked';
    this.details = details;
  }
}

export class URLVerificationService {
  constructor(textService = new TextVerificationService()) {
    this.textService = textService;
    this.timeoutMs = config.FETCH_TIMEOUT_MS || 10000;
    this.maxBytes = config.MAX_WEBPAGE_BYTES || 5 * 1024 * 1024;
  }

  /**
   * Checks whether an IP address is private, loopback, link-local, multicast, or reserved.
   *
   * @param {string} ip
   * @returns {boolean}
   */
  isPrivateOrBlockedIP(ip) {
    if (!ip || typeof ip !== 'string') return true;
    const cleanIp = ip.trim();

    // Check for IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (cleanIp.startsWith('::ffff:')) {
      const mapped = cleanIp.slice(7);
      if (mapped.includes('.')) {
        return this.isPrivateOrBlockedIP(mapped);
      }
    }

    // IPv6 checks
    if (cleanIp.includes(':')) {
      const lower = cleanIp.toLowerCase();
      if (lower === '::1' || lower === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
      if (lower === '::' || lower === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
      // Link-local: fe80::/10
      if (/^fe[89ab]/i.test(lower)) return true;
      // Unique local address: fc00::/7 (fc00 - fdff)
      if (/^f[cd]/i.test(lower)) return true;
      return false;
    }

    // IPv4 checks
    const parts = cleanIp.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformed IP is blocked
    }

    const [a, b, c] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private RFC1918)
    if (a === 10) return true;
    // 100.64.0.0/10 (Carrier-Grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local & AWS/GCP/Azure Cloud Metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private RFC1918: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 192.168.0.0/16 (Private RFC1918)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (a >= 224) return true;

    return false;
  }

  /**
   * Validates and resolves a target URL against SSRF rules.
   *
   * @param {string} inputUrl
   * @returns {Promise<{ resolvedUrl: URL, ip: string }>}
   */
  async validateAndResolveUrl(inputUrl) {
    let parsed;
    try {
      parsed = new URL(inputUrl);
    } catch {
      throw new SSRFProtectionError('Invalid URL structure', { inputUrl });
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new SSRFProtectionError(`Prohibited protocol: ${parsed.protocol}. Only http and https are permitted.`, {
        protocol: parsed.protocol,
      });
    }

    const hostname = parsed.hostname;
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      throw new SSRFProtectionError(`Prohibited internal hostname: ${hostname}`, { hostname });
    }

    // Resolve DNS records to verify outbound target IP
    let addresses;
    try {
      addresses = await dns.lookup(hostname, { all: true });
    } catch (err) {
      throw new SSRFProtectionError(`DNS resolution failed for hostname "${hostname}": ${err.message}`, {
        hostname,
      });
    }

    if (!addresses || addresses.length === 0) {
      throw new SSRFProtectionError(`No IP address resolved for hostname "${hostname}"`, { hostname });
    }

    for (const record of addresses) {
      if (this.isPrivateOrBlockedIP(record.address)) {
        throw new SSRFProtectionError(
          `SSRF protection: Target hostname "${hostname}" resolved to prohibited address ${record.address}`,
          { hostname, ip: record.address }
        );
      }
    }

    return {
      resolvedUrl: parsed,
      ip: addresses[0].address,
    };
  }

  /**
   * Safely retrieves webpage content following redirects with strict SSRF re-validation.
   *
   * @param {string} initialUrl
   * @returns {Promise<{ html: string, finalUrl: string, statusCode: number, headers: Object }>}
   */
  async safeFetch(initialUrl) {
    let currentUrl = initialUrl;
    let redirectCount = 0;
    const maxRedirects = 5;
    const visited = new Set();

    while (redirectCount <= maxRedirects) {
      if (visited.has(currentUrl)) {
        throw new SSRFProtectionError('Detected redirect loop', { currentUrl });
      }
      visited.add(currentUrl);

      // Validate SSRF on every hop
      await this.validateAndResolveUrl(currentUrl);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(currentUrl, {
          redirect: 'manual', // Manual handling to enforce SSRF validation per hop
          signal: controller.signal,
          headers: {
            'User-Agent': 'TruthGuard-VerificationEngine/1.0 (+https://truthguard.ai/bot)',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        clearTimeout(timer);

        // Handle Redirects
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            throw new Error(`HTTP ${response.status} redirect without Location header`);
          }
          currentUrl = new URL(location, currentUrl).toString();
          redirectCount++;
          continue;
        }

        if (!response.ok) {
          throw new Error(`Webpage returned HTTP error ${response.status} (${response.statusText})`);
        }

        // Validate content-type
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          throw new Error(`Unsupported content type "${contentType}". Only HTML documents can be verified.`);
        }

        // Stream and enforce byte limit
        const reader = response.body.getReader();
        const chunks = [];
        let totalBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.length;
          if (totalBytes > this.maxBytes) {
            reader.cancel();
            throw new Error(`Webpage exceeded maximum allowed size limit of ${Math.round(this.maxBytes / (1024 * 1024))}MB`);
          }
          chunks.push(value);
        }

        const fullBuffer = Buffer.concat(chunks);
        const html = fullBuffer.toString('utf8');

        return {
          html,
          finalUrl: currentUrl,
          statusCode: response.status,
          headers: Object.fromEntries(response.headers.entries()),
        };
      } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          throw new Error(`Request timed out after ${this.timeoutMs / 1000} seconds`);
        }
        throw err;
      }
    }

    throw new SSRFProtectionError(`Exceeded maximum redirect limit of ${maxRedirects} hops`);
  }

  /**
   * Extracts article text, metadata, publisher, author, and date using cheerio.
   *
   * @param {string} html
   * @param {string} pageUrl
   * @returns {Object}
   */
  extractArticleData(html, pageUrl) {
    const $ = cheerio.load(html);
    const urlObj = new URL(pageUrl);

    // Remove noise elements
    $('script, style, noscript, nav, header, footer, aside, form, svg, iframe, .advertisement, .ad, .cookie-banner').remove();

    // 1. Title Extraction
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      'Untitled Document';

    // 2. Meta Description
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    // 3. Publisher Identification
    const publisher =
      $('meta[property="og:site_name"]').attr('content') ||
      $('meta[name="publisher"]').attr('content') ||
      $('meta[name="author"]').attr('content') ||
      urlObj.hostname.replace(/^www\./, '');

    // 4. Author Extraction
    const author =
      $('meta[name="author"]').attr('content') ||
      $('meta[property="article:author"]').attr('content') ||
      $('meta[name="twitter:creator"]').attr('content') ||
      $('.byline, .author, [rel="author"]').first().text().trim() ||
      null;

    // 5. Publication Date Extraction
    const publishedDate =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="publishdate"]').attr('content') ||
      $('meta[name="date"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      $('time').first().text().trim() ||
      null;

    // 6. Body Text Extraction
    const paragraphs = [];
    $('article p, main p, .content p, .article-body p, p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 25) {
        paragraphs.push(text);
      }
    });

    const fullArticleText = paragraphs.join('\n\n').slice(0, 15000);
    const wordCount = fullArticleText.split(/\s+/).filter(Boolean).length;

    return {
      title: title.trim(),
      description: description.trim(),
      publisher: publisher.trim(),
      author: author ? author.replace(/^by\s+/i, '').trim() : null,
      publishedDate,
      articleText: fullArticleText,
      wordCount,
      estimatedReadingTimeMinutes: Math.max(1, Math.ceil(wordCount / 200)),
    };
  }

  /**
   * Analyzes website structural characteristics, security, and credibility cues.
   *
   * @param {string} pageUrl
   * @param {Object} articleData
   * @returns {Object}
   */
  analyzeWebsiteCharacteristics(pageUrl, articleData) {
    const urlObj = new URL(pageUrl);
    const isHttps = urlObj.protocol === 'https:';
    const hostname = urlObj.hostname;

    const characteristics = [];

    if (isHttps) {
      characteristics.push('Encrypted transport (HTTPS) in use.');
    } else {
      characteristics.push('Unencrypted connection (HTTP); lacks transport security.');
    }

    // TLD classification
    if (hostname.endsWith('.gov') || hostname.endsWith('.gov.in')) {
      characteristics.push('Official government domain authority (.gov).');
    } else if (hostname.endsWith('.edu') || hostname.endsWith('.ac.in')) {
      characteristics.push('Accredited academic / educational institution (.edu).');
    } else if (hostname.endsWith('.org')) {
      characteristics.push('Non-profit or institutional domain (.org).');
    }

    // Headline clickbait check
    const title = articleData.title || '';
    const clickbaitSignals = [
      'you won\'t believe', 'shocking truth', 'secret they don\'t want you to know',
      'mind blowing', 'will destroy', 'revealed!', 'OMG', 'हैरान कर देने वाला',
      'चौंकाने वाला', 'खुलासा'
    ];
    const isClickbait = clickbaitSignals.some((s) => title.toLowerCase().includes(s.toLowerCase())) || /!{2,}|\?{2,}/.test(title);

    if (isClickbait) {
      characteristics.push('Sensationalist or clickbait phrasing detected in article headline.');
    }

    if (articleData.wordCount < 100) {
      characteristics.push('Short-form article stub (under 100 words).');
    }

    return {
      domain: hostname,
      isHttps,
      isClickbait,
      characteristics,
    };
  }

  /**
   * End-to-end URL Verification Pipeline.
   *
   * @param {string} inputUrl
   * @returns {Promise<Object>}
   */
  async verifyUrl(inputUrl) {
    if (!inputUrl || typeof inputUrl !== 'string') {
      throw new Error('Valid URL string is required');
    }

    // 1. SSRF Guard & Safe Fetch
    const fetchResult = await this.safeFetch(inputUrl);

    // 2. Content & Entity Extraction
    const articleData = this.extractArticleData(fetchResult.html, fetchResult.finalUrl);

    // 3. Website Characteristic Analysis
    const characteristics = this.analyzeWebsiteCharacteristics(fetchResult.finalUrl, articleData);

    // 4. Independent Evidence Comparison & Fact Verification
    // Pass extracted headline and text into TextVerificationService
    const verificationContent = articleData.title
      ? `${articleData.title}. ${articleData.articleText.slice(0, 3000)}`
      : articleData.articleText.slice(0, 3000);

    let textVerificationResult = null;
    if (verificationContent.trim().length > 20) {
      textVerificationResult = await this.textService.verifyText(verificationContent);
    } else {
      textVerificationResult = {
        verdict: 'unverified',
        confidence: 0.3,
        summary: 'Webpage contains insufficient readable body text for factual verification.',
        reasoning: ['Article body is empty or blocked by a client-side JavaScript renderer or paywall.'],
        claims: [],
        evidenceSources: [],
        aiDetection: {
          score: 0,
          isLikelyAiGenerated: false,
          indicators: ['Insufficient text for AI detection'],
          externalIntegration: { available: false, provider: 'External AI Detector', reason: 'Unconfigured' },
          disclaimer: 'AI-detection scores must never independently determine factual accuracy.',
        },
        language: 'en',
      };
    }

    return {
      verdict: textVerificationResult.verdict,
      shortExplanation: textVerificationResult.shortExplanation || textVerificationResult.summary,
      summary: textVerificationResult.summary,
      detailedReasoning: [
        `Verified content retrieved from publisher "${articleData.publisher}" (${fetchResult.finalUrl}).`,
        ...(textVerificationResult.detailedReasoning || textVerificationResult.reasoning || []),
      ],
      reasoning: [
        `Verified content retrieved from publisher "${articleData.publisher}" (${fetchResult.finalUrl}).`,
        ...(textVerificationResult.reasoning || []),
      ],
      confidenceAssessment: textVerificationResult.confidenceAssessment,
      confidence: textVerificationResult.confidence,
      recommendedNextSteps: textVerificationResult.recommendedNextSteps || [],
      urlDetails: {
        submittedUrl: inputUrl,
        finalUrl: fetchResult.finalUrl,
        statusCode: fetchResult.statusCode,
        ssrfChecked: true,
      },
      article: {
        title: articleData.title,
        description: articleData.description,
        publisher: articleData.publisher,
        author: articleData.author,
        publishedDate: articleData.publishedDate,
        wordCount: articleData.wordCount,
        readingTimeMinutes: articleData.estimatedReadingTimeMinutes,
        textSnippet: articleData.articleText.slice(0, 500),
      },
      websiteCharacteristics: characteristics,
      claims: textVerificationResult.claims,
      evidenceSources: textVerificationResult.evidenceSources,
      missingContext: textVerificationResult.missingContext || [],
      aiDetection: textVerificationResult.aiDetection,
      language: textVerificationResult.language,
      limitations: [
        'Webpage verification extracts static HTML; dynamic single-page applications (SPAs) requiring client-side JavaScript execution may yield partial body text.',
        'Publisher reputation and domain ownership indicators provide context but do not substitute for factual corroboration.',
      ],
    };
  }
}

