import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import {
  Route53Client,
  ListHostedZonesByNameCommand,
  GetHostedZoneCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";
import { ACMClient, ListCertificatesCommand, DescribeCertificateCommand } from "@aws-sdk/client-acm";
import { CloudFrontClient, GetDistributionCommand } from "@aws-sdk/client-cloudfront";
import { createAwsRuntime, formatAwsCredentialError } from "./aws-runtime.mjs";

const awsRuntime = createAwsRuntime(import.meta.url);

const REGION = awsRuntime.diagnostics.region;
const DOMAIN = readEnv("IVX_ROOT_DOMAIN") || "ivxholding.com";
const API_DOMAIN = readEnv("IVX_API_DOMAIN") || `api.${DOMAIN}`;
const OWNER_AI_BASE_URL = readEnv("EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL") || readEnv("EXPO_PUBLIC_API_BASE_URL") || `https://${API_DOMAIN}`;
const OWNER_AI_PATH = "/api/ivx/owner-ai";
import { validateRepoUrl, CANONICAL_GITHUB_REPO_URL, isRealSha } from "../../lib/canonical-repo.mjs";

const GITHUB_TOKEN = readEnv("GITHUB_TOKEN");
const GITHUB_REPO_URL = validateRepoUrl(readEnv("GITHUB_REPO_URL")).resolved;
const CLOUDFRONT_DISTRIBUTION_ID = readEnv("CLOUDFRONT_DISTRIBUTION_ID");

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

function safeSnippet(value, limit = 180) {
  if (!value) {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function stripTrailingDot(value) {
  return value.replace(/\.$/, "");
}

function normalizeRepoUrl(input) {
  const validated = validateRepoUrl(input || GITHUB_REPO_URL || CANONICAL_GITHUB_REPO_URL);
  if (!validated || validated.error || !validated.slug) {
    return null;
  }
  const [owner, repo] = validated.slug.split('/');
  return { owner, repo, slug: validated.slug };
}

async function requestJson(url, options = {}) {
  const { signal, cancel } = createTimeoutSignal(12000);
  try {
    const response = await fetch(url, {
      ...options,
      signal,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {}),
      },
    });

    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cancel();
  }
}

async function probeUrl(url, init = {}) {
  const startedAt = Date.now();
  const { signal, cancel } = createTimeoutSignal(12000);
  try {
    const response = await fetch(url, {
      ...init,
      signal,
      headers: {
        "User-Agent": "ivx-backend-recovery-evidence",
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      contentType: response.headers.get("content-type") || "",
      location: response.headers.get("location") || "",
      snippet: safeSnippet(text),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      contentType: "",
      location: "",
      snippet: "",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cancel();
  }
}

function createAwsClients() {
  return {
    sts: new STSClient({ ...awsRuntime.clientConfig, region: REGION }),
    route53: new Route53Client({ ...awsRuntime.clientConfig, region: "us-east-1" }),
    acm: new ACMClient({ ...awsRuntime.clientConfig, region: "us-east-1" }),
    cloudfront: new CloudFrontClient({ ...awsRuntime.clientConfig, region: "us-east-1" }),
  };
}

async function collectGithubEvidence() {
  const repoUrl = validateRepoUrl(readEnv("GITHUB_REPO_URL") || CANONICAL_GITHUB_REPO_URL).resolved;
  const repo = normalizeRepoUrl(repoUrl);
  if (!repo) {
    return {
      status: "skipped",
      summary: "GITHUB_REPO_URL is missing, malformed, or points to a non-canonical repo",
      resolvedUrl: repoUrl,
      workflows: [],
    };
  }

  if (!GITHUB_TOKEN) {
    return {
      status: "skipped",
      summary: `No GITHUB_TOKEN configured for ${repo.slug}`,
      workflows: [],
    };
  }

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
  };

  const workflowsResponse = await requestJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/workflows?per_page=100`, { headers });
  if (!workflowsResponse.ok || !workflowsResponse.data) {
    return {
      status: "error",
      summary: `GitHub workflow lookup failed (${workflowsResponse.status || "request_error"})`,
      workflows: [],
      error: workflowsResponse.error || workflowsResponse.data?.message || "Unknown GitHub error",
    };
  }

  const workflows = Array.isArray(workflowsResponse.data.workflows) ? workflowsResponse.data.workflows : [];
  const matchingWorkflows = workflows.filter((workflow) => {
    const path = typeof workflow.path === "string" ? workflow.path : "";
    const name = typeof workflow.name === "string" ? workflow.name : "";
    return path.endsWith("/infrastructure.yml") || /infrastructure/i.test(name);
  });

  const results = [];
  for (const workflow of matchingWorkflows) {
    const runsResponse = await requestJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/workflows/${workflow.id}/runs?per_page=3`, { headers });
    const runs = runsResponse.ok && runsResponse.data && Array.isArray(runsResponse.data.workflow_runs)
      ? runsResponse.data.workflow_runs.slice(0, 3).map((run) => ({
          id: run.id,
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          event: run.event,
          branch: run.head_branch,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
          url: run.html_url,
        }))
      : [];

    results.push({
      id: workflow.id,
      name: workflow.name,
      path: workflow.path,
      state: workflow.state,
      url: workflow.html_url,
      runs,
      error: runsResponse.ok ? "" : runsResponse.error || runsResponse.data?.message || `Failed to load runs (${runsResponse.status})`,
    });
  }

  const latestRuns = results.flatMap((workflow) => workflow.runs).sort((left, right) => {
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
  const latestRun = latestRuns[0] || null;
  const duplicateWorkflowWarning = results.length > 1 ? `Detected ${results.length} infrastructure workflows in the repo.` : "";

  return {
    status: results.length > 0 ? "ok" : "warn",
    summary: latestRun
      ? `Latest infrastructure workflow run is ${latestRun.status}/${latestRun.conclusion || "pending"} on ${latestRun.branch || "unknown"}`
      : "No infrastructure workflow runs found",
    repo: repo.slug,
    duplicateWorkflowWarning,
    workflows: results,
  };
}

async function collectAwsEvidence() {
  const { sts, route53, acm, cloudfront } = createAwsClients();
  const evidence = {
    status: "ok",
    summary: "AWS credentials are valid",
    callerIdentity: null,
    hostedZone: null,
    records: [],
    certificate: null,
    cloudfront: null,
    errors: [],
    runtime: awsRuntime.diagnostics,
  };

  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    evidence.callerIdentity = {
      account: identity.Account || "",
      arn: identity.Arn || "",
      userId: identity.UserId || "",
    };
  } catch (error) {
    evidence.status = "error";
    evidence.summary = "AWS caller identity failed";
    evidence.errors.push(formatAwsCredentialError(error, awsRuntime.diagnostics));
    return evidence;
  }

  try {
    const zonesResponse = await route53.send(new ListHostedZonesByNameCommand({ DNSName: DOMAIN }));
    const zone = (zonesResponse.HostedZones || []).find((item) => item.Name === `${DOMAIN}.`);
    if (zone) {
      const zoneDetails = await route53.send(new GetHostedZoneCommand({ Id: zone.Id }));
      evidence.hostedZone = {
        id: zone.Id.replace("/hostedzone/", ""),
        name: zone.Name,
        recordCount: zone.ResourceRecordSetCount || 0,
        privateZone: !!zone.Config?.PrivateZone,
        nameServers: (zoneDetails.DelegationSet?.NameServers || []).map((value) => stripTrailingDot(value)),
      };

      const recordResponse = await route53.send(new ListResourceRecordSetsCommand({
        HostedZoneId: evidence.hostedZone.id,
        StartRecordName: DOMAIN,
        MaxItems: 200,
      }));
      const trackedNames = new Set([DOMAIN, API_DOMAIN, `www.${DOMAIN}`, `cdn.${DOMAIN}`]);
      evidence.records = (recordResponse.ResourceRecordSets || [])
        .filter((record) => trackedNames.has(stripTrailingDot(record.Name || "")))
        .map((record) => ({
          name: stripTrailingDot(record.Name || ""),
          type: record.Type || "",
          aliasTarget: record.AliasTarget?.DNSName ? stripTrailingDot(record.AliasTarget.DNSName) : "",
          values: (record.ResourceRecords || []).map((value) => value.Value || ""),
        }));
    } else {
      evidence.status = "warn";
      evidence.summary = `No Route53 hosted zone found for ${DOMAIN}`;
    }
  } catch (error) {
    evidence.status = "error";
    evidence.errors.push(formatAwsCredentialError(error, awsRuntime.diagnostics));
  }

  try {
    const certificates = await acm.send(new ListCertificatesCommand({ CertificateStatuses: ["ISSUED", "PENDING_VALIDATION"] }));
    const match = (certificates.CertificateSummaryList || []).find((certificate) => {
      const name = certificate.DomainName || "";
      return name === DOMAIN || name === `*.${DOMAIN}`;
    });
    if (match?.CertificateArn) {
      const certificateDetails = await acm.send(new DescribeCertificateCommand({ CertificateArn: match.CertificateArn }));
      const certificate = certificateDetails.Certificate;
      evidence.certificate = {
        arn: match.CertificateArn,
        domainName: certificate?.DomainName || match.DomainName || "",
        status: certificate?.Status || match.Status || "",
        sans: certificate?.SubjectAlternativeNames || [],
        validations: (certificate?.DomainValidationOptions || []).map((item) => ({
          domainName: item.DomainName || "",
          validationStatus: item.ValidationStatus || "",
          recordName: item.ResourceRecord?.Name ? stripTrailingDot(item.ResourceRecord.Name) : "",
          recordValue: item.ResourceRecord?.Value || "",
        })),
      };
    }
  } catch (error) {
    evidence.errors.push(formatAwsCredentialError(error, awsRuntime.diagnostics));
  }

  if (CLOUDFRONT_DISTRIBUTION_ID) {
    try {
      const distributionResponse = await cloudfront.send(new GetDistributionCommand({ Id: CLOUDFRONT_DISTRIBUTION_ID }));
      const distribution = distributionResponse.Distribution;
      evidence.cloudfront = {
        id: distribution?.Id || CLOUDFRONT_DISTRIBUTION_ID,
        status: distribution?.Status || "",
        domainName: distribution?.DomainName || "",
        aliases: distribution?.DistributionConfig?.Aliases?.Items || [],
      };
    } catch (error) {
      evidence.errors.push(formatAwsCredentialError(error, awsRuntime.diagnostics));
    }
  }

  return evidence;
}

async function collectHttpEvidence() {
  const landingProbe = await probeUrl(`https://${DOMAIN}`, { method: "GET" });
  const healthProbe = await probeUrl(`https://${API_DOMAIN}/health`, { method: "GET" });
  const ownerAiProbe = await probeUrl(`${OWNER_AI_BASE_URL.replace(/\/$/, "")}${OWNER_AI_PATH}`, {
    method: "OPTIONS",
  });

  return {
    status: "ok",
    summary: `Landing=${landingProbe.status || "error"} · API health=${healthProbe.status || "error"} · Owner AI=${ownerAiProbe.status || "error"}`,
    landingProbe,
    healthProbe,
    ownerAiProbe,
  };
}

function printSummary(report) {
  console.log("\nIVX backend recovery evidence\n");
  console.log(`Timestamp: ${report.generatedAt}`);
  console.log(`GitHub: ${report.github.summary}`);
  if (report.github.duplicateWorkflowWarning) {
    console.log(`GitHub note: ${report.github.duplicateWorkflowWarning}`);
  }
  console.log(`AWS: ${report.aws.summary}`);
  if (report.aws.hostedZone) {
    console.log(`Hosted zone: ${report.aws.hostedZone.id} (${report.aws.hostedZone.nameServers.join(", ") || "no name servers returned"})`);
  }
  if (report.aws.certificate) {
    console.log(`Certificate: ${report.aws.certificate.status} (${report.aws.certificate.domainName})`);
  }
  if (report.aws.cloudfront) {
    console.log(`CloudFront: ${report.aws.cloudfront.status} (${report.aws.cloudfront.domainName})`);
  }
  console.log(`HTTP: ${report.http.summary}`);
  console.log("\nJSON report\n");
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  console.log("[BackendRecoveryEvidence] Starting evidence collection...");
  const [github, aws, http] = await Promise.all([
    collectGithubEvidence(),
    collectAwsEvidence(),
    collectHttpEvidence(),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    github,
    aws,
    http,
  };

  printSummary(report);
}

main().catch((error) => {
  console.error("[BackendRecoveryEvidence] Fatal error:", error);
  process.exit(1);
});
