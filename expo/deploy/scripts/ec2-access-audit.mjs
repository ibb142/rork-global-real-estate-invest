import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { DescribeInstancesCommand, DescribeSecurityGroupsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { createAwsRuntime, formatAwsCredentialError, readTrimmedEnv } from './aws-runtime.mjs';

const awsRuntime = createAwsRuntime(import.meta.url);
const AWS_REGION = awsRuntime.diagnostics.region;
const ec2 = new EC2Client({
  ...awsRuntime.clientConfig,
  region: AWS_REGION,
});

const TARGET_INSTANCE_ID = readTrimmedEnv('INSTANCE_ID');
const API_DOMAIN = normalizeHostCandidate(readTrimmedEnv('API_DOMAIN') || 'api.ivxholding.com');
const CHAT_DOMAIN = normalizeHostCandidate(readTrimmedEnv('CHAT_DOMAIN') || 'chat.ivxholding.com');
const TARGET_HOST_HINT = normalizeHostCandidate(
  readTrimmedEnv('EC2_HOST')
  || readTrimmedEnv('REMOTE_HOST')
  || readTrimmedEnv('PUBLIC_IP_HINT')
  || readTrimmedEnv('EXPECTED_PUBLIC_IP')
  || API_DOMAIN
);
const PORTS_TO_AUDIT = [22, 80, 443];
const PUBLIC_PROBE_HOSTS = [...new Set([TARGET_HOST_HINT, API_DOMAIN, CHAT_DOMAIN].filter(Boolean))];

function readTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHostCandidate(value) {
  const normalized = readTrimmed(value)
    .replace(/^https?:\/\//i, '')
    .replace(/^ssh:\/\//i, '')
    .replace(/\/+$/, '');

  if (!normalized) {
    return '';
  }

  if (normalized.includes('@') && normalized.indexOf('@') === normalized.lastIndexOf('@')) {
    return normalized.split('@', 2)[1] ?? '';
  }

  if (normalized.startsWith('[') && normalized.includes(']')) {
    return normalized.slice(1, normalized.indexOf(']'));
  }

  if (normalized.includes(':') && normalized.indexOf(':') === normalized.lastIndexOf(':')) {
    const [hostPart, portPart] = normalized.split(':', 2);
    if (/^[0-9]+$/.test(portPart ?? '')) {
      return hostPart ?? '';
    }
  }

  return normalized;
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function extractAwsErrorSummary(error) {
  return {
    name: typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : 'UnknownError',
    code: typeof error === 'object' && error !== null && 'Code' in error ? String(error.Code) : null,
    message: safeError(error),
    formatted: formatAwsCredentialError(error, awsRuntime.diagnostics),
  };
}

function isIpv4Address(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(readTrimmed(value));
}

function buildTagMap(tags) {
  const entries = Array.isArray(tags)
    ? tags
        .map((tag) => [readTrimmed(tag?.Key), readTrimmed(tag?.Value)])
        .filter(([key]) => Boolean(key))
    : [];

  return Object.fromEntries(entries);
}

function getInstanceName(tagMap) {
  return readTrimmed(tagMap.Name) || readTrimmed(tagMap.name) || null;
}

function matchesHostHint(instanceSummary) {
  if (!TARGET_HOST_HINT) {
    return false;
  }

  const candidates = [
    instanceSummary.publicIpAddress,
    instanceSummary.publicDnsName,
    instanceSummary.privateIpAddress,
    instanceSummary.privateDnsName,
  ]
    .map((value) => normalizeHostCandidate(value ?? ''))
    .filter(Boolean);

  return candidates.includes(TARGET_HOST_HINT);
}

function formatSources(permission) {
  const ipv4Sources = Array.isArray(permission.IpRanges)
    ? permission.IpRanges.map((entry) => readTrimmed(entry?.CidrIp)).filter(Boolean)
    : [];
  const ipv6Sources = Array.isArray(permission.Ipv6Ranges)
    ? permission.Ipv6Ranges.map((entry) => readTrimmed(entry?.CidrIpv6)).filter(Boolean)
    : [];
  const securityGroupSources = Array.isArray(permission.UserIdGroupPairs)
    ? permission.UserIdGroupPairs.map((entry) => readTrimmed(entry?.GroupId)).filter(Boolean)
    : [];

  return {
    ipv4Sources,
    ipv6Sources,
    securityGroupSources,
  };
}

function ruleCoversPort(permission, port) {
  const protocol = readTrimmed(permission.IpProtocol);
  if (!protocol) {
    return false;
  }

  if (protocol === '-1') {
    return true;
  }

  if (protocol.toLowerCase() !== 'tcp') {
    return false;
  }

  const fromPort = typeof permission.FromPort === 'number' ? permission.FromPort : null;
  const toPort = typeof permission.ToPort === 'number' ? permission.ToPort : null;

  if (fromPort === null || toPort === null) {
    return false;
  }

  return fromPort <= port && port <= toPort;
}

function summarizePermission(permission, port) {
  const protocol = readTrimmed(permission.IpProtocol) || null;
  const fromPort = typeof permission.FromPort === 'number' ? permission.FromPort : null;
  const toPort = typeof permission.ToPort === 'number' ? permission.ToPort : null;
  const sources = formatSources(permission);
  const openToWorld = sources.ipv4Sources.includes('0.0.0.0/0') || sources.ipv6Sources.includes('::/0');

  return {
    port,
    protocol,
    fromPort,
    toPort,
    openToWorld,
    ...sources,
  };
}

async function resolveProbeHost(host) {
  const normalizedHost = normalizeHostCandidate(host);

  if (!normalizedHost) {
    return {
      inputHost: host || null,
      normalizedHost: null,
      resolvedAddresses: [],
      resolutionError: 'No host provided',
    };
  }

  if (isIpv4Address(normalizedHost)) {
    return {
      inputHost: host,
      normalizedHost,
      resolvedAddresses: [normalizedHost],
      resolutionError: null,
    };
  }

  try {
    const records = await lookup(normalizedHost, { all: true });
    return {
      inputHost: host,
      normalizedHost,
      resolvedAddresses: [...new Set(records.map((record) => readTrimmed(record.address)).filter(Boolean))],
      resolutionError: null,
    };
  } catch (error) {
    return {
      inputHost: host,
      normalizedHost,
      resolvedAddresses: [],
      resolutionError: safeError(error),
    };
  }
}

function probeTcpPort(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      finalize({
        port,
        targetHost: host,
        open: true,
        error: null,
      });
    });
    socket.once('timeout', () => {
      finalize({
        port,
        targetHost: host,
        open: false,
        error: `Timed out after ${timeoutMs}ms`,
      });
    });
    socket.once('error', (error) => {
      finalize({
        port,
        targetHost: host,
        open: false,
        error: safeError(error),
      });
    });

    try {
      socket.connect(port, host);
    } catch (error) {
      finalize({
        port,
        targetHost: host,
        open: false,
        error: safeError(error),
      });
    }
  });
}

async function getPublicNetworkProbe(host) {
  const resolution = await resolveProbeHost(host);
  const connectHost = resolution.resolvedAddresses[0] ?? resolution.normalizedHost;
  const portAudit = connectHost
    ? await Promise.all(PORTS_TO_AUDIT.map((port) => probeTcpPort(connectHost, port)))
    : [];

  return {
    inputHost: resolution.inputHost,
    normalizedHost: resolution.normalizedHost,
    resolvedAddresses: resolution.resolvedAddresses,
    resolutionError: resolution.resolutionError,
    connectHost: connectHost || null,
    portAudit,
  };
}

async function listInstances() {
  const instances = [];
  let nextToken;

  do {
    const response = await ec2.send(new DescribeInstancesCommand({
      ...(TARGET_INSTANCE_ID ? { InstanceIds: [TARGET_INSTANCE_ID] } : {}),
      ...(!TARGET_INSTANCE_ID
        ? {
            Filters: [
              {
                Name: 'instance-state-name',
                Values: ['pending', 'running', 'stopping', 'stopped'],
              },
            ],
            MaxResults: 100,
          }
        : {}),
      ...(nextToken ? { NextToken: nextToken } : {}),
    }));

    const pageInstances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
    instances.push(...pageInstances);
    nextToken = response.NextToken;
  } while (nextToken);

  return instances;
}

async function describeSecurityGroups(groupIds) {
  if (groupIds.length === 0) {
    return [];
  }

  const response = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: groupIds }));
  return response.SecurityGroups ?? [];
}

function summarizeInstance(instance) {
  const tagMap = buildTagMap(instance.Tags);
  const securityGroups = Array.isArray(instance.SecurityGroups) ? instance.SecurityGroups : [];

  return {
    instanceId: readTrimmed(instance.InstanceId) || null,
    name: getInstanceName(tagMap),
    state: readTrimmed(instance.State?.Name) || null,
    instanceType: readTrimmed(instance.InstanceType) || null,
    imageId: readTrimmed(instance.ImageId) || null,
    launchTime: instance.LaunchTime ? new Date(instance.LaunchTime).toISOString() : null,
    availabilityZone: readTrimmed(instance.Placement?.AvailabilityZone) || null,
    publicIpAddress: readTrimmed(instance.PublicIpAddress) || null,
    publicDnsName: readTrimmed(instance.PublicDnsName) || null,
    privateIpAddress: readTrimmed(instance.PrivateIpAddress) || null,
    privateDnsName: readTrimmed(instance.PrivateDnsName) || null,
    keyName: readTrimmed(instance.KeyName) || null,
    subnetId: readTrimmed(instance.SubnetId) || null,
    vpcId: readTrimmed(instance.VpcId) || null,
    securityGroupIds: securityGroups.map((group) => readTrimmed(group.GroupId)).filter(Boolean),
    securityGroupNames: securityGroups.map((group) => readTrimmed(group.GroupName)).filter(Boolean),
    tags: tagMap,
  };
}

function summarizeSecurityGroup(group) {
  const permissions = Array.isArray(group.IpPermissions) ? group.IpPermissions : [];
  const portAuditEntries = PORTS_TO_AUDIT.map((port) => {
    const matchingRules = permissions
      .filter((permission) => ruleCoversPort(permission, port))
      .map((permission) => summarizePermission(permission, port));

    return [String(port), {
      covered: matchingRules.length > 0,
      openToWorld: matchingRules.some((rule) => rule.openToWorld),
      rules: matchingRules,
    }];
  });

  return {
    groupId: readTrimmed(group.GroupId) || null,
    groupName: readTrimmed(group.GroupName) || null,
    description: readTrimmed(group.Description) || null,
    vpcId: readTrimmed(group.VpcId) || null,
    inboundPortAudit: Object.fromEntries(portAuditEntries),
  };
}

function buildRecommendations(instanceSummaries, securityGroupSummaries, options = {}) {
  const { describeInstancesError = null, describeSecurityGroupsError = null, publicNetworkProbes = [] } = options;
  const recommendations = [];
  const runningInstances = instanceSummaries.filter((instance) => instance.state === 'running');
  const matchedInstances = instanceSummaries.filter((instance) => instance.hostHintMatch);
  const sshOpenGroupIds = new Set(
    securityGroupSummaries
      .filter((group) => group.inboundPortAudit['22']?.openToWorld)
      .map((group) => group.groupId)
      .filter(Boolean)
  );

  const canTrustInstanceInventory = !describeInstancesError;

  if (instanceSummaries.length === 0 && canTrustInstanceInventory) {
    recommendations.push('No EC2 instances were returned. Confirm EC2 permissions or specify INSTANCE_ID.');
  }

  if (canTrustInstanceInventory && runningInstances.length === 0) {
    recommendations.push('No running EC2 instance was found. Start the target instance before re-running deployment.');
  }

  if (canTrustInstanceInventory && matchedInstances.length === 0 && TARGET_HOST_HINT) {
    recommendations.push(`No instance matched the provided host hint ${TARGET_HOST_HINT}. Set EC2_HOST, REMOTE_HOST, PUBLIC_IP_HINT, or INSTANCE_ID to narrow the audit.`);
  }

  if (describeInstancesError) {
    recommendations.push(`EC2 discovery is blocked by ${describeInstancesError.name}: grant ec2:DescribeInstances so the audit can identify the live instance and its security groups.`);
  }

  if (describeSecurityGroupsError) {
    recommendations.push(`Security-group discovery is blocked by ${describeSecurityGroupsError.name}: grant ec2:DescribeSecurityGroups so the audit can confirm whether ports 22, 80, and 443 are exposed.`);
  }

  for (const probe of publicNetworkProbes) {
    const probeHost = probe.normalizedHost || probe.inputHost || 'unknown-host';
    if (!probe.connectHost) {
      recommendations.push(`Public probe for ${probeHost} could not resolve DNS: ${probe.resolutionError ?? 'unknown DNS error'}.`);
      continue;
    }

    const openPorts = probe.portAudit.filter((entry) => entry.open).map((entry) => entry.port);
    if (openPorts.length === 0) {
      recommendations.push(`Public probe for ${probeHost} could not connect to TCP 22, 80, or 443 on ${probe.connectHost}. Check DNS, security groups, NACLs, and host firewall rules.`);
      continue;
    }

    if ((openPorts.includes(80) || openPorts.includes(443)) && !openPorts.includes(22)) {
      recommendations.push(`Public probe for ${probeHost} reaches TCP ${openPorts.join(', ')} on ${probe.connectHost}, but TCP 22 is still closed. Remote SSH recovery will remain blocked until SSH access is opened or an alternate admin path is provided.`);
    }
  }

  if (canTrustInstanceInventory) {
    const sshReadyInstances = runningInstances.filter((instance) => instance.securityGroupIds.some((groupId) => sshOpenGroupIds.has(groupId)));
    if (sshReadyInstances.length === 0) {
      recommendations.push('No running instance currently exposes TCP 22 to the internet through its attached security groups. SSH-based remote recovery will stay blocked until port 22 is allowed from your IP or a trusted CIDR.');
    }

    const instancesWithoutKeyPair = runningInstances.filter((instance) => !instance.keyName);
    if (instancesWithoutKeyPair.length > 0) {
      recommendations.push(`Running instance(s) without an EC2 key pair: ${instancesWithoutKeyPair.map((instance) => instance.instanceId).join(', ')}. Use SSM / Instance Connect if available, or recreate access before attempting SSH recovery.`);
    }

    const webOpenGroupIds = new Set(
      securityGroupSummaries
        .filter((group) => group.inboundPortAudit['80']?.openToWorld || group.inboundPortAudit['443']?.openToWorld)
        .map((group) => group.groupId)
        .filter(Boolean)
    );

    const publiclyReachableInstances = runningInstances.filter((instance) => instance.securityGroupIds.some((groupId) => webOpenGroupIds.has(groupId)));
    if (publiclyReachableInstances.length === 0) {
      recommendations.push('No running instance currently exposes HTTP/HTTPS through its attached security groups. Even with Nginx fixed, the site would stay unreachable until TCP 80 and/or 443 is open to the intended clients.');
    } else {
      recommendations.push('If HTTP/HTTPS security-group access is open but the public probes still fail, the remaining blocker is on-instance runtime setup: Nginx, PM2, certificates, or the app process.');
    }
  } else {
    const anyProbeHasWebAccess = publicNetworkProbes.some((probe) => probe.portAudit.some((entry) => entry.open && (entry.port === 80 || entry.port === 443)));
    if (anyProbeHasWebAccess) {
      recommendations.push('Public TCP access to 80/443 is already reachable from the internet, so the remaining blocker is likely on-instance runtime setup or TLS termination rather than an outer network firewall.');
    }
  }

  return recommendations;
}

async function main() {
  console.log('[EC2AccessAudit] Starting EC2 access audit');
  console.log('[EC2AccessAudit] Runtime diagnostics', awsRuntime.diagnostics);
  console.log('[EC2AccessAudit] Inputs', {
    region: AWS_REGION,
    targetInstanceId: TARGET_INSTANCE_ID || null,
    targetHostHint: TARGET_HOST_HINT || null,
    publicProbeHosts: PUBLIC_PROBE_HOSTS,
  });

  const publicNetworkProbes = await Promise.all(PUBLIC_PROBE_HOSTS.map((host) => getPublicNetworkProbe(host)));

  let instances = [];
  let describeInstancesError = null;
  try {
    instances = await listInstances();
  } catch (error) {
    describeInstancesError = extractAwsErrorSummary(error);
    console.log('[EC2AccessAudit] DescribeInstances failed', describeInstancesError);
  }

  const instanceSummaries = instances.map((instance) => {
    const summary = summarizeInstance(instance);
    return {
      ...summary,
      hostHintMatch: matchesHostHint(summary),
    };
  });

  const securityGroupIds = [...new Set(instanceSummaries.flatMap((instance) => instance.securityGroupIds))].filter(Boolean);

  let securityGroups = [];
  let describeSecurityGroupsError = null;
  if (securityGroupIds.length > 0) {
    try {
      securityGroups = await describeSecurityGroups(securityGroupIds);
    } catch (error) {
      describeSecurityGroupsError = extractAwsErrorSummary(error);
      console.log('[EC2AccessAudit] DescribeSecurityGroups failed', describeSecurityGroupsError);
    }
  }

  const securityGroupSummaries = securityGroups.map((group) => summarizeSecurityGroup(group));
  const matchedInstances = instanceSummaries.filter((instance) => instance.hostHintMatch);
  const recommendations = buildRecommendations(instanceSummaries, securityGroupSummaries, {
    describeInstancesError,
    describeSecurityGroupsError,
    publicNetworkProbes,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    region: AWS_REGION,
    targetInstanceId: TARGET_INSTANCE_ID || null,
    targetHostHint: TARGET_HOST_HINT || null,
    publicProbeHosts: PUBLIC_PROBE_HOSTS,
    instanceCount: instanceSummaries.length,
    runningInstanceCount: instanceSummaries.filter((instance) => instance.state === 'running').length,
    matchedInstanceIds: matchedInstances.map((instance) => instance.instanceId),
    instances: instanceSummaries,
    securityGroups: securityGroupSummaries,
    publicNetworkProbes,
    awsErrors: {
      describeInstances: describeInstancesError,
      describeSecurityGroups: describeSecurityGroupsError,
    },
    recommendations,
  };

  console.log('[EC2AccessAudit] Report');
  console.log(JSON.stringify(report, null, 2));

  if (describeInstancesError || describeSecurityGroupsError) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.log('[EC2AccessAudit] Unhandled failure', {
    error: safeError(error),
    formatted: formatAwsCredentialError(error, awsRuntime.diagnostics),
  });
  process.exit(1);
});
