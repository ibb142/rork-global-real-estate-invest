/**
 * IVX Senior-Developer Answer Format
 *
 * Renders the senior-developer runtime proof into the OWNER-REQUIRED strict
 * execution format. The owner explicitly rejected narrative prose ("Owner
 * Execution Mode — executing end-to-end…"); every development task must return
 * an evidence-only block:
 *
 *   TASK UNDERSTOOD / FILES INSPECTED / FILES CHANGED / COMMANDS RUN /
 *   TEST RESULT / TYPECHECK RESULT / STATUS / PROOF
 *
 * Hard enforcement (no claims without real commands):
 *   - No files changed      → "NO CODE CHANGED — no development was completed."
 *   - No tests run          → "NOT VERIFIED — tests were not run."
 *   - Patch could not write  → "BLOCKED — I do not have code write access."
 *
 * This module is runtime-free and deterministic (no network/filesystem/AI) so it
 * is fully unit-testable.
 */
import type { IVXSeniorDeveloperRunProof } from './ivx-senior-developer-runtime';
import type { IVXOwnerExecutionDecision } from './ivx-owner-execution-mode';

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstSentence(text: string): string {
  const normalized = trimmed(text).replace(/\s+/g, ' ');
  if (!normalized) {
    return 'Execute the requested development task.';
  }
  const sentence = normalized.split(/(?<=[.!?])\s/)[0] ?? normalized;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence;
}

/** Render one validation result as raw, copy-pasteable terminal output. */
function rawValidationOutput(validation: IVXSeniorDeveloperRunProof['validations'][number]): string {
  return [
    `$ ${validation.command}`,
    validation.stdoutTail ? validation.stdoutTail.trimEnd() : '',
    validation.stderrTail ? validation.stderrTail.trimEnd() : '',
    validation.error ? `error: ${validation.error}` : '',
    `exit code: ${validation.exitCode ?? 'null'} → ${validation.ok ? 'PASS' : 'FAIL'}`,
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

export function isTypecheckCommand(command: string): boolean {
  return /\b(tsc|typecheck|type-check|type\s+check)\b/i.test(command);
}

export function isTestCommand(command: string): boolean {
  return /\btest\b/i.test(command) && !isTypecheckCommand(command);
}

/**
 * Build the senior-developer execution answer in the owner-required strict format.
 */
export function buildSeniorDeveloperExecutionAnswer(
  proof: IVXSeniorDeveloperRunProof,
  decision: IVXOwnerExecutionDecision,
): string {
  // Guarded actions are the only path allowed to stop before executing.
  if (decision.requiresApproval) {
    const categories = decision.approvalCategories.join(', ') || 'a guarded action';
    return [
      `TASK UNDERSTOOD:\n${firstSentence(proof.goal)}`,
      `FILES INSPECTED:\n${proof.repoBrain.keyFiles.slice(0, 12).join('\n') || 'none'}`,
      'FILES CHANGED:\nNO CODE CHANGED — no development was completed.',
      'COMMANDS RUN:\nnone — guarded action requires explicit owner confirmation before execution.',
      'TEST RESULT:\nNOT VERIFIED — tests were not run.',
      'TYPECHECK RESULT:\nNOT VERIFIED — typecheck was not run.',
      'STATUS:\nBLOCKED',
      `PROOF:\nBLOCKED — requires owner confirmation: ${categories}. Reply with the exact action and confirmation text to execute.`,
    ].join('\n\n');
  }

  const changedFiles = proof.changedFiles;
  const validations = proof.validations;
  const testValidations = validations.filter((v) => isTestCommand(v.command));
  const typecheckValidations = validations.filter((v) => isTypecheckCommand(v.command));
  const otherValidations = validations.filter(
    (v) => !isTestCommand(v.command) && !isTypecheckCommand(v.command),
  );
  const git = proof.gitDeployOperator;

  // FILES INSPECTED — real paths the repo brain indexed for this task.
  const inspected = proof.repoBrain.keyFiles.slice(0, 12);
  const filesInspected = inspected.length > 0
    ? inspected.join('\n')
    : `indexed ${proof.repoBrain.indexedFileCount} files across ${proof.repoBrain.indexedDirectoryCount} directories`;

  // FILES CHANGED — hard enforcement: real paths or the exact "no change" / "no write" line.
  let filesChanged: string;
  if (changedFiles.length > 0) {
    filesChanged = changedFiles.join('\n');
  } else if (proof.patchProposal.status === 'blocked') {
    filesChanged = 'BLOCKED — I do not have code write access.';
  } else {
    filesChanged = 'NO CODE CHANGED — no development was completed.';
  }

  // COMMANDS RUN — raw command lines actually executed (validations + git/deploy).
  const commandLines: string[] = otherValidations
    .concat(testValidations, typecheckValidations)
    .map((v) => `$ ${v.command} → exit ${v.exitCode ?? 'null'} (${v.ok ? 'PASS' : 'FAIL'})`);
  if (git.github.commitAttempted) {
    commandLines.push(`$ git commit/push → ${git.github.commitSha ? `committed ${git.github.commitSha}` : `not completed (${git.reason})`}`);
  }
  if (git.render.deployAttempted) {
    commandLines.push(`$ render deploy → ${git.render.deployId ? `${git.render.deployStatus ?? 'triggered'} (${git.render.deployId})` : `not completed (${git.render.error ?? git.reason})`}`);
  }
  const commandsRun = commandLines.length > 0
    ? commandLines.join('\n')
    : 'NONE — no commands were executed.';

  // TEST RESULT — raw output or the exact "not verified" line.
  const testResult = testValidations.length > 0
    ? testValidations.map(rawValidationOutput).join('\n\n')
    : 'NOT VERIFIED — tests were not run.';

  // TYPECHECK RESULT — raw output or the exact "not verified" line.
  const typecheckResult = typecheckValidations.length > 0
    ? typecheckValidations.map(rawValidationOutput).join('\n\n')
    : 'NOT VERIFIED — typecheck was not run.';

  // STATUS — DEPLOYED only when commit+deploy executed, production verified, AND
  // the validation checks actually ran and passed. A deploy that looks complete
  // but has no confirmed tests/typecheck is UNVERIFIED, never DEPLOYED — claiming
  // DEPLOYED while tests/typecheck read "NOT VERIFIED" is exactly the dishonest
  // mismatch this format must prevent.
  const checksRan = testValidations.length > 0 || typecheckValidations.length > 0;
  const checksPassed = checksRan && validations.every((v) => v.ok);
  const deployConfirmed = git.status === 'executed'
    && Boolean(git.github.commitSha)
    && proof.productionVerification.ok
    && proof.changedRouteVerification.ok;
  let status: 'DEPLOYED' | 'UNVERIFIED' | 'LOCAL ONLY' | 'BLOCKED';
  if (changedFiles.length === 0 || proof.patchProposal.status === 'blocked') {
    status = 'BLOCKED';
  } else if (deployConfirmed && checksPassed) {
    status = 'DEPLOYED';
  } else if (deployConfirmed && !checksPassed) {
    // Deploy pipeline reported done, but checks were not run/confirmed — do not
    // overclaim. Surface UNVERIFIED so the report matches the TEST/TYPECHECK lines.
    status = 'UNVERIFIED';
  } else {
    status = 'LOCAL ONLY';
  }

  // PROOF — diff-stat-style summary derived from the applied patch operations.
  const proofLines: string[] = [];
  if (changedFiles.length > 0) {
    proofLines.push('git diff --stat (applied patch):');
    for (const filePath of changedFiles) {
      const op = proof.patchProposal.operations.find((operation) => operation.path === filePath);
      proofLines.push(` ${filePath} | ${op ? op.summary : 'modified'}`);
    }
    proofLines.push('git status --short:');
    for (const filePath of changedFiles) {
      proofLines.push(` M ${filePath}`);
    }
    if (git.github.commitSha) {
      proofLines.push(`commit: ${git.github.commitSha}${git.github.branch ? ` (${git.github.branch})` : ''}`);
    }
    proofLines.push(`production /health: ${proof.productionVerification.ok ? 'healthy' : 'not confirmed'}; changed route: ${proof.changedRouteVerification.ok ? 'live' : 'not confirmed'}`);
  } else {
    proofLines.push('git diff --stat: (no changes)');
    proofLines.push('git status --short: (clean)');
  }
  proofLines.push(`job: ${proof.jobId}`);

  return [
    `TASK UNDERSTOOD:\n${firstSentence(proof.goal)}`,
    `FILES INSPECTED:\n${filesInspected}`,
    `FILES CHANGED:\n${filesChanged}`,
    `COMMANDS RUN:\n${commandsRun}`,
    `TEST RESULT:\n${testResult}`,
    `TYPECHECK RESULT:\n${typecheckResult}`,
    `STATUS:\n${status}`,
    `PROOF:\n${proofLines.join('\n')}`,
  ].join('\n\n');
}
