import { describe, expect, test } from 'bun:test';
import {
  toFiniteNumber,
  formatPercentSafe,
  isQuarantinedTestProperty,
  isPublicReelRow,
  mapReelRow,
  mapReelRows,
} from '@/lib/home-content-guards';
import {
  formatCurrency,
  formatCurrencyWithDecimals,
  formatCurrencyCompact,
  formatDollar,
  formatDollarWhole,
  formatDollarCompact,
  formatNumber,
  formatCompactNumber,
} from '@/lib/formatters';

describe('formatters never render NaN (item 8)', () => {
  const badInputs = [Number.NaN, undefined as unknown as number, null as unknown as number, Infinity, -Infinity];

  test('every money formatter is NaN-safe', () => {
    for (const bad of badInputs) {
      expect(formatCurrency(bad)).not.toContain('NaN');
      expect(formatCurrencyWithDecimals(bad)).not.toContain('NaN');
      expect(formatCurrencyCompact(bad)).not.toContain('NaN');
      expect(formatDollar(bad)).not.toContain('NaN');
      expect(formatDollarWhole(bad)).not.toContain('NaN');
      expect(formatDollarCompact(bad)).not.toContain('NaN');
      expect(formatNumber(bad)).not.toContain('NaN');
      expect(formatCompactNumber(bad)).not.toContain('NaN');
    }
  });

  test('valid values still format correctly', () => {
    expect(formatCurrencyWithDecimals(125.5)).toBe('$125.50');
    expect(formatDollarWhole(2500000)).toBe('$2,500,000');
    expect(formatCurrencyCompact(2500000)).toBe('2.50M');
  });

  test('formatPercentSafe never renders NaN/undefined', () => {
    expect(formatPercentSafe(7.2)).toBe('7.2%');
    expect(formatPercentSafe('8')).toBe('8%');
    expect(formatPercentSafe(undefined)).toBe('—');
    expect(formatPercentSafe(null)).toBe('—');
    expect(formatPercentSafe(Number.NaN)).toBe('—');
    expect(formatPercentSafe('garbage')).toBe('—');
  });

  test('toFiniteNumber coerces safely', () => {
    expect(toFiniteNumber(5)).toBe(5);
    expect(toFiniteNumber('12.5')).toBe(12.5);
    expect(toFiniteNumber(undefined)).toBe(0);
    expect(toFiniteNumber(Number.NaN, -1)).toBe(-1);
    expect(toFiniteNumber(Infinity)).toBe(0);
  });
});

describe('test-record quarantine (items 7 + 20): IVX Test must never render in production', () => {
  test('quarantines the exact live "IVX Test" record shape', () => {
    const ivxTestRow = {
      name: 'IVX Test',
      price_per_share: null,
      target_raise: null,
    };
    expect(isQuarantinedTestProperty(ivxTestRow)).toBe(true);
  });

  test('quarantines demo/placeholder/mock/sample names', () => {
    expect(isQuarantinedTestProperty({ name: 'Demo Tower', pricePerShare: 50, targetRaise: 100000 })).toBe(true);
    expect(isQuarantinedTestProperty({ name: 'PLACEHOLDER', pricePerShare: 50, targetRaise: 100000 })).toBe(true);
    expect(isQuarantinedTestProperty({ name: 'Sample Estate', pricePerShare: 50, targetRaise: 100000 })).toBe(true);
  });

  test('quarantines records with no valid financials (the $NaN source)', () => {
    expect(isQuarantinedTestProperty({ name: 'Riverside Lofts' })).toBe(true);
    expect(isQuarantinedTestProperty({ name: 'Riverside Lofts', pricePerShare: 0, targetRaise: 0 })).toBe(true);
  });

  test('keeps real production records', () => {
    expect(isQuarantinedTestProperty({ name: 'Casa Rosario', pricePerShare: 100, targetRaise: 500000 })).toBe(false);
    expect(isQuarantinedTestProperty({ name: 'Perez Residence', price_per_share: '75', target_raise: '250000' })).toBe(false);
    // "Testa" inside a word must NOT quarantine — pattern requires word-ish boundary
    expect(isQuarantinedTestProperty({ name: 'Testaccio Rome Flats', pricePerShare: 90, targetRaise: 300000 })).toBe(false);
  });
});

describe('reels mapping (items 11 + 20): published reels always render, bad rows are dropped', () => {
  const liveReelRow = {
    id: '205eb13f-5cc9-47a5-bce6-e8f353572730',
    project_id: 'casa-rosario-001',
    video_url: 'https://ivxholding.com/videos/original/b8788d0c/casa-rosario.mp4',
    thumbnail_url: 'https://ivxholding.com/videos/thumbs/b8788d0c/thumb.jpg',
    caption: 'Casa Rosario — Property Tour',
    sort_order: 0,
    published: true,
    visibility: 'public',
  };

  test('maps the exact live Casa Rosario reel row (same IDs/URLs as landing)', () => {
    const reel = mapReelRow(liveReelRow);
    expect(reel).not.toBeNull();
    expect(reel?.id).toBe('205eb13f-5cc9-47a5-bce6-e8f353572730');
    expect(reel?.projectId).toBe('casa-rosario-001');
    expect(reel?.videoUrl).toContain('https://ivxholding.com/videos/original');
    expect(reel?.thumbnailUrl).toContain('https://ivxholding.com/videos/thumbs');
  });

  test('rejects unpublished / private / broken rows', () => {
    expect(isPublicReelRow({ ...liveReelRow, published: false })).toBe(false);
    expect(isPublicReelRow({ ...liveReelRow, visibility: 'private' })).toBe(false);
    expect(isPublicReelRow({ ...liveReelRow, video_url: null })).toBe(false);
    expect(isPublicReelRow({ ...liveReelRow, video_url: 'not-a-url' })).toBe(false);
    expect(isPublicReelRow(null)).toBe(false);
  });

  test('one bad reel does not hide the section, duplicates are dropped', () => {
    const rows = [
      liveReelRow,
      { ...liveReelRow, id: 'broken', video_url: null },
      liveReelRow,
      { ...liveReelRow, id: 'second', sort_order: -1 },
    ];
    const reels = mapReelRows(rows);
    expect(reels.length).toBe(2);
    expect(reels[0].id).toBe('second');
    expect(reels[1].id).toBe('205eb13f-5cc9-47a5-bce6-e8f353572730');
  });

  test('non-array input yields empty list (response-shape guard, item 13)', () => {
    expect(mapReelRows(null)).toEqual([]);
    expect(mapReelRows({ data: [] })).toEqual([]);
    expect(mapReelRows(undefined)).toEqual([]);
  });
});
