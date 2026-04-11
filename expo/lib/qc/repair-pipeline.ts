import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDiagnosticEvent } from './diagnostic-events';
import type {
  QCDiagnosticEvent,
  QCFlowId,
  QCModuleId,
  QCProbeResult,
  QCRepairTask,
  QCRepairTaskStatus,
  QCSeverity,
} from './types';

const REPAIR_TASKS_KEY = '@ivx_qc_repair_tasks_v1';
const MAX_REPAIR_TASKS = 50;
const PATTERN_THRESHOLD = 3;

const failurePatterns = new Map<string, { count: number; firstSeen: string; lastSeen: string; events: string[] }>();

function patternKey(flow: QCFlowId, module: QCModuleId, step: string): string {
  return `${flow}::${module}::${step}`;
}

function inferLikelyFiles(flow: QCFlowId, module: QCModuleId): string[] {
  const fileMap: Partial<Record<QCFlowId, string[]>> = {
    admin_publish_deal: ['lib/canonical-deals.ts', 'app/admin/jv-deals.tsx'],
    user_invest: ['lib/investment-service.ts', 'app/buy-shares.tsx'],
    realtime_sync: ['lib/realtime.ts', 'lib/jv-realtime.ts'],
    photo_protection: ['lib/photo-upload.ts', 'lib/image-storage.ts'],
    trash_recovery: ['lib/data-recovery.ts', 'app/admin/trash-bin.tsx'],
    storage_isolation: ['lib/project-storage.ts'],
    chat_room: [
      'src/modules/chat/services/supabaseChatProvider.ts',
      'src/modules/chat/hooks/useRoomSync.ts',
      'src/modules/chat/screens/ChatScreen.tsx',
    ],
    analytics_rpc: ['lib/analytics-server.ts', 'app/admin/landing-analytics.tsx'],
    storage_upload: ['lib/photo-upload.ts', 'lib/supabase.ts'],
    auth_session: ['lib/auth-context.tsx', 'lib/supabase.ts'],
  };

  const moduleMap: Partial<Record<QCModuleId, string[]>> = {
    supabase_db: ['lib/supabase.ts'],
    supabase_auth: ['lib/auth-context.tsx', 'lib/auth-helpers.ts'],
    supabase_realtime: ['lib/realtime.ts'],
    supabase_storage: ['lib/photo-upload.ts'],
  };

  return [...(fileMap[flow] ?? []), ...(moduleMap[module] ?? [])];
}

function generateSuggestedFix(flow: QCFlowId, failingStep: string, summary: string): string {
  if (flow === 'analytics_rpc' && summary.includes('does not exist')) {
    return 'Create or verify the get_landing_analytics RPC function in Supabase. Check SQL definition, parameter types, and EXECUTE grants.';
  }
  if (flow === 'chat_room' && summary.includes('conversations')) {
    return 'Verify conversations table exists in Supabase with correct RLS policies. Run the full schema SQL if missing.';
  }
  if (flow === 'storage_upload' && summary.includes('bucket')) {
    return 'Create required storage buckets (chat-uploads, deal-photos, avatars) in Supabase Dashboard > Storage.';
  }
  if (flow === 'photo_protection') {
    return 'Verify deal-photos bucket exists and has correct upload/download policies. Check RLS on storage.objects.';
  }
  if (flow === 'auth_session') {
    return 'Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Verify auth service is reachable and session tokens are valid.';
  }
  if (flow === 'realtime_sync') {
    return 'Check Supabase realtime configuration. Verify WebSocket connectivity and channel subscription logic in the affected module.';
  }
  return `Investigate ${failingStep} in the ${flow} flow. Review the error: "${summary}" and verify backend/DB state.`;
}

export async function loadRepairTasks(): Promise<QCRepairTask[]> {
  try {
    const raw = await AsyncStorage.getItem(REPAIR_TASKS_KEY);
    if (!raw) return [];
    const tasks = JSON.parse(raw) as QCRepairTask[];
    return Array.isArray(tasks) ? tasks : [];
  } catch {
    console.log('[QC:Repair] Failed to load repair tasks');
    return [];
  }
}

async function persistRepairTasks(tasks: QCRepairTask[]): Promise<void> {
  try {
    const trimmed = tasks.slice(0, MAX_REPAIR_TASKS);
    await AsyncStorage.setItem(REPAIR_TASKS_KEY, JSON.stringify(trimmed));
  } catch {
    console.log('[QC:Repair] Failed to persist repair tasks');
  }
}

export function trackFailurePattern(event: QCDiagnosticEvent): void {
  const key = patternKey(event.flow, event.module, event.failingStep);
  const existing = failurePatterns.get(key);

  if (existing) {
    existing.count++;
    existing.lastSeen = event.timestamp;
    existing.events.push(event.id);
    if (existing.events.length > 10) {
      existing.events = existing.events.slice(-10);
    }
  } else {
    failurePatterns.set(key, {
      count: 1,
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      events: [event.id],
    });
  }
}

export async function detectAndCreateRepairTasks(probeResults: QCProbeResult[]): Promise<QCRepairTask[]> {
  const newTasks: QCRepairTask[] = [];
  const existingTasks = await loadRepairTasks();
  const existingKeys = new Set(existingTasks.filter((t) => t.status === 'open' || t.status === 'in_progress').map((t) => `${t.flow}::${t.module}`));

  for (const probe of probeResults) {
    if (probe.status !== 'fail') continue;

    for (const event of probe.diagnosticEvents) {
      trackFailurePattern(event);

      const key = patternKey(event.flow, event.module, event.failingStep);
      const pattern = failurePatterns.get(key);

      if (!pattern || pattern.count < PATTERN_THRESHOLD) continue;

      const taskKey = `${event.flow}::${event.module}`;
      if (existingKeys.has(taskKey)) {
        const existingTask = existingTasks.find((t) => `${t.flow}::${t.module}` === taskKey && (t.status === 'open' || t.status === 'in_progress'));
        if (existingTask) {
          existingTask.failureCount = pattern.count;
          existingTask.lastSeenAt = event.timestamp;
          existingTask.diagnosticEventIds = pattern.events;
        }
        continue;
      }

      const task: QCRepairTask = {
        id: `repair_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        status: 'open',
        flow: event.flow,
        module: event.module,
        severity: event.severity,
        title: `Repeated failure: ${event.title}`,
        description: `${event.summary}\n\nThis failure has occurred ${pattern.count} times since ${new Date(pattern.firstSeen).toLocaleString()}.`,
        likelyFiles: inferLikelyFiles(event.flow, event.module),
        suggestedFix: generateSuggestedFix(event.flow, event.failingStep, event.summary),
        failureCount: pattern.count,
        firstSeenAt: pattern.firstSeen,
        lastSeenAt: event.timestamp,
        diagnosticEventIds: pattern.events,
        autoGenerated: true,
      };

      newTasks.push(task);
      existingKeys.add(taskKey);

      createDiagnosticEvent({
        flow: event.flow,
        module: event.module,
        severity: 'warning',
        title: `Repair task created: ${task.title}`,
        summary: `Auto-generated repair task after ${pattern.count} failures`,
        failingStep: 'repair-pipeline/detect',
        correlationId: event.correlationId,
        autoHealEligible: false,
      });

      console.log(`[QC:Repair] Created repair task: ${task.id} — ${task.title} (${pattern.count} failures)`);
    }
  }

  if (newTasks.length > 0) {
    const allTasks = [...newTasks, ...existingTasks];
    await persistRepairTasks(allTasks);
  } else if (existingTasks.length > 0) {
    await persistRepairTasks(existingTasks);
  }

  return newTasks;
}

export async function updateRepairTaskStatus(taskId: string, status: QCRepairTaskStatus): Promise<void> {
  const tasks = await loadRepairTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (task) {
    task.status = status;
    await persistRepairTasks(tasks);
    console.log(`[QC:Repair] Task ${taskId} updated to ${status}`);
  }
}

export async function getOpenRepairTasks(): Promise<QCRepairTask[]> {
  const tasks = await loadRepairTasks();
  return tasks.filter((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'awaiting_approval');
}

export async function dismissRepairTask(taskId: string): Promise<void> {
  await updateRepairTaskStatus(taskId, 'dismissed');
}

export async function resolveRepairTask(taskId: string): Promise<void> {
  await updateRepairTaskStatus(taskId, 'resolved');
}

export function getFailurePatternSummary(): Array<{ key: string; count: number; firstSeen: string; lastSeen: string }> {
  const entries: Array<{ key: string; count: number; firstSeen: string; lastSeen: string }> = [];
  for (const [key, pattern] of failurePatterns.entries()) {
    entries.push({ key, count: pattern.count, firstSeen: pattern.firstSeen, lastSeen: pattern.lastSeen });
  }
  return entries.sort((a, b) => b.count - a.count);
}
