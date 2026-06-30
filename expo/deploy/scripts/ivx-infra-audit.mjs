import { resolve4, resolveCname } from 'node:dns/promises';
import { ACMClient, ListCertificatesCommand } from '@aws-sdk/client-acm';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { CloudFrontClient, GetDistributionCommand, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { ECSClient, DescribeClustersCommand, DescribeServicesCommand, ListClustersCommand, ListServicesCommand } from '@aws-sdk/client-ecs';
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ListHostedZonesByNameCommand, ListResourceRecordSetsCommand, Route53Client } from '@aws-sdk/client-route-53';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { createAwsRuntime, formatAwsCredentialError } from './aws-runtime.mjs';

const awsRuntime = createAwsRuntime(import.meta.url);

const APP_NAME = (process.env.APP_NAME ?? 'ivx-holdings').trim() || 'ivx-holdings';
const AWS_REGION = awsRuntime.diagnostics.region;
const DOMAIN_NAME = normalizeDomain(process.env.DOMAIN_NAME ?? 'ivxholding.com');
const API_DOMAIN = normalizeDomain(process.env.API_DOMAIN ?? 'api.ivxholding.com');
const STACK_NAME = `${APP_NAME}-stack`;
const CLOUDFRONT_DISTRIBUTION_ID = readTrimmed(process.env.CLOUDFRONT_DISTRIBUTION_ID);
const API_TARGET_DNS = normalizeDnsValue(process.env.API_TARGET_DNS ?? process.env.API_ELB_DNS ?? '');

const sharedConfig = {
  ...awsRuntime.clientConfig,
  region: AWS_REGION,
};

const sts = new STSClient(sharedConfig);
const route53 = new Route53Client({ ...sharedConfig, region: 'us-east-1' });
const acm = new ACMClient({ ...sharedConfig, region: 'us-east-1' });
const cloudFront = new CloudFrontClient({ ...sharedConfig, region: 'us-east-1' });
const cloudFormation = new CloudFormationClient(sharedConfig);
const elbv2 = new ElasticLoadBalancingV2Client(sharedConfig);
const ecs = new ECSClient(sharedConfig);

function readTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDomain(value) {
  return readTrimmed(value).toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\.$/, '');
}

function normalizeDnsValue(value) {
  return readTrimmed(value).replace(/^https?:\/\//i, '').replace(/\/$/, '').replace(/\.$/, '');
}

function previewText(value, maxLength = 240) {
  const normalized = readTrimmed(value);
  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function safeErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatAwsError(error) {
  return formatAwsCredentialError(error, awsRuntime.diagnostics);
}

function isHtmlContentType(contentType) {
  return typeof contentType === 'string' && contentType.toLowerCase().includes('text/html');
}

function isHtmlBody(body) {
  return /<!doctype html|<html|<head|<body/i.test(body);
}

function inferRoutingPath(record) {
  if (!record) {
    return 'missing';
  }

  const aliasTarget = normalizeDnsValue(record.aliasTarget ?? '');
  const firstValue = normalizeDnsValue(Array.isArray(record.values) ? record.values[0] ?? '' : '');
  const target = aliasTarget || firstValue;

  if (!target) {
    return 'unknown';
  }

  if (target.includes('cloudfront.net')) {
    return 'route53_to_cloudfront';
  }

  if (target.includes('elb.amazonaws.com')) {
    return 'route53_to_alb';
  }

  return 'unknown';
}

async function withTimeout(label, fn, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function getCallerIdentity() {
  try {
    const response = await sts.send(new GetCallerIdentityCommand({}));
    return {
      ok: true,
      accountId: readTrimmed(response.Account) || null,
      arn: readTrimmed(response.Arn) || null,
      userId: readTrimmed(response.UserId) || null,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      accountId: null,
      arn: null,
      userId: null,
      error: formatAwsError(error),
    };
  }
}

async function getHostedZone(domainName) {
  try {
    const response = await route53.send(new ListHostedZonesByNameCommand({
      DNSName: `${domainName}.`,
      MaxItems: 25,
    }));
    const hostedZones = (response.HostedZones ?? []).map((zone) => ({
      id: readTrimmed(zone.Id).replace('/hostedzone/', ''),
      name: normalizeDomain(zone.Name ?? ''),
      privateZone: Boolean(zone.Config?.PrivateZone),
    }));
    const zone = hostedZones.find((item) => item.name === domainName && item.privateZone === false) ?? null;

    return {
      ok: true,
      zone,
      hostedZones,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      zone: null,
      hostedZones: [],
      error: safeErrorMessage(error),
    };
  }
}

async function getApiRecord(zoneId) {
  if (!zoneId) {
    return {
      ok: false,
      record: null,
      error: 'Hosted zone unavailable.',
    };
  }

  try {
    const response = await route53.send(new ListResourceRecordSetsCommand({
      HostedZoneId: zoneId,
      StartRecordName: `${API_DOMAIN}.`,
      MaxItems: 10,
    }));
    const record = (response.ResourceRecordSets ?? []).find((item) => normalizeDomain(item.Name ?? '') === API_DOMAIN) ?? null;

    return {
      ok: true,
      record: record ? {
        name: readTrimmed(record.Name) || null,
        type: readTrimmed(record.Type) || null,
        ttl: typeof record.TTL === 'number' ? record.TTL : null,
        values: Array.isArray(record.ResourceRecords) ? record.ResourceRecords.map((entry) => readTrimmed(entry.Value)).filter(Boolean) : [],
        aliasTarget: readTrimmed(record.AliasTarget?.DNSName) || null,
      } : null,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      record: null,
      error: safeErrorMessage(error),
    };
  }
}

async function getPublicDnsProbe(domainName) {
  const [cnameResult, aResult] = await Promise.allSettled([
    resolveCname(domainName),
    resolve4(domainName),
  ]);

  const cname = cnameResult.status === 'fulfilled' ? cnameResult.value.map((value) => readTrimmed(value)).filter(Boolean) : [];
  const a = aResult.status === 'fulfilled' ? aResult.value.map((value) => readTrimmed(value)).filter(Boolean) : [];
  const errors = [
    cnameResult.status === 'rejected' ? safeErrorMessage(cnameResult.reason) : null,
    aResult.status === 'rejected' ? safeErrorMessage(aResult.reason) : null,
  ].filter(Boolean);

  return {
    cname,
    a,
    resolvable: cname.length > 0 || a.length > 0,
    errors,
  };
}

async function getCertificates() {
  try {
    const response = await acm.send(new ListCertificatesCommand({
      CertificateStatuses: ['ISSUED', 'PENDING_VALIDATION', 'INACTIVE'],
      MaxItems: 50,
    }));
    const certificates = (response.CertificateSummaryList ?? [])
      .map((item) => ({
        arn: readTrimmed(item.CertificateArn) || null,
        domainName: readTrimmed(item.DomainName) || null,
        status: readTrimmed(item.Status) || null,
      }))
      .filter((item) => item.domainName && (item.domainName === DOMAIN_NAME || item.domainName === `*.${DOMAIN_NAME}` || item.domainName.endsWith(`.${DOMAIN_NAME}`)));

    return {
      ok: true,
      certificates,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      certificates: [],
      error: safeErrorMessage(error),
    };
  }
}

async function getCloudFrontSummary() {
  try {
    if (CLOUDFRONT_DISTRIBUTION_ID) {
      const response = await cloudFront.send(new GetDistributionCommand({ Id: CLOUDFRONT_DISTRIBUTION_ID }));
      const distribution = response.Distribution;
      return {
        ok: true,
        distribution: distribution ? {
          id: readTrimmed(distribution.Id) || null,
          domainName: readTrimmed(distribution.DomainName) || null,
          status: readTrimmed(distribution.Status) || null,
          aliases: distribution.DistributionConfig?.Aliases?.Items ?? [],
        } : null,
        error: null,
      };
    }

    const response = await cloudFront.send(new ListDistributionsCommand({}));
    const distribution = (response.DistributionList?.Items ?? []).find((item) => {
      const aliases = item.Aliases?.Items ?? [];
      return aliases.includes(DOMAIN_NAME) || aliases.includes(`www.${DOMAIN_NAME}`) || aliases.includes(API_DOMAIN);
    }) ?? null;

    return {
      ok: true,
      distribution: distribution ? {
        id: readTrimmed(distribution.Id) || null,
        domainName: readTrimmed(distribution.DomainName) || null,
        status: readTrimmed(distribution.Status) || null,
        aliases: distribution.Aliases?.Items ?? [],
      } : null,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      distribution: null,
      error: safeErrorMessage(error),
    };
  }
}

async function getStackSummary() {
  try {
    const response = await cloudFormation.send(new DescribeStacksCommand({ StackName: STACK_NAME }));
    const stack = response.Stacks?.[0] ?? null;
    const outputs = Object.fromEntries((stack?.Outputs ?? []).map((item) => [readTrimmed(item.OutputKey), readTrimmed(item.OutputValue)]));

    return {
      ok: true,
      stack: stack ? {
        name: readTrimmed(stack.StackName) || null,
        status: readTrimmed(stack.StackStatus) || null,
        outputs,
      } : null,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      stack: null,
      error: safeErrorMessage(error),
    };
  }
}

async function getLoadBalancers(stackSummary) {
  try {
    const response = await elbv2.send(new DescribeLoadBalancersCommand({}));
    const stackAlbDns = normalizeDnsValue(stackSummary?.stack?.outputs?.ALBDNS ?? '');
    const loadBalancers = (response.LoadBalancers ?? []).map((item) => ({
      name: readTrimmed(item.LoadBalancerName) || null,
      dnsName: normalizeDnsValue(item.DNSName ?? ''),
      state: readTrimmed(item.State?.Code) || null,
      scheme: readTrimmed(item.Scheme) || null,
      type: readTrimmed(item.Type) || null,
      arn: readTrimmed(item.LoadBalancerArn) || null,
    }));
    const filtered = loadBalancers.filter((item) => item.dnsName === stackAlbDns || (item.name ?? '').includes('ivx') || (item.dnsName ?? '').includes('ivx'));

    return {
      ok: true,
      loadBalancers: filtered,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      loadBalancers: [],
      error: safeErrorMessage(error),
    };
  }
}

async function getEcsSummary() {
  try {
    const listResponse = await ecs.send(new ListClustersCommand({ maxResults: 20 }));
    const clusterArns = listResponse.clusterArns ?? [];
    if (clusterArns.length === 0) {
      return {
        ok: true,
        clusters: [],
        error: null,
      };
    }

    const describeResponse = await ecs.send(new DescribeClustersCommand({ clusters: clusterArns }));
    const clusters = [];

    for (const cluster of describeResponse.clusters ?? []) {
      const clusterArn = readTrimmed(cluster.clusterArn);
      if (!clusterArn) {
        continue;
      }

      const servicesResponse = await ecs.send(new ListServicesCommand({ cluster: clusterArn, maxResults: 20 }));
      const serviceArns = servicesResponse.serviceArns ?? [];
      const describedServices = serviceArns.length > 0
        ? await ecs.send(new DescribeServicesCommand({ cluster: clusterArn, services: serviceArns }))
        : { services: [] };

      const relevantServices = (describedServices.services ?? [])
        .map((service) => ({
          serviceName: readTrimmed(service.serviceName) || null,
          status: readTrimmed(service.status) || null,
          desiredCount: typeof service.desiredCount === 'number' ? service.desiredCount : null,
          runningCount: typeof service.runningCount === 'number' ? service.runningCount : null,
        }))
        .filter((service) => (service.serviceName ?? '').includes('ivx') || (readTrimmed(cluster.clusterName) || '').includes('ivx'));

      if (relevantServices.length > 0 || (readTrimmed(cluster.clusterName) || '').includes('ivx')) {
        clusters.push({
          clusterName: readTrimmed(cluster.clusterName) || null,
          status: readTrimmed(cluster.status) || null,
          services: relevantServices,
        });
      }
    }

    return {
      ok: true,
      clusters,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      clusters: [],
      error: safeErrorMessage(error),
    };
  }
}

async function fetchUrl(url) {
  try {
    const response = await withTimeout(`Fetch ${url}`, async (signal) => await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        'user-agent': 'ivx-infra-audit/1.0',
        accept: 'application/json, text/plain, */*',
      },
    }));
    const body = await response.text();
    const contentType = readTrimmed(response.headers.get('content-type')) || null;

    return {
      ok: true,
      status: response.status,
      contentType,
      location: readTrimmed(response.headers.get('location')) || null,
      isHtml: isHtmlContentType(contentType) || isHtmlBody(body),
      preview: previewText(body),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      contentType: null,
      location: null,
      isHtml: false,
      preview: null,
      error: safeErrorMessage(error),
    };
  }
}

function determineBlocker(input) {
  const callerIdentity = input.callerIdentity;
  const hostedZoneSummary = input.hostedZoneSummary;
  const route53RecordSummary = input.route53RecordSummary;
  const certificates = input.certificates;
  const routingPath = input.routingPath;
  const route53Record = input.route53Record;
  const publicDns = input.publicDns;
  const cloudFrontSummary = input.cloudFrontSummary;
  const loadBalancersSummary = input.loadBalancersSummary;
  const healthCheck = input.healthCheck;
  const landingOwnerAi = input.landingOwnerAi;
  const stackSummary = input.stackSummary;

  if (!callerIdentity.ok) {
    return `AWS caller identity failed: ${callerIdentity.error}`;
  }

  if (!hostedZoneSummary.ok) {
    return `Route53 hosted zone discovery failed: ${hostedZoneSummary.error}`;
  }

  if (hostedZoneSummary.zone && !route53RecordSummary.ok) {
    return `Route53 api.ivxholding.com record lookup failed: ${route53RecordSummary.error}`;
  }

  if (!certificates.ok) {
    return `ACM certificate discovery failed: ${certificates.error}`;
  }

  if (routingPath === 'route53_to_cloudfront' && !cloudFrontSummary.ok) {
    return `CloudFront distribution discovery failed: ${cloudFrontSummary.error}`;
  }

  if (routingPath === 'route53_to_alb' && !loadBalancersSummary.ok) {
    return `ALB discovery failed: ${loadBalancersSummary.error}`;
  }

  if (!route53Record) {
    return 'Route53 record missing for api.ivxholding.com';
  }

  if (!publicDns.resolvable) {
    return 'Public DNS for api.ivxholding.com is not resolving';
  }

  if (routingPath === 'route53_to_cloudfront' && !cloudFrontSummary.distribution) {
    return 'CloudFront distribution for api.ivxholding.com is missing or inaccessible';
  }

  if (routingPath === 'route53_to_alb' && loadBalancersSummary.loadBalancers.length === 0 && !API_TARGET_DNS && !stackSummary?.stack?.outputs?.ALBDNS) {
    return 'ALB target for api.ivxholding.com is missing or inaccessible';
  }

  if (!healthCheck.ok) {
    return `https://api.ivxholding.com/health is unreachable: ${healthCheck.error}`;
  }

  if (healthCheck.status !== 200) {
    return `https://api.ivxholding.com/health returned HTTP ${healthCheck.status}`;
  }

  if (healthCheck.isHtml) {
    return 'https://api.ivxholding.com/health returned HTML instead of backend JSON';
  }

  if (!landingOwnerAi.ok) {
    return `https://ivxholding.com/api/ivx/owner-ai is unreachable: ${landingOwnerAi.error}`;
  }

  if (landingOwnerAi.isHtml) {
    return 'https://ivxholding.com/api/ivx/owner-ai is routed to landing HTML instead of backend JSON';
  }

  if (landingOwnerAi.status !== 200 && landingOwnerAi.status !== 401 && landingOwnerAi.status !== 403 && landingOwnerAi.status !== 405) {
    return `https://ivxholding.com/api/ivx/owner-ai returned unexpected HTTP ${landingOwnerAi.status}`;
  }

  return null;
}

async function main() {
  const callerIdentity = await getCallerIdentity();
  const hostedZoneSummary = await getHostedZone(DOMAIN_NAME);
  const route53RecordSummary = await getApiRecord(hostedZoneSummary.zone?.id ?? null);
  const publicDns = await getPublicDnsProbe(API_DOMAIN);
  const certificates = await getCertificates();
  const cloudFrontSummary = await getCloudFrontSummary();
  const stackSummary = await getStackSummary();
  const loadBalancersSummary = await getLoadBalancers(stackSummary);
  const ecsSummary = await getEcsSummary();
  const routingPath = inferRoutingPath(route53RecordSummary.record);
  const healthCheck = publicDns.resolvable ? await fetchUrl(`https://${API_DOMAIN}/health`) : {
    ok: false,
    status: null,
    contentType: null,
    location: null,
    isHtml: false,
    preview: null,
    error: 'Skipped because public DNS is not resolving.',
  };
  const landingOwnerAi = await fetchUrl(`https://${DOMAIN_NAME}/api/ivx/owner-ai`);
  const exactBlocker = determineBlocker({
    callerIdentity,
    hostedZoneSummary,
    route53RecordSummary,
    certificates,
    routingPath,
    route53Record: route53RecordSummary.record,
    publicDns,
    cloudFrontSummary,
    loadBalancersSummary,
    healthCheck,
    landingOwnerAi,
    stackSummary,
  });

  const result = {
    ok: exactBlocker === null,
    finalStatus: exactBlocker === null ? 'FULLY FIXED' : `BLOCKED BY ${exactBlocker}`,
    exactBlocker,
    callerIdentity,
    dns: {
      domainName: DOMAIN_NAME,
      apiDomain: API_DOMAIN,
      hostedZone: hostedZoneSummary.zone,
      hostedZoneDiscoveryError: hostedZoneSummary.error,
      apiRecord: route53RecordSummary.record,
      apiRecordError: route53RecordSummary.error,
      publicDns,
      inferredRoutingPath: routingPath,
    },
    http: {
      apiHealth: healthCheck,
      landingOwnerAi,
    },
    aws: {
      runtime: awsRuntime.diagnostics,
      certificates,
      cloudFront: cloudFrontSummary,
      cloudFormation: stackSummary,
      loadBalancers: loadBalancersSummary,
      ecs: ecsSummary,
    },
  };

  console.log(JSON.stringify(result, null, 2));

  if (exactBlocker !== null) {
    process.exitCode = 1;
  }
}

await main();
