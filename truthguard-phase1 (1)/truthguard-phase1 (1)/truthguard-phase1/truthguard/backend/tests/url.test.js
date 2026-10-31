import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { URLVerificationService, SSRFProtectionError } from '../src/services/verification/URLVerificationService.js';

test('URLVerificationService - SSRF Protection blocks private, loopback, and metadata IPs', () => {
  const service = new URLVerificationService();

  // IPv4 Private & Loopback
  assert.equal(service.isPrivateOrBlockedIP('127.0.0.1'), true);
  assert.equal(service.isPrivateOrBlockedIP('127.0.0.2'), true);
  assert.equal(service.isPrivateOrBlockedIP('10.0.0.1'), true);
  assert.equal(service.isPrivateOrBlockedIP('192.168.1.1'), true);
  assert.equal(service.isPrivateOrBlockedIP('172.16.0.1'), true);
  assert.equal(service.isPrivateOrBlockedIP('172.31.255.255'), true);
  assert.equal(service.isPrivateOrBlockedIP('0.0.0.0'), true);

  // Cloud Metadata IP (AWS, GCP, Azure 169.254.169.254)
  assert.equal(service.isPrivateOrBlockedIP('169.254.169.254'), true);
  assert.equal(service.isPrivateOrBlockedIP('169.254.1.1'), true);

  // IPv6 Loopback & Link Local & Unique Local
  assert.equal(service.isPrivateOrBlockedIP('::1'), true);
  assert.equal(service.isPrivateOrBlockedIP('fe80::1'), true);
  assert.equal(service.isPrivateOrBlockedIP('fc00::1'), true);
  assert.equal(service.isPrivateOrBlockedIP('fd12:3456:789a:1::1'), true);

  // IPv4-mapped IPv6
  assert.equal(service.isPrivateOrBlockedIP('::ffff:127.0.0.1'), true);
  assert.equal(service.isPrivateOrBlockedIP('::ffff:169.254.169.254'), true);

  // Public valid IPs should NOT be blocked
  assert.equal(service.isPrivateOrBlockedIP('8.8.8.8'), false);
  assert.equal(service.isPrivateOrBlockedIP('1.1.1.1'), false);
  assert.equal(service.isPrivateOrBlockedIP('142.250.190.46'), false);
});

test('URLVerificationService - SSRF Protection rejects prohibited protocols and localhost', async () => {
  const service = new URLVerificationService();

  // Non-HTTP/HTTPS protocols
  await assert.rejects(
    () => service.validateAndResolveUrl('file:///etc/passwd'),
    (err) => err instanceof SSRFProtectionError && err.message.includes('Prohibited protocol')
  );

  await assert.rejects(
    () => service.validateAndResolveUrl('ftp://example.com/file.txt'),
    (err) => err instanceof SSRFProtectionError && err.message.includes('Prohibited protocol')
  );

  // Localhost hostname
  await assert.rejects(
    () => service.validateAndResolveUrl('http://localhost:4000/api'),
    (err) => err instanceof SSRFProtectionError && err.message.includes('Prohibited internal hostname')
  );

  await assert.rejects(
    () => service.validateAndResolveUrl('http://server.local/admin'),
    (err) => err instanceof SSRFProtectionError && err.message.includes('Prohibited internal hostname')
  );
});

test('URLVerificationService - extracts article title, author, date, publisher, and text', () => {
  const service = new URLVerificationService();

  const mockHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>NASA Confirms Mars Water Discovery | Science News</title>
        <meta property="og:title" content="NASA Confirms Liquid Water on Mars" />
        <meta property="og:site_name" content="Astro Chronicle" />
        <meta name="author" content="Dr. Sarah Mitchell" />
        <meta property="article:published_time" content="2026-05-15T12:00:00Z" />
        <meta name="description" content="Detailed analysis of planetary spectroscopic readings." />
      </head>
      <body>
        <nav><a href="/">Home</a></nav>
        <article>
          <h1>NASA Confirms Liquid Water on Mars</h1>
          <p class="byline">By Dr. Sarah Mitchell</p>
          <p>Planetary scientists using orbital radar sensors have confirmed subterranean water deposits on Mars.</p>
          <p>The findings corroborate mathematical simulations conducted across multiple international observatories.</p>
        </article>
        <footer>Copyright 2026 Astro Chronicle</footer>
      </body>
    </html>
  `;

  const data = service.extractArticleData(mockHtml, 'https://astrochronicle.example.com/mars-water');

  assert.equal(data.title, 'NASA Confirms Liquid Water on Mars');
  assert.equal(data.publisher, 'Astro Chronicle');
  assert.equal(data.author, 'Dr. Sarah Mitchell');
  assert.equal(data.publishedDate, '2026-05-15T12:00:00Z');
  assert.ok(data.articleText.includes('Planetary scientists'));
  assert.ok(data.wordCount > 15);
  assert.ok(data.estimatedReadingTimeMinutes >= 1);
});

test('URLVerificationService - website characteristic analysis evaluates HTTPS and clickbait', () => {
  const service = new URLVerificationService();

  const articleSensational = {
    title: 'YOU WON\'T BELIEVE THIS SHOCKING SECRET ABOUT THE MOON!!!',
    wordCount: 80,
  };
  const char1 = service.analyzeWebsiteCharacteristics('http://sensationalnews.com/article', articleSensational);
  assert.equal(char1.isHttps, false);
  assert.equal(char1.isClickbait, true);
  assert.ok(char1.characteristics.some((c) => c.includes('Sensationalist or clickbait')));
  assert.ok(char1.characteristics.some((c) => c.includes('Unencrypted connection')));

  const articleGov = {
    title: 'Geodetic Survey Report on Terrestrial Oblateness',
    wordCount: 1500,
  };
  const char2 = service.analyzeWebsiteCharacteristics('https://geodesy.gov/report', articleGov);
  assert.equal(char2.isHttps, true);
  assert.equal(char2.isClickbait, false);
  assert.ok(char2.characteristics.some((c) => c.includes('government domain authority')));
});

test('URLVerificationService - end-to-end verification with mocked safeFetch', async () => {
  const service = new URLVerificationService();

  // Mock safeFetch to return static test article without external networking
  service.safeFetch = async (url) => ({
    html: `
      <html>
        <head>
          <meta property="og:title" content="Evidence Refutes Flat Earth Myth" />
          <meta property="og:site_name" content="Science Review" />
          <meta name="author" content="Jane Doe" />
        </head>
        <body>
          <article>
            <p>Centuries of astronomical observation confirm the Earth is an oblate spheroid. Satellite geodesy and navigation disprove the flat earth claim.</p>
          </article>
        </body>
      </html>
    `,
    finalUrl: url,
    statusCode: 200,
    headers: { 'content-type': 'text/html' },
  });

  const res = await service.verifyUrl('https://example.com/science/earth-shape');
  assert.ok(['SUPPORTED', 'CONTRADICTED', 'UNVERIFIED', 'MIXED', 'verified_false', 'verified_true', 'unverified'].includes(res.verdict));
  assert.equal(res.urlDetails.submittedUrl, 'https://example.com/science/earth-shape');
  assert.equal(res.article.publisher, 'Science Review');
  assert.equal(res.article.author, 'Jane Doe');
  assert.ok(res.websiteCharacteristics.isHttps);
  assert.ok(res.limitations.length >= 1);
});

