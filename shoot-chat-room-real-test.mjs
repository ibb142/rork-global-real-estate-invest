import { chromium } from 'playwright-core';
import fs from 'fs';

const SHOTS = 'screenshots/qa-chat-room-real-test-2026-07-05';
fs.mkdirSync(SHOTS, { recursive: true });
const exec = '/home/user/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';

const EMAIL = 'iperez4242@gmail.com';
const PASSWORD = 'X146corp@1x146corp$$1';

async function shootChatRoom(name, width, height) {
  const browser = await chromium.launch({
    executablePath: exec,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const t0 = Date.now();

  try {
    await page.goto('https://chat.ivxholding.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Accept any cookie/age banner if present
    const acceptButton = page.locator('button:has-text("Accept"), button:has-text("I agree"), button:has-text("Continue")').first();
    if (await acceptButton.isVisible().catch(() => false)) {
      await acceptButton.click();
      await page.waitForTimeout(300);
    }

    // Look for email/password fields and sign in
    const emailInput = page.locator('input[type="email"]').first();
    const passInput = page.locator('input[type="password"]').first();
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(EMAIL);
      await passInput.fill(PASSWORD);
      const submit = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Continue")').first();
      await submit.click();
      await page.waitForTimeout(3000);
    }

    // Navigate to the owner AI room if not already there
    const roomLink = page.locator('text=IVX Owner AI room, a[href*="ivx/owner-ai"], a[href="/ivx"], a[href="/ivx/chat"]').first();
    if (await roomLink.isVisible().catch(() => false)) {
      await roomLink.click();
      await page.waitForTimeout(2500);
    }

    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });

    // Proof metrics
    const title = await page.title().catch(() => '?');
    const messageCount = await page.locator('[data-testid="ivx-owner-chat-list"], .message-bubble, [class*="MessageBubble"]').count().catch(() => 0);
    const oldestVisible = await page.locator('text=/months ago|202[5-6]/').first().textContent().catch(() => 'none');
    const loadingText = await page.locator('text=Loading IVX').count().catch(() => 0);
    const scrollToLatestVisible = await page.locator('[data-testid="ivx-owner-chat-scroll-to-latest"]').count().catch(() => 0);
    const noResults = await page.locator('text=No support tickets yet').count().catch(() => 0);
    const elapsed = Date.now() - t0;
    const stat = fs.statSync(`${SHOTS}/${name}.png`);

    console.log(JSON.stringify({
      name,
      viewport: `${width}x${height}`,
      elapsedMs: elapsed,
      title,
      messageCount,
      oldestVisible,
      loadingText,
      scrollToLatestVisible,
      noResults,
      bytes: stat.size,
    }));
  } catch (error) {
    console.log(`${name} failed: ${error.message}`);
    await page.screenshot({ path: `${SHOTS}/${name}-error.png`, fullPage: false }).catch(() => {});
  } finally {
    await browser.close();
  }
}

await shootChatRoom('01-chat-room-desktop', 1440, 900);
await shootChatRoom('02-chat-room-android', 412, 915);
await shootChatRoom('03-chat-room-ios', 390, 844);
console.log('DONE');
