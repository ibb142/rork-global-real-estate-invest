import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '../../..');
const API_DOMAIN = readTrimmed(process.env.API_DOMAIN) || 'api.ivxholding.com';
const REPORT_DIR = resolve(PROJECT_ROOT, readTrimmed(process.env.CUTOVER_REPORT_DIR) || 'logs/deploy');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_BASENAME = `ivx-cutover-report-${RUN_TIMESTAMP}`;
const REPORT_JSON_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.json`);
const REPORT_MD_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.md`);
const SELECTED_CHECK_IDS = new Set(
  readTrimmed(process.env.CUTOVER_REPORT_CHECKS)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const AVAILABLE_CHECKS = [
  {
    id: 'verify-ivx-deploy-iam',
    label: 'IVX deploy IAM live verification',
    command: 'node',
    args: [resolve(SCRIPT_DIR, 'verify-ivx-deploy-iam.mjs')],
  },
  {
    id: 'grant-ivx-deploy-cutover-policy',
    label: 'IVX deploy IAM inline-policy attach diagnostics',
    command: 'node',
    args: [resolve(SCRIPT_DIR, 'grant-ivx-deploy-cutover-policy.mjs')],
  },
  {
    id: 'ec2-access-audit',
    label: 'EC2 access audit',
    command: 'node',
    args: [resolve(SCRIPT_DIR, 'ec2-access-audit.mjs')],
  },
  {
    id: 'verify-api-domain',
    label: 'Public API domain verification',
    command: 'bash',
    args: [resolve(SCRIPT_DIR, 'verify-api-domain.sh'), API_DOMAIN],
  },
  {
    id: 'ivx-infra-audit',
    label: 'IVX infra audit',
    command: 'node',
    args: [resolve(SCRIPT_DIR, 'ivx-infra-audit.mjs')],
  },
];

function readTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*m/g, '');
}

function truncateText(value, maxLength = 12000) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 40)}\n… truncated ${value.length - maxLength + 40} characters …`;
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 1000) {
    return `${Math.max(0, Math.round(durationMs))}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function extractJsonPayload(output) {
  const sanitized = stripAnsi(output).trim();
  if (!sanitized) {
    return null;
  }

  const lines = sanitized.split('\n');
  const candidateIndexes = [];
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      candidateIndexes.push(index);
    }
  }

  for (let index = candidateIndexes.length - 1; index >= 0; index -= 1) {
    const candidate = lines.slice(candidateIndexes[index]).join('\n').trim();
    try {
      return JSON.parse(candidate);
    } catch {
    }
  }

  return null;
}

function buildChecks() {
  const checks = [...AVAILABLE_CHECKS];

  if (readTrimmed(process.env.EC2_RUN_INSTANCES_COMMAND)) {
    checks.splice(3, 0, {
      id: 'ec2-launch-command-audit',
      label: 'EC2 run-instances command audit',
      command: 'node',
      args: [resolve(SCRIPT_DIR, 'ec2-launch-command-audit.mjs')],
    });
  }

  if (SELECTED_CHECK_IDS.size === 0) {
    return checks;
  }

  return checks.filter((check) => SELECTED_CHECK_IDS.has(check.id));
}

function runCommand(check) {
  return new Promise((resolvePromise) => {
    const startedAt = new Date();
    const child = spawn(check.command, check.args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', (error) => {
      const finishedAt = new Date();
      const output = `${stdout}${stderr}`;
      resolvePromise({
        id: check.id,
        label: check.label,
        command: check.command,
        args: check.args,
        ok: false,
        exitCode: null,
        signal: null,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${error instanceof Error ? error.message : String(error)}`,
        output: stripAnsi(output),
        parsedJson: extractJsonPayload(output),
      });
    });

    child.on('close', (code, signal) => {
      const finishedAt = new Date();
      const output = `${stdout}${stderr}`;
      resolvePromise({
        id: check.id,
        label: check.label,
        command: check.command,
        args: check.args,
        ok: code === 0,
        exitCode: code,
        signal: signal ?? null,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        stdout,
        stderr,
        output: stripAnsi(output),
        parsedJson: extractJsonPayload(output),
      });
    });
  });
}

function buildMarkdown(report) {
  const lines = [
    '# IVX cutover report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- API domain: ${report.apiDomain}`,
    `- Project root: ${report.projectRoot}`,
    `- Report JSON: ${report.reportJsonPathRelative}`,
    `- Report Markdown: ${report.reportMdPathRelative}`,
    '',
    '## Summary',
    '',
    '| Check | Status | Exit | Duration |',
    '| --- | --- | --- | --- |',
    ...report.checks.map((check) => `| ${check.label} | ${check.ok ? 'PASS' : 'FAIL'} | ${check.exitCode ?? 'signal'} | ${formatDuration(check.durationMs)} |`),
    '',
    `- Passed: ${report.summary.passedCount}`,
    `- Failed: ${report.summary.failedCount}`,
    report.summary.failedLabels.length > 0
      ? `- Blocking checks: ${report.summary.failedLabels.join(', ')}`
      : '- Blocking checks: none',
    '',
  ];

  for (const check of report.checks) {
    lines.push(`## ${check.label}`);
    lines.push('');
    lines.push(`- Status: ${check.ok ? 'PASS' : 'FAIL'}`);
    lines.push(`- Exit code: ${check.exitCode ?? 'signal'}`);
    lines.push(`- Duration: ${formatDuration(check.durationMs)}`);
    lines.push(`- Command: \`${[check.command, ...check.args].join(' ')}\``);
    lines.push('');
    lines.push('```text');
    lines.push(truncateText(check.output || '(no output)'));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });

  const checks = buildChecks();
  const results = [];
  const unknownSelectedChecks = [...SELECTED_CHECK_IDS].filter((checkId) => !checks.some((check) => check.id === checkId));

  console.log('[IVXCutoverReport] Starting screenshot-free cutover report');
  console.log('[IVXCutoverReport] Report directory', relative(PROJECT_ROOT, REPORT_DIR) || REPORT_DIR);
  if (SELECTED_CHECK_IDS.size > 0) {
    console.log('[IVXCutoverReport] Selected checks', [...SELECTED_CHECK_IDS]);
  }
  if (unknownSelectedChecks.length > 0) {
    console.log('[IVXCutoverReport] Ignoring unknown check IDs', unknownSelectedChecks);
  }
  if (checks.length === 0) {
    throw new Error('No cutover checks selected. Set CUTOVER_REPORT_CHECKS to one or more known check IDs.');
  }

  for (const check of checks) {
    console.log(`\n[IVXCutoverReport] Running ${check.label}`);
    const result = await runCommand(check);
    console.log(`[IVXCutoverReport] ${check.label} ${result.ok ? 'passed' : 'failed'} in ${formatDuration(result.durationMs)}`);
    results.push(result);
  }

  const passedCount = results.filter((result) => result.ok).length;
  const failedChecks = results.filter((result) => !result.ok);
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    apiDomain: API_DOMAIN,
    projectRoot: PROJECT_ROOT,
    reportDir: REPORT_DIR,
    reportJsonPath: REPORT_JSON_PATH,
    reportMdPath: REPORT_MD_PATH,
    reportJsonPathRelative: relative(PROJECT_ROOT, REPORT_JSON_PATH) || REPORT_JSON_PATH,
    reportMdPathRelative: relative(PROJECT_ROOT, REPORT_MD_PATH) || REPORT_MD_PATH,
    summary: {
      totalCount: results.length,
      passedCount,
      failedCount: failedChecks.length,
      failedLabels: failedChecks.map((result) => result.label),
      selectedCheckIds: checks.map((check) => check.id),
      ok: failedChecks.length === 0,
    },
    checks: results,
  };

  await writeFile(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(REPORT_MD_PATH, `${buildMarkdown(report)}\n`, 'utf8');

  console.log('\n[IVXCutoverReport] Completed');
  console.log('[IVXCutoverReport] JSON report', report.reportJsonPathRelative);
  console.log('[IVXCutoverReport] Markdown report', report.reportMdPathRelative);
  console.log('[IVXCutoverReport] Summary', report.summary);

  if (!report.summary.ok) {
    process.exitCode = 1;
  }
}

await main();
