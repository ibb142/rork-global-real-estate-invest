import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetUserCommand,
  GetUserPolicyCommand,
  IAMClient,
  ListUserPoliciesCommand,
  PutUserPolicyCommand,
  SimulatePrincipalPolicyCommand,
} from '@aws-sdk/client-iam';
import {
  DescribePolicyCommand,
  ListParentsCommand,
  ListPoliciesForTargetCommand,
  ListRootsCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { createAwsRuntime, formatAwsCredentialError, readTrimmedEnv } from './aws-runtime.mjs';

const awsRuntime = createAwsRuntime(import.meta.url);
const TARGET_USER_NAME = readTrimmedEnv('AWS_IAM_TARGET_USER') || readTrimmedEnv('IVX_DEPLOY_AWS_USER') || 'IVXDeploy';
const TARGET_ACCOUNT_ID = readTrimmedEnv('AWS_ACCOUNT_ID') || '206818124217';
const POLICY_NAME = readTrimmedEnv('AWS_IAM_POLICY_NAME') || 'IVXDeployCutoverPolicy';
const POLICY_FILE_PATH = readTrimmedEnv('AWS_IAM_POLICY_FILE')
  || resolve(dirname(fileURLToPath(import.meta.url)), '../aws/ivx-deploy-cutover-policy.json');
const TARGET_USER_ARN = `arn:aws:iam::${TARGET_ACCOUNT_ID}:user/${TARGET_USER_NAME}`;

const ACTIONS_TO_VALIDATE = [
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

const sharedConfig = {
  ...awsRuntime.clientConfig,
  region: awsRuntime.diagnostics.region,
};

const iam = new IAMClient(sharedConfig);
const sts = new STSClient(sharedConfig);
const organizations = new OrganizationsClient({ ...sharedConfig, region: 'us-east-1' });

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
  console.log(`[IVXDeployIAMGrant] ${label}...`);

  try {
    const value = await fn();
    console.log(`[IVXDeployIAMGrant] ${label} succeeded`);
    return {
      ok: true,
      value,
      error: null,
    };
  } catch (error) {
    const formatted = extractAwsError(error);
    console.log(`[IVXDeployIAMGrant] ${label} failed`, formatted);
    return {
      ok: false,
      value: null,
      error: formatted,
    };
  }
}

async function getCallerIdentitySummary() {
  const response = await sts.send(new GetCallerIdentityCommand({}));
  return {
    account: readTrimmed(response.Account) || null,
    arn: readTrimmed(response.Arn) || null,
    userId: readTrimmed(response.UserId) || null,
  };
}

async function loadPolicyDocument() {
  const fileContents = await readFile(POLICY_FILE_PATH, 'utf8');
  const parsed = JSON.parse(fileContents);

  return {
    filePath: POLICY_FILE_PATH,
    raw: JSON.stringify(parsed),
    parsed,
  };
}

async function attachInlinePolicy(policyDocument) {
  await iam.send(new PutUserPolicyCommand({
    UserName: TARGET_USER_NAME,
    PolicyName: POLICY_NAME,
    PolicyDocument: policyDocument,
  }));

  return {
    userName: TARGET_USER_NAME,
    policyName: POLICY_NAME,
  };
}

async function listInlinePolicies() {
  const response = await iam.send(new ListUserPoliciesCommand({
    UserName: TARGET_USER_NAME,
    MaxItems: 1000,
  }));

  return (response.PolicyNames ?? []).map((name) => readTrimmed(name)).filter(Boolean);
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

async function getTargetUserSummary() {
  const response = await iam.send(new GetUserCommand({ UserName: TARGET_USER_NAME }));
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
  };
}

async function getInlinePolicyDocument() {
  const response = await iam.send(new GetUserPolicyCommand({
    UserName: TARGET_USER_NAME,
    PolicyName: POLICY_NAME,
  }));

  return {
    policyName: readTrimmed(response.PolicyName) || POLICY_NAME,
    document: normalizePolicyDocument(response.PolicyDocument ?? null),
  };
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

async function simulateTargetUser() {
  const response = await iam.send(new SimulatePrincipalPolicyCommand({
    PolicySourceArn: TARGET_USER_ARN,
    ActionNames: ACTIONS_TO_VALIDATE,
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

async function main() {
  console.log('[IVXDeployIAMGrant] Starting remediation run');
  console.log('[IVXDeployIAMGrant] AWS runtime diagnostics', awsRuntime.diagnostics);

  const callerIdentity = await capture('STS GetCallerIdentity', async () => await getCallerIdentitySummary());
  const policyDocument = await capture(`Load policy document ${POLICY_FILE_PATH}`, async () => await loadPolicyDocument());
  const attachPolicy = policyDocument.ok
    ? await capture(`IAM PutUserPolicy ${TARGET_USER_NAME}/${POLICY_NAME}`, async () => await attachInlinePolicy(policyDocument.value.raw))
    : buildSkippedResult('Skipped because the policy document could not be loaded.');
  const targetUser = await capture(`IAM GetUser ${TARGET_USER_NAME}`, async () => await getTargetUserSummary());
  const permissionsBoundaryPolicyArn = targetUser.value?.permissionsBoundary?.permissionsBoundaryArn ?? null;
  const permissionsBoundaryPolicy = permissionsBoundaryPolicyArn
    ? await capture(`IAM permissions boundary policy ${permissionsBoundaryPolicyArn}`, async () => await getManagedPolicySummary(permissionsBoundaryPolicyArn))
    : buildSkippedResult('Skipped because the target user does not have a readable permissions boundary.');
  const inlinePolicies = await capture(`IAM ListUserPolicies ${TARGET_USER_NAME}`, async () => await listInlinePolicies());
  const inlinePolicyDocument = await capture(`IAM GetUserPolicy ${TARGET_USER_NAME}/${POLICY_NAME}`, async () => await getInlinePolicyDocument());
  const organizationsScps = await capture(`Organizations SCP inspection for account ${TARGET_ACCOUNT_ID}`, async () => await inspectOrganizationsScps(TARGET_ACCOUNT_ID));
  const simulation = await capture(`IAM SimulatePrincipalPolicy ${TARGET_USER_ARN}`, async () => await simulateTargetUser());

  const simulationResults = Array.isArray(simulation.value) ? simulation.value : [];
  const deniedByOrganizations = simulationResults.filter((item) => item.allowedByOrganizations === false).map((item) => item.actionName);
  const deniedByPermissionsBoundary = simulationResults.filter((item) => item.allowedByPermissionsBoundary === false).map((item) => item.actionName);
  const deniedActions = simulationResults.filter((item) => item.decision !== 'allowed').map((item) => item.actionName);
  const targetPolicyNamePresent = inlinePolicies.ok ? inlinePolicies.value.includes(POLICY_NAME) : false;
  const effectivePermissionsAlreadyPresent = deniedActions.length === 0;
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
    targetUserArn: TARGET_USER_ARN,
    policyName: POLICY_NAME,
    policyFilePath: POLICY_FILE_PATH,
    callerIdentity,
    policyDocument: policyDocument.ok
      ? {
          ok: true,
          value: {
            filePath: policyDocument.value.filePath,
            statementCount: Array.isArray(policyDocument.value.parsed?.Statement)
              ? policyDocument.value.parsed.Statement.length
              : policyDocument.value.parsed?.Statement
                ? 1
                : 0,
          },
          error: null,
        }
      : policyDocument,
    attachPolicy,
    targetUser,
    permissionsBoundaryPolicy,
    inlinePolicies,
    inlinePolicyDocument,
    organizationsScps,
    simulation,
    conclusions: {
      policyAttached: targetPolicyNamePresent,
      effectivePermissionsAlreadyPresent,
      attachPermissionRequired: !targetPolicyNamePresent && !effectivePermissionsAlreadyPresent,
      permissionsBoundaryPresent: Boolean(targetUser.value?.permissionsBoundary),
      permissionsBoundaryArn: permissionsBoundaryPolicyArn,
      deniedByOrganizations,
      deniedByPermissionsBoundary,
      deniedActions,
      scpPoliciesWithExplicitDeny,
      allRequestedActionsAllowed: effectivePermissionsAlreadyPresent,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (deniedActions.length > 0) {
    process.exitCode = 1;
  }
}

await main();
