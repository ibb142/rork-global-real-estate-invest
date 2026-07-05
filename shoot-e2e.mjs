import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';

const SHOTS = 'screenshots/qa-final-2026-07-05';
const exec = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

async function shoot(url, name, width, height) {
  const browser = await chromium.launch({ executablePath: exec, args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  const title = await page.title().catch(()=>'?');
  await browser.close();
  console.log(`${name}: ${width}x${height} title="${title}"`);
}

await shoot('https://ivxholding.com', '01-landing-desktop', 1440, 900);
await shoot('https://ivxholding.com', '02-landing-android', 412, 915);
await shoot('https://ivxholding.com', '03-landing-ios', 390, 844);
await shoot('https://chat.ivxholding.com', '04-chat-desktop', 1440, 900);
await shoot('https://chat.ivxholding.com', '05-chat-mobile', 390, 844);
console.log('DONE');
