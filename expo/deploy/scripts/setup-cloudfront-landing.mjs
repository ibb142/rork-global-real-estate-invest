#!/usr/bin/env node

/**
 * IVX Holdings — CloudFront Distribution for Landing Page (HTTPS)
 * 
 * Creates a CloudFront distribution in front of the S3 website bucket
 * so ivxholding.com and www.ivxholding.com serve over HTTPS.
 *
 * Prerequisites:
 *   1. S3 buckets already created (run deploy-landing.mjs first)
 *   2. ACM certificate issued for *.ivxholding.com in us-east-1
 *      (run deploy/scripts/aws-full-setup.mjs to create it)
 *   3. Route53 hosted zone for ivxholding.com
 *
 * Run:
 *   node deploy/scripts/setup-cloudfront-landing.mjs
 *
 * Environment variables:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (optional, defaults us-east-1)
 */

import {
  CloudFrontClient,
  CreateDistributionCommand,
  ListDistributionsCommand,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import {
  ACMClient,
  ListCertificatesCommand,
} from "@aws-sdk/client-acm";
import {
  Route53Client,
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";

const DOMAIN = "ivxholding.com";
const WWW_DOMAIN = "www.ivxholding.com";
const S3_BUCKET = "ivxholding.com";
const REGION = (process.env.AWS_REGION || "us-east-1").trim();
const API_ORIGIN_URL = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
const API_ORIGIN_HOST = API_ORIGIN_URL ? new URL(API_ORIGIN_URL).host : "";
const CACHE_POLICY_CACHING_OPTIMIZED = "658327ea-f89d-4fab-a63d-7e88639e58f6";
const CACHE_POLICY_CACHING_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
const ORIGIN_REQUEST_POLICY_ALL_VIEWER = "216adef6-5c7f-47e4-b989-5492eafa07d3";

const creds = {
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
  },
};

const cloudfront = new CloudFrontClient({ ...creds, region: "us-east-1" });
const acm = new ACMClient({ ...creds, region: "us-east-1" });
const route53 = new Route53Client({ ...creds, region: "us-east-1" });

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const log = (msg) => console.log(`${BLUE}[INFO]${RESET} ${msg}`);
const ok = (msg) => console.log(`${GREEN}[OK]${RESET} ${msg}`);
const warn = (msg) => console.log(`${YELLOW}[WARN]${RESET} ${msg}`);
const fail = (msg) => console.log(`${RED}[ERROR]${RESET} ${msg}`);
const step = (msg) => console.log(`\n${BOLD}${BLUE}━━━ ${msg} ━━━${RESET}`);

// ─── STEP 1: Find ACM Certificate ──────────────────────────────────────────
async function findCertificate() {
  step("Step 1: Finding ACM Certificate for ivxholding.com");

  const resp = await acm.send(new ListCertificatesCommand({
    CertificateStatuses: ["ISSUED"],
  }));

  const cert = resp.CertificateSummaryList?.find(
    (c) => c.DomainName === DOMAIN || c.DomainName === `*.${DOMAIN}`
  );

  if (!cert) {
    fail("No ISSUED ACM certificate found for ivxholding.com or *.ivxholding.com");
    fail("Run: node deploy/scripts/aws-full-setup.mjs to request one first.");
    fail("Certificate must be in us-east-1 region for CloudFront.");
    process.exit(1);
  }

  ok(`Found certificate: ${cert.CertificateArn}`);
  return cert.CertificateArn;
}

// ─── STEP 2: Check for existing CloudFront distribution ─────────────────────
async function findExistingDistribution() {
  step("Step 2: Checking for existing CloudFront distribution");

  const resp = await cloudfront.send(new ListDistributionsCommand({}));
  const distributions = resp.DistributionList?.Items || [];

  for (const dist of distributions) {
    const aliases = dist.Aliases?.Items || [];
    if (aliases.includes(DOMAIN) || aliases.includes(WWW_DOMAIN)) {
      ok(`Found existing distribution: ${dist.Id} (${dist.DomainName})`);
      ok(`Status: ${dist.Status}`);
      return dist;
    }
  }

  log("No existing distribution found for ivxholding.com");
  return null;
}

// ─── STEP 3: Create CloudFront distribution ─────────────────────────────────
async function createDistribution(certArn) {
  step("Step 3: Creating CloudFront Distribution");

  const s3WebsiteOrigin = `${S3_BUCKET}.s3-website-${REGION}.amazonaws.com`;
  const orderedCacheBehaviors = API_ORIGIN_HOST
    ? {
        Quantity: 2,
        Items: [
          {
            PathPattern: "/api/*",
            TargetOriginId: "Api-Origin",
            ViewerProtocolPolicy: "redirect-to-https",
            AllowedMethods: {
              Quantity: 7,
              Items: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
              CachedMethods: {
                Quantity: 2,
                Items: ["GET", "HEAD"],
              },
            },
            Compress: true,
            CachePolicyId: CACHE_POLICY_CACHING_DISABLED,
            OriginRequestPolicyId: ORIGIN_REQUEST_POLICY_ALL_VIEWER,
          },
          {
            PathPattern: "/health*",
            TargetOriginId: "Api-Origin",
            ViewerProtocolPolicy: "redirect-to-https",
            AllowedMethods: {
              Quantity: 3,
              Items: ["GET", "HEAD", "OPTIONS"],
              CachedMethods: {
                Quantity: 2,
                Items: ["GET", "HEAD"],
              },
            },
            Compress: true,
            CachePolicyId: CACHE_POLICY_CACHING_DISABLED,
            OriginRequestPolicyId: ORIGIN_REQUEST_POLICY_ALL_VIEWER,
          },
        ],
      }
    : { Quantity: 0 };

  const distributionConfig = {
    CallerReference: `ivx-landing-${Date.now()}`,
    Comment: "IVX Holdings Landing Page — HTTPS via CloudFront",
    Enabled: true,
    HttpVersion: "http2and3",
    PriceClass: "PriceClass_100",
    DefaultRootObject: "index.html",
    Aliases: {
      Quantity: 2,
      Items: [DOMAIN, WWW_DOMAIN],
    },
    Origins: {
      Quantity: API_ORIGIN_HOST ? 2 : 1,
      Items: [
        {
          Id: "S3-Website-ivxholding",
          DomainName: s3WebsiteOrigin,
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: "http-only",
            OriginSslProtocols: {
              Quantity: 1,
              Items: ["TLSv1.2"],
            },
          },
        },
        ...(API_ORIGIN_HOST ? [{
          Id: "Api-Origin",
          DomainName: API_ORIGIN_HOST,
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: "https-only",
            OriginSslProtocols: {
              Quantity: 1,
              Items: ["TLSv1.2"],
            },
          },
        }] : []),
      ],
    },
    DefaultCacheBehavior: {
      TargetOriginId: "S3-Website-ivxholding",
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: {
        Quantity: 3,
        Items: ["GET", "HEAD", "OPTIONS"],
        CachedMethods: {
          Quantity: 2,
          Items: ["GET", "HEAD"],
        },
      },
      Compress: true,
      CachePolicyId: CACHE_POLICY_CACHING_OPTIMIZED,
    },
    OrderedCacheBehaviors: orderedCacheBehaviors,
    CustomErrorResponses: {
      Quantity: 2,
      Items: [
        {
          ErrorCode: 404,
          ResponseCode: 200,
          ResponsePagePath: "/index.html",
          ErrorCachingMinTTL: 60,
        },
        {
          ErrorCode: 403,
          ResponseCode: 200,
          ResponsePagePath: "/index.html",
          ErrorCachingMinTTL: 60,
        },
      ],
    },
    ViewerCertificate: {
      ACMCertificateArn: certArn,
      SSLSupportMethod: "sni-only",
      MinimumProtocolVersion: "TLSv1.2_2021",
      CloudFrontDefaultCertificate: false,
    },
    Restrictions: {
      GeoRestriction: {
        RestrictionType: "none",
        Quantity: 0,
      },
    },
  };

  log(`Creating distribution with origin: ${s3WebsiteOrigin}`);
  if (API_ORIGIN_HOST) {
    log(`API origin enabled for /api/* and /health*: ${API_ORIGIN_HOST}`);
  } else {
    warn('API origin not configured — /api/* will continue to miss CloudFront bypass routing until EXPO_PUBLIC_RORK_API_BASE_URL is set');
  }
  log(`Aliases: ${DOMAIN}, ${WWW_DOMAIN}`);
  log(`SSL Certificate: ${certArn}`);
  log("Viewer protocol: redirect-to-https");

  try {
    const resp = await cloudfront.send(new CreateDistributionCommand({
      DistributionConfig: distributionConfig,
    }));

    const dist = resp.Distribution;
    ok(`Distribution created!`);
    ok(`  ID:     ${dist.Id}`);
    ok(`  Domain: ${dist.DomainName}`);
    ok(`  Status: ${dist.Status}`);
    warn("Distribution takes 5–15 minutes to deploy globally.");

    return dist;
  } catch (e) {
    if (e.name === "CNAMEAlreadyExists") {
      fail(`CNAME ${DOMAIN} or ${WWW_DOMAIN} is already associated with another CloudFront distribution.`);
      fail("You must remove the alias from the other distribution first.");
    }
    throw e;
  }
}

// ─── STEP 4: Update Route53 DNS to point to CloudFront ─────────────────────
async function updateDNS(cloudfrontDomain) {
  step("Step 4: Updating Route53 DNS → CloudFront");

  const listResp = await route53.send(new ListHostedZonesByNameCommand({ DNSName: DOMAIN }));
  const zone = listResp.HostedZones?.find((z) => z.Name === `${DOMAIN}.`);

  if (!zone) {
    warn("Route53 hosted zone for ivxholding.com not found.");
    warn("You need to manually create DNS records pointing to CloudFront:");
    warn(`  ${DOMAIN}     → A (Alias) → ${cloudfrontDomain}`);
    warn(`  ${WWW_DOMAIN} → A (Alias) → ${cloudfrontDomain}`);
    return;
  }

  const zoneId = zone.Id.replace("/hostedzone/", "");
  log(`Found hosted zone: ${zoneId}`);

  const changes = [
    {
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: `${DOMAIN}.`,
        Type: "A",
        AliasTarget: {
          DNSName: cloudfrontDomain,
          HostedZoneId: "Z2FDTNDATAQYW2",
          EvaluateTargetHealth: false,
        },
      },
    },
    {
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: `${DOMAIN}.`,
        Type: "AAAA",
        AliasTarget: {
          DNSName: cloudfrontDomain,
          HostedZoneId: "Z2FDTNDATAQYW2",
          EvaluateTargetHealth: false,
        },
      },
    },
    {
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: `${WWW_DOMAIN}.`,
        Type: "A",
        AliasTarget: {
          DNSName: cloudfrontDomain,
          HostedZoneId: "Z2FDTNDATAQYW2",
          EvaluateTargetHealth: false,
        },
      },
    },
    {
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: `${WWW_DOMAIN}.`,
        Type: "AAAA",
        AliasTarget: {
          DNSName: cloudfrontDomain,
          HostedZoneId: "Z2FDTNDATAQYW2",
          EvaluateTargetHealth: false,
        },
      },
    },
  ];

  await route53.send(new ChangeResourceRecordSetsCommand({
    HostedZoneId: zoneId,
    ChangeBatch: {
      Changes: changes,
      Comment: "IVX Holdings — Landing page → CloudFront HTTPS",
    },
  }));

  ok("DNS records updated:");
  ok(`  ${DOMAIN}     → A (Alias) → ${cloudfrontDomain}`);
  ok(`  ${DOMAIN}     → AAAA (Alias) → ${cloudfrontDomain}`);
  ok(`  ${WWW_DOMAIN} → A (Alias) → ${cloudfrontDomain}`);
  ok(`  ${WWW_DOMAIN} → AAAA (Alias) → ${cloudfrontDomain}`);
}

// ─── STEP 5: Invalidate cache ───────────────────────────────────────────────
async function invalidateCache(distributionId) {
  step("Step 5: Invalidating CloudFront cache");

  await cloudfront.send(new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `invalidate-${Date.now()}`,
      Paths: {
        Quantity: 1,
        Items: ["/*"],
      },
    },
  }));

  ok("Cache invalidation triggered for /*");
}

// ─── SUMMARY ────────────────────────────────────────────────────────────────
function printSummary(data) {
  console.log(`\n${BOLD}${"━".repeat(60)}${RESET}`);
  console.log(`${BOLD}  IVX Holdings — CloudFront HTTPS Setup Complete${RESET}`);
  console.log(`${"━".repeat(60)}`);
  console.log(`\n  ${GREEN}Distribution ID:${RESET}   ${data.distributionId}`);
  console.log(`  ${GREEN}CloudFront URL:${RESET}    https://${data.cloudfrontDomain}`);
  console.log(`  ${GREEN}Live URL (HTTPS):${RESET}  https://${DOMAIN}`);
  console.log(`  ${GREEN}Live URL (www):${RESET}    https://${WWW_DOMAIN}`);
  console.log(`  ${GREEN}Certificate:${RESET}       ${data.certArn}`);
  console.log(`  ${GREEN}HTTP → HTTPS:${RESET}      Automatic redirect`);

  console.log(`\n${BOLD}  WHAT HAPPENS NOW:${RESET}`);
  console.log(`  ${YELLOW}1. CloudFront distribution deploying globally (5–15 min)${RESET}`);
  console.log(`  ${YELLOW}2. DNS propagating to point ${DOMAIN} → CloudFront${RESET}`);
  console.log(`  ${YELLOW}3. After propagation, https://${DOMAIN} will be live${RESET}`);
  console.log(`  ${YELLOW}4. All HTTP requests auto-redirect to HTTPS${RESET}`);

  console.log(`\n${BOLD}  DEPLOY UPDATES:${RESET}`);
  console.log(`  ${GREEN}After uploading new content to S3, invalidate cache:${RESET}`);
  console.log(`     node deploy-landing.mjs`);
  console.log(`     (auto-invalidates CloudFront after upload)`);

  console.log(`\n${BOLD}  SAVE THIS DISTRIBUTION ID:${RESET}`);
  console.log(`  ${GREEN}${data.distributionId}${RESET}`);
  console.log(`  You need it for cache invalidation in deploy-landing.mjs`);
  console.log(`\n${"━".repeat(60)}\n`);
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${BOLD}${BLUE}${"━".repeat(60)}${RESET}`);
  console.log(`${BOLD}${BLUE}  IVX Holdings — CloudFront HTTPS Setup for Landing Page${RESET}`);
  console.log(`${BOLD}${BLUE}${"━".repeat(60)}${RESET}\n`);

  if (!creds.credentials.accessKeyId || !creds.credentials.secretAccessKey) {
    fail("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.");
    process.exit(1);
  }

  const certArn = await findCertificate();

  const existing = await findExistingDistribution();

  let distributionId;
  let cloudfrontDomain;

  if (existing) {
    distributionId = existing.Id;
    cloudfrontDomain = existing.DomainName;
    log("Using existing distribution — skipping creation.");
  } else {
    const dist = await createDistribution(certArn);
    distributionId = dist.Id;
    cloudfrontDomain = dist.DomainName;
  }

  await updateDNS(cloudfrontDomain);
  await invalidateCache(distributionId);

  printSummary({ distributionId, cloudfrontDomain, certArn });
}

main().catch((e) => {
  fail(`Fatal error: ${e.message}`);
  if (e.name === "InvalidClientTokenId" || e.message?.includes("credentials")) {
    fail("→ Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
  }
  console.error(e);
  process.exit(1);
});
