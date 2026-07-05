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

export function detectDeveloperModeRequest(message: string): boolean {
  const text = (message ?? '').toLowerCase();
  const triggers = [
    'deploy', 'developer mode', 'dev mode', 'senior developer', 'fix now',
    'put live', 'deploy live', 'audit ivx', 'fix this', 'execute now',
    'end to end', 'live deploy', 'push to production', 'verify live',
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
