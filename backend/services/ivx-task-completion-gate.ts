/**
 * IVX task completion gate — owner spec 2026-07-11.
 *
 * A task/block may NEVER report COMPLETED until ALL of:
 *   1. Git commit exists (real SHA)
 *   2. Push completed
 *   3. Deployment started
 *   4. Deployment completed
 *   5. Health endpoint returns HTTP 200
 *   6. Production is running the latest commit
 *
 * If any requirement fails → STATUS = NOT_DEPLOYED. Pure + deterministic
 * (no I/O, no network, no AI) so it is fully unit-testable and can never
 * fabricate evidence.
 */
import { commitShasMatch, isRealCommitSha } from './ivx-deployment-state-machine';

/** Real evidence captured from the actual git/deploy/verify pipeline. */
export type BlockCompletionEvidence = {
  commitSha: string | null;
  pushCompleted: boolean;
  deployStarted: boolean;
  deployCompleted: boolean;
  healthHttpStatus: number | null;
  runningCommitSha: string | null;
};

export type BlockCompletionDecision = {
  status: 'VERIFIED' | 'NOT_DEPLOYED';
  /** Empty when VERIFIED; otherwise the exact unmet requirements. */
  failures: string[];
};

/** Evidence object representing "nothing happened" — always NOT_DEPLOYED. */
export const NO_DEPLOYMENT_EVIDENCE: BlockCompletionEvidence = {
  commitSha: null,
  pushCompleted: false,
  deployStarted: false,
  deployCompleted: false,
  healthHttpStatus: null,
  runningCommitSha: null,
};

/**
 * Apply the six-point completion checklist. Returns VERIFIED only when every
 * requirement is backed by real evidence; otherwise NOT_DEPLOYED with the
 * exact list of unmet requirements (never narrative).
 */
export function resolveBlockCompletionStatus(evidence: BlockCompletionEvidence): BlockCompletionDecision {
  const failures: string[] = [];

  if (!evidence.commitSha || !isRealCommitSha(evidence.commitSha)) {
    failures.push('No git commit exists (real commit SHA required).');
  }
  if (!evidence.pushCompleted) {
    failures.push('Push not completed.');
  }
  if (!evidence.deployStarted) {
    failures.push('Deployment never started.');
  }
  if (!evidence.deployCompleted) {
    failures.push('Deployment not completed.');
  }
  if (evidence.healthHttpStatus !== 200) {
    failures.push(
      evidence.healthHttpStatus === null
        ? 'No health check evidence (health endpoint never returned).'
        : `Health endpoint returned HTTP ${evidence.healthHttpStatus}, expected 200.`,
    );
  }
  if (!evidence.runningCommitSha || !isRealCommitSha(evidence.runningCommitSha)) {
    failures.push('No production running-commit evidence.');
  } else if (evidence.commitSha && !commitShasMatch(evidence.commitSha, evidence.runningCommitSha)) {
    failures.push(`Production running commit ${evidence.runningCommitSha} differs from GitHub commit ${evidence.commitSha}.`);
  }

  return failures.length === 0
    ? { status: 'VERIFIED', failures: [] }
    : { status: 'NOT_DEPLOYED', failures };
}
