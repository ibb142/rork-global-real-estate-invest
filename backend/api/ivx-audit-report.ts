import { ACMClient, ListCertificatesCommand } from '@aws-sdk/client-acm';
import { CloudFrontClient, GetDistributionCommand, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { DescribeInstancesCommand, DescribeSecurityGroupsCommand, DescribeSubnetsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { ECSClient, ListClustersCommand } from '@aws-sdk/client-ecs';
import { DescribeLoadBalancersCommand, ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ListHostedZonesByNameCommand, Route53Client } from '@aws-sdk/client-route-53';
import { HeadBucketCommand, ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIVXAIConfigurationSnapshot } from '../ivx-ai-runtime';
import { inspectSupabaseColumns, inspectSupabaseRls, inspectSupabaseSchema, inspectSupabaseTables } from './ivx-supabase-inspection';
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions, type IVXOwnerRequestContext } from './owner-only';

type AuditCheck<T = unknown> = {
  ok: boolean;
  value: T | null;
  error: string | null;
};

type AWSClientConfig = {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
};

export type IVXAuditReport = {
  ok: true;
  ownerOnly: true;
  readOnly: true;
  destructiveActionsEnabled: false;
  generatedAt: string;
  requestedBy: {
    userId: string;
    email: string | null;
    role: string | null;
    guardMode: string | null;
  };
  backend: Record<string, unknown>;
  supabase: Record<string, unknown>;
  amazon: Record<string, unknown>;
  code: Record<string, unknown>;
  verdict: {
    backendAccess: 'yes';
    supabaseInspection: 'yes' | 'blocked';
    amazonAccess: 'yes' | 'partial' | 'blocked';
    externalRuntimeControlDependency: 'not_active' | 'active_reference_found';
    writeActionsEnabled: false;
    honestBlockers: string[];
  };
};

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_AWS_REGION = 'us-east-1';

function nowIso(): string {
  return new Date().toISOString();
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function maskValue(value: string): string | null {
  const normalized = readTrimmed(value);
  if (!normalized) {
    return null;
  }
  if (normalized.length <= 10) {
    return `${normalized.slice(0, 2)}…${normalized.slice(-2)}`;
  }
  return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function capture<T>(fn: () => Promise<T>): Promise<AuditCheck<T>> {
  try {
    return { ok: true, value: await fn(), error: null };
  } catch (error) {
    return { ok: false, value: null, error: safeErrorMessage(error) };
  }
}

async function withAuditTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number = 7_000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function captureWithTimeout<T>(label: string, fn: () => Promise<T>, timeoutMs?: number): Promise<AuditCheck<T>> {
  return await capture(async () => await withAuditTimeout(fn(), label, timeoutMs));
}

function createAwsClientConfig(regionOverride?: string): AWSClientConfig {
  const accessKeyId = readTrimmed(process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = readTrimmed(process.env.AWS_SECRET_ACCESS_KEY);
  const sessionToken = readTrimmed(process.env.AWS_SESSION_TOKEN);
  const region = regionOverride || readTrimmed(process.env.AWS_REGION) || DEFAULT_AWS_REGION;
  const config: AWSClientConfig = { region };

  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }

  return config;
}

function decodeJwtRole(token: string): string | null {
  const normalized = readTrimmed(token);
  if (!normalized.includes('.')) {
    return null;
  }

  try {
    const payloadSegment = normalized.split('.')[1] ?? '';
    const padded = payloadSegment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
    return readTrimmed(payload.role) || null;
  } catch {
    return null;
  }
}

async function readProjectFile(relativePath: string): Promise<string | null> {
  const absolutePath = path.resolve(SERVER_ROOT, relativePath);
  if (!absolutePath.startsWith(SERVER_ROOT) || !existsSync(absolutePath)) {
    return null;
  }
  return await readFile(absolutePath, 'utf8');
}

async function buildCodeAudit(): Promise<Record<string, unknown>> {
  const [metroConfig, expoPackage, backendHono, ownerAI, supabaseInspection] = await Promise.all([
    readProjectFile('expo/metro.config.js'),
    readProjectFile('expo/package.json'),
    readProjectFile('backend/hono.ts'),
    readProjectFile('backend/api/ivx-owner-ai.ts'),
    readProjectFile('backend/api/ivx-supabase-inspection.ts'),
  ]);
  const searchable = [metroConfig, expoPackage, backendHono, ownerAI, supabaseInspection].filter((value): value is string => typeof value === 'string').join('\n');
  const activeReferences = ['legacyExternalSdk', 'legacyMetroWrapper', 'LegacyDevWrapper'].filter((needle) => searchable.includes(needle));

  return {
    filesChecked: [
      'expo/metro.config.js',
      'expo/package.json',
      'backend/hono.ts',
      'backend/api/ivx-owner-ai.ts',
      'backend/api/ivx-supabase-inspection.ts',
    ],
    plainExpoMetro: metroConfig === null ? null : !metroConfig.includes('legacyMetroWrapper') && !metroConfig.includes('legacyExternalSdk'),
    formerRuntimeDependencyInExpoPackage: expoPackage === null ? null : expoPackage.includes('legacyExternalSdk'),
    activeExternalRuntimeControlReferences: activeReferences,
    supabaseInspectionEndpointCodePresent: Boolean(supabaseInspection?.includes('handleIVXSupabaseInspectionRequest')),
    ownerAIInspectionToolCodePresent: Boolean(ownerAI?.includes('runSupabaseInspectionTool')),
    backendAuditEndpointCodePresent: Boolean(backendHono?.includes('/api/ivx/audit-report')),
  };
}

async function buildBackendAudit(): Promise<Record<string, unknown>> {
  const aiSnapshot = getIVXAIConfigurationSnapshot();
  return {
    server: 'hono',
    ownerGuard: 'assertIVXOwnerOnly',
    ownerOnlyEndpoints: [
      'POST /api/ivx/owner-ai',
      'GET /api/ivx/supabase/tables',
      'GET /api/ivx/supabase/schema',
      'GET /api/ivx/supabase/columns',
      'GET /api/ivx/supabase/rls',
      'GET /api/ivx/audit-report',
      'POST /api/aws/route53/audit',
      'POST /api/aws/route53/upsert',
    ],
    aiRuntimeConfigured: aiSnapshot.configured,
    aiRuntime: {
      model: aiSnapshot.model,
      endpoint: aiSnapshot.endpoint,
      runtime: aiSnapshot.runtime,
      phase: aiSnapshot.phase,
      layer: aiSnapshot.layer,
      hasGatewayUrl: aiSnapshot.hasGatewayUrl,
      hasGatewayApiKey: aiSnapshot.hasGatewayApiKey,
    },
    publicApiBaseUrlConfigured: Boolean(readTrimmed(process.env.EXPO_PUBLIC_API_BASE_URL) || readTrimmed(process.env.EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL)),
  };
}

async function buildSupabaseAudit(): Promise<Record<string, unknown>> {
  const serviceKey = readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_KEY);
  const anonKey = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRole = decodeJwtRole(serviceKey);
  const config = {
    hasSupabaseUrl: Boolean(readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL)),
    hasAnonKey: Boolean(anonKey),
    hasServiceKey: Boolean(serviceKey),
    serviceKeyRole: serviceRole,
    serviceKeyDiffersFromAnon: Boolean(serviceKey && anonKey && serviceKey !== anonKey),
    hasDbPasswordOrUrl: Boolean(
      readTrimmed(process.env.SUPABASE_DB_PASSWORD)
      || readTrimmed(process.env.SUPABASE_INSPECTION_DATABASE_URL)
      || readTrimmed(process.env.SUPABASE_READONLY_DATABASE_URL)
      || readTrimmed(process.env.SUPABASE_DB_URL)
      || readTrimmed(process.env.DATABASE_URL)
      || readTrimmed(process.env.POSTGRES_URL),
    ),
  };

  const [tables, schemas, columns, rls] = await Promise.all([
    capture(async () => await inspectSupabaseTables('public', null, 20)),
    capture(async () => await inspectSupabaseSchema('public', null, 20)),
    capture(async () => await inspectSupabaseColumns('public', null, 60)),
    capture(async () => await inspectSupabaseRls('public', null, 40)),
  ]);

  return {
    config,
    readOnlyCatalogQueries: {
      tables,
      schemas,
      columns,
      rls,
    },
    available: tables.ok || schemas.ok || columns.ok || rls.ok,
  };
}

async function buildAmazonAudit(): Promise<Record<string, unknown>> {
  const region = readTrimmed(process.env.AWS_REGION) || DEFAULT_AWS_REGION;
  const sharedConfig = createAwsClientConfig(region);
  const globalConfig = createAwsClientConfig('us-east-1');
  const sts = new STSClient(sharedConfig);
  const route53 = new Route53Client(globalConfig);
  const acm = new ACMClient(globalConfig);
  const cloudFront = new CloudFrontClient(globalConfig);
  const ec2 = new EC2Client(sharedConfig);
  const elbv2 = new ElasticLoadBalancingV2Client(sharedConfig);
  const ecs = new ECSClient(sharedConfig);
  const s3 = new S3Client(sharedConfig);
  const domainName = readTrimmed(process.env.DOMAIN_NAME) || 'ivxholding.com';
  const distributionId = readTrimmed(process.env.CLOUDFRONT_DISTRIBUTION_ID);
  const bucketName = readTrimmed(process.env.S3_BUCKET_NAME);

  const [
    callerIdentity,
    route53HostedZones,
    acmCertificates,
    cloudFrontCheck,
    loadBalancers,
    ec2Instances,
    ec2SecurityGroups,
    ec2Subnets,
    ecsClusters,
    s3Check,
  ] = await Promise.all([
    captureWithTimeout('AWS caller identity', async () => {
      const response = await sts.send(new GetCallerIdentityCommand({}));
      return {
        account: readTrimmed(response.Account) || null,
        arn: readTrimmed(response.Arn) || null,
        userId: readTrimmed(response.UserId) || null,
      };
    }),
    captureWithTimeout('AWS Route53 hosted zones', async () => {
      const response = await route53.send(new ListHostedZonesByNameCommand({ DNSName: `${domainName}.`, MaxItems: 5 }));
      return (response.HostedZones ?? []).map((zone) => ({
        id: readTrimmed(zone.Id).replace('/hostedzone/', ''),
        name: readTrimmed(zone.Name),
        privateZone: Boolean(zone.Config?.PrivateZone),
      }));
    }),
    captureWithTimeout('AWS ACM certificates', async () => {
      const response = await acm.send(new ListCertificatesCommand({ MaxItems: 5 }));
      return (response.CertificateSummaryList ?? []).map((certificate) => ({
        arn: maskValue(readTrimmed(certificate.CertificateArn)),
        domainName: readTrimmed(certificate.DomainName) || null,
        status: readTrimmed(certificate.Status) || null,
      }));
    }),
    captureWithTimeout('AWS CloudFront', async () => {
      if (distributionId) {
        const response = await cloudFront.send(new GetDistributionCommand({ Id: distributionId }));
        return {
          distributionId: readTrimmed(response.Distribution?.Id) || distributionId,
          domainName: readTrimmed(response.Distribution?.DomainName) || null,
          status: readTrimmed(response.Distribution?.Status) || null,
          aliases: response.Distribution?.DistributionConfig?.Aliases?.Items ?? [],
        };
      }
      const response = await cloudFront.send(new ListDistributionsCommand({ MaxItems: 5 }));
      return (response.DistributionList?.Items ?? []).map((distribution) => ({
        id: readTrimmed(distribution.Id),
        domainName: readTrimmed(distribution.DomainName),
        status: readTrimmed(distribution.Status),
        aliases: distribution.Aliases?.Items ?? [],
      }));
    }),
    captureWithTimeout('AWS load balancers', async () => {
      const response = await elbv2.send(new DescribeLoadBalancersCommand({}));
      return (response.LoadBalancers ?? []).slice(0, 10).map((loadBalancer) => ({
        arn: maskValue(readTrimmed(loadBalancer.LoadBalancerArn)),
        name: readTrimmed(loadBalancer.LoadBalancerName),
        dnsName: readTrimmed(loadBalancer.DNSName),
        state: readTrimmed(loadBalancer.State?.Code),
      }));
    }),
    captureWithTimeout('AWS EC2 instances', async () => {
      const response = await ec2.send(new DescribeInstancesCommand({
        Filters: [{ Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped'] }],
        MaxResults: 10,
      }));
      return (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []).slice(0, 10).map((instance) => ({
        instanceId: readTrimmed(instance.InstanceId),
        state: readTrimmed(instance.State?.Name),
        publicIpAddress: readTrimmed(instance.PublicIpAddress) || null,
        publicDnsName: readTrimmed(instance.PublicDnsName) || null,
      }));
    }),
    captureWithTimeout('AWS EC2 security groups', async () => {
      const response = await ec2.send(new DescribeSecurityGroupsCommand({}));
      return (response.SecurityGroups ?? []).slice(0, 10).map((group) => ({
        groupId: readTrimmed(group.GroupId),
        groupName: readTrimmed(group.GroupName),
        description: readTrimmed(group.Description),
      }));
    }),
    captureWithTimeout('AWS EC2 subnets', async () => {
      const response = await ec2.send(new DescribeSubnetsCommand({ MaxResults: 10 }));
      return (response.Subnets ?? []).slice(0, 10).map((subnet) => ({
        subnetId: readTrimmed(subnet.SubnetId),
        availabilityZone: readTrimmed(subnet.AvailabilityZone),
        vpcId: readTrimmed(subnet.VpcId),
        cidrBlock: readTrimmed(subnet.CidrBlock),
      }));
    }),
    captureWithTimeout('AWS ECS clusters', async () => {
      const response = await ecs.send(new ListClustersCommand({ maxResults: 10 }));
      return response.clusterArns ?? [];
    }),
    captureWithTimeout('AWS S3', async () => {
      if (bucketName) {
        await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
        return {
          mode: 'head_bucket',
          bucketName,
          reachable: true,
        };
      }
      const response = await s3.send(new ListBucketsCommand({}));
      return {
        mode: 'list_buckets',
        buckets: (response.Buckets ?? []).slice(0, 10).map((bucket) => ({
          name: readTrimmed(bucket.Name),
          creationDate: bucket.CreationDate?.toISOString?.() ?? null,
        })),
      };
    }),
  ]);

  const checks = {
    callerIdentity,
    route53HostedZones,
    acmCertificates,
    cloudFront: cloudFrontCheck,
    loadBalancers,
    ec2Instances,
    ec2SecurityGroups,
    ec2Subnets,
    ecsClusters,
    s3: s3Check,
  };

  const checkValues = Object.values(checks);
  const passed = checkValues.filter((check) => check.ok).length;
  const failed = checkValues.length - passed;

  return {
    config: {
      region,
      credentialSource: readTrimmed(process.env.AWS_ACCESS_KEY_ID) && readTrimmed(process.env.AWS_SECRET_ACCESS_KEY) ? 'environment' : 'default_provider_chain',
      hasAccessKeyId: Boolean(readTrimmed(process.env.AWS_ACCESS_KEY_ID)),
      hasSecretAccessKey: Boolean(readTrimmed(process.env.AWS_SECRET_ACCESS_KEY)),
      hasSessionToken: Boolean(readTrimmed(process.env.AWS_SESSION_TOKEN)),
      accessKeyIdPreview: maskValue(readTrimmed(process.env.AWS_ACCESS_KEY_ID)),
      cloudFrontDistributionIdConfigured: Boolean(distributionId),
      s3BucketNameConfigured: Boolean(bucketName),
    },
    checks,
    summary: {
      total: checkValues.length,
      passed,
      failed,
    },
  };
}

function extractBlockers(input: { supabase: Record<string, unknown>; amazon: Record<string, unknown>; code: Record<string, unknown> }): string[] {
  const blockers: string[] = [];
  const supabaseAvailable = input.supabase.available === true;
  if (!supabaseAvailable) {
    blockers.push('Supabase catalog inspection did not complete from the backend service. Check database URL/password/network reachability.');
  }

  const amazonSummary = input.amazon.summary as { failed?: unknown } | undefined;
  const amazonFailed = typeof amazonSummary?.failed === 'number' ? amazonSummary.failed : 0;
  if (amazonFailed > 0) {
    blockers.push(`${amazonFailed} Amazon discovery checks failed. Review the failed check errors in amazon.checks.`);
  }

  const activeReferences = Array.isArray(input.code.activeExternalRuntimeControlReferences) ? input.code.activeExternalRuntimeControlReferences : [];
  if (activeReferences.length > 0) {
    blockers.push(`Active external control references still exist: ${activeReferences.join(', ')}.`);
  }

  return blockers;
}

export async function buildIVXAuditReport(ownerContext: IVXOwnerRequestContext): Promise<IVXAuditReport> {
  const [backend, supabase, amazon, code] = await Promise.all([
    buildBackendAudit(),
    buildSupabaseAudit(),
    buildAmazonAudit(),
    buildCodeAudit(),
  ]);
  const blockers = extractBlockers({ supabase, amazon, code });
  const amazonSummary = amazon.summary as { failed?: unknown; passed?: unknown } | undefined;
  const amazonFailed = typeof amazonSummary?.failed === 'number' ? amazonSummary.failed : 0;
  const amazonPassed = typeof amazonSummary?.passed === 'number' ? amazonSummary.passed : 0;
  const activeReferences = Array.isArray(code.activeExternalRuntimeControlReferences) ? code.activeExternalRuntimeControlReferences : [];

  return {
    ok: true,
    ownerOnly: true,
    readOnly: true,
    destructiveActionsEnabled: false,
    generatedAt: nowIso(),
    requestedBy: {
      userId: ownerContext.userId,
      email: ownerContext.email ?? null,
      role: ownerContext.role ?? null,
      guardMode: ownerContext.guardMode ?? null,
    },
    backend,
    supabase,
    amazon,
    code,
    verdict: {
      backendAccess: 'yes',
      supabaseInspection: supabase.available === true ? 'yes' : 'blocked',
      amazonAccess: amazonFailed === 0 ? 'yes' : amazonPassed > 0 ? 'partial' : 'blocked',
      externalRuntimeControlDependency: activeReferences.length > 0 ? 'active_reference_found' : 'not_active',
      writeActionsEnabled: false,
      honestBlockers: blockers,
    },
  };
}

export function OPTIONS(): Response {
  return ownerOnlyOptions();
}

export async function handleIVXAuditReportRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return ownerOnlyJson({ error: 'Method not allowed.' }, 405);
    }

    const ownerContext = await assertIVXOwnerOnly(request);
    console.log('[IVXAuditReport] Audit report started:', {
      userId: ownerContext.userId,
      role: ownerContext.role,
      guardMode: ownerContext.guardMode,
    });
    const report = await buildIVXAuditReport(ownerContext);
    console.log('[IVXAuditReport] Audit report completed:', {
      userId: ownerContext.userId,
      supabaseInspection: report.verdict.supabaseInspection,
      amazonAccess: report.verdict.amazonAccess,
      externalRuntimeControlDependency: report.verdict.externalRuntimeControlDependency,
      blockers: report.verdict.honestBlockers.length,
    });
    return ownerOnlyJson(report as unknown as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX audit report failed.';
    console.log('[IVXAuditReport] Audit report failed:', message);
    return ownerOnlyJson({
      ok: false,
      ownerOnly: true,
      readOnly: true,
      destructiveActionsEnabled: false,
      error: message,
      generatedAt: nowIso(),
    }, message.toLowerCase().includes('owner') || message.toLowerCase().includes('auth') ? 401 : 500);
  }
}
