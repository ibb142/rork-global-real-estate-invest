/**
 * Per-night token budget cap for autonomous night-ops + repair-brain.
 *
 * Tracks cumulative model-token spend per UTC day. When the cap is exceeded,
 * autonomous operations must stop and require explicit owner approval to
 * continue. Spend is persisted to logs/audit/token-budget.jsonl.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const BUDGET_DIR = path.resolve(process.cwd(), 'logs/audit');
const BUDGET_FILE = path.join(BUDGET_DIR, 'token-budget.jsonl');

const DEFAULT_NIGHT_CAP = Number.parseInt(process.env.IVX_NIGHT_TOKEN_CAP || '', 10);
const DEFAULT_DAY_CAP = Number.parseInt(process.env.IVX_DAY_TOKEN_CAP || '', 10);

export type TokenBudgetEntry = {
  at: string;
  utcDay: string; // YYYY-MM-DD
  source: string;
  inputTokens: number;
  outputTokens: number;
};

export type TokenBudgetSnapshot = {
  utcDay: string;
  totalInput: number;
  totalOutput: number;
  totalCombined: number;
  nightCap: number;
  dayCap: number;
  capExceeded: boolean;
  nightCapExceeded: boolean;
  isNightWindowUtc: boolean;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isNightWindowUtc(): boolean {
  const hour = new Date().getUTCHours();
  // Night window matches the default night-ops gate (02:00–08:00 UTC).
  return hour >= 2 && hour < 8;
}

async function readTodayEntries(): Promise<TokenBudgetEntry[]> {
  const day = todayUtc();
  try {
    const content = await fs.readFile(BUDGET_FILE, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const entries: TokenBudgetEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TokenBudgetEntry;
        if (entry && entry.utcDay === day) entries.push(entry);
      } catch { /* skip */ }
    }
    return entries;
  } catch {
    return [];
  }
}

export async function recordTokenSpend(source: string, inputTokens: number, outputTokens: number): Promise<TokenBudgetSnapshot> {
  const entry: TokenBudgetEntry = {
    at: new Date().toISOString(),
    utcDay: todayUtc(),
    source: source || 'unknown',
    inputTokens: Math.max(0, Math.floor(inputTokens) || 0),
    outputTokens: Math.max(0, Math.floor(outputTokens) || 0),
  };
  try {
    await fs.mkdir(BUDGET_DIR, { recursive: true });
    await fs.appendFile(BUDGET_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // best-effort
  }
  return getTokenBudgetSnapshot();
}

export async function getTokenBudgetSnapshot(): Promise<TokenBudgetSnapshot> {
  const day = todayUtc();
  const entries = await readTodayEntries();
  const totalInput = entries.reduce((s, e) => s + e.inputTokens, 0);
  const totalOutput = entries.reduce((s, e) => s + e.outputTokens, 0);
  const totalCombined = totalInput + totalOutput;
  const nightCap = Number.isFinite(DEFAULT_NIGHT_CAP) && DEFAULT_NIGHT_CAP > 0 ? DEFAULT_NIGHT_CAP : 500_000;
  const dayCap = Number.isFinite(DEFAULT_DAY_CAP) && DEFAULT_DAY_CAP > 0 ? DEFAULT_DAY_CAP : 2_000_000;
  const isNight = isNightWindowUtc();
  return {
    utcDay: day,
    totalInput,
    totalOutput,
    totalCombined,
    nightCap,
    dayCap,
    capExceeded: totalCombined >= dayCap,
    nightCapExceeded: isNight && totalCombined >= nightCap,
    isNightWindowUtc: isNight,
  };
}

/** Returns true when autonomous operations should pause for budget reasons. */
export async function isAutonomousBudgetExhausted(): Promise<boolean> {
  const snap = await getTokenBudgetSnapshot();
  return snap.capExceeded || snap.nightCapExceeded;
}
