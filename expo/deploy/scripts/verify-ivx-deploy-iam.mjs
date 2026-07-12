import {
  GetGroupPolicyCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetUserCommand,
  GetUserPolicyCommand,
  IAMClient,
  ListAttachedGroupPoliciesCommand,
  ListAttachedUserPoliciesCommand,
  ListGroupPoliciesCommand,
  ListGroupsForUserCommand,
  ListUserPoliciesCommand,
  SimulatePrincipalPolicyCommand,
} from '@aws-sdk/client-iam';
import { ACMClient, ListCertificatesCommand } from '@aws-sdk/client-acm';
import { CloudFrontClient, GetDistributionCommand } from '@aws-sdk/client-cloudfront';
import { DescribeInstancesCommand, DescribeSecurityGroupsCommand, DescribeSubnetsCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  DescribePolicyCommand,
  ListParentsCommand,
  ListPoliciesForTargetCommand,
  ListRootsCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { ECSClient, ListClustersCommand } from '@aws-sdk/client-ecs';
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ListHostedZonesByNameCommand, Route53Client } from '@aws-sdk/client-route-53';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { createAwsRuntime, formatAwsCredentialError, readTrimmedEnv } from './aws-runtime.mjs';

const awsRuntime = createAwsRuntime(import.meta.url);
const TARGET_USER_NAME = readTrimmedEnv('AWS_IAM_TARGET_USER') || 'ivx-deploy';
const TARGET_ACCOUNT_ID = readTrimmedEnv('AWS_ACCOUNT_ID') || '206818124217';
const EXPECTED_USER_ARN = `arn:aws:iam::${TARGET_ACCOUNT_ID}:user/${TARGET_USER_NAME}`;
const DOMAIN_NAME = readTrimmedEnv('DOMAIN_NAME') || 'ivxholding.com';
const CLOUDFRONT_DISTRIBUTION_ID = readTrimmedEnv('CLOUDFRONT_DISTRIBUTION_ID');

const sharedConfig = {
  ...awsRuntime.clientConfig,
  region: awsRuntime.diagnostics.region,
};

const iam = new IAMClient(sharedConfig);
const sts = new STSClient(sharedConfig);
const route53 = new Route53Client({ ...sharedConfig, region: 'us-east-1' });
const acm = new ACMClient({ ...sharedConfig, region: 'us-east-1' });
const cloudfront = new CloudFrontClient({ ...sharedConfig, region: 'us-east-1' });
const organizations = new OrganizationsClient({ ...sharedConfig, region: 'us-east-1' });
const elbv2 = new ElasticLoadBalancingV2Client(sharedConfig);
const ec2 = new EC2Client(sharedConfig);
const ecs = new ECSClient(sharedConfig);

const ACTIONS_TO_TEST = [
  'iam:GetUser',
  'iam:ListUserPolicies',
  'iam:ListAttachedUserPolicies',
  'iam:ListGroupsForUser',
  'route53:ListHostedZonesByName',
  'acm:ListCertificates',
  'cloudfront:GetDistribution',
  'elasticloadbalancing:DescribeLoadBalancers',
  'ec2:DescribeInstances',
  'ec2:DescribeSecurityGroups',
  'ec2:DescribeSubnets',
  'ecs:ListClusters',
];

function readTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (value === undefined || value === null || value === '') {
    return [];
  }

  return [String(value)];
}

function decodeMaybe(value) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizePolicyDocument(document) {
  if (!document) {
    return null;
  }

  if (typeof document === 'object') {
    return document;
  }

  const decoded = decodeMaybe(document);
  if (typeof decoded !== 'string') {
    return null;
  }

  try {
    return JSON.parse(decoded);
  } catch {
    return decoded;
  }
}

function summarizePolicyDocument(document) {
  const normalized = normalizePolicyDocument(document);
  if (!normalized || typeof normalized !== 'object') {
    return {
      raw: normalized ?? null,
      statements: [],
    };
  }

  const statements = Array.isArray(normalized.Statement)
    ? normalized.Statement
    : normalized.Statement
      ? [normalized.Statement]
      : [];

  return {
    version: readTrimmed(normalized.Version),
    statements: statements.map((statement) => ({
      sid: readTrimmed(statement?.Sid),
      effect: readTrimmed(statement?.Effect),
      action: toArray(statement?.Action),
      notAction: toArray(statement?.NotAction),
      resource: toArray(statement?.Resource),
      notResource: toArray(statement?.NotResource),
      conditionKeys: statement?.Condition && typeof statement.Condition === 'object'
        ? Object.keys(statement.Condition)
        : [],
    })),
  };
}

function extractAwsError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : 'UnknownError';
  const code = typeof error === 'object' && error !== null && 'Code' in error ? String(error.Code) : name;
  const httpStatusCode = typeof error === 'object' && error !== null && '$metadata' in error
    ? error.$metadata?.httpStatusCode ?? null
    : null;

  return {
    name,
    code,
    message,
    httpStatusCode,
    formatted: formatAwsCredentialError(error, awsRuntime.diagnostics),
  };
}

function buildSkippedResult(message) {
  return {
    ok: false,
    value: null,
    error: {
      name: 'Skipped',
      code: 'Skipped',
      message,
      httpStatusCode: null,
      formatted: message,
    },
  };
}

async function capture(label, fn) {
  console.log(`[IVXDeployIAMVerify] ${label}...`);

  try {
    const value = await fn();
    console.log(`[IVXDeployIAMVerify] ${label} succeeded`);
    return {
      ok: true,
      value,
      error: null,
    };
  } catch (error) {
    const formatted = extractAwsError(error);
    console.log(`[IVXDeployIAMVerify] ${label} failed`, formatted);
    return {
      ok: false,
      value: null,
      error: formatted,
    };
  }
}

async function listAllUserPolicyNames(userName) {
  const names = [];
  let marker;

  do {
    const response = await iam.send(new ListUserPoliciesCommand({
      UserName: userName,
      Marker: marker,
      MaxItems: 1000,
    }));
    names.push(...(response.PolicyNames ?? []).map((name) => readTrimmed(name)).filter(Boolean));
    marker = response.IsTruncated ? response.Marker : undefined;
  } while (marker);

  return names;
}

async function listAllAttachedUserPolicies(userName) {
  const policies = [];
  let marker;

  do {
    const response = await iam.send(new ListAttachedUserPoliciesCommand({
      UserName: userName,
      Marker: marker,
      MaxItems: 1000,
    }));
    policies.push(...(response.AttachedPolicies ?? []));
    marker = response.IsTruncated ? response.Marker : undefined;
  } while (marker);

  return policies;
}

async function listAllGroupsForUser(userName) {
  const groups = [];
  let marker;

  do {
    const response = await iam.send(new ListGroupsForUserCommand({
      UserName: userName,
      Marker: marker,
      MaxItems: 1000,
    }));
    groups.push(...(response.Groups ?? []));
    marker = response.IsTruncated ? response.Marker : undefined;
  } while (marker);

  return groups;
}

async function listAllGroupPolicyNames(groupName) {
  const names = [];
  let marker;

  do {
    const response = await iam.send(new ListGroupPoliciesCommand({
      GroupName: groupName,
      Marker: marker,
      MaxItems: 1000,
    }));
    names.push(...(response.PolicyNames ?? []).map((name) => readTrimmed(name)).filter(Boolean));
    marker = response.IsTruncated ? response.Marker : undefined;
  } while (marker);

  return names;
}

async function listAllAttachedGroupPolicies(groupName) {
  const policies = [];
  let marker;

  do {
    const response = await iam.send(new ListAttachedGroupPoliciesCommand({
      GroupName: groupName,
      Marker: marker,
      MaxItems: 1000,
    }));
    policies.push(...(response.AttachedPolicies ?? []));
    marker = response.IsTruncated ? response.Marker : undefined;
  } while (marker);

  return policies;
}

async function getManagedPolicySummary(policyArn) {
  const policyResponse = await iam.send(new GetPolicyCommand({ PolicyArn: policyArn }));
  const policy = policyResponse.Policy;
  const defaultVersionId = readTrimmed(policy?.DefaultVersionId);
  const versionResponse = defaultVersionId
    ? await iam.send(new GetPolicyVersionCommand({
        PolicyArn: policyArn,
        VersionId: defaultVersionId,
      }))
    : null;

  return {
    policyName: readTrimmed(policy?.PolicyName),
    policyArn: readTrimmed(policy?.Arn),
    defaultVersionId: defaultVersionId || null,
    document: summarizePolicyDocument(versionResponse?.PolicyVersion?.Document ?? null),
  };
}

async function getInlineUserPolicies(userName) {
  const policyNames = await listAllUserPolicyNames(userName);
  const policies = [];

  for (const policyName of policyNames) {
    const response = await iam.send(new GetUserPolicyCommand({
      UserName: userName,
      PolicyName: policyName,
    }));
    policies.push({
      policyName,
      document: summarizePolicyDocument(response.PolicyDocument ?? null),
    });
  }

  return policies;
}

async function getAttachedUserPolicies(userName) {
  const attachedPolicies = await listAllAttachedUserPolicies(userName);
  const policies = [];

  for (const policy of attachedPolicies) {
    const policyArn = readTrimmed(policy.PolicyArn);
    if (!policyArn) {
      continue;
    }

    policies.push(await getManagedPolicySummary(policyArn));
  }

  return policies;
}

async function getGroupSummaries(userName) {
  const groups = await listAllGroupsForUser(userName);
  const summaries = [];

  for (const group of groups) {
    const groupName = readTrimmed(group.GroupName);
    if (!groupName) {
      continue;
    }

    const inlinePolicyNames = await listAllGroupPolicyNames(groupName);
    const inlinePolicies = [];
    for (const policyName of inlinePolicyNames) {
      const response = await iam.send(new GetGroupPolicyCommand({
        GroupName: groupName,
        PolicyName: policyName,
      }));
      inlinePolicies.push({
        policyName,
        document: summarizePolicyDocument(response.PolicyDocument ?? null),
      });
    }

    const attachedPolicies = await listAllAttachedGroupPolicies(groupName);
    const managedPolicies = [];
    for (const policy of attachedPolicies) {
      const policyArn = readTrimmed(policy.PolicyArn);
      if (!policyArn) {
        continue;
      }
      managedPolicies.push(await getManagedPolicySummary(policyArn));
    }

    summaries.push({
      groupName,
      groupArn: readTrimmed(group.Arn) || null,
      inlinePolicies,
      managedPolicies,
    });
  }

  return summaries;
}

async function listAllOrganizationRoots() {
  const roots = [];
  let nextToken;

  do {
    const response = await organizations.send(new ListRootsCommand({
      ...(nextToken ? { NextToken: nextToken } : {}),
      MaxResults: 20,
    }));
    roots.push(...(response.Roots ?? []));
    nextToken = response.NextToken;
  } while (nextToken);

  return roots;
}

async function listAllOrganizationParents(childId) {
  const parents = [];
  let nextToken;

  do {
    const response = await organizations.send(new ListParentsCommand({
      ChildId: childId,
      ...(nextToken ? { NextToken: nextToken } : {}),
      MaxResults: 20,
    }));
    parents.push(...(response.Parents ?? []));
    nextToken = response.NextToken;
  } while (nextToken);

  return parents;
}

async function listAllPoliciesForTarget(targetId, filter) {
  const policies = [];
  let nextToken;

  do {
    const response = await organizations.send(new ListPoliciesForTargetCommand({
      TargetId: targetId,
      Filter: filter,
      ...(nextToken ? { NextToken: nextToken } : {}),
      MaxResults: 20,
    }));
    policies.push(...(response.Policies ?? []));
    nextToken = response.NextToken;
  } while (nextToken);

  return policies;
}

async function describeOrganizationsPolicy(policyId) {
  const response = await organizations.send(new DescribePolicyCommand({ PolicyId: policyId }));
  const policy = response.Policy;
  const summary = policy?.PolicySummary;

  return {
    policyId: readTrimmed(summary?.Id) || policyId,
    arn: readTrimmed(summary?.Arn) || null,
    name: readTrimmed(summary?.Name) || null,
    description: readTrimmed(summary?.Description) || null,
    type: readTrimmed(summary?.Type) || null,
    awsManaged: summary?.AwsManaged ?? null,
    document: summarizePolicyDocument(policy?.Content ?? null),
  };
}

async function inspectOrganizationsScps(accountId) {
  const roots = await listAllOrganizationRoots();
  const rootSummaries = roots.map((root) => ({
    id: readTrimmed(root.Id) || null,
    arn: readTrimmed(root.Arn) || null,
    name: readTrimmed(root.Name) || null,
    policyTypes: (root.PolicyTypes ?? []).map((policyType) => ({
      type: readTrimmed(policyType.Type) || null,
      status: readTrimmed(policyType.Status) || null,
    })),
  }));

  const hierarchy = [];
  const targets = [
    {
      targetId: accountId,
      targetType: 'ACCOUNT',
      sourceChildId: null,
    },
  ];

  let currentChildId = accountId;
  let safetyCounter = 0;

  while (currentChildId && safetyCounter < 10) {
    safetyCounter += 1;
    const parents = await listAllOrganizationParents(currentChildId);
    const parent = parents[0] ?? null;
    const parentId = readTrimmed(parent?.Id);
    const parentType = readTrimmed(parent?.Type) || null;

    if (!parentId) {
      break;
    }

    const entry = {
      targetId: parentId,
      targetType: parentType,
      sourceChildId: currentChildId,
    };

    hierarchy.push(entry);
    targets.push(entry);

    if (parentType === 'ROOT') {
      break;
    }

    currentChildId = parentId;
  }

  const seenTargetIds = new Set();
  const uniqueTargets = targets.filter((target) => {
    if (!target.targetId || seenTargetIds.has(target.targetId)) {
      return false;
    }
    seenTargetIds.add(target.targetId);
    return true;
  });

  const targetPolicies = [];
  for (const target of uniqueTargets) {
    const policySummaries = await listAllPoliciesForTarget(target.targetId, 'SERVICE_CONTROL_POLICY');
    const policies = [];

    for (const policySummary of policySummaries) {
      const policyId = readTrimmed(policySummary.Id);
      if (!policyId) {
        continue;
      }
      policies.push(await describeOrganizationsPolicy(policyId));
    }

    targetPolicies.push({
      targetId: target.targetId,
      targetType: target.targetType ?? null,
      sourceChildId: target.sourceChildId ?? null,
      policies,
    });
  }

  return {
    roots: rootSummaries,
    hierarchy,
    targets: targetPolicies,
  };
}

async function getCallerIdentitySummary() {
  const response = await sts.send(new GetCallerIdentityCommand({}));
  return {
    account: readTrimmed(response.Account) || null,
    arn: readTrimmed(response.Arn) || null,
    userId: readTrimmed(response.UserId) || null,
  };
}

async function getTargetUserSummary(userName) {
  const response = await iam.send(new GetUserCommand({ UserName: userName }));
  const user = response.User;
  return {
    userName: readTrimmed(user?.UserName) || null,
    arn: readTrimmed(user?.Arn) || null,
    userId: readTrimmed(user?.UserId) || null,
    permissionsBoundary: user?.PermissionsBoundary
      ? {
          permissionsBoundaryArn: readTrimmed(user.PermissionsBoundary.PermissionsBoundaryArn) || null,
          permissionsBoundaryType: readTrimmed(user.PermissionsBoundary.PermissionsBoundaryType) || null,
        }
      : null,
    tags: Array.isArray(user?.Tags)
      ? user.Tags.map((tag) => ({ key: readTrimmed(tag.Key), value: readTrimmed(tag.Value) }))
      : [],
  };
}

async function simulateTargetUser(userArn) {
  const response = await iam.send(new SimulatePrincipalPolicyCommand({
    PolicySourceArn: userArn,
    ActionNames: ACTIONS_TO_TEST,
    ResourceArns: ['*'],
    MaxItems: 1000,
  }));

  return (response.EvaluationResults ?? []).map((item) => ({
    actionName: readTrimmed(item.EvalActionName) || null,
    decision: readTrimmed(item.EvalDecision) || null,
    allowedByOrganizations: item.OrganizationsDecisionDetail?.AllowedByOrganizations ?? null,
    allowedByPermissionsBoundary: item.PermissionsBoundaryDecisionDetail?.AllowedByPermissionsBoundary ?? null,
    missingContextValues: item.MissingContextValues ?? [],
    matchedStatements: (item.MatchedStatements ?? []).map((statement) => ({
      sourcePolicyId: readTrimmed(statement.SourcePolicyId) || null,
      startPosition: statement.StartPosition ? {
        line: statement.StartPosition.Line ?? null,
        column: statement.StartPosition.Column ?? null,
      } : null,
      endPosition: statement.EndPosition ? {
        line: statement.EndPosition.Line ?? null,
        column: statement.EndPosition.Column ?? null,
      } : null,
    })),
  }));
}

async function testLivePermissions() {
  const tests = [
    {
      action: 'route53:ListHostedZonesByName',
      fn: async () => {
        const response = await route53.send(new ListHostedZonesByNameCommand({
          DNSName: `${DOMAIN_NAME}.`,
          MaxItems: 1,
        }));
        return {
          hostedZones: (response.HostedZones ?? []).map((zone) => ({
            id: readTrimmed(zone.Id),
            name: readTrimmed(zone.Name),
          })),
        };
      },
    },
    {
      action: 'acm:ListCertificates',
      fn: async () => {
        const response = await acm.send(new ListCertificatesCommand({ MaxItems: 5 }));
        return {
          certificates: (response.CertificateSummaryList ?? []).slice(0, 5).map((certificate) => ({
            arn: readTrimmed(certificate.CertificateArn),
            domainName: readTrimmed(certificate.DomainName),
            status: readTrimmed(certificate.Status),
          })),
        };
      },
    },
    {
      action: 'cloudfront:GetDistribution',
      fn: async () => {
        if (!CLOUDFRONT_DISTRIBUTION_ID) {
          return {
            skipped: true,
            reason: 'CLOUDFRONT_DISTRIBUTION_ID is not configured in the environment.',
          };
        }

        const response = await cloudfront.send(new GetDistributionCommand({ Id: CLOUDFRONT_DISTRIBUTION_ID }));
        return {
          distributionId: readTrimmed(response.Distribution?.Id) || CLOUDFRONT_DISTRIBUTION_ID,
          domainName: readTrimmed(response.Distribution?.DomainName) || null,
          status: readTrimmed(response.Distribution?.Status) || null,
          aliases: response.Distribution?.DistributionConfig?.Aliases?.Items ?? [],
        };
      },
    },
    {
      action: 'elasticloadbalancing:DescribeLoadBalancers',
      fn: async () => {
        const response = await elbv2.send(new DescribeLoadBalancersCommand({}));
        return {
          loadBalancers: (response.LoadBalancers ?? []).slice(0, 5).map((loadBalancer) => ({
            arn: readTrimmed(loadBalancer.LoadBalancerArn),
            name: readTrimmed(loadBalancer.LoadBalancerName),
            dnsName: readTrimmed(loadBalancer.DNSName),
            state: readTrimmed(loadBalancer.State?.Code),
          })),
        };
      },
    },
    {
      action: 'ec2:DescribeInstances',
      fn: async () => {
        const response = await ec2.send(new DescribeInstancesCommand({
          Filters: [
            {
              Name: 'instance-state-name',
              Values: ['pending', 'running', 'stopping', 'stopped'],
            },
          ],
          MaxResults: 5,
        }));
        return {
          instances: (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []).slice(0, 5).map((instance) => ({
            instanceId: readTrimmed(instance.InstanceId),
            state: readTrimmed(instance.State?.Name),
            publicIpAddress: readTrimmed(instance.PublicIpAddress),
            publicDnsName: readTrimmed(instance.PublicDnsName),
          })),
        };
      },
    },
    {
      action: 'ec2:DescribeSecurityGroups',
      fn: async () => {
        const response = await ec2.send(new DescribeSecurityGroupsCommand({}));
        return {
          securityGroups: (response.SecurityGroups ?? []).slice(0, 5).map((group) => ({
            groupId: readTrimmed(group.GroupId),
            groupName: readTrimmed(group.GroupName),
            description: readTrimmed(group.Description),
          })),
        };
      },
    },
    {
      action: 'ec2:DescribeSubnets',
      fn: async () => {
        const response = await ec2.send(new DescribeSubnetsCommand({ MaxResults: 5 }));
        return {
          subnets: (response.Subnets ?? []).slice(0, 5).map((subnet) => ({
            subnetId: readTrimmed(subnet.SubnetId),
            availabilityZone: readTrimmed(subnet.AvailabilityZone),
            vpcId: readTrimmed(subnet.VpcId),
            cidrBlock: readTrimmed(subnet.CidrBlock),
          })),
        };
      },
    },
    {
      action: 'ecs:ListClusters',
      fn: async () => {
        const response = await ecs.send(new ListClustersCommand({ maxResults: 10 }));
        return {
          clusterArns: response.clusterArns ?? [],
        };
      },
    },
  ];

  const results = [];

  for (const test of tests) {
    const outcome = await capture(`Live permission test ${test.action}`, test.fn);
    results.push({
      action: test.action,
      ok: outcome.ok,
      response: outcome.value,
      error: outcome.error,
    });
  }

  return results;
}

async function main() {
  console.log('[IVXDeployIAMVerify] Starting verification run');
  console.log('[IVXDeployIAMVerify] AWS runtime diagnostics', awsRuntime.diagnostics);

  const callerIdentity = await capture('STS GetCallerIdentity', async () => await getCallerIdentitySummary());
  const targetUser = await capture(`IAM GetUser ${TARGET_USER_NAME}`, async () => await getTargetUserSummary(TARGET_USER_NAME));
  const permissionsBoundaryPolicyArn = targetUser.value?.permissionsBoundary?.permissionsBoundaryArn ?? null;
  const permissionsBoundaryPolicy = permissionsBoundaryPolicyArn
    ? await capture(`IAM permissions boundary policy ${permissionsBoundaryPolicyArn}`, async () => await getManagedPolicySummary(permissionsBoundaryPolicyArn))
    : buildSkippedResult('Skipped because the target user does not have a readable permissions boundary.') ;
  const inlinePolicies = await capture(`IAM inline policies for ${TARGET_USER_NAME}`, async () => await getInlineUserPolicies(TARGET_USER_NAME));
  const attachedPolicies = await capture(`IAM attached managed policies for ${TARGET_USER_NAME}`, async () => await getAttachedUserPolicies(TARGET_USER_NAME));
  const groupPolicies = await capture(`IAM group memberships for ${TARGET_USER_NAME}`, async () => await getGroupSummaries(TARGET_USER_NAME));
  const organizationsScps = await capture(`Organizations SCP inspection for account ${TARGET_ACCOUNT_ID}`, async () => await inspectOrganizationsScps(TARGET_ACCOUNT_ID));
  const simulationTargetArn = targetUser.value?.arn ?? EXPECTED_USER_ARN;
  const simulation = simulationTargetArn
    ? await capture(`IAM SimulatePrincipalPolicy ${simulationTargetArn}`, async () => await simulateTargetUser(simulationTargetArn))
    : buildSkippedResult('Skipped because target user ARN could not be loaded.');
  const livePermissionTests = await capture('Live AWS discovery permission tests', async () => await testLivePermissions());

  const callerArn = callerIdentity.ok ? callerIdentity.value?.arn ?? null : null;
  const activePrincipalIsTargetUser = callerArn === EXPECTED_USER_ARN || callerArn === targetUser.value?.arn;
  const permissionsBoundaryPresent = targetUser.ok ? Boolean(targetUser.value?.permissionsBoundary) : null;
  const allCapturedErrors = [
    targetUser.error,
    permissionsBoundaryPolicy.error,
    inlinePolicies.error,
    attachedPolicies.error,
    groupPolicies.error,
    organizationsScps.error,
    ...(Array.isArray(livePermissionTests.value)
      ? livePermissionTests.value.map((item) => item.error).filter(Boolean)
      : []),
  ].filter(Boolean);
  const noIdentityPolicySignals = allCapturedErrors.filter((error) => error.message.includes('because no identity-based policy allows'));
  const liveDeniedActions = Array.isArray(livePermissionTests.value)
    ? livePermissionTests.value.filter((item) => !item.ok && item.error).map((item) => ({
        action: item.action,
        error: item.error,
      }))
    : [];
  const simulationDecisions = Array.isArray(simulation.value) ? simulation.value : [];
  const actionsAllowedInSimulation = simulationDecisions.filter((item) => item.decision === 'allowed').map((item) => item.actionName);
  const actionsDeniedByOrganizations = simulationDecisions
    .filter((item) => item.allowedByOrganizations === false)
    .map((item) => item.actionName);
  const actionsDeniedByPermissionsBoundary = simulationDecisions
    .filter((item) => item.allowedByPermissionsBoundary === false)
    .map((item) => item.actionName);
  const likelyExternalRestriction = liveDeniedActions.length > 0
    && actionsAllowedInSimulation.length > 0
    && liveDeniedActions.some((item) => actionsAllowedInSimulation.includes(item.action));
  const organizationsStatus = simulation.ok
    ? actionsDeniedByOrganizations.length > 0
      ? 'denied'
      : 'allowed_or_not_applicable'
    : organizationsScps.ok
      ? 'readable'
      : 'unverifiable';
  const permissionsBoundaryStatus = permissionsBoundaryPresent === null
    ? 'unverifiable'
    : permissionsBoundaryPresent
      ? 'present'
      : 'absent';
  const organizationsTargets = Array.isArray(organizationsScps.value?.targets) ? organizationsScps.value.targets : [];
  const scpPoliciesWithExplicitDeny = organizationsTargets.flatMap((target) => (
    Array.isArray(target.policies)
      ? target.policies
          .filter((policy) => Array.isArray(policy.document?.statements)
            && policy.document.statements.some((statement) => statement.effect === 'Deny'))
          .map((policy) => ({
            targetId: target.targetId,
            targetType: target.targetType,
            policyId: policy.policyId,
            policyName: policy.name,
          }))
      : []
  ));

  const report = {
    generatedAt: new Date().toISOString(),
    targetUserName: TARGET_USER_NAME,
    expectedUserArn: EXPECTED_USER_ARN,
    activePrincipalIsTargetUser,
    permissionsBoundaryPresent,
    likelyExternalRestriction,
    callerIdentity,
    targetUser,
    permissionsBoundaryPolicy,
    inlinePolicies,
    attachedPolicies,
    groupPolicies,
    organizationsScps,
    simulation,
    livePermissionTests,
    conclusions: {
      policyAttachmentReadable: inlinePolicies.ok || attachedPolicies.ok || groupPolicies.ok,
      likelyMissingIdentityPolicy: noIdentityPolicySignals.length > 0,
      permissionsBoundaryStatus,
      permissionsBoundaryArn: permissionsBoundaryPolicyArn,
      actionsDeniedByPermissionsBoundary,
      actionsDeniedByOrganizations,
      organizationsStatus,
      scpPoliciesWithExplicitDeny,
      liveDeniedActions,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (!activePrincipalIsTargetUser || liveDeniedActions.length > 0) {
    process.exitCode = 1;
  }
}

await main();
