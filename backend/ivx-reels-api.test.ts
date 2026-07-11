import { describe, expect, test } from 'bun:test';
import {
  normalizeReelCategory,
  reelMatchesCategory,
  countReelsByCategory,
  summarizeDealRow,
  buildReelPayload,
  reelCta,
  REEL_CATEGORIES,
  type ReelRow,
  type DealRow,
} from './api/ivx-reels';
import { REELS_MODULE_SEEDS, REELS_MODULE_MIGRATION_SQL } from './services/ivx-reels-module-migration';
import { splitSqlStatements } from './services/ivx-canonical-media-migration';

function reel(overrides: Partial<ReelRow>): ReelRow {
  return {
    id: 'r-1',
    project_id: null,
    video_url: 'https://ivxholding.com/videos/original/x/video.mp4',
    thumbnail_url: null,
    caption: null,
    sort_order: 0,
    published: true,
    visibility: 'public',
    is_global: true,
    reel_type: 'opportunity',
    category_tags: [],
    approved: true,
    ...overrides,
  };
}

describe('reels categories', () => {
  test('normalizes every documented synonym', () => {
    expect(normalizeReelCategory('all')).toBe('all');
    expect(normalizeReelCategory('')).toBe('all');
    expect(normalizeReelCategory('Investments')).toBe('investment');
    expect(normalizeReelCategory('buyers')).toBe('buyer');
    expect(normalizeReelCategory('SELLERS')).toBe('seller');
    expect(normalizeReelCategory('jv-deals')).toBe('jv');
    expect(normalizeReelCategory('tokenized')).toBe('tokenized');
    expect(normalizeReelCategory('walkthroughs')).toBe('walkthrough');
    expect(normalizeReelCategory('opportunities')).toBe('opportunity');
    expect(normalizeReelCategory('bogus')).toBeNull();
  });

  test('project-linked reels are investment AND jv category members', () => {
    const casa = reel({ project_id: 'casa-rosario-001', reel_type: 'investment', is_global: false });
    expect(reelMatchesCategory(casa, 'investment')).toBe(true);
    expect(reelMatchesCategory(casa, 'jv')).toBe(true);
    expect(reelMatchesCategory(casa, 'seller')).toBe(false);
    expect(reelMatchesCategory(casa, 'all')).toBe(true);
  });

  test('category tags add membership without title guessing', () => {
    const buyerTour = reel({ reel_type: 'walkthrough', category_tags: ['buyer'] });
    expect(reelMatchesCategory(buyerTour, 'walkthrough')).toBe(true);
    expect(reelMatchesCategory(buyerTour, 'buyer')).toBe(true);
    expect(reelMatchesCategory(buyerTour, 'construction')).toBe(false);
  });

  test('typed business links grant category membership', () => {
    expect(reelMatchesCategory(reel({ tokenized_asset_id: 'tok-1' }), 'tokenized')).toBe(true);
    expect(reelMatchesCategory(reel({ buyer_id: 'b-1', reel_type: 'walkthrough' }), 'buyer')).toBe(true);
    expect(reelMatchesCategory(reel({ seller_id: 's-1', reel_type: 'walkthrough' }), 'seller')).toBe(true);
  });

  test('countReelsByCategory returns a count for every category plus all', () => {
    const counts = countReelsByCategory([
      reel({ id: 'a', project_id: 'casa-rosario-001', reel_type: 'investment' }),
      reel({ id: 'b', reel_type: 'walkthrough', category_tags: ['buyer'] }),
      reel({ id: 'c', reel_type: 'seller' }),
      reel({ id: 'd', reel_type: 'construction' }),
      reel({ id: 'e', reel_type: 'opportunity' }),
    ]);
    expect(counts.all).toBe(5);
    expect(counts.investment).toBe(1);
    expect(counts.jv).toBe(1);
    expect(counts.buyer).toBe(1);
    expect(counts.seller).toBe(1);
    expect(counts.construction).toBe(1);
    expect(counts.walkthrough).toBe(1);
    expect(counts.opportunity).toBe(1);
    expect(counts.tokenized).toBe(0);
    for (const category of REEL_CATEGORIES) {
      expect(typeof counts[category]).toBe('number');
    }
  });
});

describe('deal summary (investment card data)', () => {
  const casa: DealRow = {
    id: 'casa-rosario-001',
    title: 'Casa Rosario',
    project_name: 'Casa Rosario',
    city: 'Pembroke Pines',
    state: 'FL',
    total_investment: 1400000,
    expected_roi: 30,
    min_investment: 50,
    partner_name: 'ONE STOP DEVELOPMENT TWO LLC',
    status: 'active',
  };

  test('mirrors landing math: sale price fallback + min investment default', () => {
    const summary = summarizeDealRow(casa);
    expect(summary.salePrice).toBe(1400000);
    expect(summary.minInvestment).toBe(50);
    expect(summary.location).toBe('Pembroke Pines, FL');
    expect(summary.developer).toBe('ONE STOP DEVELOPMENT TWO LLC');
    expect(summary.minOwnershipPercent).toBe('0.0036%');
  });

  test('never emits NaN for missing financials', () => {
    const summary = summarizeDealRow({ id: 'x', title: 'X' });
    expect(Number.isNaN(summary.investmentAmount)).toBe(false);
    expect(Number.isNaN(summary.salePrice)).toBe(false);
    expect(summary.minInvestment).toBe(50);
  });
});

describe('reel payload + CTA', () => {
  test('project reel carries deal card, immutable ids, and invest CTA', () => {
    const payload = buildReelPayload(
      reel({ id: 'reel-1', project_id: 'casa-rosario-001', reel_type: 'investment' }),
      { id: 'casa-rosario-001', title: 'Casa Rosario', total_investment: 1400000, expected_roi: 30 },
      { likes: 3, comments: 1, saves: 2 },
      { liked: true, saved: false },
    );
    expect(payload.reel_id).toBe('reel-1');
    expect(payload.project_id).toBe('casa-rosario-001');
    expect(payload.deal_id).toBe('casa-rosario-001');
    expect((payload.project as { id: string }).id).toBe('casa-rosario-001');
    expect(payload.likes).toBe(3);
    expect((payload.viewer as { liked: boolean }).liked).toBe(true);
    expect((payload.cta as { primary: string }).primary).toBe('invest_now');
  });

  test('global category reels get category-correct CTAs', () => {
    expect(reelCta(reel({ reel_type: 'seller' })).primary).toBe('submit_listing');
    expect(reelCta(reel({ reel_type: 'buyer' })).primary).toBe('contact_match');
    expect(reelCta(reel({ reel_type: 'construction' })).primary).toBe('view_projects');
    expect(reelCta(reel({ reel_type: 'walkthrough' })).primary).toBe('view_projects');
    expect(reelCta(reel({ reel_type: 'opportunity' })).primary).toBe('view_deals');
  });
});

describe('reels module migration', () => {
  test('seeds only distinct verified production URLs (no duplicates)', () => {
    const urls = REELS_MODULE_SEEDS.map((seed) => seed.videoUrl);
    expect(new Set(urls).size).toBe(urls.length);
    for (const seed of REELS_MODULE_SEEDS) {
      expect(seed.videoUrl.startsWith('https://ivxholding.com/videos/original/')).toBe(true);
      expect(seed.thumbnailUrl.startsWith('https://ivxholding.com/videos/thumbs/')).toBe(true);
      expect((REEL_CATEGORIES as readonly string[]).includes(seed.reelType)).toBe(true);
    }
  });

  test('migration SQL is guarded and splittable', () => {
    const statements = splitSqlStatements(REELS_MODULE_MIGRATION_SQL);
    expect(statements.length).toBeGreaterThan(10);
    expect(REELS_MODULE_MIGRATION_SQL).toContain('ADD COLUMN IF NOT EXISTS reel_type');
    expect(REELS_MODULE_MIGRATION_SQL).toContain('CREATE TABLE IF NOT EXISTS public.reel_likes');
    expect(REELS_MODULE_MIGRATION_SQL).toContain('CREATE TABLE IF NOT EXISTS public.reel_comments');
    expect(REELS_MODULE_MIGRATION_SQL).toContain('ivx_reels_integrity');
    // every seed insert is idempotent
    const inserts = statements.filter((s) => s.includes('INSERT INTO public.jv_deal_reels'));
    expect(inserts.length).toBe(REELS_MODULE_SEEDS.length);
    for (const insert of inserts) {
      expect(insert).toContain('WHERE NOT EXISTS');
    }
  });
});
