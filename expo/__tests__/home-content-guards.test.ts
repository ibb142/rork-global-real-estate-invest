import { describe, expect, test } from 'bun:test';
import {
  toFiniteNumber,
  formatPercentSafe,
  isQuarantinedTestProperty,
  isPublicReelRow,
  mapReelRow,
  mapReelRows,
  buildProjectTitleMap,
  mapMediaRowsToPublications,
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

describe('publications next to the project: jv_deal_media grouped per project', () => {
  const liveDeals = [
    { id: 'perez-residence-001', title: 'Perez Residence', project_name: 'ONE STOP DEVELOPMENT LLC' },
    { id: 'casa-rosario-001', title: 'Casa Rosario', project_name: 'Casa Rosario' },
    { id: 'JV-202603-5190', title: 'IVX Jacksonville Prime', project_name: 'IVX JACKSONVILLE PRIME' },
  ];

  const mediaRow = (projectId: string, id: string, sortOrder: number, extra: Record<string, unknown> = {}) => ({
    id,
    project_id: projectId,
    media_type: 'image',
    public_url: `https://kvclcdjmjghndxsngfzb.supabase.co/storage/v1/object/public/deal-photos/${projectId}/${id}.jpg`,
    sort_order: sortOrder,
    is_cover: false,
    published: true,
    ...extra,
  });

  test('title map prefers deal title, falls back to project_name then id', () => {
    const map = buildProjectTitleMap(liveDeals);
    expect(map['perez-residence-001']).toBe('Perez Residence');
    expect(map['casa-rosario-001']).toBe('Casa Rosario');
    expect(map['JV-202603-5190']).toBe('IVX Jacksonville Prime');
    expect(buildProjectTitleMap([{ id: 'x-1', project_name: 'X Project' }])['x-1']).toBe('X Project');
    expect(buildProjectTitleMap(null)).toEqual({});
  });

  test('groups all 3 live projects with their own photos (8 each, exact live shape)', () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => mediaRow('perez-residence-001', `p${i}`, i)),
      ...Array.from({ length: 8 }, (_, i) => mediaRow('casa-rosario-001', `c${i}`, i)),
      ...Array.from({ length: 8 }, (_, i) => mediaRow('JV-202603-5190', `j${i}`, i)),
    ];
    const groups = mapMediaRowsToPublications(rows, buildProjectTitleMap(liveDeals));
    expect(groups.length).toBe(3);
    const ids = groups.map((g) => g.projectId).sort();
    expect(ids).toEqual(['JV-202603-5190', 'casa-rosario-001', 'perez-residence-001']);
    for (const g of groups) {
      expect(g.photoCount).toBe(8);
      expect(g.projectTitle).not.toBe(g.projectId);
      expect(g.coverUrl).toContain(g.projectId);
      for (const photo of g.photos) expect(photo.url).toContain(g.projectId);
    }
  });

  test('cover photo sorts first; unpublished/broken/non-image/duplicate rows dropped', () => {
    const rows = [
      mediaRow('perez-residence-001', 'a', 2),
      mediaRow('perez-residence-001', 'cover', 5, { is_cover: true }),
      mediaRow('perez-residence-001', 'hidden', 0, { published: false }),
      mediaRow('perez-residence-001', 'doc', 1, { media_type: 'document' }),
      mediaRow('perez-residence-001', 'broken', 1, { public_url: 'not-a-url' }),
      mediaRow('perez-residence-001', 'a', 2),
    ];
    const groups = mapMediaRowsToPublications(rows);
    expect(groups.length).toBe(1);
    expect(groups[0].photoCount).toBe(2);
    expect(groups[0].photos[0].id).toBe('cover');
    expect(groups[0].coverUrl).toContain('cover');
  });

  test('non-array input yields empty list', () => {
    expect(mapMediaRowsToPublications(null)).toEqual([]);
    expect(mapMediaRowsToPublications({ data: [] })).toEqual([]);
  });
});
