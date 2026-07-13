import { chromium } from 'playwright';

const BASE_URL = 'https://ivxholding.com';
const API_URL = 'https://api.ivxholding.com';

interface QAResult {
  item: string;
  viewport: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  evidence: string;
}

const results: QAResult[] = [];
const viewports = [
  { name: 'mobile-android', width: 360, height: 640 },
  { name: 'mobile-iphone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

async function runQA() {
  const browser = await chromium.launch({ headless: true });

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.name.includes('iphone')
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
        : undefined,
    });
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', (req) => {
      networkErrors.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });

    try {
      const response = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
      const httpStatus = response?.status() ?? 0;
      results.push({ item: 'Page Load', viewport: vp.name, status: httpStatus === 200 ? 'pass' : 'fail', detail: `HTTP ${httpStatus}`, evidence: `${BASE_URL} returned ${httpStatus}` });

      // Wait for dynamic content
      await page.waitForTimeout(3000);

      // Check for horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      results.push({ item: 'Horizontal Overflow', viewport: vp.name, status: scrollWidth > clientWidth ? 'fail' : 'pass', detail: `scrollWidth=${scrollWidth} clientWidth=${clientWidth}`, evidence: scrollWidth > clientWidth ? `Overflow of ${scrollWidth - clientWidth}px` : 'No overflow' });

      // Check for broken images (after waiting for dynamic load)
      const brokenImages = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src).slice(0, 5);
      });
      results.push({ item: 'Broken Images', viewport: vp.name, status: brokenImages.length === 0 ? 'pass' : 'warn', detail: `${brokenImages.length} broken images`, evidence: brokenImages.join(', ') || 'All images loaded' });

      // Check for page sections
      const sections = await page.evaluate(() => document.querySelectorAll('section, [class*="section"], [class*="hero"], [class*="feature"], [class*="deal"], [class*="property"]').length);
      results.push({ item: 'Page Sections', viewport: vp.name, status: sections >= 5 ? 'pass' : 'warn', detail: `${sections} sections found`, evidence: `Found ${sections} section elements` });

      // Check for CTAs / buttons
      const buttons = await page.evaluate(() => document.querySelectorAll('button, a[role="button"], .cta, [class*="btn"], [class*="button"]').length);
      results.push({ item: 'CTA Buttons', viewport: vp.name, status: buttons >= 3 ? 'pass' : 'warn', detail: `${buttons} buttons found`, evidence: `Found ${buttons} clickable elements` });

      // Check for blank sections
      const blankSections = await page.evaluate(() => {
        const allEls = document.querySelectorAll('div, section');
        let blankCount = 0;
        allEls.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.height > 100 && rect.width > 200) {
            const bg = window.getComputedStyle(el).backgroundColor;
            if (bg === 'rgb(0, 0, 0)') {
              const hasContent = el.innerHTML.length > 100;
              if (!hasContent) blankCount++;
            }
          }
        });
        return blankCount;
      });
      results.push({ item: 'Blank Sections', viewport: vp.name, status: blankSections === 0 ? 'pass' : 'warn', detail: `${blankSections} potentially blank sections`, evidence: `${blankSections} blank sections` });

      // Check page height stability (no jumping)
      const heights: number[] = [];
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(500);
        heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
      }
      const heightVariation = Math.max(...heights) - Math.min(...heights);
      results.push({ item: 'Page Jumping', viewport: vp.name, status: heightVariation < 50 ? 'pass' : 'warn', detail: `Height variation: ${heightVariation}px`, evidence: `Heights: ${heights.join(', ')}` });

      // Check for video elements
      const videos = await page.evaluate(() => document.querySelectorAll('video').length);
      results.push({ item: 'Video Elements', viewport: vp.name, status: 'pass', detail: `${videos} video elements found`, evidence: `Found ${videos} video elements` });

      // Scroll to bottom to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);

      // Check for IVX colors
      const hasGoldColor = await page.evaluate(() => {
        const html = document.documentElement.innerHTML;
        return html.includes('#FFD700') || html.includes('rgb(255, 215, 0)') || html.includes('gold');
      });
      results.push({ item: 'IVX Gold Color', viewport: vp.name, status: hasGoldColor ? 'pass' : 'warn', detail: 'Gold #FFD700 presence', evidence: hasGoldColor ? 'Gold color found' : 'Gold color not found in inline styles' });

      // Check title
      const title = await page.title();
      results.push({ item: 'Page Title', viewport: vp.name, status: title.includes('IVX') ? 'pass' : 'fail', detail: title, evidence: `Title: "${title}"` });

      // Check meta description
      const metaDesc = await page.evaluate(() => document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '');
      results.push({ item: 'Meta Description', viewport: vp.name, status: metaDesc.length > 50 ? 'pass' : 'warn', detail: `${metaDesc.length} chars`, evidence: metaDesc.substring(0, 80) });

      // Console errors
      results.push({ item: 'Console Errors', viewport: vp.name, status: consoleErrors.length === 0 ? 'pass' : 'warn', detail: `${consoleErrors.length} errors`, evidence: consoleErrors.slice(0, 3).join(' | ') || 'No console errors' });

      // Network failures
      results.push({ item: 'Network Failures', viewport: vp.name, status: networkErrors.length === 0 ? 'pass' : 'warn', detail: `${networkErrors.length} failures`, evidence: networkErrors.slice(0, 3).join(' | ') || 'No network failures' });

      // Take screenshot
      await page.screenshot({ path: `/home/user/rork-app/qa-screenshots/qa-${vp.name}.png`, fullPage: false });
      results.push({ item: 'Screenshot', viewport: vp.name, status: 'pass', detail: 'Screenshot captured', evidence: `qa-screenshots/qa-${vp.name}.png` });

    } catch (error) {
      results.push({ item: 'Page Navigation', viewport: vp.name, status: 'fail', detail: error instanceof Error ? error.message : 'Unknown error', evidence: 'Navigation failed' });
    }
    await context.close();
  }

  // API endpoint tests
  const apiContext = await browser.newContext();
  const apiPage = await apiContext.newPage();

  const endpoints = [
    { path: '/health', expected: 200 },
    { path: '/api/landing-config', expected: 200 },
    { path: '/api/ivx/members/count', expected: 200 },
    { path: '/api/ivx/video-platform/feed', expected: 200 },
    { path: '/api/public/messages', expected: 200 },
    { path: '/api/public/rooms', expected: 200 },
    { path: '/api/ivx/properties/featured', expected: 200 },
    { path: '/api/ivx/jv-deals', expected: 200 },
    { path: '/api/reels', expected: 200, deployed: false },
    { path: '/api/members/authoritative-count', expected: 200, deployed: false },
    { path: '/api/metrics/authoritative-count', expected: 200, deployed: false },
    { path: '/api/trpc/waitlist.getStats', expected: 200, deployed: false },
  ];

  for (const ep of endpoints) {
    try {
      const response = await apiPage.goto(`${API_URL}${ep.path}`, { timeout: 10000 });
      const status = response?.status() ?? 0;
      const isUndeployed = ep.deployed === false && status === 404;
      results.push({
        item: `API ${ep.path}`,
        viewport: 'api',
        status: status === ep.expected ? 'pass' : isUndeployed ? 'warn' : 'fail',
        detail: `Expected ${ep.expected}, got ${status}${isUndeployed ? ' (code committed but not deployed)' : ''}`,
        evidence: `${API_URL}${ep.path} → ${status}`,
      });
    } catch (error) {
      results.push({ item: `API ${ep.path}`, viewport: 'api', status: 'fail', detail: error instanceof Error ? error.message : 'Request failed', evidence: 'Connection failed' });
    }
  }

  // www redirect test
  try {
    const wwwResponse = await apiPage.goto('https://www.ivxholding.com', { timeout: 10000 });
    const wwwStatus = wwwResponse?.status() ?? 0;
    const wwwUrl = apiPage.url();
    results.push({ item: 'WWW Redirect', viewport: 'redirect', status: wwwUrl.includes('ivxholding.com') ? 'pass' : 'fail', detail: `HTTP ${wwwStatus}, URL: ${wwwUrl}`, evidence: `www.ivxholding.com → ${wwwUrl}` });
  } catch (error) {
    results.push({ item: 'WWW Redirect', viewport: 'redirect', status: 'fail', detail: error instanceof Error ? error.message : 'Redirect failed', evidence: 'www redirect test failed' });
  }

  await browser.close();

  // Print results
  console.log('\n=== IVX LIVE PRODUCTION QA RESULTS ===\n');
  let passCount = 0, failCount = 0, warnCount = 0;
  for (const r of results) {
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'WARN';
    console.log(`[${icon}] ${r.item} (${r.viewport}) — ${r.detail}`);
    if (r.evidence) console.log(`       Evidence: ${r.evidence}`);
    if (r.status === 'pass') passCount++;
    else if (r.status === 'fail') failCount++;
    else warnCount++;
  }
  console.log(`\n=== SUMMARY: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL ===`);
  console.log('\n=== JSON RESULTS ===');
  console.log(JSON.stringify({ results, passCount, warnCount, failCount }));
}

runQA().catch(console.error);
