/**
 * IVX Home Stats Service — Shared data source for iOS and Android Home.
 *
 * Fetches the exact same canonical backend endpoints that the iOS native app uses:
 *   - GET /api/ivx/members/count  → members, investors, total registry counts
 *   - GET /api/ivx/jv-deals     → published active deal count
 *
 * No hardcoded demo counts. No chatbot members. Counts come only from the live
 * IVX database served by the production backend.
 */

const API_BASE = (process.env.EXPO_PUBLIC_IVX_API_BASE_URL || 'https://api.ivxholding.com').replace(/\/+$/, '');

export interface IvxHomeStats {
  members: number;
  investors: number;
  liveDeals: number;
  annualReturns: string;
  ok: boolean;
  timestamp?: string;
}

interface MembersCountPayload {
  ok: boolean;
  members: number;
  waitlist: number;
  investors: number;
  buyers: number;
  total: number;
  timestamp?: string;
}

interface JVDealsPayload {
  deals: unknown[];
  count?: number;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchIvxHomeStats(): Promise<IvxHomeStats> {
  const [counts, deals] = await Promise.all([
    fetchJSON<MembersCountPayload>(`${API_BASE}/api/ivx/members/count`),
    fetchJSON<JVDealsPayload>(`${API_BASE}/api/ivx/jv-deals`),
  ]);

  const liveDeals = deals.count ?? (Array.isArray(deals.deals) ? deals.deals.length : 0);

  return {
    members: counts.total ?? 0,
    investors: counts.investors ?? 0,
    liveDeals,
    annualReturns: 'Up to 22%',
    ok: counts.ok === true,
    timestamp: counts.timestamp,
  };
}
