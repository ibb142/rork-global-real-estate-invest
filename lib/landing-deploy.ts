import { Platform } from 'react-native';
import { getSupabaseCredentials } from '@/lib/landing-config';

export interface DeployResult {
  success: boolean;
  filesUploaded: string[];
  errors: string[];
  timestamp: string;
}

function getAwsCredentials(): { accessKeyId: string; secretAccessKey: string; region: string; configured: boolean } {
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const region = (process.env.AWS_REGION || 'us-east-1').trim();
  const configured = !!(accessKeyId && secretAccessKey);
  return { accessKeyId, secretAccessKey, region, configured };
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmacSha256(encoder.encode('AWS4' + secretKey).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function s3PutObject(params: {
  bucket: string;
  key: string;
  body: string;
  contentType: string;
  cacheControl: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}): Promise<{ success: boolean; status: number; error?: string }> {
  const { bucket, key, body, contentType, cacheControl, accessKeyId, secretAccessKey, region } = params;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').substring(0, 15) + 'Z';  // eslint-disable-line no-useless-escape
  const dateStamp = amzDate.substring(0, 8);
  const host = region === 'us-east-1' ? `${bucket}.s3.amazonaws.com` : `${bucket}.s3.${region}.amazonaws.com`;
  const url = `https://${host}/${key}`;
  const payloadHash = await sha256Hex(body);
  const canonicalHeaders = [
    `cache-control:${cacheControl}`,
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'cache-control;content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    '/' + key,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, 's3');
  const signature = toHex(await hmacSha256(signingKey, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    console.log('[LandingDeploy] Uploading', key, 'to', bucket, '...');
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Authorization': authorization,
      },
      body,
    });
    if (response.ok || response.status === 200) {
      console.log('[LandingDeploy] ✅ Uploaded', key, 'status:', response.status);
      return { success: true, status: response.status };
    }
    const errText = await response.text();
    console.log('[LandingDeploy] ❌ Upload failed', key, 'status:', response.status, errText.substring(0, 300));
    return { success: false, status: response.status, error: errText.substring(0, 200) };
  } catch (err) {
    console.log('[LandingDeploy] ❌ Upload exception for', key, ':', (err as Error)?.message);
    return { success: false, status: 0, error: (err as Error)?.message || 'Upload failed' };
  }
}

function getLocalLandingHtml(): string | null {
  try {
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.resolve(__dirname, '..', 'ivxholding-landing', 'index.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      console.log('[LandingDeploy] Loaded local landing HTML, length:', html.length);
      return html;
    }
  } catch {
    console.log('[LandingDeploy] Could not read local HTML file (expected in browser)');
  }
  return null;
}

async function fetchCurrentLandingHtml(): Promise<string | null> {
  const localHtml = getLocalLandingHtml();
  if (localHtml && localHtml.length > 1000) {
    console.log('[LandingDeploy] Using local ivxholding-landing/index.html as source of truth');
    return localHtml;
  }

  try {
    console.log('[LandingDeploy] Local HTML not available — fetching from ivxholding.com...');
    const response = await fetch('https://ivxholding.com', {
      headers: { 'Accept': 'text/html' },
    });
    if (!response.ok) {
      console.log('[LandingDeploy] Failed to fetch landing HTML:', response.status);
      return null;
    }
    const html = await response.text();
    if (html.includes('__IVX_SUPABASE_URL__') || html.includes('IVX Holdings')) {
      console.log('[LandingDeploy] Got landing HTML from remote, length:', html.length);
      return html;
    }
    console.log('[LandingDeploy] HTML doesnt look like landing page');
    return null;
  } catch (err) {
    console.log('[LandingDeploy] Fetch error:', (err as Error)?.message);
    return null;
  }
}

function injectAppBanner(html: string): string {
  const bodyStart = html.indexOf('<body');
  const bodyContent = bodyStart !== -1 ? html.substring(bodyStart) : html;
  if (bodyContent.includes('app-banner-section') || bodyContent.includes('app-coming-soon')) {
    console.log('[LandingDeploy] App banner already present in body — skipping injection');
    return html;
  }

  const bannerCSS = `
    /* APP COMING SOON BANNER */
    .app-banner-section{position:relative;overflow:hidden;padding:80px 24px;background:linear-gradient(135deg,#0D0D0D 0%,#1A1200 50%,#0D0D0D 100%);border-top:1px solid rgba(255,215,0,0.15);border-bottom:1px solid rgba(255,215,0,0.15)}
    .app-banner-glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 80% at 30% 50%,rgba(255,215,0,0.08) 0%,transparent 60%),radial-gradient(ellipse 50% 60% at 80% 40%,rgba(0,196,140,0.06) 0%,transparent 55%)}
    .app-banner-grid{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,215,0,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,215,0,0.02) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 80% 70% at 50% 50%,black 20%,transparent)}
    .app-banner-inner{position:relative;z-index:2;max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
    @media(max-width:800px){.app-banner-inner{grid-template-columns:1fr;text-align:center;gap:36px}.app-banner-phones{justify-content:center}}
    .app-banner-tag{display:inline-flex;align-items:center;gap:8px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:100px;padding:7px 18px;font-size:10.5px;font-weight:800;letter-spacing:2px;color:var(--gold);text-transform:uppercase;margin-bottom:20px;animation:banner-pulse 3s ease-in-out infinite}
    @keyframes banner-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,215,0,0.15)}50%{box-shadow:0 0 20px 4px rgba(255,215,0,0.12)}}
    .app-banner-tag .coming-dot{width:8px;height:8px;border-radius:50%;background:var(--gold);animation:glow-pulse 1.8s infinite}
    .app-banner-title{font-size:clamp(30px,4.5vw,48px);font-weight:900;letter-spacing:-1.5px;line-height:1.08;margin-bottom:16px}
    .app-banner-title .gold{color:var(--gold)}
    .app-banner-sub{font-size:15.5px;color:var(--text2);line-height:1.75;margin-bottom:28px;max-width:480px}
    @media(max-width:800px){.app-banner-sub{margin:0 auto 28px}}
    .app-banner-stores{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px}
    @media(max-width:800px){.app-banner-stores{justify-content:center}}
    .app-store-card{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,215,0,0.18);border-radius:18px;padding:16px 24px;min-width:200px;transition:border-color 0.25s,transform 0.2s,box-shadow 0.25s;cursor:default}
    .app-store-card:hover{border-color:rgba(255,215,0,0.4);transform:translateY(-3px);box-shadow:0 12px 40px rgba(255,215,0,0.1)}
    .app-store-card svg{flex-shrink:0}
    .app-store-card-text small{display:block;font-size:9px;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:2px}
    .app-store-card-text strong{display:block;font-size:16px;font-weight:800;color:var(--text);letter-spacing:-0.3px}
    .app-banner-features{display:flex;gap:24px;flex-wrap:wrap}
    @media(max-width:800px){.app-banner-features{justify-content:center}}
    .app-banner-feat{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text2);font-weight:600}
    .app-banner-feat-dot{width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0}
    .app-banner-phones{display:flex;gap:20px;justify-content:center;position:relative}
    .app-banner-phone-glow{position:absolute;width:400px;height:400px;background:radial-gradient(circle,rgba(255,215,0,0.1),transparent 65%);border-radius:50%;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none}
    .app-banner-phone{width:180px;background:var(--surface);border:1.5px solid var(--border);border-radius:32px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,0.6),0 0 0 1px rgba(255,215,0,0.08);position:relative;z-index:1;transition:transform 0.4s ease}
    .app-banner-phone:hover{transform:translateY(-8px)}
    .app-banner-phone.phone-2{margin-top:40px}
    .abp-notch{height:9px;background:var(--surface2);display:flex;align-items:center;justify-content:center}
    .abp-notch-bar{width:48px;height:3.5px;background:var(--border);border-radius:2px}
    .abp-screen{background:var(--bg);padding:14px 10px}
    .abp-topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .abp-brand{font-size:8px;font-weight:800;letter-spacing:1px;color:var(--gold)}
    .abp-live{display:flex;align-items:center;gap:3px;font-size:7px;font-weight:700;color:var(--green);letter-spacing:0.5px}
    .abp-live-dot{width:4px;height:4px;border-radius:50%;background:var(--green);animation:glow-pulse 1.8s infinite}
    .abp-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px}
    .abp-card-title{font-size:8px;color:var(--text3);margin-bottom:4px;letter-spacing:0.5px}
    .abp-card-val{font-size:18px;font-weight:900;color:var(--text)}
    .abp-card-change{font-size:8px;color:var(--green);font-weight:700;margin-top:2px}
    .abp-holdings{display:flex;flex-direction:column;gap:5px}
    .abp-holding{display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:7px 9px}
    .abp-h-name{font-size:7.5px;font-weight:700;color:var(--text)}
    .abp-h-sub{font-size:6.5px;color:var(--text3)}
    .abp-h-val{font-size:7.5px;font-weight:700;color:var(--gold);text-align:right}
    .abp-h-ret{font-size:6.5px;color:var(--green);text-align:right}
    .abp-tabs{display:flex;justify-content:space-around;background:var(--surface);border-top:1px solid var(--border);padding:8px 4px}
    .abp-tab{text-align:center;font-size:6px;color:var(--text3)}
    .abp-tab.active{color:var(--gold)}
    .abp-tab-ico{font-size:10px;margin-bottom:1px}
    .abp-chart-mini{display:flex;align-items:flex-end;gap:2px;height:32px;margin-bottom:8px}
    .abp-chart-bar{flex:1;border-radius:2px 2px 0 0;background:rgba(255,215,0,0.1);border-top:1.5px solid var(--gold)}
    .app-banner-countdown{display:inline-flex;align-items:center;gap:8px;background:rgba(0,196,140,0.08);border:1px solid rgba(0,196,140,0.2);border-radius:100px;padding:8px 18px;font-size:12px;font-weight:700;color:var(--green);margin-top:20px}
    .app-banner-countdown svg{flex-shrink:0}
  `;

  const bannerHTML = `
<!-- APP COMING SOON BANNER -->
<section class="app-banner-section" id="app-coming-soon">
  <div class="app-banner-glow"></div>
  <div class="app-banner-grid"></div>
  <div class="app-banner-inner">
    <div class="reveal">
      <div class="app-banner-tag"><div class="coming-dot"></div>Coming Soon &nbsp;&middot;&nbsp; 2026</div>
      <h2 class="app-banner-title">Invest Anywhere.<br><span class="gold">IVX Mobile Apps.</span></h2>
      <p class="app-banner-sub">Trade tokenized real estate shares, track your portfolio, earn dividends &mdash; all from your phone. Our native iOS and Android apps are launching soon.</p>
      <div class="app-banner-stores">
        <div class="app-store-card">
          <svg width="30" height="30" viewBox="0 0 28 28" fill="none"><path d="M19.11 14.85c-.03-3.11 2.54-4.62 2.66-4.69-1.45-2.12-3.7-2.41-4.5-2.44-1.91-.19-3.74 1.13-4.71 1.13-.98 0-2.48-1.1-4.09-1.07-2.1.03-4.05 1.22-5.12 3.09-2.19 3.8-.56 9.42 1.57 12.5 1.04 1.51 2.28 3.2 3.91 3.14 1.57-.06 2.16-1.02 4.07-1.02 1.89 0 2.44 1.02 4.1.98 1.69-.03 2.76-1.54 3.79-3.06a13.1 13.1 0 0 0 1.73-3.54c-.04-.02-3.38-1.3-3.41-5.02Z" fill="white"/><path d="M16.1 5.76c.86-1.05 1.44-2.5 1.28-3.96-1.24.05-2.75.83-3.63 1.87-.8.92-1.5 2.4-1.31 3.82 1.38.11 2.79-.71 3.66-1.73Z" fill="white"/></svg>
          <div class="app-store-card-text"><small>Coming Soon on</small><strong>App Store</strong></div>
        </div>
        <div class="app-store-card">
          <svg width="30" height="30" viewBox="0 0 28 28" fill="none"><path d="M4.5 3.27c0-.71.4-1.33.99-1.65L15.96 14 4.5 25.38a1.87 1.87 0 0 1-.99-1.65V3.27Z" fill="#EA4335"/><path d="M20.36 9.14 6.16 1.07A2 2 0 0 0 4.5 1.62L15.96 14l4.4-4.86Z" fill="#FBBC04"/><path d="M20.36 18.86 15.96 14 4.5 26.38a2 2 0 0 0 1.66.55l14.2-8.07Z" fill="#34A853"/><path d="M23.5 14c0 .84-.45 1.58-1.13 1.98l-2.01 1.14L15.96 14l4.4-4.86 1.99 1.12A2.29 2.29 0 0 1 23.5 14Z" fill="#4285F4"/></svg>
          <div class="app-store-card-text"><small>Coming Soon on</small><strong>Google Play</strong></div>
        </div>
      </div>
      <div class="app-banner-features">
        <div class="app-banner-feat"><div class="app-banner-feat-dot"></div>24/7 Trading</div>
        <div class="app-banner-feat"><div class="app-banner-feat-dot"></div>Live Portfolio</div>
        <div class="app-banner-feat"><div class="app-banner-feat-dot"></div>Instant Dividends</div>
        <div class="app-banner-feat"><div class="app-banner-feat-dot"></div>Push Alerts</div>
      </div>
      <div class="app-banner-countdown">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Join the waitlist &mdash; be first to download
      </div>
    </div>
    <div class="app-banner-phones reveal">
      <div class="app-banner-phone-glow"></div>
      <div class="app-banner-phone phone-1">
        <div class="abp-notch"><div class="abp-notch-bar"></div></div>
        <div class="abp-screen">
          <div class="abp-topbar"><span class="abp-brand">IVXHOLDINGS</span><div class="abp-live"><div class="abp-live-dot"></div>LIVE</div></div>
          <div class="abp-card"><div class="abp-card-title">PORTFOLIO VALUE</div><div class="abp-card-val">$24,850</div><div class="abp-card-change">&#9650; +$412.50 (+1.69%)</div></div>
          <div class="abp-chart-mini"><div class="abp-chart-bar" style="height:35%"></div><div class="abp-chart-bar" style="height:50%"></div><div class="abp-chart-bar" style="height:42%"></div><div class="abp-chart-bar" style="height:65%"></div><div class="abp-chart-bar" style="height:55%"></div><div class="abp-chart-bar" style="height:75%"></div><div class="abp-chart-bar" style="height:60%"></div><div class="abp-chart-bar" style="height:85%"></div><div class="abp-chart-bar" style="height:100%;background:rgba(255,215,0,0.22);border-top-color:#FFE44D;"></div></div>
          <div class="abp-holdings"><div class="abp-holding"><div><div class="abp-h-name">Casa Rosario</div><div class="abp-h-sub">Pembroke Pines, FL</div></div><div><div class="abp-h-val">$12,400</div><div class="abp-h-ret">&#9650; +30%</div></div></div><div class="abp-holding"><div><div class="abp-h-name">JV Direct Partner</div><div class="abp-h-sub">Equity Stake</div></div><div><div class="abp-h-val">$8,200</div><div class="abp-h-ret">Quarterly</div></div></div><div class="abp-holding"><div><div class="abp-h-name">Token Shares</div><div class="abp-h-sub">From $50</div></div><div><div class="abp-h-val">$4,250</div><div class="abp-h-ret">24/7</div></div></div></div>
        </div>
        <div class="abp-tabs"><div class="abp-tab active"><div class="abp-tab-ico">&#127968;</div>Home</div><div class="abp-tab"><div class="abp-tab-ico">&#128202;</div>Portfolio</div><div class="abp-tab"><div class="abp-tab-ico">&#127963;&#65039;</div>Market</div><div class="abp-tab"><div class="abp-tab-ico">&#128172;</div>Chat</div></div>
      </div>
      <div class="app-banner-phone phone-2">
        <div class="abp-notch"><div class="abp-notch-bar"></div></div>
        <div class="abp-screen">
          <div class="abp-topbar"><span class="abp-brand">MARKET</span><div class="abp-live"><div class="abp-live-dot"></div>LIVE</div></div>
          <div class="abp-card" style="border-color:rgba(255,215,0,0.15);"><div class="abp-card-title">&#128293; TRENDING DEAL</div><div style="font-size:11px;font-weight:800;margin-bottom:3px;">CASA ROSARIO</div><div style="font-size:7.5px;color:var(--text3);margin-bottom:6px;">Pembroke Pines, FL &middot; Dev JV</div><div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:13px;font-weight:900;color:var(--gold);">$1.4M</div><div style="font-size:10px;font-weight:800;color:var(--green);">+30% ROI</div></div></div>
          <div class="abp-card"><div class="abp-card-title">&#128176; DIVIDENDS</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;"><div style="font-size:14px;font-weight:900;color:var(--green);">$1,240</div><div style="font-size:8px;color:var(--text3);">This Quarter</div></div></div>
          <div class="abp-card"><div class="abp-card-title">&#128200; PERFORMANCE</div><div style="display:flex;gap:8px;margin-top:4px;"><div style="flex:1;text-align:center;"><div style="font-size:12px;font-weight:900;color:var(--gold);">14.5%</div><div style="font-size:6.5px;color:var(--text3);">Annual</div></div><div style="width:1px;background:var(--border);"></div><div style="flex:1;text-align:center;"><div style="font-size:12px;font-weight:900;color:var(--green);">$2.1B</div><div style="font-size:6.5px;color:var(--text3);">AUM</div></div></div></div>
        </div>
        <div class="abp-tabs"><div class="abp-tab"><div class="abp-tab-ico">&#127968;</div>Home</div><div class="abp-tab"><div class="abp-tab-ico">&#128202;</div>Portfolio</div><div class="abp-tab active"><div class="abp-tab-ico">&#127963;&#65039;</div>Market</div><div class="abp-tab"><div class="abp-tab-ico">&#128172;</div>Chat</div></div>
      </div>
    </div>
  </div>
</section>
`;

  let result = html;

  const cssInsertPoint = result.indexOf('/* \u2500\u2500\u2500 REVEAL');
  if (cssInsertPoint === -1) {
    const styleClose = result.lastIndexOf('</style>');
    if (styleClose !== -1) {
      result = result.substring(0, styleClose) + bannerCSS + '\n  ' + result.substring(styleClose);
      console.log('[LandingDeploy] Banner CSS injected before </style>');
    }
  } else {
    result = result.substring(0, cssInsertPoint) + bannerCSS + '\n    ' + result.substring(cssInsertPoint);
    console.log('[LandingDeploy] Banner CSS injected before REVEAL section');
  }

  const waitlistMarker = result.indexOf('<!-- WAITLIST -->');
  if (waitlistMarker !== -1) {
    result = result.substring(0, waitlistMarker) + bannerHTML + '\n' + result.substring(waitlistMarker);
    console.log('[LandingDeploy] Banner HTML injected before WAITLIST section');
  } else {
    const ctaMarker = result.indexOf('<!-- CTA -->');
    if (ctaMarker !== -1) {
      result = result.substring(0, ctaMarker) + bannerHTML + '\n' + result.substring(ctaMarker);
      console.log('[LandingDeploy] Banner HTML injected before CTA section');
    } else {
      console.log('[LandingDeploy] Could not find injection point for banner HTML');
    }
  }

  return result;
}

function injectCredentials(html: string, supabaseUrl: string, supabaseAnonKey: string, apiBaseUrl: string, appUrl: string): string {
  const backendUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || apiBaseUrl || '').trim().replace(/\/$/, '');
  let result = injectAppBanner(html);
  result = result.replace(/__IVX_SUPABASE_URL__/g, supabaseUrl);
  result = result.replace(/__IVX_SUPABASE_ANON_KEY__/g, supabaseAnonKey);
  result = result.replace(/__IVX_API_BASE_URL__/g, apiBaseUrl);
  result = result.replace(/__IVX_APP_URL__/g, appUrl);
  result = result.replace(/__IVX_BACKEND_URL__/g, backendUrl);

  const metaUrlMatch = result.match(/<meta\s+name="ivx-sb-url"\s+content="[^"]*"/);
  if (metaUrlMatch) {
    result = result.replace(metaUrlMatch[0], `<meta name="ivx-sb-url" content="${supabaseUrl}"`);
  }
  const metaKeyMatch = result.match(/<meta\s+name="ivx-sb-key"\s+content="[^"]*"/);
  if (metaKeyMatch) {
    result = result.replace(metaKeyMatch[0], `<meta name="ivx-sb-key" content="${supabaseAnonKey}"`);
  }
  const metaUrlFallback = result.match(/<meta\s+name="ivx-sb-url-fallback"\s+content="[^"]*"/);
  if (metaUrlFallback) {
    result = result.replace(metaUrlFallback[0], `<meta name="ivx-sb-url-fallback" content="${supabaseUrl}"`);
  }
  const metaKeyFallback = result.match(/<meta\s+name="ivx-sb-key-fallback"\s+content="[^"]*"/);
  if (metaKeyFallback) {
    result = result.replace(metaKeyFallback[0], `<meta name="ivx-sb-key-fallback" content="${supabaseAnonKey}"`);
  }
  const metaApiUrl = result.match(/<meta\s+name="ivx-api-url"\s+content="[^"]*"/);
  if (metaApiUrl) {
    result = result.replace(metaApiUrl[0], `<meta name="ivx-api-url" content="${apiBaseUrl}"`);
  }
  const metaBackendUrl = result.match(/<meta\s+name="ivx-backend-url"\s+content="[^"]*"/);
  if (metaBackendUrl) {
    result = result.replace(metaBackendUrl[0], `<meta name="ivx-backend-url" content="${backendUrl}"`);
  }

  const fallbackUrlPattern = /var _FALLBACK_SUPABASE_URL = '[^']*';/;
  if (fallbackUrlPattern.test(result)) {
    result = result.replace(fallbackUrlPattern, `var _FALLBACK_SUPABASE_URL = '${supabaseUrl}';`);
  }
  const fallbackKeyPattern = /var _FALLBACK_SUPABASE_KEY = '[^']*';/;
  if (fallbackKeyPattern.test(result)) {
    result = result.replace(fallbackKeyPattern, `var _FALLBACK_SUPABASE_KEY = '${supabaseAnonKey}';`);
  }
  const rorkApiPattern = /var _RORK_API_URL = '[^']*';/;
  if (rorkApiPattern.test(result)) {
    result = result.replace(rorkApiPattern, `var _RORK_API_URL = '${apiBaseUrl}';`);
  }
  const rorkBackendPattern = /var _RORK_BACKEND_URL = '[^']*';/;
  if (rorkBackendPattern.test(result)) {
    result = result.replace(rorkBackendPattern, `var _RORK_BACKEND_URL = '${backendUrl}';`);
  }

  console.log('[LandingDeploy] Credentials injected into HTML');
  console.log('[LandingDeploy] Supabase URL:', supabaseUrl.substring(0, 40) + '...');
  console.log('[LandingDeploy] API Base URL:', apiBaseUrl);
  console.log('[LandingDeploy] Has placeholders remaining:', result.includes('__IVX_'));
  return result;
}

export async function deployLandingPage(): Promise<DeployResult> {
  const timestamp = new Date().toISOString();
  const errors: string[] = [];
  const filesUploaded: string[] = [];

  if (Platform.OS !== 'web') {
    console.log('[LandingDeploy] Native platform detected — triggering deploy via backend API...');
    return deployViaBackendApi(timestamp);
  }

  const aws = getAwsCredentials();
  if (!aws.configured) {
    console.log('[LandingDeploy] AWS credentials not configured');
    return { success: false, filesUploaded: [], errors: ['AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) not configured. Add them in project settings.'], timestamp };
  }

  const sb = getSupabaseCredentials();
  if (!sb.configured) {
    console.log('[LandingDeploy] Supabase credentials not configured');
    return { success: false, filesUploaded: [], errors: ['Supabase credentials not configured'], timestamp };
  }

  const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || 'https://ivxholding.com').trim().replace(/\/$/, '');
  const appUrl = (process.env.EXPO_PUBLIC_APP_URL || process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');
  const bucket = 'ivxholding.com';

  console.log('[LandingDeploy] 🚀 Starting landing page deploy...');
  console.log('[LandingDeploy] AWS Region:', aws.region);
  console.log('[LandingDeploy] Bucket:', bucket);
  console.log('[LandingDeploy] Supabase URL:', sb.url.substring(0, 40));

  const backendUrlForConfig = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || apiBaseUrl || '').trim().replace(/\/$/, '');
  const configJson = JSON.stringify({
    supabaseUrl: sb.url,
    supabaseAnonKey: sb.anonKey,
    apiBaseUrl,
    appUrl,
    backendUrl: backendUrlForConfig,
    deployedAt: timestamp,
  }, null, 2);

  const configResult = await s3PutObject({
    bucket,
    key: 'ivx-config.json',
    body: configJson,
    contentType: 'application/json',
    cacheControl: 'no-cache, no-store, must-revalidate',
    accessKeyId: aws.accessKeyId,
    secretAccessKey: aws.secretAccessKey,
    region: aws.region,
  });

  if (configResult.success) {
    filesUploaded.push('ivx-config.json');
    console.log('[LandingDeploy] ✅ ivx-config.json deployed');
  } else {
    errors.push(`ivx-config.json: ${configResult.error}`);
    console.log('[LandingDeploy] ❌ ivx-config.json deploy failed:', configResult.error);
  }

  const currentHtml = await fetchCurrentLandingHtml();
  if (currentHtml) {
    const updatedHtml = injectCredentials(currentHtml, sb.url, sb.anonKey, apiBaseUrl, appUrl);

    if (!updatedHtml.includes('__IVX_')) {
      const htmlResult = await s3PutObject({
        bucket,
        key: 'index.html',
        body: updatedHtml,
        contentType: 'text/html; charset=utf-8',
        cacheControl: 'no-cache, no-store, must-revalidate',
        accessKeyId: aws.accessKeyId,
        secretAccessKey: aws.secretAccessKey,
        region: aws.region,
      });

      if (htmlResult.success) {
        filesUploaded.push('index.html');
        console.log('[LandingDeploy] ✅ index.html deployed with real credentials');
      } else {
        errors.push(`index.html: ${htmlResult.error}`);
        console.log('[LandingDeploy] ❌ index.html deploy failed:', htmlResult.error);
      }
    } else {
      console.log('[LandingDeploy] ⚠️ HTML still has placeholders — skipping upload');
      errors.push('HTML still contains __IVX_ placeholders after injection');
    }
  } else {
    console.log('[LandingDeploy] ⚠️ Could not fetch current HTML — only config deployed');
    errors.push('Could not fetch current landing HTML from ivxholding.com');
  }

  const success = filesUploaded.length > 0;
  console.log('[LandingDeploy] Deploy complete:', success ? '✅' : '❌', '| files:', filesUploaded.join(', '), '| errors:', errors.length);

  return { success, filesUploaded, errors, timestamp };
}

export async function deployConfigOnly(): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS !== 'web') {
    console.log('[LandingDeploy] Native platform — deploying config via backend API...');
    return deployConfigViaBackendApi();
  }

  const aws = getAwsCredentials();
  if (!aws.configured) {
    return { success: false, error: 'AWS credentials not configured' };
  }

  const sb = getSupabaseCredentials();
  if (!sb.configured) {
    return { success: false, error: 'Supabase credentials not configured' };
  }

  const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || 'https://ivxholding.com').trim().replace(/\/$/, '');
  const appUrl = (process.env.EXPO_PUBLIC_APP_URL || process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');

  const backendUrlForConfigOnly = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || apiBaseUrl || '').trim().replace(/\/$/, '');
  const configJson = JSON.stringify({
    supabaseUrl: sb.url,
    supabaseAnonKey: sb.anonKey,
    apiBaseUrl,
    appUrl,
    backendUrl: backendUrlForConfigOnly,
    deployedAt: new Date().toISOString(),
  }, null, 2);

  const bucket = 'ivxholding.com';
  const configResult = await s3PutObject({
    bucket,
    key: 'ivx-config.json',
    body: configJson,
    contentType: 'application/json',
    cacheControl: 'no-cache, no-store, must-revalidate',
    accessKeyId: aws.accessKeyId,
    secretAccessKey: aws.secretAccessKey,
    region: aws.region,
  });

  if (configResult.success) {
    console.log('[LandingDeploy] ivx-config.json deployed to S3 — now deploying full HTML with injected credentials...');
    try {
      const currentHtml = await fetchCurrentLandingHtml();
      if (currentHtml && currentHtml.includes('__IVX_')) {
        const updatedHtml = injectCredentials(currentHtml, sb.url, sb.anonKey, apiBaseUrl, appUrl);
        if (!updatedHtml.includes('__IVX_')) {
          const htmlResult = await s3PutObject({
            bucket,
            key: 'index.html',
            body: updatedHtml,
            contentType: 'text/html; charset=utf-8',
            cacheControl: 'no-cache, no-store, must-revalidate',
            accessKeyId: aws.accessKeyId,
            secretAccessKey: aws.secretAccessKey,
            region: aws.region,
          });
          if (htmlResult.success) {
            console.log('[LandingDeploy] index.html also deployed with real credentials');
          } else {
            console.log('[LandingDeploy] index.html deploy failed (non-critical):', htmlResult.error);
          }
        }
      } else {
        console.log('[LandingDeploy] HTML already has credentials or fetch failed — config-only deploy OK');
      }
    } catch (htmlErr) {
      console.log('[LandingDeploy] HTML deploy skipped (non-critical):', (htmlErr as Error)?.message);
    }
  }

  return { success: configResult.success, error: configResult.error };
}

export function getDeployStatus(): { awsConfigured: boolean; supabaseConfigured: boolean; canDeploy: boolean } {
  const aws = getAwsCredentials();
  const sb = getSupabaseCredentials();
  const backendUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim();
  const canDeployViaBackend = !!(sb.configured && backendUrl);
  return {
    awsConfigured: aws.configured,
    supabaseConfigured: sb.configured,
    canDeploy: (aws.configured && sb.configured) || canDeployViaBackend,
  };
}

async function deployViaBackendApi(timestamp: string): Promise<DeployResult> {
  const backendUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (!backendUrl) {
    return { success: false, filesUploaded: [], errors: ['No backend URL configured (EXPO_PUBLIC_RORK_API_BASE_URL)'], timestamp };
  }

  try {
    console.log('[LandingDeploy] Calling backend deploy endpoint:', backendUrl + '/api/deploy-landing');
    const response = await fetch(backendUrl + '/api/deploy-landing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log('[LandingDeploy] Backend deploy failed:', response.status, errText.substring(0, 300));
      return { success: false, filesUploaded: [], errors: [`Backend deploy failed: HTTP ${response.status}`], timestamp };
    }

    const result = await response.json();
    console.log('[LandingDeploy] Backend deploy result:', JSON.stringify(result).substring(0, 500));
    return {
      success: result.success ?? false,
      filesUploaded: result.filesUploaded ?? [],
      errors: result.errors ?? [],
      timestamp,
    };
  } catch (err) {
    console.log('[LandingDeploy] Backend deploy exception:', (err as Error)?.message);
    return { success: false, filesUploaded: [], errors: [(err as Error)?.message || 'Backend deploy failed'], timestamp };
  }
}

async function deployConfigViaBackendApi(): Promise<{ success: boolean; error?: string }> {
  const backendUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (!backendUrl) {
    return { success: false, error: 'No backend URL configured' };
  }

  try {
    const response = await fetch(backendUrl + '/api/deploy-landing?configOnly=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configOnly: true }),
    });

    if (!response.ok) {
      return { success: false, error: `Backend config deploy failed: HTTP ${response.status}` };
    }

    const result = await response.json();
    return { success: result.success ?? false, error: result.error };
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'Backend config deploy failed' };
  }
}
