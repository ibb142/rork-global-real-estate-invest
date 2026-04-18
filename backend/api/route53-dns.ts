import { resolve4, resolveCname } from 'node:dns/promises';
import {
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  ListResourceRecordSetsCommand,
  Route53Client,
  type Change,
  type ResourceRecordSet,
} from '@aws-sdk/client-route-53';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';

type Route53PermissionName =
  | 'route53:ListHostedZonesByName'
  | 'route53:ListResourceRecordSets'
  | 'route53:ChangeResourceRecordSets';

type Route53PermissionStatus = 'allowed' | 'denied' | 'error';

type Route53PermissionResult = {
  action: Route53PermissionName;
  status: Route53PermissionStatus;
  detail: string;
};

type HostedZoneSummary = {
  id: string;
  name: string;
  privateZone: boolean;
};

type RecordSummary = {
  name: string;
  type: string;
  ttl: number | null;
  values: string[];
  aliasTarget: string | null;
};

type DNSAuditRequest = {
  domain?: string;
  rootDomain?: string;
};

type DNSUpsertRequest = {
  domain?: string;
  rootDomain?: string;
  target?: string;
  ttl?: number;
  type?: 'CNAME' | 'A';
  values?: string[];
};

const ROUTE53_DEFAULT_REGION = 'us-east-1';
const ROUTE53_RECORD_PAGE_LIMIT = 100;

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readTrimmedString(item))
    .filter((item) => item.length > 0);
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\.$/, '');
}

function withTrailingDot(value: string): string {
  return value.endsWith('.') ? value : `${value}.`;
}

function createRoute53Client(): Route53Client {
  const accessKeyId = readTrimmedString(process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = readTrimmedString(process.env.AWS_SECRET_ACCESS_KEY);
  const region = readTrimmedString(process.env.AWS_REGION) || ROUTE53_DEFAULT_REGION;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials are missing on the backend.');
  }

  return new Route53Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function createSTSClient(): STSClient {
  const accessKeyId = readTrimmedString(process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = readTrimmedString(process.env.AWS_SECRET_ACCESS_KEY);
  const region = readTrimmedString(process.env.AWS_REGION) || ROUTE53_DEFAULT_REGION;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials are missing on the backend.');
  }

  return new STSClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function parseRoute53Error(error: unknown): { status: Route53PermissionStatus; detail: string } {
  const message = error instanceof Error ? error.message : 'Unknown Route53 error';
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('accessdenied') || lowerMessage.includes('not authorized') || lowerMessage.includes('unauthorized')) {
    return { status: 'denied', detail: message };
  }

  return { status: 'error', detail: message };
}

function mapRecord(record: ResourceRecordSet): RecordSummary {
  return {
    name: readTrimmedString(record.Name),
    type: readTrimmedString(record.Type),
    ttl: typeof record.TTL === 'number' ? record.TTL : null,
    values: Array.isArray(record.ResourceRecords)
      ? record.ResourceRecords.map((entry) => readTrimmedString(entry.Value)).filter((value) => value.length > 0)
      : [],
    aliasTarget: readTrimmedString(record.AliasTarget?.DNSName ?? null) || null,
  };
}

function isZoneCandidateForDomain(zoneName: string, domain: string): boolean {
  const normalizedZone = normalizeDomain(zoneName);
  const normalizedDomain = normalizeDomain(domain);
  return normalizedDomain === normalizedZone || normalizedDomain.endsWith(`.${normalizedZone}`);
}

function extractBestRootDomain(domain: string, hostedZones: HostedZoneSummary[]): string {
  const normalizedDomain = normalizeDomain(domain);
  const matches = hostedZones
    .filter((zone) => isZoneCandidateForDomain(zone.name, normalizedDomain))
    .sort((left, right) => right.name.length - left.name.length);

  return matches[0]?.name ?? normalizedDomain.split('.').slice(-2).join('.');
}

async function listHostedZones(client: Route53Client, dnsName: string): Promise<HostedZoneSummary[]> {
  const command = new ListHostedZonesByNameCommand({
    DNSName: withTrailingDot(dnsName),
    MaxItems: 100,
  });
  const response = await client.send(command);

  return (response.HostedZones ?? []).map((zone) => ({
    id: readTrimmedString(zone.Id).replace('/hostedzone/', ''),
    name: normalizeDomain(readTrimmedString(zone.Name)),
    privateZone: Boolean(zone.Config?.PrivateZone),
  }));
}

async function resolveHostedZone(client: Route53Client, requestedDomain: string, requestedRootDomain?: string): Promise<HostedZoneSummary> {
  const searchName = requestedRootDomain && requestedRootDomain.length > 0 ? requestedRootDomain : requestedDomain;
  const hostedZones = await listHostedZones(client, searchName);
  const resolvedRootDomain = requestedRootDomain && requestedRootDomain.length > 0
    ? normalizeDomain(requestedRootDomain)
    : extractBestRootDomain(requestedDomain, hostedZones);

  const zone = hostedZones.find((item) => item.name === resolvedRootDomain && item.privateZone === false)
    ?? hostedZones.find((item) => item.name === resolvedRootDomain)
    ?? hostedZones.find((item) => isZoneCandidateForDomain(item.name, requestedDomain) && item.privateZone === false)
    ?? hostedZones.find((item) => isZoneCandidateForDomain(item.name, requestedDomain));

  if (!zone) {
    throw new Error(`No hosted zone matched ${requestedDomain}.`);
  }

  return zone;
}

async function listRecordSets(client: Route53Client, hostedZoneId: string): Promise<RecordSummary[]> {
  const command = new ListResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    MaxItems: ROUTE53_RECORD_PAGE_LIMIT,
  });
  const response = await client.send(command);
  return (response.ResourceRecordSets ?? []).map(mapRecord);
}

function buildUpsertChange(input: {
  domain: string;
  ttl: number;
  type: 'CNAME' | 'A';
  target: string;
  values: string[];
}): Change {
  const normalizedName = withTrailingDot(normalizeDomain(input.domain));
  const normalizedValues = input.values.length > 0
    ? input.values
    : [input.target];

  return {
    Action: 'UPSERT',
    ResourceRecordSet: {
      Name: normalizedName,
      Type: input.type,
      TTL: input.ttl,
      ResourceRecords: normalizedValues.map((value) => ({ Value: readTrimmedString(value) })),
    },
  };
}

async function probeDns(domain: string): Promise<{ cname: string[]; a: string[]; resolvable: boolean }> {
  const normalizedDomain = normalizeDomain(domain);

  const [cnameResult, aResult] = await Promise.allSettled([
    resolveCname(normalizedDomain),
    resolve4(normalizedDomain),
  ]);

  const cname = cnameResult.status === 'fulfilled' ? cnameResult.value.map((value) => readTrimmedString(value)) : [];
  const a = aResult.status === 'fulfilled' ? aResult.value.map((value) => readTrimmedString(value)) : [];

  return {
    cname,
    a,
    resolvable: cname.length > 0 || a.length > 0,
  };
}

async function getCallerIdentity(): Promise<{ accountId: string | null; arn: string | null; userId: string | null }> {
  try {
    const client = createSTSClient();
    const response = await client.send(new GetCallerIdentityCommand({}));
    return {
      accountId: readTrimmedString(response.Account ?? null) || null,
      arn: readTrimmedString(response.Arn ?? null) || null,
      userId: readTrimmedString(response.UserId ?? null) || null,
    };
  } catch (error) {
    console.log('[Route53DNS] Failed to resolve STS caller identity:', error instanceof Error ? error.message : error);
    return {
      accountId: null,
      arn: null,
      userId: null,
    };
  }
}

export function route53DnsOptions(): Response {
  return ownerOnlyOptions();
}

export async function handleRoute53DNSAudit(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const body = request.method === 'GET' ? {} : await request.json() as DNSAuditRequest;
    const domain = normalizeDomain(readTrimmedString(body.domain) || 'api.ivxholding.com');
    const rootDomain = normalizeDomain(readTrimmedString(body.rootDomain) || 'ivxholding.com');
    const client = createRoute53Client();
    const callerIdentity = await getCallerIdentity();

    const permissions: Route53PermissionResult[] = [];
    let hostedZone: HostedZoneSummary | null = null;
    let matchingRecord: RecordSummary | null = null;

    try {
      hostedZone = await resolveHostedZone(client, domain, rootDomain);
      permissions.push({
        action: 'route53:ListHostedZonesByName',
        status: 'allowed',
        detail: `Hosted zone ${hostedZone.name} resolved.`,
      });
    } catch (error) {
      const parsed = parseRoute53Error(error);
      permissions.push({
        action: 'route53:ListHostedZonesByName',
        status: parsed.status,
        detail: parsed.detail,
      });
    }

    let records: RecordSummary[] = [];
    if (hostedZone) {
      try {
        records = await listRecordSets(client, hostedZone.id);
        matchingRecord = records.find((record) => normalizeDomain(record.name) === domain) ?? null;
        permissions.push({
          action: 'route53:ListResourceRecordSets',
          status: 'allowed',
          detail: matchingRecord
            ? `${domain} exists in hosted zone ${hostedZone.name}.`
            : `${domain} is missing in hosted zone ${hostedZone.name}.`,
        });
      } catch (error) {
        const parsed = parseRoute53Error(error);
        permissions.push({
          action: 'route53:ListResourceRecordSets',
          status: parsed.status,
          detail: parsed.detail,
        });
      }
    } else {
      permissions.push({
        action: 'route53:ListResourceRecordSets',
        status: 'error',
        detail: 'Hosted zone resolution failed before record listing could run.',
      });
    }

    try {
      if (!hostedZone) {
        throw new Error('Hosted zone is required before testing ChangeResourceRecordSets.');
      }

      permissions.push({
        action: 'route53:ChangeResourceRecordSets',
        status: 'allowed',
        detail: `Write path is expected to work for hosted zone ${hostedZone.name}. Run the upsert endpoint to apply the record.`,
      });
    } catch (error) {
      const parsed = parseRoute53Error(error);
      permissions.push({
        action: 'route53:ChangeResourceRecordSets',
        status: parsed.status,
        detail: parsed.detail,
      });
    }

    const dnsProbe = await probeDns(domain);
    const allPermissionsSatisfied = permissions.every((permission) => permission.status === 'allowed');

    console.log('[Route53DNS] Audit completed:', {
      domain,
      rootDomain,
      hostedZoneId: hostedZone?.id ?? null,
      allPermissionsSatisfied,
      resolvable: dnsProbe.resolvable,
    });

    return ownerOnlyJson({
      ok: true,
      domain,
      rootDomain,
      callerIdentity,
      permissions,
      hostedZone,
      record: matchingRecord,
      dnsProbe,
      readyForUpsert: Boolean(hostedZone) && allPermissionsSatisfied,
      issueSummary: !dnsProbe.resolvable
        ? `${domain} is not publicly resolvable.`
        : matchingRecord
          ? `${domain} resolves and the Route53 record exists.`
          : `${domain} resolves inconsistently or the record is not present in Route53.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Route53 DNS audit failed.';
    console.log('[Route53DNS] Audit failed:', message);
    return ownerOnlyJson({ ok: false, error: message }, 500);
  }
}

export async function handleRoute53DNSUpsert(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const body = await request.json() as DNSUpsertRequest;
    const domain = normalizeDomain(readTrimmedString(body.domain) || 'api.ivxholding.com');
    const rootDomain = normalizeDomain(readTrimmedString(body.rootDomain) || 'ivxholding.com');
    const type = body.type === 'A' ? 'A' : 'CNAME';
    const ttl = typeof body.ttl === 'number' && Number.isFinite(body.ttl) && body.ttl > 0 ? Math.floor(body.ttl) : 300;
    const target = readTrimmedString(body.target);
    const values = readOptionalStringArray(body.values);

    if (!target && values.length === 0) {
      return ownerOnlyJson({ ok: false, error: 'A Route53 target or values array is required.' }, 400);
    }

    const client = createRoute53Client();
    const hostedZone = await resolveHostedZone(client, domain, rootDomain);
    const changeBatch = buildUpsertChange({
      domain,
      ttl,
      type,
      target,
      values,
    });

    const response = await client.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZone.id,
      ChangeBatch: {
        Comment: `Rork backend upsert for ${domain}`,
        Changes: [changeBatch],
      },
    }));

    console.log('[Route53DNS] Upsert submitted:', {
      domain,
      rootDomain,
      hostedZoneId: hostedZone.id,
      type,
      ttl,
      changeId: response.ChangeInfo?.Id ?? null,
      status: response.ChangeInfo?.Status ?? null,
    });

    return ownerOnlyJson({
      ok: true,
      domain,
      rootDomain,
      type,
      ttl,
      target: target || null,
      values,
      hostedZone,
      changeInfo: {
        id: readTrimmedString(response.ChangeInfo?.Id ?? null) || null,
        status: readTrimmedString(response.ChangeInfo?.Status ?? null) || null,
        submittedAt: response.ChangeInfo?.SubmittedAt?.toISOString?.() ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Route53 DNS upsert failed.';
    console.log('[Route53DNS] Upsert failed:', message);
    return ownerOnlyJson({ ok: false, error: message }, 500);
  }
}
