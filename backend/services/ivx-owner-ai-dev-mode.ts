/**
 * IVX Owner AI Developer Mode — turn the chat into a real executor.
 *
 * Why this exists: the owner explicitly rejected the BLOCKED-only behavior when
 * they ask for development/deploy/audit work. The chat must still refuse to
 * fabricate proof, but it can now trigger a real senior-developer job through
 * the owner-gated worker and stream the proof back into the conversation.
 *
 * Rules:
 *   - No fake proof. The chat only reports what the worker returns.
 *   - If the worker returns BLOCKED (missing credentials / owner not signed in),
 *     the chat explains the exact blocker and the required action.
 *   - If the worker succeeds, the chat returns the strict evidence block
 *     (TASK UNDERSTOOD / FILES CHANGED / COMMANDS RUN / STATUS / PROOF).
 */

export type IVXOwnerAIDevModeResult =
  | { mode: 'developer'; ok: boolean; evidence: string; error: string | null };

export function detectSeniorDeveloperModeStatusRequest(message: string): boolean {
  const text = (message ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const statusPhrases = [
    'senior developer mode',
    'senior dev mode',
    'developer mode',
    'dev mode',
    'are you a senior developer',
    'are you in senior',
    'are you in developer',
    'do you in senior',
    'do you in developer',
    'you are senior developer',
    'you are developer',
    'switch to senior developer',
    'switch to developer',
  ];
  return statusPhrases.some((p) => text.includes(p));
}

export function buildSeniorDeveloperModeStatusAnswer(): string {
  return [
    'YES — IVX Senior Developer mode is live and owner-gated.',
    'CAPABILITIES: repo inspection, safe code patch, test/build runner, GitHub commit/push, Render deploy, production health verify, proof ledger.',
    'REQUIRED: owner sign-in + real GitHub/Render/Supabase credentials.',
    'TO USE IT:',
    '1. Make sure you are signed in as the IVX owner.',
    '2. Ask: "Run a senior developer task: <goal>" or go to Admin → IVX Developer Workspace.',
    '3. The worker will execute, commit, deploy, and return live proof.',
    'No proof = no VERIFIED status.',
  ].join('\n');
}

export function detectDeveloperModeRequest(message: string): boolean {
  const text = (message ?? '').toLowerCase();
  // Senior-developer mode STATUS questions are handled above, not blocked.
  if (detectSeniorDeveloperModeStatusRequest(message)) {
    return false;
  }
  const triggers = [
    'deploy', 'fix now', 'put live', 'deploy live', 'audit ivx', 'fix this', 'execute now',
    'end to end', 'live deploy', 'push to production', 'verify live', 'run senior developer task',
  ];
  return triggers.some((t) => text.includes(t));
}

export function buildDeveloperModeBlockedExplanation(blocker: string): string {
  return [
    'BLOCKED — IVX Owner AI cannot fabricate a deployment or code-change claim.',
    `REASON: ${blocker}`,
    'EXACT_ACTION_REQUIRED:',
    '1. Sign in to the IVX app as the owner.',
    '2. Go to Admin → IVX Developer Workspace.',
    '3. Submit the task with owner approval and real credentials (GitHub token, Render API key, Supabase service key).',
    '4. The senior-developer worker will execute, commit, deploy, and return live proof.',
    'No proof = no VERIFIED status.',
  ].join('\n');
}
