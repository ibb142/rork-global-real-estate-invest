/**
 * IVX AWS Deployment Tool
 *
 * Comprehensive AWS operations using the AWS SDK:
 *   - STS identity verification (whoami)
 *   - S3 bucket listing + object inspection
 *   - CloudFront distribution status + invalidation
 *   - IAM user + attached policies
 *   - Route53 hosted zones
 *   - ACM certificate listing
 *   - EC2 instance overview
 *   - ECS cluster + service status
 *
 * All credentials come from the IVX Secure Vault with fallback to standard
 * AWS env vars. No secret values are ever returned.
 */

import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { S3Client, ListBucketsCommand, HeadBucketCommand, GetBucketLocationCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { CloudFrontClient, ListDistributionsCommand, GetDistributionCommand, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { IAMClient, ListUsersCommand, GetUserCommand, ListAttachedUserPoliciesCommand } from '@aws-sdk/client-iam';
import { Route53Client, ListHostedZonesByNameCommand } from '@aws-sdk/client-route-53';
import { ACMClient, ListCertificatesCommand } from '@aws-sdk/client-acm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { ECSClient, ListClustersCommand, ListServicesCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs';

// ─── Types ───────────────────────────────────────────────────────────

export interface AwsIdentity {
  userId: string;
  account: string;
  arn: string;
}

export interface AwsS3Bucket {
  name: string;
  createdAt: string;
  region: string | null;
}

export interface AwsCloudFrontDistribution {
  id: string;
  domainName: string;
  status: string;
  enabled: boolean;
  originDomain: string | null;
}

export interface AwsIamUser {
  userName: string;
  arn: string;
  createDate: string;
  attachedPolicies: string[];
}

export interface AwsRoute53Zone {
  id: string;
  name: string;
  recordCount: number;
}

export interface AwsAcmCert {
  domainName: string;
  certificateArn: string;
  status: string;
  type: string;
}

export interface AwsEc2Instance {
  instanceId: string;
  state: string;
  type: string;
  publicIp: string | null;
  privateIp: string | null;
}

export interface AwsEcsService {
  clusterArn: string;
  serviceArn: string;
  serviceName: string;
  status: string;
  runningCount: number;
  desiredCount: number;
}

export interface AwsToolResult {
  ok: boolean;
  error: string | null;
  identity?: AwsIdentity;
  buckets?: AwsS3Bucket[];
  distributions?: AwsCloudFrontDistribution[];
  iamUsers?: AwsIamUser[];
  hostedZones?: AwsRoute53Zone[];
  certificates?: AwsAcmCert[];
  ec2Instances?: AwsEc2Instance[];
  ecsServices?: AwsEcsService[];
  invalidation?: { id: string; status: string; path: string };
}

// ─── Credential Helpers ──────────────────────────────────────────────

function getAwsCredentials(): { accessKeyId: string; secretAccessKey: string; region: string } {
  return {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID ?? process.env.IVX_AWS_ACCESS_KEY_ID ?? '').trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY ?? process.env.IVX_AWS_SECRET_ACCESS_KEY ?? '').trim(),
    region: (process.env.AWS_REGION ?? process.env.IVX_AWS_REGION ?? 'us-east-1').trim(),
  };
}

function isConfigured(): boolean {
  const c = getAwsCredentials();
  return c.accessKeyId.length > 0 && c.secretAccessKey.length > 0;
}

function getClientConfig(): { region: string; credentials: { accessKeyId: string; secretAccessKey: string } } | null {
  const c = getAwsCredentials();
  if (!c.accessKeyId || !c.secretAccessKey) return null;
  return {
    region: c.region || 'us-east-1',
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  };
}

// ─── STS Identity ────────────────────────────────────────────────────

export async function getIdentity(): Promise<AwsToolResult> {
  if (!isConfigured()) return { ok: false, error: 'AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not configured' };
  const cfg = getClientConfig()!;
  try {
    const client = new STSClient(cfg);
    const result = await client.send(new GetCallerIdentityCommand({}));
    return {
      ok: true,
      error: null,
      identity: {
        userId: result.UserId ?? 'unknown',
        account: result.Account ?? 'unknown',
        arn: result.Arn ?? 'unknown',
      },
    };
  } catch (err) {
    return { ok: false, error: `STS error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── S3 Operations ───────────────────────────────────────────────────

export async function listBuckets(): Promise<AwsToolResult> {
  if (!isConfigured()) return { ok: false, error: 'AWS credentials not configured' };
  const cfg = getClientConfig()!;
  try {
    const client = new S3Client(cfg);
    const result = await client.send(new ListBucketsCommand({}));
    const buckets: AwsS3Bucket[] = [];
    for (const b of result.Buckets ?? []) {
      let region: string | null = null;
      try {
        const locResult = await client.send(new GetBucketLocationCommand({ Bucket: b.Name }));
        region = locResult.LocationConstraint ?? 'us-east-1';
      } catch { /* ignore per-bucket errors */ }
      buckets.push({
        name: b.Name ?? 'unknown',
        createdAt: b.CreationDate?.toISOString() ?? 'unknown',
        region,
      });
    }
    return { ok: true, error: null, buckets };
  } catch (err) {
    return { ok: false, error: `S3 error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function listBucketObjects(bucketName: string, maxKeys: number = 20): Promise<AwsToolResult & { objects?: Array<{ key: string; size: number; lastModified: string }> }> {
  if (!isConfigured()) return { ok: false, error: 'AWS credentials not configured' };
  const cfg = getClientConfig()!;
  try {
    const client = new S3Client(cfg);
    const result = await client.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: maxKeys }));
    const objects = (result.Contents ?? []).map(o => ({
      key: o.Key ?? 'unknown',
      size: o.Size ?? 0,
      lastModified: o.LastModified?.toISOString() ?? 'unknown',
    }));
    return { ok: true, error: null, objects };
  } catch (err) {
    return { ok: false, error: `S3 list error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── CloudFront Operations ───────────────────────────────────────────

export async function listDistributions(): Promise<AwsToolResult> {
  if (!isConfigured()) return { ok: false, error: 'AWS credentials not configured' };
  const cfg = getClientConfig()!;
  try {
    const client = new CloudFrontClient(cfg);
    const result = await client.send(new ListDistributionsCommand({}));
    const distros: AwsCloudFrontDistribution[] = (result.DistributionList?.Items ?? []).map(d => ({
      id: d.Id ?? 'unknown',
      domainName: d.DomainName ?? 'unknown',
      status: d.Status ?? 'unknown',
      enabled: d.Enabled ?? false,
      originDomain: d.Origins?.Items?.[0]?.DomainName ?? null,
    }));
    return { ok: true, error: null, distributions: distros };
  } catch (err) {
    return { ok: false, error: `CloudFront error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function createInvalidation(distributionId: string, paths: string[]): Promise<AwsToolResult> {
  if (!isConfigured()) return { ok: false, error: 'AWS credentials not configured' };
  if (!distributionId || paths.length === 0) return { ok: false, error: 'distributionId and paths are required' };
  const cfg = getClientConfig()!;
  try {
    const client = new CloudFrontClient(cfg);
    const callerRef = `ivx-invalidation-${Date.now()}`;
    const result = await client.send(new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: callerRef,
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    }));
    return {
      ok: true,
      error: null,
      invalidation: {
        id: result.Invalidation?.Id ?? 'unknown',
        status: result.Invalidation?.Status ?? 'unknown',
        path: paths.join(', '),
      },
    };
  } catch (err) {
    return { ok: false, error: `CloudFront invalidation error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── IAM Operations ──────────────────────────────────────────────────

export async function listIamUsers(): Promise<AwsToolResult> {
  if (!isConfigured()) return { ok: false, error: 'AWS credentials not configured' };
  const cfg = getClientConfig()!;
  try {
    const client = new IAMClient(cfg);
    const result = await client.send(new ListUsersCommand({}));
    const users: AwsIamUser[] = [];
    for (const u of result.Users ?? []) {
      const userName = u.UserName ?? 'unknown';
      let attachedPolicies: string[] = [];
      try {
        const polResult = await client.send(new ListAttachedUserPoliciesCommand({ UserName: userName }));
        attachedPolicies = (polResult.AttachedPolicies ?? []).map(p => p.PolicyName ?? 'unknown');
      } catch { /* ignore per-user policy errors */ }
      users.push({
        userName,
        arn: u.Arn ?? 'unknown',
        createDate: u.CreateDate?.toISOString() ?? 'unknown',
        attachedPolicies,
      });
    }
    return { ok: true, error: null, iamUsers: users };
  } catch (err) {
    return { ok: false, error: `IAM error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Route53 Operations ──────────────────────────────────────────────

export async function listHostedZones(): Promise<AwsToolResult> {
  if (!isConfigured()) return { ok: false, error: 'AWS credentials not configured' };
  const cfg = getClientConfig()!;
  try {
    const client = new Route53Client(cfg);
    const result = await client.send(new ListHostedZonesByNameCommand({}));
    const zones: AwsRoute53Zone[] = (result.HostedZones ?? []).map(z => ({
      id: z.Id?.replace('/hostedzone/', '') ?? 'unknown',
      name: z.Name ?? 'unknown',
      recordCount: z.ResourceRecordSetCount ?? 0,
    }));
    return { ok: true, error: null, hostedZones: zones };
  } catch (err) {
    return { ok: false, error: `Route53 error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── ACM Operations ──────────────────────────────────────────────────

export async function listCertificates(): Promise<AwsToolResult> {
  if (!isConfigured()) return { ok: false, error: 'AWS credentials not configured' };
  const cfg = getClientConfig()!;
  try {
    const client = new ACMClient(cfg);
    const result = await client.send(new ListCertificatesCommand({}));
    const certs: AwsAcmCert[] = (result.CertificateSummaryList ?? []).map(c => ({
      domainName: c.DomainName ?? 'unknown',
      certificateArn: c.CertificateArn ?? 'unknown',
      status: 'unknown',
      type: 'unknown',
    }));
    return { ok: true, error: null, certificates: certs };
  } catch (err) {
    return { ok: false, error: `ACM error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── EC2 Operations ──────────────────────────────────────────────────

export async function listEc2Instances(): Promise<AwsToolResult> {
  if (!isConfigured()) return { ok: false, error: 'AWS credentials not configured' };
  const cfg = getClientConfig()!;
  try {
    const client = new EC2Client(cfg);
    const result = await client.send(new DescribeInstancesCommand({}));
    const instances: AwsEc2Instance[] = [];
    for (const reservation of result.Reservations ?? []) {
      for (const inst of reservation.Instances ?? []) {
        instances.push({
          instanceId: inst.InstanceId ?? 'unknown',
          state: inst.State?.Name ?? 'unknown',
          type: inst.InstanceType ?? 'unknown',
          publicIp: inst.PublicIpAddress ?? null,
          privateIp: inst.PrivateIpAddress ?? null,
        });
      }
    }
    return { ok: true, error: null, ec2Instances: instances };
  } catch (err) {
    return { ok: false, error: `EC2 error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── ECS Operations ──────────────────────────────────────────────────

export async function listEcsServices(): Promise<AwsToolResult> {
  if (!isConfigured()) return { ok: false, error: 'AWS credentials not configured' };
  const cfg = getClientConfig()!;
  try {
    const client = new ECSClient(cfg);
    const clustersResult = await client.send(new ListClustersCommand({}));
    const services: AwsEcsService[] = [];
    for (const clusterArn of clustersResult.clusterArns ?? []) {
      try {
        const svcResult = await client.send(new ListServicesCommand({ cluster: clusterArn }));
        if (svcResult.serviceArns && svcResult.serviceArns.length > 0) {
          const descResult = await client.send(new DescribeServicesCommand({
            cluster: clusterArn,
            services: svcResult.serviceArns,
          }));
          for (const svc of descResult.services ?? []) {
            services.push({
              clusterArn,
              serviceArn: svc.serviceArn ?? 'unknown',
              serviceName: svc.serviceName ?? 'unknown',
              status: svc.status ?? 'unknown',
              runningCount: svc.runningCount ?? 0,
              desiredCount: svc.desiredCount ?? 0,
            });
          }
        }
      } catch { /* ignore per-cluster errors */ }
    }
    return { ok: true, error: null, ecsServices: services };
  } catch (err) {
    return { ok: false, error: `ECS error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Combined Status ─────────────────────────────────────────────────

export async function getFullAwsStatus(): Promise<AwsToolResult> {
  if (!isConfigured()) {
    return { ok: false, error: 'AWS credentials not configured — AWS tool is inactive' };
  }

  const [identity, buckets, distributions, hostedZones, certificates] = await Promise.all([
    getIdentity(),
    listBuckets(),
    listDistributions(),
    listHostedZones(),
    listCertificates(),
  ]);

  const errors = [identity.error, buckets.error, distributions.error, hostedZones.error, certificates.error]
    .filter(Boolean);

  return {
    ok: identity.ok,
    error: errors.length > 0 ? errors.join('; ') : null,
    identity: identity.identity,
    buckets: buckets.buckets,
    distributions: distributions.distributions,
    hostedZones: hostedZones.hostedZones,
    certificates: certificates.certificates,
  };
}
