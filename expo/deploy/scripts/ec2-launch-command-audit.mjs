const ENV_COMMAND = typeof process.env.EC2_RUN_INSTANCES_COMMAND === 'string'
  ? process.env.EC2_RUN_INSTANCES_COMMAND.trim()
  : '';
const CLI_COMMAND = process.argv.slice(2).join(' ').trim();
const COMMAND = CLI_COMMAND || ENV_COMMAND;

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function readTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function tokenizeShellCommand(command) {
  const tokens = [];
  let current = '';
  let quote = null;
  let escaping = false;

  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += '\\';
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function parseCliFlags(tokens) {
  const flags = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const flagName = token.slice(2);
    const nextToken = tokens[index + 1];
    if (!nextToken || nextToken.startsWith('--')) {
      flags[flagName] = true;
      continue;
    }

    flags[flagName] = nextToken;
    index += 1;
  }

  return flags;
}

function parseJsonValue(rawValue) {
  try {
    return {
      value: JSON.parse(rawValue),
      error: null,
    };
  } catch (error) {
    return {
      value: null,
      error: safeError(error),
    };
  }
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return [value];
  }

  return [];
}

function normalizeGroups(networkInterfaces, flags) {
  const interfaceGroups = networkInterfaces.flatMap((item) => Array.isArray(item?.Groups) ? item.Groups : []);
  const topLevelGroups = [
    readTrimmed(flags['security-group-ids']),
    readTrimmed(flags['security-groups']),
  ].filter(Boolean);

  return [...new Set([...interfaceGroups, ...topLevelGroups].map((entry) => readTrimmed(String(entry))).filter(Boolean))];
}

function looksLikeSecurityGroupId(value) {
  return /^sg-[0-9a-f]{8,17}$/i.test(readTrimmed(value));
}

function looksLikeSubnetId(value) {
  return /^subnet-[0-9a-f]{8,17}$/i.test(readTrimmed(value));
}

function extractEc2CommandSegments(command) {
  const trimmedCommand = readTrimmed(command);
  if (!trimmedCommand) {
    return [];
  }

  const matches = [...trimmedCommand.matchAll(/\baws\s+ec2\s+[a-z0-9-]+\b/gi)];
  if (matches.length === 0) {
    return [trimmedCommand];
  }

  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? trimmedCommand.length;
      return trimmedCommand.slice(start, end).trim();
    })
    .filter(Boolean);
}

function getEc2Subcommand(tokens) {
  const awsIndex = tokens.findIndex((token) => token === 'aws');
  if (awsIndex === -1) {
    return null;
  }

  if (tokens[awsIndex + 1] !== 'ec2') {
    return null;
  }

  return readTrimmed(tokens[awsIndex + 2]) || null;
}

function buildRunInstancesSummary(tokens, flags, networkInterfaces) {
  return {
    tokenCount: tokens.length,
    imageId: readTrimmed(flags['image-id']) || null,
    instanceType: readTrimmed(flags['instance-type']) || null,
    count: readTrimmed(flags.count) || '1',
    hasKeyName: Boolean(readTrimmed(flags['key-name'])),
    keyName: readTrimmed(flags['key-name']) || null,
    networkInterfaceCount: networkInterfaces.length,
    subnetIds: [...new Set(networkInterfaces.map((item) => readTrimmed(item?.SubnetId)).filter(Boolean))],
    securityGroups: normalizeGroups(networkInterfaces, flags),
  };
}

function permissionSources(permission) {
  const ipv4Sources = Array.isArray(permission?.IpRanges)
    ? permission.IpRanges.map((entry) => readTrimmed(entry?.CidrIp)).filter(Boolean)
    : [];
  const ipv6Sources = Array.isArray(permission?.Ipv6Ranges)
    ? permission.Ipv6Ranges.map((entry) => readTrimmed(entry?.CidrIpv6)).filter(Boolean)
    : [];

  return {
    ipv4Sources,
    ipv6Sources,
  };
}

function ruleCoversPort(permission, port) {
  const protocol = readTrimmed(permission?.IpProtocol).toLowerCase();
  if (!protocol) {
    return false;
  }

  if (protocol === '-1') {
    return true;
  }

  if (protocol !== 'tcp') {
    return false;
  }

  const fromPort = typeof permission?.FromPort === 'number' ? permission.FromPort : null;
  const toPort = typeof permission?.ToPort === 'number' ? permission.ToPort : null;

  if (fromPort === null || toPort === null) {
    return false;
  }

  return fromPort <= port && port <= toPort;
}

function opensPortToWorld(permission, port) {
  if (!ruleCoversPort(permission, port)) {
    return false;
  }

  const sources = permissionSources(permission);
  return sources.ipv4Sources.includes('0.0.0.0/0') || sources.ipv6Sources.includes('::/0');
}

function prefixMessages(subcommand, messages) {
  return messages.map((message) => `[${subcommand}] ${message}`);
}

function buildRunInstancesAudit(command) {
  const trimmedCommand = readTrimmed(command);
  const tokens = tokenizeShellCommand(trimmedCommand);
  const flags = parseCliFlags(tokens);
  const networkInterfacesRaw = readTrimmed(flags['network-interfaces']);
  const networkInterfacesParse = networkInterfacesRaw
    ? parseJsonValue(networkInterfacesRaw)
    : { value: [], error: null };
  const networkInterfaces = networkInterfacesParse.error ? [] : toArray(networkInterfacesParse.value);
  const summary = buildRunInstancesSummary(tokens, flags, networkInterfaces);
  const blockingIssues = [];
  const warnings = [];
  const nextSteps = [];

  if (!tokens.includes('run-instances')) {
    warnings.push('The provided command does not include the run-instances subcommand.');
  }

  if (!summary.imageId) {
    blockingIssues.push('Missing --image-id.');
  }

  if (!summary.instanceType) {
    blockingIssues.push('Missing --instance-type.');
  }

  if (networkInterfacesRaw && networkInterfacesParse.error) {
    blockingIssues.push(`The --network-interfaces payload is not valid JSON: ${networkInterfacesParse.error}`);
  }

  if (networkInterfaces.length > 0) {
    const missingSubnetInterfaces = networkInterfaces.filter((item) => !readTrimmed(item?.SubnetId));
    if (missingSubnetInterfaces.length > 0) {
      blockingIssues.push('The --network-interfaces payload is missing SubnetId. AWS requires subnets to be specified inside the network interface definition when you launch with --network-interfaces.');
    }

    const invalidSubnetIds = networkInterfaces
      .map((item) => readTrimmed(item?.SubnetId))
      .filter(Boolean)
      .filter((value) => !looksLikeSubnetId(value));
    if (invalidSubnetIds.length > 0) {
      blockingIssues.push(`SubnetId values must look like subnet-... identifiers. Invalid value(s): ${invalidSubnetIds.join(', ')}`);
    }

    const nonPrimaryInterfaces = networkInterfaces.filter((item) => item?.DeviceIndex !== 0);
    if (nonPrimaryInterfaces.length === networkInterfaces.length) {
      warnings.push('The primary network interface usually needs DeviceIndex 0.');
    }
  }

  if (summary.securityGroups.length === 0) {
    warnings.push('No security group was detected. AWS will fall back to the default VPC security group only when the launch context allows it.');
  }

  const invalidSecurityGroups = summary.securityGroups.filter((group) => !looksLikeSecurityGroupId(group));
  if (invalidSecurityGroups.length > 0) {
    blockingIssues.push(`Security group values must be real sg- IDs when launching into a VPC network interface. Invalid value(s): ${invalidSecurityGroups.join(', ')}`);
  }

  if (!summary.hasKeyName) {
    blockingIssues.push('Missing --key-name. Without a key pair, SSH-based recovery will not be available for a standard Linux launch.');
  }

  if (networkInterfaces.length > 0 && summary.subnetIds.length === 0) {
    nextSteps.push('Add SubnetId to the --network-interfaces JSON so AWS knows where to place the instance.');
  }

  if (invalidSecurityGroups.length > 0) {
    nextSteps.push('Replace placeholder security-group values with the actual security group ID returned by AWS, for example sg-0123abcd4567ef890.');
  }

  if (!summary.hasKeyName) {
    nextSteps.push('Add --key-name <your-keypair> if you want SSH access for deployment or recovery.');
  }

  if (summary.securityGroups.length > 0) {
    nextSteps.push('Confirm the attached security group allows inbound TCP 22 from your admin IP and TCP 80/443 from the public internet if this instance will serve the live site.');
  }

  return {
    subcommand: 'run-instances',
    provided: true,
    command: trimmedCommand,
    summary,
    blockingIssues,
    warnings,
    nextSteps,
  };
}

function buildCreateSecurityGroupAudit(command) {
  const trimmedCommand = readTrimmed(command);
  const tokens = tokenizeShellCommand(trimmedCommand);
  const flags = parseCliFlags(tokens);
  const summary = {
    tokenCount: tokens.length,
    groupName: readTrimmed(flags['group-name']) || null,
    hasDescription: Boolean(readTrimmed(flags.description)),
    vpcId: readTrimmed(flags['vpc-id']) || null,
  };
  const blockingIssues = [];
  const warnings = [];
  const nextSteps = [];

  if (!summary.groupName) {
    blockingIssues.push('Missing --group-name.');
  }

  if (!summary.hasDescription) {
    blockingIssues.push('Missing --description.');
  }

  if (!summary.vpcId) {
    warnings.push('No --vpc-id was provided. AWS will use the default VPC context if available.');
  }

  nextSteps.push('Capture the returned GroupId from create-security-group before using authorize-security-group-ingress or run-instances.');

  return {
    subcommand: 'create-security-group',
    provided: true,
    command: trimmedCommand,
    summary,
    blockingIssues,
    warnings,
    nextSteps,
  };
}

function buildAuthorizeSecurityGroupIngressAudit(command) {
  const trimmedCommand = readTrimmed(command);
  const tokens = tokenizeShellCommand(trimmedCommand);
  const flags = parseCliFlags(tokens);
  const ipPermissionsRaw = readTrimmed(flags['ip-permissions']);
  const ipPermissionsParse = ipPermissionsRaw
    ? parseJsonValue(ipPermissionsRaw)
    : { value: [], error: null };
  const ipPermissions = ipPermissionsParse.error ? [] : toArray(ipPermissionsParse.value);
  const summary = {
    tokenCount: tokens.length,
    groupId: readTrimmed(flags['group-id']) || null,
    permissionCount: ipPermissions.length,
    opensSshToWorld: ipPermissions.some((permission) => opensPortToWorld(permission, 22)),
  };
  const blockingIssues = [];
  const warnings = [];
  const nextSteps = [];

  if (!summary.groupId) {
    blockingIssues.push('Missing --group-id.');
  }

  if (summary.groupId && !looksLikeSecurityGroupId(summary.groupId)) {
    blockingIssues.push(`The provided --group-id is not a real security group ID: ${summary.groupId}`);
  }

  if (!ipPermissionsRaw) {
    blockingIssues.push('Missing --ip-permissions.');
  }

  if (ipPermissionsRaw && ipPermissionsParse.error) {
    blockingIssues.push(`The --ip-permissions payload is not valid JSON: ${ipPermissionsParse.error}`);
  }

  if (summary.opensSshToWorld) {
    warnings.push('Port 22 is open to 0.0.0.0/0 or ::/0. Restrict SSH to your admin IP if possible.');
    nextSteps.push('Tighten the SSH ingress rule to your own IP range after initial access is confirmed.');
  }

  if (summary.groupId && !looksLikeSecurityGroupId(summary.groupId)) {
    nextSteps.push('Use the real GroupId returned by create-security-group instead of a placeholder value.');
  }

  return {
    subcommand: 'authorize-security-group-ingress',
    provided: true,
    command: trimmedCommand,
    summary,
    blockingIssues,
    warnings,
    nextSteps,
  };
}

function buildUnknownCommandAudit(command) {
  return {
    subcommand: 'unknown',
    provided: true,
    command: readTrimmed(command),
    summary: {
      tokenCount: tokenizeShellCommand(command).length,
    },
    blockingIssues: [],
    warnings: ['The command sequence contains an unsupported or unrecognized EC2 subcommand.'],
    nextSteps: [],
  };
}

function buildSubcommandAudit(command) {
  const tokens = tokenizeShellCommand(command);
  const subcommand = getEc2Subcommand(tokens);

  if (subcommand === 'run-instances') {
    return buildRunInstancesAudit(command);
  }

  if (subcommand === 'create-security-group') {
    return buildCreateSecurityGroupAudit(command);
  }

  if (subcommand === 'authorize-security-group-ingress') {
    return buildAuthorizeSecurityGroupIngressAudit(command);
  }

  return buildUnknownCommandAudit(command);
}

function buildAggregateSummary(commandReports) {
  const createSecurityGroup = commandReports.find((report) => report.subcommand === 'create-security-group') ?? null;
  const authorizeSecurityGroupIngress = commandReports.find((report) => report.subcommand === 'authorize-security-group-ingress') ?? null;
  const runInstances = commandReports.find((report) => report.subcommand === 'run-instances') ?? null;

  return {
    commandCount: commandReports.length,
    detectedSubcommands: commandReports.map((report) => report.subcommand),
    createSecurityGroup: createSecurityGroup?.summary ?? null,
    authorizeSecurityGroupIngress: authorizeSecurityGroupIngress?.summary ?? null,
    runInstances: runInstances?.summary ?? null,
  };
}

function buildLaunchCommandAudit(command) {
  const trimmedCommand = readTrimmed(command);
  if (!trimmedCommand) {
    return null;
  }

  const commandSegments = extractEc2CommandSegments(trimmedCommand);
  const commandReports = commandSegments.map((segment) => buildSubcommandAudit(segment));
  const summary = buildAggregateSummary(commandReports);
  const blockingIssues = commandReports.flatMap((report) => prefixMessages(report.subcommand, report.blockingIssues));
  const warnings = commandReports.flatMap((report) => prefixMessages(report.subcommand, report.warnings));
  const nextSteps = [];

  const seenNextSteps = new Set();
  for (const report of commandReports) {
    for (const step of report.nextSteps) {
      if (seenNextSteps.has(step)) {
        continue;
      }
      seenNextSteps.add(step);
      nextSteps.push(step);
    }
  }

  const createSecurityGroup = commandReports.find((report) => report.subcommand === 'create-security-group') ?? null;
  const authorizeSecurityGroupIngress = commandReports.find((report) => report.subcommand === 'authorize-security-group-ingress') ?? null;
  const runInstances = commandReports.find((report) => report.subcommand === 'run-instances') ?? null;
  const invalidAuthorizeGroupId = readTrimmed(authorizeSecurityGroupIngress?.summary?.groupId);
  const invalidRunGroups = Array.isArray(runInstances?.summary?.securityGroups)
    ? runInstances.summary.securityGroups.filter((group) => !looksLikeSecurityGroupId(group))
    : [];

  if (createSecurityGroup && (invalidAuthorizeGroupId || invalidRunGroups.length > 0)) {
    const usesPlaceholderAuthorizeGroup = invalidAuthorizeGroupId && !looksLikeSecurityGroupId(invalidAuthorizeGroupId);
    if (usesPlaceholderAuthorizeGroup || invalidRunGroups.length > 0) {
      nextSteps.push('Create the security group first, capture its returned GroupId, and then reuse that real sg-... value in both the ingress rule and the run-instances command.');
    }
  }

  return {
    provided: true,
    command: trimmedCommand,
    summary,
    blockingIssues,
    warnings,
    nextSteps,
    commandReports,
  };
}

const audit = buildLaunchCommandAudit(COMMAND);

if (!audit) {
  console.log('[EC2LaunchCommandAudit] No command provided. Pass the EC2 command sequence as CLI args or set EC2_RUN_INSTANCES_COMMAND.');
  process.exit(0);
}

console.log('[EC2LaunchCommandAudit] Starting launch command audit');
console.log('[EC2LaunchCommandAudit] Summary', audit.summary);
console.log('[EC2LaunchCommandAudit] Report');
console.log(JSON.stringify(audit, null, 2));

if (audit.blockingIssues.length > 0) {
  process.exit(1);
}
