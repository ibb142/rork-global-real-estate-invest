import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  DescribeInstanceInformationCommand,
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { createAwsRuntime, formatAwsCredentialError, readTrimmedEnv } from './aws-runtime.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '../../..');
const awsRuntime = createAwsRuntime(import.meta.url);
const AWS_REGION = awsRuntime.diagnostics.region;
const TARGET_INSTANCE_ID = readTrimmedEnv('INSTANCE_ID');
const TARGET_HOST = normalizeHost(readTrimmedEnv('EC2_HOST') || readTrimmedEnv('REMOTE_HOST') || '108.132.7.57');
const API_DOMAIN = readTrimmedEnv('API_DOMAIN') || 'api.ivxholding.com';
const CHAT_DOMAIN = readTrimmedEnv('CHAT_DOMAIN') || 'chat.ivxholding.com';
const SERVICE_NAME = readTrimmedEnv('SERVICE_NAME') || 'ivx-chat-api';
const REMOTE_APP_DIR = readTrimmedEnv('REMOTE_APP_DIR') || '/opt/ivx-app';
const REMOTE_GIT_BRANCH = readTrimmedEnv('REMOTE_GIT_BRANCH') || 'main';
const GITHUB_REPO_URL = readTrimmedEnv('GITHUB_REPO_URL');
const GITHUB_TOKEN = readTrimmedEnv('GITHUB_TOKEN');
const SHOULD_DEPLOY = readBooleanEnv('SSM_DEPLOY', true);
const COMMAND_TIMEOUT_SECONDS = Number.parseInt(readTrimmedEnv('SSM_COMMAND_TIMEOUT_SECONDS') || '1800', 10);
const POLL_INTERVAL_MS = Number.parseInt(readTrimmedEnv('SSM_POLL_INTERVAL_MS') || '5000', 10);

const sharedConfig = {
  ...awsRuntime.clientConfig,
  region: AWS_REGION,
};

const ec2 = new EC2Client(sharedConfig);
const ssm = new SSMClient(sharedConfig);

function readTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHost(value) {
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

function readBooleanEnv(name, defaultValue) {
  const normalized = readTrimmedEnv(name).toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function extractAwsError(error) {
  return {
    name: typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : 'UnknownError',
    code: typeof error === 'object' && error !== null && 'Code' in error ? String(error.Code) : null,
    message: safeError(error),
    formatted: formatAwsCredentialError(error, awsRuntime.diagnostics),
  };
}

function mask(value) {
  const text = readTrimmed(value);
  if (!text) {
    return null;
  }
  if (text.length <= 10) {
    return `${text.slice(0, 2)}…${text.slice(-2)}`;
  }
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function sanitizeOutput(value) {
  let text = readTrimmed(value);
  const secretValues = [
    process.env.JWT_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    process.env.AWS_SECRET_ACCESS_KEY,
    process.env.GITHUB_TOKEN,
    process.env.AI_GATEWAY_API_KEY,

  ].map(readTrimmed).filter(Boolean);

  for (const secret of secretValues) {
    text = text.split(secret).join('[REDACTED]');
  }

  return text;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function buildRepoUrl() {
  if (!GITHUB_REPO_URL) {
    return '';
  }

  if (!GITHUB_TOKEN || !GITHUB_REPO_URL.startsWith('https://')) {
    return GITHUB_REPO_URL;
  }

  return GITHUB_REPO_URL.replace(/^https:\/\//i, `https://${encodeURIComponent(GITHUB_TOKEN)}@`);
}

function buildEnvFileCommand() {
  const envNames = [
    'NODE_ENV',
    'HOST',
    'PORT',
    'JWT_SECRET',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_PASSWORD',
    'EXPO_PUBLIC_IVX_AI_GATEWAY_URL',
    'AI_GATEWAY_API_KEY',
    'IVX_AI_GATEWAY_URL',
    'EXPO_PUBLIC_PROJECT_ID',
    'EXPO_PUBLIC_TEAM_ID',
    'EXPO_PUBLIC_API_BASE_URL',
    'EXPO_PUBLIC_CHAT_API_URL',
    'EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL',
    'CHAT_ALLOWED_ORIGINS',
    'CHAT_DATABASE_PATH',
    'EXPO_PUBLIC_CHAT_SOCKET_PATH',
  ];

  const defaults = {
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    PORT: '3000',
    EXPO_PUBLIC_API_BASE_URL: `https://${API_DOMAIN}`,
    EXPO_PUBLIC_CHAT_API_URL: `https://${API_DOMAIN}`,
    EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL: `https://${API_DOMAIN}`,
    CHAT_ALLOWED_ORIGINS: `https://${CHAT_DOMAIN},https://${API_DOMAIN}`,
    CHAT_DATABASE_PATH: `${REMOTE_APP_DIR}/data/chat-room.sqlite`,
    EXPO_PUBLIC_CHAT_SOCKET_PATH: '/socket.io',
  };

  const lines = envNames.map((name) => {
    const value = readTrimmed(process.env[name]) || defaults[name] || '';
    return `${name}=${value.replace(/\n/g, '')}`;
  });

  return `sudo install -d -m 0755 ${shellQuote(REMOTE_APP_DIR)} && sudo tee ${shellQuote(`${REMOTE_APP_DIR}/.env`)} >/dev/null <<'IVX_ENV'\n${lines.join('\n')}\nIVX_ENV\nsudo chmod 0600 ${shellQuote(`${REMOTE_APP_DIR}/.env`)}`;
}

function buildRedeployCommands() {
  const repoUrl = buildRepoUrl();
  const commands = [
    'set -euo pipefail',
    'echo "[ivx-ssm] started $(date -Iseconds)"',
    'echo "[ivx-ssm] identity $(id -un) host $(hostname -f 2>/dev/null || hostname)"',
    'if command -v dnf >/dev/null 2>&1; then sudo dnf install -y git curl nginx tar gzip unzip shadow-utils procps-ng nodejs22 nodejs22-npm || sudo dnf install -y git curl nginx tar gzip unzip shadow-utils procps-ng nodejs npm; fi',
    'if command -v yum >/dev/null 2>&1; then sudo yum install -y git curl nginx tar gzip unzip shadow-utils procps-ng nodejs npm || true; fi',
    'if command -v apt-get >/dev/null 2>&1; then export DEBIAN_FRONTEND=noninteractive; sudo apt-get update -y; sudo apt-get install -y git curl nginx tar gzip unzip ca-certificates procps; fi',
    'if ! command -v node >/dev/null 2>&1 || [ "$(node -p "process.versions.node.split(\'.\')[0]" 2>/dev/null || echo 0)" -lt 20 ]; then curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - || true; sudo apt-get install -y nodejs || true; fi',
    'if ! command -v bun >/dev/null 2>&1; then curl -fsSL https://bun.sh/install | bash; fi',
    'export BUN_INSTALL="$HOME/.bun"',
    'export PATH="$BUN_INSTALL/bin:$PATH"',
    'if ! command -v bun >/dev/null 2>&1; then echo "bun missing after install"; exit 20; fi',
    'bun install -g pm2',
    `sudo mkdir -p ${shellQuote(REMOTE_APP_DIR)} ${shellQuote(`${REMOTE_APP_DIR}/data`)} /var/www/ivx-chat /etc/nginx/conf.d`,
  ];

  if (repoUrl) {
    commands.push(`if [ ! -d ${shellQuote(`${REMOTE_APP_DIR}/.git`)} ]; then sudo rm -rf ${shellQuote(REMOTE_APP_DIR)}; sudo git clone ${shellQuote(repoUrl)} ${shellQuote(REMOTE_APP_DIR)}; fi`);
    commands.push(`sudo git -C ${shellQuote(REMOTE_APP_DIR)} fetch --all --prune`);
    commands.push(`sudo git -C ${shellQuote(REMOTE_APP_DIR)} checkout ${shellQuote(REMOTE_GIT_BRANCH)}`);
    commands.push(`sudo git -C ${shellQuote(REMOTE_APP_DIR)} pull --ff-only origin ${shellQuote(REMOTE_GIT_BRANCH)}`);
  } else {
    commands.push(`test -f ${shellQuote(`${REMOTE_APP_DIR}/server.ts`)} || { echo "repo missing and GITHUB_REPO_URL is not configured"; exit 21; }`);
  }

  commands.push(
    `sudo chown -R $(id -un):$(id -gn) ${shellQuote(REMOTE_APP_DIR)}`,
    buildEnvFileCommand(),
    `cd ${shellQuote(REMOTE_APP_DIR)}`,
    'set -a; . ./.env; set +a',
    'bun install --frozen-lockfile || bun install',
    'if [ -d expo ]; then cd expo; bun install --frozen-lockfile || bun install; bunx expo export --platform web; cd ..; fi',
    'if [ -d expo/dist ]; then sudo rsync -a --delete expo/dist/ /var/www/ivx-chat/; fi',
    `cat > /tmp/ivx-chat.conf <<'NGINX_CONF'\nserver {\n    listen 80;\n    server_name ${API_DOMAIN};\n    client_max_body_size 25M;\n    location /health { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; access_log off; }\n    location /readiness { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; access_log off; }\n    location /socket.io/ { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_read_timeout 75s; proxy_send_timeout 75s; proxy_buffering off; }\n    location / { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }\n}\nserver {\n    listen 80;\n    server_name ${CHAT_DOMAIN};\n    root /var/www/ivx-chat;\n    index chat-hub.html index.html;\n    location = / { try_files /chat-hub.html /index.html =404; }\n    location / { try_files $uri $uri/ /chat-hub.html /index.html; }\n}\nNGINX_CONF`,
    'sudo cp /tmp/ivx-chat.conf /etc/nginx/conf.d/ivx-chat.conf',
    'sudo nginx -t',
    'sudo systemctl enable nginx || true',
    'sudo systemctl restart nginx || sudo service nginx restart',
    `pm2 delete ${shellQuote(SERVICE_NAME)} || true`,
    `pm2 start ./node_modules/tsx/dist/cli.mjs --name ${shellQuote(SERVICE_NAME)} -- server.ts`,
    'pm2 save --force || true',
    'sleep 5',
    'pm2 status',
    'curl -sS -i --max-time 15 http://127.0.0.1:3000/health',
    `curl -sS -i --max-time 15 -H ${shellQuote(`Host: ${API_DOMAIN}`)} http://127.0.0.1/health`,
    `curl -sS -i --max-time 15 -H ${shellQuote(`Host: ${CHAT_DOMAIN}`)} http://127.0.0.1/`,
    `curl -sS -i --max-time 20 http://${API_DOMAIN}/health || true`,
    `curl -sS -i --max-time 20 http://${CHAT_DOMAIN}/ || true`,
    'echo "[ivx-ssm] finished $(date -Iseconds)"',
  );

  return commands;
}

async function listSsmInstances() {
  const instances = [];
  let nextToken;
  do {
    const response = await ssm.send(new DescribeInstanceInformationCommand({
      MaxResults: 50,
      ...(nextToken ? { NextToken: nextToken } : {}),
    }));
    instances.push(...(response.InstanceInformationList ?? []));
    nextToken = response.NextToken;
  } while (nextToken);
  return instances;
}

async function describeEc2Instances() {
  const instances = [];
  let nextToken;
  do {
    const response = await ec2.send(new DescribeInstancesCommand({
      ...(TARGET_INSTANCE_ID ? { InstanceIds: [TARGET_INSTANCE_ID] } : {}),
      ...(!TARGET_INSTANCE_ID ? { Filters: [{ Name: 'instance-state-name', Values: ['running', 'pending', 'stopping', 'stopped'] }], MaxResults: 100 } : {}),
      ...(nextToken ? { NextToken: nextToken } : {}),
    }));
    instances.push(...((response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? [])));
    nextToken = response.NextToken;
  } while (nextToken);
  return instances;
}

function summarizeEc2(instance) {
  return {
    instanceId: readTrimmed(instance.InstanceId) || null,
    state: readTrimmed(instance.State?.Name) || null,
    publicIpAddress: readTrimmed(instance.PublicIpAddress) || null,
    privateIpAddress: readTrimmed(instance.PrivateIpAddress) || null,
    publicDnsName: readTrimmed(instance.PublicDnsName) || null,
    privateDnsName: readTrimmed(instance.PrivateDnsName) || null,
  };
}

function summarizeSsm(instance) {
  return {
    instanceId: readTrimmed(instance.InstanceId) || null,
    pingStatus: readTrimmed(instance.PingStatus) || null,
    platformType: readTrimmed(instance.PlatformType) || null,
    platformName: readTrimmed(instance.PlatformName) || null,
    platformVersion: readTrimmed(instance.PlatformVersion) || null,
    ipAddress: readTrimmed(instance.IPAddress) || null,
    computerName: readTrimmed(instance.ComputerName) || null,
    resourceType: readTrimmed(instance.ResourceType) || null,
    lastPingDateTime: instance.LastPingDateTime ? new Date(instance.LastPingDateTime).toISOString() : null,
  };
}

function chooseTargetInstance(ec2Summaries, ssmSummaries) {
  if (TARGET_INSTANCE_ID) {
    return TARGET_INSTANCE_ID;
  }

  const ec2Match = ec2Summaries.find((instance) => [instance.publicIpAddress, instance.privateIpAddress, instance.publicDnsName, instance.privateDnsName].includes(TARGET_HOST));
  if (ec2Match?.instanceId) {
    return ec2Match.instanceId;
  }

  const ssmOnline = ssmSummaries.filter((instance) => instance.pingStatus === 'Online');
  const ssmMatch = ssmOnline.find((instance) => [instance.ipAddress, instance.computerName].includes(TARGET_HOST));
  if (ssmMatch?.instanceId) {
    return ssmMatch.instanceId;
  }

  if (ssmOnline.length === 1 && !TARGET_HOST) {
    return ssmOnline[0]?.instanceId ?? null;
  }

  return null;
}

async function sendRedeployCommand(instanceId) {
  const response = await ssm.send(new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: 'AWS-RunShellScript',
    TimeoutSeconds: COMMAND_TIMEOUT_SECONDS,
    Parameters: {
      commands: buildRedeployCommands(),
      executionTimeout: [String(COMMAND_TIMEOUT_SECONDS)],
    },
    Comment: `IVX clean backend redeploy ${API_DOMAIN} ${CHAT_DOMAIN}`,
  }));

  return readTrimmed(response.Command?.CommandId);
}

async function waitForInvocation(commandId, instanceId) {
  const terminalStatuses = new Set(['Success', 'Cancelled', 'Failed', 'TimedOut', 'Cancelling', 'Undeliverable', 'Terminated']);
  let lastResponse = null;

  for (;;) {
    try {
      const response = await ssm.send(new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      }));
      lastResponse = response;
      const status = readTrimmed(response.Status);
      if (terminalStatuses.has(status)) {
        return response;
      }
    } catch (error) {
      const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
      if (name !== 'InvocationDoesNotExist') {
        throw error;
      }
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_INTERVAL_MS));

    if (lastResponse) {
      console.log('[EC2SSMRedeploy] Waiting for command', {
        commandId,
        instanceId,
        status: readTrimmed(lastResponse.Status) || null,
        statusDetails: readTrimmed(lastResponse.StatusDetails) || null,
      });
    }
  }
}

async function main() {
  console.log('[EC2SSMRedeploy] Starting SSM redeploy attempt');
  console.log('[EC2SSMRedeploy] Runtime diagnostics', awsRuntime.diagnostics);
  console.log('[EC2SSMRedeploy] Inputs', {
    region: AWS_REGION,
    targetInstanceId: TARGET_INSTANCE_ID || null,
    targetHost: TARGET_HOST || null,
    apiDomain: API_DOMAIN,
    chatDomain: CHAT_DOMAIN,
    serviceName: SERVICE_NAME,
    remoteAppDir: REMOTE_APP_DIR,
    deployEnabled: SHOULD_DEPLOY,
    repoConfigured: Boolean(GITHUB_REPO_URL),
    repoPreview: mask(GITHUB_REPO_URL),
  });

  let ec2Summaries = [];
  let ssmSummaries = [];
  let ec2Error = null;
  let ssmDescribeError = null;

  try {
    ec2Summaries = (await describeEc2Instances()).map(summarizeEc2);
  } catch (error) {
    ec2Error = extractAwsError(error);
    console.log('[EC2SSMRedeploy] DescribeInstances failed', ec2Error);
  }

  try {
    ssmSummaries = (await listSsmInstances()).map(summarizeSsm);
  } catch (error) {
    ssmDescribeError = extractAwsError(error);
    console.log('[EC2SSMRedeploy] DescribeInstanceInformation failed', ssmDescribeError);
  }

  const selectedInstanceId = chooseTargetInstance(ec2Summaries, ssmSummaries);
  const report = {
    generatedAt: new Date().toISOString(),
    region: AWS_REGION,
    targetHost: TARGET_HOST || null,
    targetInstanceId: TARGET_INSTANCE_ID || null,
    selectedInstanceId,
    ec2Instances: ec2Summaries,
    ssmInstances: ssmSummaries,
    awsErrors: {
      describeInstances: ec2Error,
      describeInstanceInformation: ssmDescribeError,
      sendCommand: null,
      getCommandInvocation: null,
    },
    command: null,
    blocker: null,
  };

  if (!selectedInstanceId) {
    report.blocker = ssmDescribeError
      ? 'SSM inventory is not available, so no managed target instance can be selected.'
      : 'No online SSM managed instance matched the target host. Provide INSTANCE_ID for a managed instance or enable EC2 DescribeInstances.';
    console.log('[EC2SSMRedeploy] Report');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (!SHOULD_DEPLOY) {
    report.command = { skipped: true };
    console.log('[EC2SSMRedeploy] Report');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  try {
    const commandId = await sendRedeployCommand(selectedInstanceId);
    report.command = { commandId, instanceId: selectedInstanceId, status: 'Sent' };
    const invocation = await waitForInvocation(commandId, selectedInstanceId);
    report.command = {
      commandId,
      instanceId: selectedInstanceId,
      status: readTrimmed(invocation.Status) || null,
      statusDetails: readTrimmed(invocation.StatusDetails) || null,
      responseCode: typeof invocation.ResponseCode === 'number' ? invocation.ResponseCode : null,
      standardOutputContent: sanitizeOutput(invocation.StandardOutputContent),
      standardErrorContent: sanitizeOutput(invocation.StandardErrorContent),
    };
  } catch (error) {
    const awsError = extractAwsError(error);
    if (!report.command?.commandId) {
      report.awsErrors.sendCommand = awsError;
      report.blocker = `SSM SendCommand failed: ${awsError.message}`;
    } else {
      report.awsErrors.getCommandInvocation = awsError;
      report.blocker = `SSM GetCommandInvocation failed: ${awsError.message}`;
    }
  }

  console.log('[EC2SSMRedeploy] Report');
  console.log(JSON.stringify(report, null, 2));

  if (report.blocker || report.command?.status !== 'Success') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.log('[EC2SSMRedeploy] Unhandled failure', {
    error: safeError(error),
    formatted: formatAwsCredentialError(error, awsRuntime.diagnostics),
  });
  process.exit(1);
});
