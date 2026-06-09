import type { JVPartner, PoolTier } from '@/types/jv';

export function safePartners(partners: unknown): JVPartner[] {
  if (Array.isArray(partners)) return partners;
  if (typeof partners === 'string') {
    try {
      const parsed = JSON.parse(partners);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return [];
}

export function safeProfitSplit(profitSplit: unknown): { partnerId: string; percentage: number }[] {
  if (Array.isArray(profitSplit)) return profitSplit;
  if (typeof profitSplit === 'string') {
    try {
      const parsed = JSON.parse(profitSplit);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return [];
}

export function safePoolTiers(poolTiers: unknown): PoolTier[] {
  if (Array.isArray(poolTiers)) return poolTiers;
  if (typeof poolTiers === 'string') {
    try {
      const parsed = JSON.parse(poolTiers);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return [];
}

export function safePhotos(photos: unknown): string[] {
  if (Array.isArray(photos)) {
    return photos.filter((p: unknown) => typeof p === 'string' && p.length > 0);
  }
  if (typeof photos === 'string') {
    try {
      const parsed = JSON.parse(photos);
      if (Array.isArray(parsed)) return parsed.filter((p: unknown) => typeof p === 'string');
    } catch { /* ignore */ }
  }
  return [];
}

export function formatJVCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function calculateDefaultEndDate(startDate: string): string {
  const THREE_YEARS_MS = 365 * 3 * 24 * 60 * 60 * 1000;
  try {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) {
      return new Date(Date.now() + THREE_YEARS_MS).toISOString().split('T')[0];
    }
    return new Date(d.getTime() + THREE_YEARS_MS).toISOString().split('T')[0];
  } catch {
    return new Date(Date.now() + THREE_YEARS_MS).toISOString().split('T')[0];
  }
}

export function generateJVNumber(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `JV-${y}${m}-${rand}`;
}

export function isExistingBackendId(id: string): boolean {
  if (id.startsWith('JV-')) return false;
  if (id.startsWith('jv_') || id.startsWith('jv-')) return true;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
