import { describe, expect, test } from 'bun:test';
import {
  CASA_ROSARIO_PHOTOS,
  PEREZ_RESIDENCE_PHOTOS,
  JACKSONVILLE_PRIME_PHOTOS,
  sanitizeDealPhotosForDeal,
  getFallbackPhotosForDeal,
} from '@/constants/deal-photos';
import { buildOwnershipSnapshot, calculateOwnershipPercent } from '@/lib/ownership-math';

function fingerprint(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.split('?')[0]?.toLowerCase() ?? '';
  }
}

describe('project media integrity (regression: Perez showed Casa Rosario photos)', () => {
  test('Perez Residence fallback contains ONLY Perez storage-folder media', () => {
    expect(PEREZ_RESIDENCE_PHOTOS.length).toBeGreaterThan(0);
    for (const photo of PEREZ_RESIDENCE_PHOTOS) {
      expect(photo).toContain('/deal-photos/perez-residence-001/');
    }
  });

  test('Perez and Casa Rosario photo sets are fully disjoint', () => {
    const casa = new Set(CASA_ROSARIO_PHOTOS.map(fingerprint));
    const overlap = PEREZ_RESIDENCE_PHOTOS.map(fingerprint).filter((fp) => casa.has(fp));
    expect(overlap).toEqual([]);
  });

  test('no two fallback registries share a non-shared media URL', () => {
    const sets: [string, string[]][] = [
      ['casa_rosario', CASA_ROSARIO_PHOTOS],
      ['perez_residence', PEREZ_RESIDENCE_PHOTOS],
      ['jacksonville_prime', JACKSONVILLE_PRIME_PHOTOS.filter((p) => p.startsWith('http'))],
    ];
    const owners = new Map<string, string>();
    for (const [id, photos] of sets) {
      for (const photo of photos) {
        const fp = fingerprint(photo);
        const existing = owners.get(fp);
        expect(existing === undefined || existing === id).toBe(true);
        owners.set(fp, id);
      }
    }
  });

  test('sanitize blocks Casa Rosario photos injected into a Perez Residence row', () => {
    const perezIdentity = { title: 'PEREZ RESIDENCE', project_name: 'ONE STOP DEVELOPMENT LLC' };
    const mixed = [...CASA_ROSARIO_PHOTOS.slice(0, 3), PEREZ_RESIDENCE_PHOTOS[0]!];
    const sanitized = sanitizeDealPhotosForDeal(perezIdentity, mixed);
    for (const photo of sanitized) {
      expect(photo).not.toContain('r2.dev/attachments');
    }
    expect(sanitized).toContain(PEREZ_RESIDENCE_PHOTOS[0]!);
  });

  test('Perez fallback lookup never returns Casa media', () => {
    const fallback = getFallbackPhotosForDeal({ title: 'PEREZ RESIDENCE' });
    const casa = new Set(CASA_ROSARIO_PHOTOS.map(fingerprint));
    for (const photo of fallback) {
      expect(casa.has(fingerprint(photo))).toBe(false);
    }
  });
});

describe('minimum ownership — single canonical calculation (regression: 0.0016% vs 0.0020%)', () => {
  test('Perez Residence: $50 of $3,125,000 sale price = 0.0016% on every surface', () => {
    const snapshot = buildOwnershipSnapshot(50, 3_125_000);
    expect(snapshot.ownershipText).toBe('0.0016% minimum ownership');
    const landingFormula = `${((50 / 3_125_000) * 100).toFixed(4)}% minimum ownership`;
    expect(landingFormula).toBe(snapshot.ownershipText);
  });

  test('Casa Rosario: $50 of $1,400,000 = 0.0036%', () => {
    expect(buildOwnershipSnapshot(50, 1_400_000).ownershipText).toBe('0.0036% minimum ownership');
  });

  test('IVX Jacksonville Prime: $50 of $400,000 = 0.0125%', () => {
    expect(buildOwnershipSnapshot(50, 400_000).ownershipText).toBe('0.0125% minimum ownership');
  });

  test('ownership percent is clamped and safe for invalid input', () => {
    expect(calculateOwnershipPercent(0, 1_000_000)).toBe(0);
    expect(calculateOwnershipPercent(50, 0)).toBe(0);
    expect(calculateOwnershipPercent(2_000_000, 1_000_000)).toBe(100);
  });
});
