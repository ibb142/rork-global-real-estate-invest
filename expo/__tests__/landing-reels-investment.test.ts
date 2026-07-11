import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the restored investment-reels experience on the public landing page:
 * - yellow Reels entry points (nav link + floating action button)
 * - reels section where every reel carries its linked investment card
 * - project-filtered reels via /reels?project=<id> (survives refresh)
 * - yellow reels icon decoration on project cards
 * - no video-only rendering: a failed video keeps the investment card visible
 */
const html = readFileSync(join(import.meta.dir, '..', 'ivxholding-landing', 'index.html'), 'utf-8');

describe('landing reels: yellow entry icons', () => {
  test('floating yellow Reels button exists with accessible label', () => {
    expect(html).toContain('id="reels-fab"');
    expect(html).toContain('aria-label="Open Property Reels"');
    expect(html).toContain('#reels-fab { position: fixed;');
    expect(html).toContain('background: #FFD700');
  });

  test('nav has a yellow Reels link routed to /reels', () => {
    expect(html).toContain('href="/reels"');
    expect(html).toMatch(/href="\/reels"[^>]*aria-label="Open Property Reels"/);
  });

  test('reels section header uses the yellow section icon and See All link', () => {
    expect(html).toContain('ivx-reels-section-icon');
    expect(html).toContain('id="reels-see-all"');
  });
});

describe('landing reels: investment card connected to each reel', () => {
  test('reel card template includes the full investment card fields', () => {
    expect(html).toContain('ivx-reel-invest-card');
    expect(html).toContain('data-reel-project=');
    for (const marker of ['Investment', 'ROI', 'Sale Price', 'Fractional from', 'min ownership', 'Developed by']) {
      expect(html).toContain(marker);
    }
  });

  test('investment actions target the exact project by immutable id', () => {
    expect(html).toContain('window.ivxReelAction = function (projectId, action)');
    expect(html).toContain("ivxReelAction(");
    expect(html).toContain('.live-deal-card[data-deal-id=');
    expect(html).toContain('ivx-reel-details-btn');
    expect(html).toContain('ivx-reel-invest-btn');
  });

  test('missing project data shows retry state instead of a video-only card', () => {
    expect(html).toContain('Project details temporarily unavailable');
    expect(html).toContain('ivxReloadReels()');
  });

  test('a failed video never hides the investment card', () => {
    expect(html).toContain('ivxReelVideoError(this)');
    expect(html).toContain('Video temporarily unavailable');
    // The old behavior removed the entire card on video error — must be gone.
    expect(html).not.toContain("this.closest('div').style.display='none'");
  });
});

describe('landing reels: project filter + card decoration', () => {
  test('project filter reads ?project= from the URL (survives refresh/direct open)', () => {
    expect(html).toContain("URLSearchParams(window.location.search).get('project')");
    expect(html).toContain('id="reels-filter-chip"');
  });

  test('window.ivxOpenReels routes to /reels and scrolls to the section', () => {
    expect(html).toContain('window.ivxOpenReels = function');
    expect(html).toContain("'/reels' + (projectId ? '?project='");
  });

  test('project cards get the yellow reels icon with real reel counts', () => {
    expect(html).toContain('ivx-card-reels-btn');
    expect(html).toContain("setAttribute('data-reels-count'");
    expect(html).toContain('state.counts[pid]');
  });

  test('reels query joins jv_deal_reels to jv_deals financial fields', () => {
    expect(html).toContain('jv_deal_reels?select=*&published=eq.true');
    expect(html).toContain('total_investment,expected_roi,estimated_value,propertyValue,min_investment,partner_name');
  });
});

describe('landing reels: full module (categories + canonical API + social)', () => {
  test('canonical /api/reels source is fetched first with Supabase only as fallback', () => {
    expect(html).toContain("reelsApiFetch('/api/reels?viewer='");
    expect(html).toContain('falling back to direct Supabase');
    expect(html).toContain("'https://api.ivxholding.com'");
  });

  test('category chips render every required category', () => {
    expect(html).toContain('id="reels-category-chips"');
    expect(html).toContain('data-reel-category=');
    for (const label of ['Investments', 'Buyers', 'Sellers', 'JV Deals', 'Tokenized', 'Construction', 'Walkthroughs', 'Opportunities']) {
      expect(html).toContain(`label: '${label}'`);
    }
  });

  test('category filter reads ?category= from the URL and filters without reload', () => {
    expect(html).toContain("get('category')");
    expect(html).toContain('function matchesCategory(r, cat)');
    expect(html).toContain('matchesCategory(r, category)');
  });

  test('every reel card carries real social actions (like/comment/share/save)', () => {
    expect(html).toContain('data-social="like"');
    expect(html).toContain('data-social="comments"');
    expect(html).toContain('data-social="share"');
    expect(html).toContain('data-social="save"');
    expect(html).toContain("'/api/reels/' + encodeURIComponent(id) + '/' + kind");
    expect(html).toContain("'/api/reels/' + encodeURIComponent(id) + '/comments'");
  });

  test('global category reels get category-correct CTA cards, never video-only', () => {
    expect(html).toContain('function globalCtaHtml(r)');
    expect(html).toContain('Submit Your Property');
    expect(html).toContain('Contact IVX');
    expect(html).toContain('View Projects');
    // old behavior rendered a dead-end placeholder for global reels
    expect(html).not.toContain('<span>IVX promotional reel</span>');
  });

  test('no artificial one-reel limit: feed renders the whole filtered list', () => {
    expect(html).toContain('for (var i = 0; i < reels.length; i++)');
    expect(html).not.toContain('reels.slice(0, 1)');
    expect(html).toContain('&limit=200');
  });

  test('device key persists locally so like/save counts are never double-counted', () => {
    expect(html).toContain("localStorage.getItem('ivx.reels.deviceKey')");
    expect(html).toContain('deviceKey: reelsDeviceKey()');
  });
});
