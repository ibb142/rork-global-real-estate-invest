#!/usr/bin/env node

/**
 * IVX Holdings — Route53 Hosted Zone + ACM SSL Certificate Setup
 * 
 * Step 1: Creates Route53 hosted zone for ivxholding.com
 * Step 2: Requests ACM certificate for ivxholding.com + *.ivxholding.com
 * Step 3: Creates DNS validation records in Route53
 * Step 4: Waits for certificate validation
 */

import {
  Route53Client,
  CreateHostedZoneCommand,
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
  GetHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import {
  ACMClient,
  RequestCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand,
} from "@aws-sdk/client-acm";

const DOMAIN = "ivxholding.com";
const REGION = "us-east-1";

const creds = {
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
  },
};

const route53 = new Route53Client({ ...creds, region: REGION });
const acm = new ACMClient({ ...creds, region: REGION });

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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── STEP 1: Create or find Route53 hosted zone ─────────────────────────────
async function setupHostedZone() {
  step("Step 1: Route53 Hosted Zone for " + DOMAIN);

  const listResp = await route53.send(new ListHostedZonesByNameCommand({ DNSName: DOMAIN }));
  const existing = listResp.HostedZones?.find((z) => z.Name === `${DOMAIN}.`);

  if (existing) {
    const zoneId = existing.Id.replace("/hostedzone/", "");
    ok(`Hosted zone already exists: ${zoneId}`);
    
    const zoneDetail = await route53.send(new GetHostedZoneCommand({ Id: existing.Id }));
    const nameservers = zoneDetail.DelegationSet?.NameServers || [];
    
    return { zoneId, nameservers };
  }

  log("Creating new hosted zone...");
  const createResp = await route53.send(new CreateHostedZoneCommand({
    Name: DOMAIN,
    CallerReference: `ivx-${Date.now()}`,
    HostedZoneConfig: {
      Comment: "IVX Holdings — Landing page & API",
    },
  }));

  const zoneId = createResp.HostedZone.Id.replace("/hostedzone/", "");
  const nameservers = createResp.DelegationSet?.NameServers || [];

  ok(`Hosted zone created: ${zoneId}`);
  return { zoneId, nameservers };
}

// ─── STEP 2: Request ACM certificate ────────────────────────────────────────
async function setupCertificate() {
  step("Step 2: ACM SSL Certificate");

  const listResp = await acm.send(new ListCertificatesCommand({
    CertificateStatuses: ["ISSUED", "PENDING_VALIDATION"],
  }));

  const existing = listResp.CertificateSummaryList?.find(
    (c) => c.DomainName === DOMAIN || c.DomainName === `*.${DOMAIN}`
  );

  if (existing) {
    ok(`Certificate already exists: ${existing.CertificateArn} (${existing.Status})`);
    return existing.CertificateArn;
  }

  log("Requesting new SSL certificate...");
  const reqResp = await acm.send(new RequestCertificateCommand({
    DomainName: DOMAIN,
    SubjectAlternativeNames: [`*.${DOMAIN}`],
    ValidationMethod: "DNS",
  }));

  ok(`Certificate requested: ${reqResp.CertificateArn}`);
  return reqResp.CertificateArn;
}

// ─── STEP 3: Create DNS validation records ──────────────────────────────────
async function createValidationRecords(certArn, zoneId) {
  step("Step 3: DNS Validation Records");

  log("Waiting 10s for certificate details to propagate...");
  await sleep(10000);

  let certDetail;
  for (let i = 0; i < 5; i++) {
    const descResp = await acm.send(new DescribeCertificateCommand({
      CertificateArn: certArn,
    }));
    certDetail = descResp.Certificate;
    
    if (certDetail.DomainValidationOptions?.length > 0 && 
        certDetail.DomainValidationOptions[0].ResourceRecord) {
      break;
    }
    
    log(`Waiting for validation details... (attempt ${i + 1}/5)`);
    await sleep(5000);
  }

  if (!certDetail?.DomainValidationOptions?.length) {
    fail("Could not get validation records from ACM");
    return;
  }

  const changes = [];
  const seen = new Set();

  for (const opt of certDetail.DomainValidationOptions) {
    if (!opt.ResourceRecord) continue;
    const key = opt.ResourceRecord.Name;
    if (seen.has(key)) continue;
    seen.add(key);

    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: opt.ResourceRecord.Name,
        Type: opt.ResourceRecord.Type,
        TTL: 300,
        ResourceRecords: [{ Value: opt.ResourceRecord.Value }],
      },
    });

    log(`Validation record: ${opt.ResourceRecord.Name} → ${opt.ResourceRecord.Value}`);
  }

  if (changes.length === 0) {
    warn("No validation records to create (may already be validated)");
    return;
  }

  await route53.send(new ChangeResourceRecordSetsCommand({
    HostedZoneId: zoneId,
    ChangeBatch: {
      Changes: changes,
      Comment: "ACM certificate DNS validation",
    },
  }));

  ok(`${changes.length} validation record(s) created in Route53`);
}

// ─── STEP 4: Check certificate status ───────────────────────────────────────
async function checkCertStatus(certArn) {
  step("Step 4: Certificate Status Check");

  const descResp = await acm.send(new DescribeCertificateCommand({
    CertificateArn: certArn,
  }));

  const status = descResp.Certificate.Status;
  
  if (status === "ISSUED") {
    ok("Certificate is ISSUED and ready to use!");
  } else if (status === "PENDING_VALIDATION") {
    warn("Certificate is PENDING_VALIDATION");
    warn("It will auto-validate once DNS propagates (after you update GoDaddy nameservers)");
    warn("This usually takes 5–30 minutes after NS change");
  } else {
    warn(`Certificate status: ${status}`);
  }

  return status;
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${BOLD}${BLUE}${"━".repeat(60)}${RESET}`);
  console.log(`${BOLD}${BLUE}  IVX Holdings — Route53 + SSL Setup${RESET}`);
  console.log(`${BOLD}${BLUE}${"━".repeat(60)}${RESET}\n`);

  if (!creds.credentials.accessKeyId || !creds.credentials.secretAccessKey) {
    fail("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.");
    process.exit(1);
  }

  const { zoneId, nameservers } = await setupHostedZone();
  const certArn = await setupCertificate();
  await createValidationRecords(certArn, zoneId);
  const certStatus = await checkCertStatus(certArn);

  console.log(`\n${BOLD}${"━".repeat(60)}${RESET}`);
  console.log(`${BOLD}  SETUP COMPLETE — ACTION REQUIRED${RESET}`);
  console.log(`${"━".repeat(60)}`);
  console.log(`\n  ${GREEN}Route53 Zone ID:${RESET}  ${zoneId}`);
  console.log(`  ${GREEN}Certificate ARN:${RESET}  ${certArn}`);
  console.log(`  ${GREEN}Certificate:${RESET}      ${certStatus}`);
  
  console.log(`\n  ${BOLD}${YELLOW}▶ UPDATE GODADDY NAMESERVERS TO:${RESET}`);
  console.log(`  ${YELLOW}  Go to GoDaddy → Domain Settings → Nameservers → Custom${RESET}`);
  console.log(`  ${YELLOW}  Replace ALL existing nameservers with these 4:${RESET}\n`);
  
  for (const ns of nameservers) {
    console.log(`     ${GREEN}${BOLD}${ns}${RESET}`);
  }
  
  console.log(`\n  ${YELLOW}  After updating GoDaddy (15–60 min propagation):${RESET}`);
  console.log(`  ${YELLOW}  1. SSL certificate will auto-validate${RESET}`);
  console.log(`  ${YELLOW}  2. Then run: node deploy/scripts/setup-cloudfront-landing.mjs${RESET}`);
  console.log(`  ${YELLOW}  3. Then run: node deploy-landing.mjs${RESET}`);
  console.log(`\n${"━".repeat(60)}\n`);
}

main().catch((e) => {
  fail(`Fatal error: ${e.message}`);
  console.error(e);
  process.exit(1);
});
