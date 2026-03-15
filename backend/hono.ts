import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";

const EDGE_FUNCTION_URL = 'https://kvclcdjmjghndxsngfzb.supabase.co/functions/v1/runtime-deals';
const SUPABASE_PROJECT_ID = 'kvclcdjmjghndxsngfzb';

let _readLocalFile: ((path: string) => string) | null = null;
try {
  const fs = require('fs');
  _readLocalFile = (p: string) => fs.readFileSync(p, 'utf-8');
} catch {}

function getSupabaseCredentials(): { url: string; key: string; isValid: boolean } {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const isValid = !!(url && url.length > 10 && key && key.length > 10);
  return { url, key, isValid };
}

const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "apikey"],
  maxAge: 86400,
}));

app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  }),
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "IVX Holdings API is running" });
});

app.get("/landing-config", (c) => {
  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseCredentials();
  const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "").trim().replace(/\/$/, "");

  console.log('[API] landing-config served | URL:', !!supabaseUrl, '| Key:', !!supabaseAnonKey, '| API:', apiBaseUrl || 'not set');

  return c.json({
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl,
    appUrl: apiBaseUrl,
    backendUrl: apiBaseUrl,
    projectId: SUPABASE_PROJECT_ID,
    servedAt: new Date().toISOString(),
  });
});

const FALLBACK_DEALS = [
  {
    id: "casa-rosario-001",
    title: "CASA ROSARIO",
    projectName: "ONE STOP DEVELOPMENT TWO LLC",
    project_name: "ONE STOP DEVELOPMENT TWO LLC",
    type: "development",
    description: "Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for investment with 30% expected ROI. Located in the highly desirable Pembroke Pines area of South Florida.",
    propertyAddress: "20231 Sw 51st Ct, Pembroke Pines, FL 33332",
    property_address: "20231 Sw 51st Ct, Pembroke Pines, FL 33332",
    totalInvestment: 1400000,
    total_investment: 1400000,
    expectedROI: 30,
    expected_roi: 30,
    distributionFrequency: "Quarterly",
    distribution_frequency: "Quarterly",
    exitStrategy: "Sale upon completion",
    exit_strategy: "Sale upon completion",
    status: "active",
    published: true,
    publishedAt: "2026-03-15T00:00:00.000Z",
    published_at: "2026-03-15T00:00:00.000Z",
    photos: [
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80",
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80",
      "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800&q=80",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80"
    ],
    partners: [{"name": "ONE STOP DEVELOPMENT TWO LLC", "role": "Developer", "share": 70}],
    created_at: "2026-03-15T00:00:00.000Z",
    updated_at: new Date().toISOString(),
  }
];

app.get("/landing-deals", async (c) => {
  const { url: supabaseUrl, key: supabaseAnonKey, isValid } = getSupabaseCredentials();
  const startTime = Date.now();

  console.log("[API] landing-deals request received");
  console.log("[API] Supabase URL configured:", !!supabaseUrl, '| Key configured:', !!supabaseAnonKey, '| Valid:', isValid);

  if (!isValid) {
    console.log('[API] landing-deals: Supabase not configured — serving fallback immediately');
    return c.json({ deals: FALLBACK_DEALS, source: "fallback_no_credentials", servedAt: new Date().toISOString() });
  }

  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json",
  };

  function mapSupabaseRow(row: Record<string, unknown>): Record<string, unknown> {
    const mapped = { ...row };
    if (!mapped.title && mapped.name) mapped.title = mapped.name;
    if (!mapped.projectName && !mapped.project_name && mapped.name) mapped.projectName = typeof mapped.name === 'string' ? mapped.name : '';
    if (!mapped.totalInvestment && !mapped.total_investment && mapped.amount) {
      mapped.totalInvestment = Number(mapped.amount);
      mapped.total_investment = Number(mapped.amount);
    }
    if (mapped.is_published !== undefined && mapped.published === undefined) {
      mapped.published = mapped.is_published;
    }
    if (!mapped.status) mapped.status = mapped.is_published ? 'active' : 'draft';
    if (typeof mapped.photos === 'string') {
      try { mapped.photos = JSON.parse(mapped.photos as string); } catch { mapped.photos = []; }
    }
    if (!Array.isArray(mapped.photos)) mapped.photos = [];
    if (typeof mapped.partners === 'string') {
      try { mapped.partners = JSON.parse(mapped.partners as string); } catch { mapped.partners = []; }
    }
    return mapped;
  }

  const queries = [
    `${supabaseUrl}/rest/v1/jv_deals?select=*&published=eq.true&status=eq.active&order=created_at.desc.nullslast`,
    `${supabaseUrl}/rest/v1/jv_deals?select=*&is_published=eq.true&order=created_at.desc.nullslast`,
    `${supabaseUrl}/rest/v1/jv_deals?select=*&published=eq.true&order=created_at.desc.nullslast`,
    `${supabaseUrl}/rest/v1/jv_deals?select=*&status=eq.active&order=created_at.desc.nullslast`,
    `${supabaseUrl}/rest/v1/jv_deals?select=*&order=created_at.desc.nullslast`,
  ];

  for (let i = 0; i < queries.length; i++) {
    try {
      console.log(`[API] landing-deals trying Supabase REST query #${i + 1}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(queries[i], { headers, signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.log(`[API] landing-deals query #${i + 1} failed: HTTP ${response.status}`, body.substring(0, 200));
        continue;
      }
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const mapped = data.map((row: Record<string, unknown>) => mapSupabaseRow(row));
        console.log(`[API] landing-deals query #${i + 1} returned ${mapped.length} deals in ${Date.now() - startTime}ms ✓`);
        return c.json({ deals: mapped, source: 'supabase_rest', queryUsed: i + 1, servedAt: new Date().toISOString() });
      }
      console.log(`[API] landing-deals query #${i + 1} returned 0 deals, trying next...`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.log(`[API] landing-deals query #${i + 1} error:`, message);
    }
  }

  try {
    console.log('[API] landing-deals: All direct queries exhausted — trying Edge Function...');
    const efUrl = EDGE_FUNCTION_URL + '?owner=' + encodeURIComponent('Ivan Perez');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const efRes = await fetch(efUrl, {
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (efRes.ok) {
      const efData = await efRes.json() as { deals?: unknown[] };
      if (Array.isArray(efData?.deals) && efData.deals.length > 0) {
        console.log(`[API] landing-deals: Edge Function returned ${efData.deals.length} deals in ${Date.now() - startTime}ms`);
        return c.json({ deals: efData.deals, source: 'edge_function', servedAt: new Date().toISOString() });
      }
    }
  } catch (err: unknown) {
    console.log('[API] landing-deals: Edge Function error:', (err as Error)?.message);
  }

  console.log(`[API] landing-deals: all sources exhausted in ${Date.now() - startTime}ms, serving fallback`);
  return c.json({ deals: FALLBACK_DEALS, source: "fallback", servedAt: new Date().toISOString() });
});

app.get("/landing-page", async (c) => {
  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseCredentials();
  const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "").trim().replace(/\/$/, "");

  console.log('[API] landing-page: Serving HTML with runtime credentials');

  let html = '';
  if (_readLocalFile) {
    const localPaths = [
      './ivxholding-landing/index.html',
      '../ivxholding-landing/index.html',
      'ivxholding-landing/index.html',
    ];
    for (const p of localPaths) {
      try {
        const content = _readLocalFile(p);
        if (content && content.includes('IVX Holdings')) {
          html = content;
          console.log('[API] landing-page: Loaded HTML from', p);
          break;
        }
      } catch {}
    }
  }

  if (!html) {
    try {
      console.log('[API] landing-page: Fetching HTML from ivxholding.com...');
      const res = await fetch('https://ivxholding.com', { headers: { Accept: 'text/html' } });
      if (res.ok) html = await res.text();
    } catch (err: unknown) {
      console.log('[API] landing-page: Fetch error:', (err as Error)?.message);
    }
  }

  if (!html || !html.includes('IVX Holdings')) {
    return c.text('Landing page HTML not available', 404);
  }

  html = html.replace(/__IVX_SUPABASE_URL__/g, supabaseUrl);
  html = html.replace(/__IVX_SUPABASE_ANON_KEY__/g, supabaseAnonKey);
  html = html.replace(/__IVX_API_BASE_URL__/g, apiBaseUrl);
  html = html.replace(/__IVX_APP_URL__/g, apiBaseUrl);
  html = html.replace(/__IVX_BACKEND_URL__/g, apiBaseUrl);

  const metaReplacements: [string, string][] = [
    ['ivx-sb-url', supabaseUrl],
    ['ivx-sb-key', supabaseAnonKey],
    ['ivx-sb-url-fallback', supabaseUrl],
    ['ivx-sb-key-fallback', supabaseAnonKey],
    ['ivx-api-url', apiBaseUrl],
    ['ivx-backend-url', apiBaseUrl],
  ];
  for (const [name, value] of metaReplacements) {
    const pattern = new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"`);
    const match = html.match(pattern);
    if (match) html = html.replace(match[0], `<meta name="${name}" content="${value}"`);
  }

  const jsVarReplacements: [RegExp, string][] = [
    [/var _FALLBACK_SUPABASE_URL = '[^']*';/, `var _FALLBACK_SUPABASE_URL = '${supabaseUrl}';`],
    [/var _FALLBACK_SUPABASE_KEY = '[^']*';/, `var _FALLBACK_SUPABASE_KEY = '${supabaseAnonKey}';`],
    [/var _RORK_API_URL = '[^']*';/, `var _RORK_API_URL = '${apiBaseUrl}';`],
    [/var _RORK_BACKEND_URL = '[^']*';/, `var _RORK_BACKEND_URL = '${apiBaseUrl}';`],
  ];
  for (const [pattern, replacement] of jsVarReplacements) {
    if (pattern.test(html)) html = html.replace(pattern, replacement);
  }

  console.log('[API] landing-page: Served with credentials injected (' + html.length + ' bytes)');

  return c.html(html);
});

app.post("/deploy-landing", async (c) => {
  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseCredentials();
  const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "").trim().replace(/\/$/, "");
  const awsAccessKey = (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const awsSecretKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  const awsRegion = (process.env.AWS_REGION || "us-east-1").trim();

  console.log("[API] deploy-landing request received");
  console.log("[API] Supabase configured:", !!(supabaseUrl && supabaseAnonKey));
  console.log("[API] AWS configured:", !!(awsAccessKey && awsSecretKey));

  if (!supabaseUrl || !supabaseAnonKey) {
    return c.json({ success: false, errors: ["Supabase credentials not configured"], filesUploaded: [] }, 500);
  }

  const configJson = JSON.stringify({
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl,
    appUrl: apiBaseUrl,
    backendUrl: apiBaseUrl,
    deployedAt: new Date().toISOString(),
  }, null, 2);

  const filesUploaded: string[] = [];
  const errors: string[] = [];

  const s3Put = async (key: string, body: string, contentType: string, bucket: string, host: string, awsAccessKeyId: string, awsSecretAccessKeyVal: string, region: string): Promise<boolean> => {
      const encoder = new TextEncoder();
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").substring(0, 15) + "Z"; // eslint-disable-line no-useless-escape
      const dateStamp = amzDate.substring(0, 8);

      const payloadHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(body))))
        .map(b => b.toString(16).padStart(2, "0")).join("");

      const canonicalHeaders = [
        `cache-control:no-cache, no-store, must-revalidate`,
        `content-type:${contentType}`,
        `host:${host}`,
        `x-amz-content-sha256:${payloadHash}`,
        `x-amz-date:${amzDate}`,
      ].join("\n") + "\n";
      const signedHeaders = "cache-control;content-type;host;x-amz-content-sha256;x-amz-date";
      const canonicalRequest = ["PUT", "/" + key, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

      const canonicalHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(canonicalRequest))))
        .map(b => b.toString(16).padStart(2, "0")).join("");

      const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
      const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, canonicalHash].join("\n");

      const hmac = async (k: ArrayBuffer, msg: string): Promise<ArrayBuffer> => {
        const ck = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        return crypto.subtle.sign("HMAC", ck, encoder.encode(msg));
      };

      const kDate = await hmac(encoder.encode("AWS4" + awsSecretAccessKeyVal).buffer as ArrayBuffer, dateStamp);
      const kRegion = await hmac(kDate, region);
      const kService = await hmac(kRegion, "s3");
      const kSigning = await hmac(kService, "aws4_request");
      const signature = Array.from(new Uint8Array(await hmac(kSigning, stringToSign)))
        .map(b => b.toString(16).padStart(2, "0")).join("");

      const authorization = `AWS4-HMAC-SHA256 Credential=${awsAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      try {
        const response = await fetch(`https://${host}/${key}`, {
          method: "PUT",
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": amzDate,
            "Authorization": authorization,
          },
          body,
        });
        console.log(`[API] S3 PUT ${key}: ${response.status}`);
        return response.ok || response.status === 200;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.log(`[API] S3 PUT ${key} error:`, message);
        return false;
      }
  };

  if (awsAccessKey && awsSecretKey) {
    const bucket = "ivxholding.com";
    const host = awsRegion === "us-east-1" ? `${bucket}.s3.amazonaws.com` : `${bucket}.s3.${awsRegion}.amazonaws.com`;

    /* s3Put moved outside if block for TS strict mode */
    if (await s3Put("ivx-config.json", configJson, "application/json", bucket, host, awsAccessKey, awsSecretKey, awsRegion)) {
      filesUploaded.push("ivx-config.json");
    } else {
      errors.push("Failed to upload ivx-config.json to S3");
    }

    try {
      let html = '';
      if (_readLocalFile) {
        const localPaths = [
          './ivxholding-landing/index.html',
          '../ivxholding-landing/index.html',
          'ivxholding-landing/index.html',
        ];
        for (const p of localPaths) {
          try {
            const content = _readLocalFile(p);
            if (content && content.includes('IVX Holdings')) {
              html = content;
              console.log('[API] Loaded local landing HTML from:', p, '(' + html.length + ' bytes)');
              break;
            }
          } catch {}
        }
      }
      if (!html || !html.includes('IVX Holdings')) {
        console.log("[API] Fetching current landing HTML from ivxholding.com...");
        const htmlResponse = await fetch("https://ivxholding.com", { headers: { Accept: "text/html" } });
        if (htmlResponse.ok) {
          html = await htmlResponse.text();
        }
      }
      if (html && html.includes("IVX Holdings")) {
        {
          html = html.replace(/__IVX_SUPABASE_URL__/g, supabaseUrl);
          html = html.replace(/__IVX_SUPABASE_ANON_KEY__/g, supabaseAnonKey);
          html = html.replace(/__IVX_API_BASE_URL__/g, apiBaseUrl);
          html = html.replace(/__IVX_APP_URL__/g, apiBaseUrl);
          html = html.replace(/__IVX_BACKEND_URL__/g, apiBaseUrl);

          const metaReplacements: [string, string][] = [
            ["ivx-sb-url", supabaseUrl],
            ["ivx-sb-key", supabaseAnonKey],
            ["ivx-sb-url-fallback", supabaseUrl],
            ["ivx-sb-key-fallback", supabaseAnonKey],
            ["ivx-api-url", apiBaseUrl],
            ["ivx-backend-url", apiBaseUrl],
          ];
          for (const [name, value] of metaReplacements) {
            const metaPattern = new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"`);
            const match = html.match(metaPattern);
            if (match) {
              html = html.replace(match[0], `<meta name="${name}" content="${value}"`);
            }
          }

          const jsVarReplacements: [RegExp, string][] = [
            [/var _FALLBACK_SUPABASE_URL = '[^']*';/, `var _FALLBACK_SUPABASE_URL = '${supabaseUrl}';`],
            [/var _FALLBACK_SUPABASE_KEY = '[^']*';/, `var _FALLBACK_SUPABASE_KEY = '${supabaseAnonKey}';`],
            [/var _RORK_API_URL = '[^']*';/, `var _RORK_API_URL = '${apiBaseUrl}';`],
            [/var _RORK_BACKEND_URL = '[^']*';/, `var _RORK_BACKEND_URL = '${apiBaseUrl}';`],
          ];
          for (const [pattern, replacement] of jsVarReplacements) {
            if (pattern.test(html)) {
              html = html.replace(pattern, replacement);
            }
          }

          if (!html.includes("__IVX_")) {
            if (await s3Put("index.html", html, "text/html; charset=utf-8", bucket, host, awsAccessKey, awsSecretKey, awsRegion)) {
              filesUploaded.push("index.html");
              console.log("[API] index.html deployed with real credentials (", html.length, "bytes)");
            } else {
              errors.push("Failed to upload index.html to S3");
            }
          } else {
            console.log("[API] HTML still has __IVX_ placeholders after injection — deploying anyway");
            if (await s3Put("index.html", html, "text/html; charset=utf-8", bucket, host, awsAccessKey, awsSecretKey, awsRegion)) {
              filesUploaded.push("index.html (with some placeholders)");
              console.log("[API] index.html deployed (some placeholders remain but backend fallbacks will work)");
            } else {
              errors.push("Failed to upload index.html to S3");
            }
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.log("[API] HTML deploy error:", message);
      errors.push("HTML deploy error: " + message);
    }
  } else {
    console.log("[API] AWS credentials not configured — config will be served from /landing-config only");
    errors.push("AWS credentials not configured — S3 upload skipped. Deals still served via /landing-deals and /landing-config.");
  }

  const success = filesUploaded.length > 0 || (!awsAccessKey && !!(supabaseUrl && supabaseAnonKey));
  console.log("[API] deploy-landing complete:", success ? "SUCCESS" : "PARTIAL", "| files:", filesUploaded.join(", "), "| errors:", errors.length);

  return c.json({ success, filesUploaded, errors, servedAt: new Date().toISOString() });
});

export default app;
