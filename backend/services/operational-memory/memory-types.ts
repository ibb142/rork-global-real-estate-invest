/**
 * IVX Operational Memory — shared types.
 * Block 23: persistent operational memory + autonomous execution loops.
 */
export type MemoryCategory =
  | 'architecture'
  | 'deployment'
  | 'incident'
  | 'fix'
  | 'roadmap'
  | 'repo_index'
  | 'task_state'
  | 'note';

export type MemoryRow = {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  source: string | null;
  ref_id: string | null;
  embedding_dim: number;
  embedding_model: string | null;
  created_at: string;
  updated_at: string;
};

export type MemoryUpsertInput = {
  category: MemoryCategory;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  source?: string;
  refId?: string;
};

export type MemorySearchHit = MemoryRow & { distance: number };

export type AgentTaskStatus =
  | 'queued'
  | 'analyzing'
  | 'planning'
  | 'patching'
  | 'testing'
  | 'validating'
  | 'deploying'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'canceled';

export type AgentTaskStep = {
  phase: AgentTaskStatus;
  startedAt: string;
  endedAt: string | null;
  ok: boolean | null;
  detail: string;
  metadata?: Record<string, unknown>;
};

export type AgentTaskRow = {
  id: string;
  goal: string;
  status: AgentTaskStatus;
  steps: AgentTaskStep[];
  rollback_token: string | null;
  rollback_applied: boolean;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export const MEMORY_EMBEDDING_DIM = 1536;
export const MEMORY_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const OPERATIONAL_MEMORY_MARKER = 'ivx-operational-memory-2026-05-17t-block23';
