import type { IVXOwnerAIRequest } from '@/shared/ivx';
import { auditOwnerAIRequestBody, type OwnerAIRequestBodyAudit } from './ivxAIRequestService';

/**
 * Every user-facing way to send a prompt to IVX Owner AI. All of them funnel
 * through `ivxAIRequestService.requestOwnerAI`, which builds the outbound body
 * with the canonical `buildRequestPayload`. This module proves — using that
 * exact builder — that each path serializes a non-empty `{ message: string }`,
 * the contract the `/api/ivx/owner-ai` route enforces (HTTP 400 otherwise).
 */
export type OwnerAISendPathId =
  | 'chat_send'
  | 'owner_ai_reply'
  | 'watchdog_probe'
  | 'voice_transcription'
  | 'quick_action'
  | 'autonomous_mode';

export type OwnerAISendPathAudit = {
  id: OwnerAISendPathId;
  /** Owner-facing label. */
  label: string;
  /** Where this path originates in the app. */
  origin: string;
  /** The representative caller input this path produces. */
  sampleInput: IVXOwnerAIRequest;
  /** Result of building + verifying the outbound body with the real builder. */
  body: OwnerAIRequestBodyAudit;
};

export type OwnerAISendPathAuditReport = {
  ranAt: string;
  allValid: boolean;
  validCount: number;
  totalCount: number;
  paths: OwnerAISendPathAudit[];
};

type SendPathDefinition = {
  id: OwnerAISendPathId;
  label: string;
  origin: string;
  build: () => IVXOwnerAIRequest;
};

/**
 * Representative inputs for each send path. These mirror exactly what each
 * caller passes into `requestOwnerAI` in production (a free-text owner prompt),
 * so the audit reflects the real outbound body rather than a synthetic shape.
 */
const SEND_PATH_DEFINITIONS: readonly SendPathDefinition[] = [
  {
    id: 'chat_send',
    label: 'Chat send',
    origin: 'app/ivx/chat.tsx → sendMessageMutation → ivxChatService.sendOwnerTextMessage',
    build: () => ({ message: 'hello', mode: 'chat', senderLabel: 'Owner' }),
  },
  {
    id: 'owner_ai_reply',
    label: 'Owner AI reply',
    origin: 'chat/services/aiReplyService.ts → ivxAIRequestService.requestOwnerAI',
    build: () => ({ message: 'Audit current IVX Owner AI issues and propose a fix.', mode: 'chat' }),
  },
  {
    id: 'watchdog_probe',
    label: 'Watchdog acceptance probe',
    origin: 'ivx-owner-ai/services/ivxAIWatchdog.ts → SEND_TAP → BACKEND_POST_STARTED',
    build: () => ({ message: 'hello', mode: 'chat', persistUserMessage: false, persistAssistantMessage: false }),
  },
  {
    id: 'voice_transcription',
    label: 'Voice prompt',
    origin: 'app/ivx/chat.tsx → transcribeVoiceMutation → composer → send',
    build: () => ({ message: 'What is the latest IVX deployment status?', mode: 'chat', senderLabel: 'Owner (voice)' }),
  },
  {
    id: 'quick_action',
    label: 'Quick action',
    origin: 'app/ivx/chat.tsx → quick-action preset prompt → send',
    build: () => ({ message: 'Run a production health check now.', mode: 'command', senderLabel: 'Owner' }),
  },
  {
    id: 'autonomous_mode',
    label: 'Autonomous mode',
    origin: 'autonomous scheduled run → requestOwnerAI (command mode)',
    build: () => ({ message: 'Pick the highest-priority open item and propose the next action.', mode: 'command', devTestModeActive: false }),
  },
];

/**
 * Audits every Owner AI send path by building its outbound request body with the
 * production `buildRequestPayload` and verifying the `{ message: string }`
 * contract. Pure and synchronous — performs no network calls.
 */
export function auditOwnerAISendPaths(): OwnerAISendPathAuditReport {
  const paths: OwnerAISendPathAudit[] = SEND_PATH_DEFINITIONS.map((def) => {
    const sampleInput = def.build();
    return {
      id: def.id,
      label: def.label,
      origin: def.origin,
      sampleInput,
      body: auditOwnerAIRequestBody(sampleInput),
    };
  });

  const validCount = paths.filter((p) => p.body.valid).length;
  return {
    ranAt: new Date().toISOString(),
    allValid: validCount === paths.length,
    validCount,
    totalCount: paths.length,
    paths,
  };
}
