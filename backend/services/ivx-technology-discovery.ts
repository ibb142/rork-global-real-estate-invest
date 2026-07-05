/**
 * IVX Technology Discovery engine (owner-only, read/derive only).
 *
 * Composes an INTERNAL signal scan (the durable innovation store's technology
 * ideas) with OPTIONAL EXTERNAL source adapters (GitHub search, arXiv). Every
 * candidate is ranked on five transparent, deterministic dimensions:
 *
 *   usefulnessToIvx | implementationDifficulty | securityRisk | businessValue | cost
 *
 * The engine NEVER writes files, never deploys, and never fabricates external
 * results — when an external source's credentials are missing it returns a
 * BLOCKED record naming the exact env var(s) required, instead of inventing data.
 */
import { buildInnovationDashboard } from './ivx-innovation-dashboard';
import type { InnovationIdea } from './ivx-innovation-store';

export const IVX_TECHNOLOGY_DISCOVERY_MARKER = 'ivx-technology-discovery-2026-06-12';

/** Five-dimensional ranking, every value 0–100 (higher = more of that property). */
export type TechnologyScores = {
  /** How useful this is to IVX specifically. */
  usefulnessToIvx: number;
  /** Implementation difficulty (higher = harder). */
  implementationDifficulty: number;
  /** Security risk of adopting it (higher = riskier). */
  securityRisk: number;
  /** Business value if adopted. */
  businessValue: number;
  /** Cost to adopt/run (higher = more expensive). */
  cost: number;
};

export type TechnologyCandidate = {
  id: string;
  title: string;
  summary: string;
  source: 'internal-innovation' | 'github' | 'arxiv';
  evidence: string;
  url: string | null;
  scores: TechnologyScores;
  /** Composite rank (0–100): rewards usefulness+businessValue, penalises difficulty+risk+cost. */
  rank: number;
};

export type TechnologyDiscoverySourceStatus = {
  source: string;
  status: 'ok' | 'blocked' | 'error';
  count: number;
  /** For blocked sources: the exact env var(s) required to enable it. */
  requiredEnv: string[];
  detail: string;
};

export type TechnologyDiscoveryResult = {
  marker: string;
  generatedAt: string;
  includeExternal: boolean;
  sources: TechnologyDiscoverySourceStatus[];
  candidates: TechnologyCandidate[];
  ranking: { total: number; topRank: number | null };
};

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Composite rank: usefulness + businessValue reward; difficulty + risk + cost penalise. */
export function computeTechnologyRank(scores: TechnologyScores): number {
  const reward = scores.usefulnessToIvx * 0.4 + scores.businessValue * 0.35;
  const penalty = scores.implementationDifficulty * 0.1 + scores.securityRisk * 0.1 + scores.cost * 0.05;
  return clamp(reward - penalty + 25);
}

function candidateFromIdea(idea: InnovationIdea): TechnologyCandidate {
  const scores: TechnologyScores = {
    usefulnessToIvx: clamp(idea.scores.impact * 0.6 + idea.scores.confidence * 0.4),
    implementationDifficulty: clamp(idea.scores.complexity),
    securityRisk: clamp(idea.scores.complexity * 0.4),
    businessValue: clamp(idea.scores.revenue),
    cost: clamp(idea.scores.complexity * 0.5),
  };
  return {
    id: `internal-${idea.id}`,
    title: idea.title,
    summary: idea.summary,
    source: 'internal-innovation',
    evidence: idea.evidence,
    url: null,
    scores,
    rank: computeTechnologyRank(scores),
  };
}

/** Fetch with a hard timeout so external adapters can never hang the request. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function scanGithub(): Promise<{ status: TechnologyDiscoverySourceStatus; candidates: TechnologyCandidate[] }> {
  const token = process.env.GITHUB_TOKEN?.trim() ?? '';
  if (!token) {
    return {
      status: { source: 'github', status: 'blocked', count: 0, requiredEnv: ['GITHUB_TOKEN'], detail: 'GitHub search disabled: GITHUB_TOKEN not set in backend runtime.' },
      candidates: [],
    };
  }
  try {
    const query = 'topic:ai-agents+stars:>500+pushed:>2026-01-01';
    const res = await fetchWithTimeout(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=8`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ivx-technology-discovery' } },
      8000,
    );
    if (!res.ok) {
      return {
        status: { source: 'github', status: 'error', count: 0, requiredEnv: [], detail: `GitHub search returned HTTP ${res.status}.` },
        candidates: [],
      };
    }
    const body = (await res.json()) as { items?: Array<{ id: number; full_name: string; description: string | null; html_url: string; stargazers_count: number }> };
    const items = body.items ?? [];
    const candidates = items.map((repo): TechnologyCandidate => {
      const popularity = clamp(Math.log10(Math.max(repo.stargazers_count, 1)) * 20);
      const scores: TechnologyScores = {
        usefulnessToIvx: clamp(popularity * 0.8),
        implementationDifficulty: 55,
        securityRisk: 45,
        businessValue: clamp(popularity * 0.7),
        cost: 30,
      };
      return {
        id: `github-${repo.id}`,
        title: repo.full_name,
        summary: repo.description ?? 'No description provided.',
        source: 'github',
        evidence: `${repo.stargazers_count} stars`,
        url: repo.html_url,
        scores,
        rank: computeTechnologyRank(scores),
      };
    });
    return {
      status: { source: 'github', status: 'ok', count: candidates.length, requiredEnv: [], detail: `GitHub search returned ${candidates.length} repositories.` },
      candidates,
    };
  } catch (error) {
    return {
      status: { source: 'github', status: 'error', count: 0, requiredEnv: [], detail: error instanceof Error ? error.message : 'GitHub search failed.' },
      candidates: [],
    };
  }
}

async function scanArxiv(): Promise<{ status: TechnologyDiscoverySourceStatus; candidates: TechnologyCandidate[] }> {
  try {
    const res = await fetchWithTimeout(
      'http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=6',
      { headers: { 'User-Agent': 'ivx-technology-discovery' } },
      8000,
    );
    if (!res.ok) {
      return {
        status: { source: 'arxiv', status: 'error', count: 0, requiredEnv: [], detail: `arXiv returned HTTP ${res.status}.` },
        candidates: [],
      };
    }
    const xml = await res.text();
    const entries = xml.split('<entry>').slice(1);
    const candidates = entries.map((entry, index): TechnologyCandidate => {
      const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'Untitled').replace(/\s+/g, ' ').trim();
      const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 280);
      const link = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? null;
      const scores: TechnologyScores = {
        usefulnessToIvx: 55,
        implementationDifficulty: 70,
        securityRisk: 25,
        businessValue: 50,
        cost: 20,
      };
      return {
        id: `arxiv-${index}`,
        title,
        summary: summary || 'No abstract available.',
        source: 'arxiv',
        evidence: 'arXiv cs.AI latest submission',
        url: link,
        scores,
        rank: computeTechnologyRank(scores),
      };
    });
    return {
      status: { source: 'arxiv', status: 'ok', count: candidates.length, requiredEnv: [], detail: `arXiv returned ${candidates.length} recent papers.` },
      candidates,
    };
  } catch (error) {
    return {
      status: { source: 'arxiv', status: 'error', count: 0, requiredEnv: [], detail: error instanceof Error ? error.message : 'arXiv query failed.' },
      candidates: [],
    };
  }
}

/** Vendor changelog sources have no free programmatic feed — reported BLOCKED, never faked. */
function blockedVendorSources(): TechnologyDiscoverySourceStatus[] {
  return [
    { source: 'openai-updates', status: 'blocked', count: 0, requiredEnv: ['OPENAI_RESEARCH_FEED_URL'], detail: 'No configured OpenAI updates feed; set OPENAI_RESEARCH_FEED_URL to enable.' },
    { source: 'anthropic-updates', status: 'blocked', count: 0, requiredEnv: ['ANTHROPIC_RESEARCH_FEED_URL'], detail: 'No configured Anthropic updates feed; set ANTHROPIC_RESEARCH_FEED_URL to enable.' },
    { source: 'google-ai-updates', status: 'blocked', count: 0, requiredEnv: ['GOOGLE_AI_RESEARCH_FEED_URL'], detail: 'No configured Google AI/DeepMind updates feed; set GOOGLE_AI_RESEARCH_FEED_URL to enable.' },
  ];
}

/**
 * Run a technology-discovery scan. Internal innovation signals are always scanned;
 * external sources (GitHub, arXiv, vendor feeds) only run when includeExternal is true.
 */
export async function runTechnologyDiscoveryScan(
  options: { includeExternal?: boolean } = {},
): Promise<TechnologyDiscoveryResult> {
  const includeExternal = options.includeExternal === true;

  const dashboard = await buildInnovationDashboard().catch(() => null);
  const internalIdeas = dashboard?.topIdeas ?? [];
  const internalCandidates = internalIdeas.map(candidateFromIdea);

  const sources: TechnologyDiscoverySourceStatus[] = [
    {
      source: 'internal-innovation',
      status: 'ok',
      count: internalCandidates.length,
      requiredEnv: [],
      detail: `Scanned ${internalCandidates.length} technology idea(s) from the innovation store.`,
    },
  ];
  const candidates: TechnologyCandidate[] = [...internalCandidates];

  if (includeExternal) {
    const [github, arxiv] = await Promise.all([scanGithub(), scanArxiv()]);
    sources.push(github.status, arxiv.status, ...blockedVendorSources());
    candidates.push(...github.candidates, ...arxiv.candidates);
  }

  candidates.sort((a, b) => b.rank - a.rank);

  return {
    marker: IVX_TECHNOLOGY_DISCOVERY_MARKER,
    generatedAt: new Date().toISOString(),
    includeExternal,
    sources,
    candidates,
    ranking: { total: candidates.length, topRank: candidates.length > 0 ? candidates[0].rank : null },
  };
}
