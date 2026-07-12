/**
 * IVX Daily Report — Idea → Task conversion store (owner-only, local).
 *
 * Converts a single daily-report finding into a structured Senior Developer task
 * (goal + plan + files + risk + rollback) and persists it locally so the owner
 * can review, hand it to the Senior Developer workspace, or track it over time.
 *
 * No secrets are stored; this is a thin local queue mirrored from report findings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IVXSeniorDeveloperRiskLevel } from '@/src/modules/ivx-developer/seniorDeveloperApprovalService';

const TASKS_STORE_KEY = 'ivx.daily-report.converted-tasks.v1';
const MAX_TASKS = 100;

export type ConvertedIdeaTask = {
  id: string;
  title: string;
  goal: string;
  proposedPlan: string;
  filesAffected: string[];
  riskLevel: IVXSeniorDeveloperRiskLevel;
  rollbackOption: string;
  sourceSection: string;
  sourceReportDate: string;
  createdAt: number;
};

export type IdeaTaskInput = {
  sectionKey: string;
  sectionTitle: string;
  findingTitle: string;
  findingDetail: string;
  reportDate: string;
};

/** Build a structured Senior Developer task from a report finding (no persistence). */
export function buildTaskFromFinding(input: IdeaTaskInput): ConvertedIdeaTask {
  const now = Date.now();
  const goal = `Act as the IVX senior developer and deliver this improvement from the daily report: ${input.findingTitle}`;
  const proposedPlan = [
    `1. Investigate the area related to: ${input.findingTitle}.`,
    `2. Context from the daily report: ${input.findingDetail}`,
    '3. Make only additive, crash-safe changes.',
    '4. Run focused validation/tests.',
    '5. Commit changed files and verify production health after deploy.',
  ].join('\n');
  return {
    id: `idea_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: input.findingTitle,
    goal,
    proposedPlan,
    filesAffected: [],
    riskLevel: 'low',
    rollbackOption:
      'Rollback by reverting the returned GitHub commit hash, then redeploy the previous known-good commit on Render.',
    sourceSection: input.sectionTitle,
    sourceReportDate: input.reportDate,
    createdAt: now,
  };
}

async function readTasks(): Promise<ConvertedIdeaTask[]> {
  try {
    const raw = await AsyncStorage.getItem(TASKS_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConvertedIdeaTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.log('[IdeaTaskService] readTasks failed:', (err as Error)?.message);
    return [];
  }
}

async function writeTasks(list: ConvertedIdeaTask[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TASKS_STORE_KEY, JSON.stringify(list.slice(0, MAX_TASKS)));
  } catch (err) {
    console.log('[IdeaTaskService] writeTasks failed:', (err as Error)?.message);
  }
}

export async function listConvertedTasks(): Promise<ConvertedIdeaTask[]> {
  const list = await readTasks();
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

/** Convert a finding into a task and persist it. Returns the created task. */
export async function convertIdeaToTask(input: IdeaTaskInput): Promise<ConvertedIdeaTask> {
  const task = buildTaskFromFinding(input);
  const existing = await readTasks();
  await writeTasks([task, ...existing]);
  return task;
}

export async function deleteConvertedTask(id: string): Promise<void> {
  const list = await readTasks();
  await writeTasks(list.filter((t) => t.id !== id));
}
