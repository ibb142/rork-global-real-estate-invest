/**
 * IVX Buyer Discovery API (owner-only).
 *
 * Real, named buyers/acquirers sourced from public SEC EDGAR Form D filings,
 * deterministically classified into the seven buyer types the owner requested:
 * cash buyers, family offices, developers, operators, acquisition groups,
 * brokers, and REITs. Every record carries a direct SEC filing link for proof.
 *
 *   GET  /api/ivx/buyer-discovery        → run a discovery scan (query params)
 *   POST /api/ivx/buyer-discovery/scan   → run a discovery scan (JSON body)
 *
 * Owner-only. No personal mobile numbers, no scraped private data.
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import {
  discoverBuyers,
  BUYER_TYPES,
  BUYER_TYPE_LABEL,
  IVX_BUYER_DISCOVERY_MARKER,
  type BuyerType,
  type BuyerDiscoveryOptions,
} from '../services/ivx-buyer-discovery';

export const OPTIONS = (): Response => ownerOnlyOptions();

async function requireOwner(request: Request): Promise<Response | null> {
  try {
    const owner = await assertIVXOwnerOnly(request);
    if (!owner.userId) {
      return ownerOnlyJson({ ok: false, error: 'IVX owner authentication required.' }, 401);
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX owner authentication failed.';
    const status = /missing bearer/i.test(message) || /invalid or expired/i.test(message) ? 401 : 403;
    return ownerOnlyJson({ ok: false, error: message }, status);
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toPositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

function normalizeBuyerTypes(value: unknown): BuyerType[] {
  const raw: string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : typeof value === 'string'
      ? value.split(',').map((v) => v.trim())
      : [];
  return BUYER_TYPES.filter((t) => raw.includes(t));
}

function buildOptions(source: Record<string, unknown>): BuyerDiscoveryOptions {
  const options: BuyerDiscoveryOptions = {};
  const query = source.query;
  if (typeof query === 'string' && query.trim()) options.query = query.trim();
  const minOffering = toPositiveNumber(source.minOfferingUsd ?? source.minOffering);
  if (minOffering !== undefined) options.minOfferingUsd = minOffering;
  const limit = toPositiveNumber(source.limit);
  if (limit !== undefined) options.limit = limit;
  const buyerTypes = normalizeBuyerTypes(source.buyerTypes ?? source.types);
  if (buyerTypes.length > 0) options.buyerTypes = buyerTypes;
  return options;
}

export async function handleBuyerDiscoveryGetRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const source: Record<string, unknown> = {
    query: url.searchParams.get('query') ?? undefined,
    minOfferingUsd: url.searchParams.get('minOfferingUsd') ?? url.searchParams.get('minOffering') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    buyerTypes: url.searchParams.get('buyerTypes') ?? url.searchParams.get('types') ?? undefined,
  };
  const result = await discoverBuyers(buildOptions(source));
  const buyers = Array.isArray(result.buyers) ? result.buyers : [];
  return ownerOnlyJson({
    ok: result.ok,
    marker: IVX_BUYER_DISCOVERY_MARKER,
    buyers,
    resultCount: buyers.length,
    buyerTypes: BUYER_TYPES.map((type) => ({ type, label: BUYER_TYPE_LABEL[type] })),
    discovery: result as unknown as Record<string, unknown>,
  });
}

export async function handleBuyerDiscoveryScanRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const result = await discoverBuyers(buildOptions(body));
  const buyers = Array.isArray(result.buyers) ? result.buyers : [];
  return ownerOnlyJson({
    ok: result.ok,
    marker: IVX_BUYER_DISCOVERY_MARKER,
    buyers,
    resultCount: buyers.length,
    discovery: result as unknown as Record<string, unknown>,
  });
}
