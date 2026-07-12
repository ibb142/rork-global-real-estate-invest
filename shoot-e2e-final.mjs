import { chromium } from 'playwright-core';

const SHOTS = 'screenshots/qa-e2e-final';
const exec = process.env.CHROMIUM_PATH;

async function shoot(url, name, width, height) {
  const browser = await chromium.launch({ executablePath: exec, args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  const title = await page.title().catch(()=>'?');
  await browser.close();
  const stat = await import('fs').then(fs=>fs.statSync(`${SHOTS}/${name}.png`));
  console.log(`${name}: ${width}x${height} title="${title}" bytes=${stat.size}`);
}

await shoot('https://ivxholding.com', '01-landing-desktop', 1440, 900);
await shoot('https://ivxholding.com', '02-landing-android', 412, 915);
await shoot('https://ivxholding.com', '03-landing-ios', 390, 844);
await shoot('https://chat.ivxholding.com', '04-chat-desktop', 1440, 900);
await shoot('https://chat.ivxholding.com', '05-chat-mobile', 390, 844);
console.log('DONE');
