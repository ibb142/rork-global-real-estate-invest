import { resolve4, resolveCname } from 'node:dns/promises';
import tls from 'node:tls';
import { CloudFrontClient, GetDistributionCommand, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { GetPolicyCommand, IAMClient, ListAttachedUserPoliciesCommand, ListPoliciesCommand, ListUsersCommand } from '@aws-sdk/client-iam';
import { ListHostedZonesByNameCommand, ListResourceRecordSetsCommand, Route53Client } from '@aws-sdk/client-route-53';
import { HeadBucketCommand, ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

export type IVXAIBrainToolName =
  | 'github_repo_status'
  | 'supabase_runtime_check'
  | 'aws_identity_check'
  | 'iam_readiness_check'
  | 's3_readiness_check'
  | 'cloudfront_readiness_check'
  | 'route53_dns_check'
  | 'dns_tls_check'
  | 'deployment_health_check'
  | 'environment_checklist';

export type IVXAIBrainToolRequest = {
  tool?: unknown;
  input?: unknown;
  confirm?: unknown;
  confirmText?: unknown;
};

export type IVXAIBrainToolResult = {
  ok: boolean;
  tool: IVXAIBrainToolName;
  readOnly: true;
  ownerOnly: true;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  missingEnvNames: string[];
  timestamp: string;
};

type AwsClientConfig = {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
};

type GithubRepoInfo = {
  owner: string;
  repo: string;
};

const DEFAULT_AWS_REGION = 'us-east-1';
const DEFAULT_API_DOMAIN = 'api.ivxholding.com';
const DEFAULT_CHAT_DOMAIN = 'chat.ivxholding.com';
const DEFAULT_HEALTH_URL = 'https://api.ivxholding.com/health';
const SUPPORTED_TOOLS: IVXAIBrainToolName[] = [
  'github_repo_status',
  'supabase_runtime_check',
  'aws_identity_check',
  'iam_readiness_check',
  's3_readiness_check',
  'cloudfront_readiness_check',
  'route53_dns_check',
  'dns_tls_check',
  'deployment_health_check',
  'environment_checklist',
];

function nowIso(): string {
  return new Date().toISOString();
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readEnv(name: string): string {
  return readTrimmed(process.env[name]);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readStringInput(input: Record<string, unknown>, key: string, fallback: string): string {
  return readTrimmed(input[key]) || fallback;
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

function normalizeTool(value: unknown): IVXAIBrainToolName {
  const normalized = readTrimmed(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (SUPPORTED_TOOLS.includes(normalized as IVXAIBrainToolName)) {
    return normalized as IVXAIBrainToolName;
  }
  throw new Error(`Unsupported IVX AI Brain tool. Supported tools: ${SUPPORTED_TOOLS.join(', ')}.`);
}

function getMissingEnvNames(names: string[]): string[] {
  return names.filter((name) => !readEnv(name));
}

function createAwsConfig(regionOverride?: string): AwsClientConfig {
  const accessKeyId = readEnv('AWS_ACCESS_KEY_ID');
  const secretAccessKey = readEnv('AWS_SECRET_ACCESS_KEY');
  const sessionToken = readEnv('AWS_SESSION_TOKEN');
  const region = regionOverride || readEnv('AWS_REGION') || DEFAULT_AWS_REGION;
  const config: AwsClientConfig = { region };
  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }
  return config;
}

function parseGithubRepoUrl(value: string): GithubRepoInfo | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const httpsMatch = normalized.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/i);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  return null;
}

function buildGithubHeaders(): HeadersInit {
  const token = readEnv('GITHUB_TOKEN');
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 600);
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; ok: boolean; data: unknown }> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    ok: response.ok,
    data: await parseJsonResponse(response),
  };
}

function readGithubDataRecord(data: unknown): Record<string, unknown> {
  return readRecord(data);
}

async function runGithubRepoStatus(input: Record<string, unknown>): Promise<unknown> {
  const repoUrl = readStringInput(input, 'repoUrl', readEnv('GITHUB_REPO_URL'));
  const repoInfo = parseGithubRepoUrl(repoUrl);
  if (!repoInfo) {
    throw new Error('GITHUB_REPO_URL is missing or invalid.');
  }
  const headers = buildGithubHeaders();
  const repoResponse = await fetchJson(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`, { headers });
  if (!repoResponse.ok) {
    throw new Error(`GitHub repo lookup failed with HTTP ${repoResponse.status}.`);
  }
  const branchResponse = await fetchJson(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/branches`, { headers });
  const repoData = readGithubDataRecord(repoResponse.data);
  const defaultBranch = readTrimmed(repoData.default_branch) || null;
  const branchNames = Array.isArray(branchResponse.data)
    ? branchResponse.data.map((item) => readTrimmed(readRecord(item).name)).filter(Boolean)
    : [];
  return {
    repoUrl,
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    private: repoData.private === true,
    defaultBranch,
    branchNames,
    cloneUrl: readTrimmed(repoData.clone_url) || null,
    pushedAt: readTrimmed(repoData.pushed_at) || null,
    tokenConfigured: Boolean(readEnv('GITHUB_TOKEN')),
  };
}

async function runSupabaseRuntimeCheck(): Promise<unknown> {
  const url = readEnv('EXPO_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY') || readEnv('SUPABASE_SERVICE_KEY');
  if (!url || !anonKey) {
    throw new Error('Supabase URL or anon key is missing.');
  }
  const healthProbe = await fetchJson(`${url}/rest/v1/`, {
    method: 'GET',
    headers: {
      Accept: 'application/openapi+json',
      apikey: serviceRoleKey || anonKey,
      Authorization: `Bearer ${serviceRoleKey || anonKey}`,
    },
  });
  return {
    hasSupabaseUrl: Boolean(url),
    hasAnonKey: Boolean(anonKey),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    hasDbPasswordOrUrl: Boolean(readEnv('SUPABASE_DB_PASSWORD') || readEnv('SUPABASE_DB_URL') || readEnv('DATABASE_URL') || readEnv('POSTGRES_URL')),
    restOpenApiReachable: healthProbe.ok,
    restStatus: healthProbe.status,
  };
}

async function runAwsIdentityCheck(): Promise<unknown> {
  const client = new STSClient(createAwsConfig());
  const response = await client.send(new GetCallerIdentityCommand({}));
  return {
    account: readTrimmed(response.Account) || null,
    arn: readTrimmed(response.Arn) || null,
    userId: readTrimmed(response.UserId) || null,
    region: readEnv('AWS_REGION') || DEFAULT_AWS_REGION,
  };
}

async function runIamReadinessCheck(input: Record<string, unknown>): Promise<unknown> {
  const client = new IAMClient(createAwsConfig(DEFAULT_AWS_REGION));
  const policyArn = readTrimmed(input.policyArn);
  const [users, policies, selectedPolicy] = await Promise.all([
    client.send(new ListUsersCommand({ MaxItems: 10 })),
    client.send(new ListPoliciesCommand({ Scope: 'Local', MaxItems: 20 })),
    policyArn ? client.send(new GetPolicyCommand({ PolicyArn: policyArn })) : Promise.resolve(null),
  ]);
  const currentUserName = readTrimmed(input.userName);
  const attachedPolicies = currentUserName
    ? await client.send(new ListAttachedUserPoliciesCommand({ UserName: currentUserName, MaxItems: 20 }))
    : null;
  return {
    users: (users.Users ?? []).map((user) => ({ userName: readTrimmed(user.UserName), arn: readTrimmed(user.Arn), createDate: user.CreateDate?.toISOString?.() ?? null })),
    localPolicies: (policies.Policies ?? []).map((policy) => ({ policyName: readTrimmed(policy.PolicyName), arn: readTrimmed(policy.Arn), attachmentCount: policy.AttachmentCount ?? null })),
    selectedPolicy: selectedPolicy ? { policyName: readTrimmed(selectedPolicy.Policy?.PolicyName), arn: readTrimmed(selectedPolicy.Policy?.Arn), attachmentCount: selectedPolicy.Policy?.AttachmentCount ?? null } : null,
    attachedPolicies: attachedPolicies ? (attachedPolicies.AttachedPolicies ?? []).map((policy) => ({ policyName: readTrimmed(policy.PolicyName), arn: readTrimmed(policy.PolicyArn) })) : null,
    requiredCapabilityHints: ['sts:GetCallerIdentity', 'route53:ListHostedZonesByName', 'route53:ListResourceRecordSets', 'route53:ChangeResourceRecordSets', 's3:ListBucket', 's3:PutObject', 'cloudfront:GetDistribution', 'cloudfront:CreateInvalidation'],
  };
}

async function runS3ReadinessCheck(input: Record<string, unknown>): Promise<unknown> {
  const bucket = readStringInput(input, 'bucket', readEnv('S3_BUCKET_NAME'));
  const client = new S3Client(createAwsConfig());
  if (bucket) {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { mode: 'head_bucket', bucket, reachable: true };
  }
  const response = await client.send(new ListBucketsCommand({}));
  return {
    mode: 'list_buckets',
    buckets: (response.Buckets ?? []).slice(0, 20).map((item) => ({ name: readTrimmed(item.Name), creationDate: item.CreationDate?.toISOString?.() ?? null })),
  };
}

async function runCloudFrontReadinessCheck(input: Record<string, unknown>): Promise<unknown> {
  const distributionId = readStringInput(input, 'distributionId', readEnv('CLOUDFRONT_DISTRIBUTION_ID'));
  const client = new CloudFrontClient(createAwsConfig(DEFAULT_AWS_REGION));
  if (distributionId) {
    const response = await client.send(new GetDistributionCommand({ Id: distributionId }));
    return {
      mode: 'get_distribution',
      id: readTrimmed(response.Distribution?.Id) || distributionId,
      domainName: readTrimmed(response.Distribution?.DomainName) || null,
      status: readTrimmed(response.Distribution?.Status) || null,
      enabled: response.Distribution?.DistributionConfig?.Enabled ?? null,
      aliases: response.Distribution?.DistributionConfig?.Aliases?.Items ?? [],
    };
  }
  const response = await client.send(new ListDistributionsCommand({ MaxItems: 20 }));
  return {
    mode: 'list_distributions',
    distributions: (response.DistributionList?.Items ?? []).map((distribution) => ({
      id: readTrimmed(distribution.Id),
      domainName: readTrimmed(distribution.DomainName),
      status: readTrimmed(distribution.Status),
      aliases: distribution.Aliases?.Items ?? [],
    })),
  };
}

async function resolveDns(domain: string): Promise<{ domain: string; cname: string[]; a: string[]; resolvable: boolean }> {
  const normalizedDomain = normalizeDomain(domain);
  const [cnameResult, aResult] = await Promise.allSettled([resolveCname(normalizedDomain), resolve4(normalizedDomain)]);
  const cname = cnameResult.status === 'fulfilled' ? cnameResult.value.map(readTrimmed).filter(Boolean) : [];
  const a = aResult.status === 'fulfilled' ? aResult.value.map(readTrimmed).filter(Boolean) : [];
  return { domain: normalizedDomain, cname, a, resolvable: cname.length > 0 || a.length > 0 };
}

async function runRoute53DnsCheck(input: Record<string, unknown>): Promise<unknown> {
  const domain = normalizeDomain(readStringInput(input, 'domain', DEFAULT_API_DOMAIN));
  const rootDomain = normalizeDomain(readStringInput(input, 'rootDomain', 'ivxholding.com'));
  const client = new Route53Client(createAwsConfig(DEFAULT_AWS_REGION));
  const hostedZones = await client.send(new ListHostedZonesByNameCommand({ DNSName: `${rootDomain}.`, MaxItems: 10 }));
  const zones = (hostedZones.HostedZones ?? []).map((zone) => ({ id: readTrimmed(zone.Id).replace('/hostedzone/', ''), name: normalizeDomain(readTrimmed(zone.Name)), privateZone: Boolean(zone.Config?.PrivateZone) }));
  const zone = zones.find((item) => item.name === rootDomain && !item.privateZone) ?? zones[0] ?? null;
  const records = zone
    ? await client.send(new ListResourceRecordSetsCommand({ HostedZoneId: zone.id, MaxItems: 100 }))
    : null;
  const matchingRecords = (records?.ResourceRecordSets ?? [])
    .filter((record) => normalizeDomain(readTrimmed(record.Name)) === domain)
    .map((record) => ({
      name: readTrimmed(record.Name),
      type: readTrimmed(record.Type),
      ttl: record.TTL ?? null,
      values: (record.ResourceRecords ?? []).map((entry) => readTrimmed(entry.Value)).filter(Boolean),
      aliasTarget: readTrimmed(record.AliasTarget?.DNSName) || null,
    }));
  return {
    domain,
    rootDomain,
    hostedZones: zones,
    selectedHostedZone: zone,
    matchingRecords,
    publicDns: await resolveDns(domain),
  };
}

function probeTls(domain: string, port: number): Promise<{ authorized: boolean; authorizationError: string | null; subject: string | null; issuer: string | null; validFrom: string | null; validTo: string | null; protocol: string | null }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: domain, servername: domain, port, rejectUnauthorized: false, timeout: 8_000 }, () => {
      const certificate = socket.getPeerCertificate();
      const result = {
        authorized: socket.authorized,
        authorizationError: typeof socket.authorizationError === 'string' ? socket.authorizationError : null,
        subject: readTrimmed(certificate.subject?.CN) || null,
        issuer: readTrimmed(certificate.issuer?.CN) || null,
        validFrom: readTrimmed(certificate.valid_from) || null,
        validTo: readTrimmed(certificate.valid_to) || null,
        protocol: socket.getProtocol(),
      };
      socket.end();
      resolve(result);
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('TLS probe timed out.'));
    });
    socket.on('error', reject);
  });
}

async function runDnsTlsCheck(input: Record<string, unknown>): Promise<unknown> {
  const domain = normalizeDomain(readStringInput(input, 'domain', DEFAULT_API_DOMAIN));
  const portValue = Number.parseInt(readTrimmed(input.port), 10);
  const port = Number.isFinite(portValue) ? portValue : 443;
  const [dns, tlsResult] = await Promise.allSettled([resolveDns(domain), probeTls(domain, port)]);
  return {
    domain,
    port,
    dns: dns.status === 'fulfilled' ? dns.value : { error: dns.reason instanceof Error ? dns.reason.message : 'DNS probe failed.' },
    tls: tlsResult.status === 'fulfilled' ? tlsResult.value : { error: tlsResult.reason instanceof Error ? tlsResult.reason.message : 'TLS probe failed.' },
  };
}

async function runDeploymentHealthCheck(input: Record<string, unknown>): Promise<unknown> {
  const url = readStringInput(input, 'url', readEnv('EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL') ? `${readEnv('EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL').replace(/\/+$/, '')}/health` : DEFAULT_HEALTH_URL);
  const startedAt = Date.now();
  const response = await fetch(url, { method: 'GET' });
  const data = await parseJsonResponse(response);
  return {
    url,
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    data,
  };
}

function runEnvironmentChecklist(): unknown {
  const required = [
    'JWT_SECRET',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_PASSWORD',
    'AI_GATEWAY_API_KEY',
    'GITHUB_TOKEN',
    'GITHUB_REPO_URL',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'S3_BUCKET_NAME',
    'CLOUDFRONT_DISTRIBUTION_ID',
    'EXPO_PUBLIC_API_BASE_URL',
    'EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL',
  ];
  return {
    required,
    present: required.filter((name) => Boolean(readEnv(name))),
    missing: getMissingEnvNames(required),
    optional: ['AWS_SESSION_TOKEN', 'SUPABASE_DB_URL', 'DATABASE_URL', 'POSTGRES_URL', 'DOMAIN_NAME', 'EXPO_PUBLIC_CHAT_API_URL'],
    domains: [DEFAULT_API_DOMAIN, DEFAULT_CHAT_DOMAIN],
  };
}

async function runTool(tool: IVXAIBrainToolName, input: Record<string, unknown>): Promise<unknown> {
  if (tool === 'github_repo_status') {
    return await runGithubRepoStatus(input);
  }
  if (tool === 'supabase_runtime_check') {
    return await runSupabaseRuntimeCheck();
  }
  if (tool === 'aws_identity_check') {
    return await runAwsIdentityCheck();
  }
  if (tool === 'iam_readiness_check') {
    return await runIamReadinessCheck(input);
  }
  if (tool === 's3_readiness_check') {
    return await runS3ReadinessCheck(input);
  }
  if (tool === 'cloudfront_readiness_check') {
    return await runCloudFrontReadinessCheck(input);
  }
  if (tool === 'route53_dns_check') {
    return await runRoute53DnsCheck(input);
  }
  if (tool === 'dns_tls_check') {
    return await runDnsTlsCheck(input);
  }
  if (tool === 'deployment_health_check') {
    return await runDeploymentHealthCheck(input);
  }
  return runEnvironmentChecklist();
}

function missingEnvForTool(tool: IVXAIBrainToolName): string[] {
  if (tool === 'github_repo_status') {
    return getMissingEnvNames(['GITHUB_REPO_URL']);
  }
  if (tool === 'supabase_runtime_check') {
    return getMissingEnvNames(['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']);
  }
  if (tool === 'aws_identity_check' || tool === 'iam_readiness_check' || tool === 's3_readiness_check' || tool === 'cloudfront_readiness_check' || tool === 'route53_dns_check') {
    return getMissingEnvNames(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION']);
  }
  return [];
}

export function listIVXAIBrainTools(): IVXAIBrainToolName[] {
  return SUPPORTED_TOOLS;
}

export async function executeIVXAIBrainTool(request: IVXAIBrainToolRequest): Promise<IVXAIBrainToolResult> {
  const tool = normalizeTool(request.tool);
  const input = readRecord(request.input);
  const missingEnvNames = missingEnvForTool(tool);
  try {
    const output = await runTool(tool, input);
    return {
      ok: true,
      tool,
      readOnly: true,
      ownerOnly: true,
      input,
      output,
      missingEnvNames,
      timestamp: nowIso(),
    };
  } catch (error) {
    return {
      ok: false,
      tool,
      readOnly: true,
      ownerOnly: true,
      input,
      error: error instanceof Error ? error.message : 'IVX AI Brain tool failed.',
      missingEnvNames,
      timestamp: nowIso(),
    };
  }
}
