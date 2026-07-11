#!/usr/bin/env node
/**
 * IVX Project Integrity Audit — read-only, runs against production Supabase.
 *
 * Fails (exit 1) when any of these production-blocking conditions exist:
 *   1. Two projects share the same non-shared media URL (cross-project mixing)
 *   2. Duplicate project slugs/ids
 *   3. A published project has zero valid photos
 *   4. A project's photos contain another project's storage-folder media
 *   5. Published reels exist but would be invisible to the landing page
 *
 * Reports (non-fatal): orphan media, orphan videos, duplicate display_order,
 * data-URI photos, media/reel counts grouped by project.
 */

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://kvclcdjmjghndxsngfzb.supabase.co').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTQwMjcsImV4cCI6MjA4ODc3MDAyN30.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk';

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) return { ok: false, status: res.status, rows: [] };
  return { ok: true, status: res.status, rows: await res.json() };
}

function photoFingerprint(url) {
  try { const u = new URL(url); return (u.origin + u.pathname).toLowerCase(); } catch { return String(url).split('?')[0].toLowerCase(); }
}

const failures = [];
const warnings = [];

const deals = await sb('jv_deals?select=id,title,project_name,published,status,display_order,photos,min_investment,total_investment,estimated_value,propertyValue,expected_roi,updated_at');
if (!deals.ok) {
  console.error(`FATAL: jv_deals unreadable (HTTP ${deals.status})`);
  process.exit(1);
}

console.log('=== IVX PROJECT INTEGRITY AUDIT ===');
console.log('supabase:', SUPABASE_URL);
console.log('project_count:', deals.rows.length);

// 2. duplicate slugs/ids
const idCounts = new Map();
for (const d of deals.rows) idCounts.set(d.id, (idCounts.get(d.id) ?? 0) + 1);
const dupSlugs = [...idCounts.entries()].filter(([, n]) => n > 1);
if (dupSlugs.length > 0) failures.push(`duplicate project slugs: ${JSON.stringify(dupSlugs)}`);
console.log('duplicate_slug_count:', dupSlugs.length);

// duplicate display_order (warning)
const orderCounts = new Map();
for (const d of deals.rows) {
  if (d.display_order == null) continue;
  orderCounts.set(d.display_order, [...(orderCounts.get(d.display_order) ?? []), d.id]);
}
const dupOrders = [...orderCounts.entries()].filter(([, ids]) => ids.length > 1);
if (dupOrders.length > 0) warnings.push(`duplicate display_order values: ${JSON.stringify(dupOrders)}`);

// 1 + 3 + 4: photo ownership and coverage
const KNOWN_STORAGE_FOLDER = /\/deal-photos\/([^/]+)\//;
const fingerprintOwners = new Map();
for (const d of deals.rows) {
  const photos = Array.isArray(d.photos) ? d.photos : [];
  const valid = photos.filter((p) => typeof p === 'string' && p.startsWith('https://'));
  const dataUris = photos.filter((p) => typeof p === 'string' && p.startsWith('data:'));
  const isPublished = d.published === true || ['active', 'published', 'live'].includes(String(d.status ?? '').toLowerCase());
  console.log(`--- ${d.id} | "${d.project_name ?? d.title}" | published=${isPublished} | display_order=${d.display_order} | photos=${photos.length} (valid=${valid.length}, dataUri=${dataUris.length})`);

  if (isPublished && valid.length === 0) failures.push(`published project ${d.id} has zero valid https photos`);
  if (dataUris.length > 0) warnings.push(`${d.id} has ${dataUris.length} embedded data-URI photo(s) — should live in storage`);

  for (const p of valid) {
    const fp = photoFingerprint(p);
    const folderMatch = p.match(KNOWN_STORAGE_FOLDER);
    if (folderMatch && folderMatch[1] !== d.id) {
      failures.push(`CROSS-PROJECT MEDIA: ${d.id} references storage folder of ${folderMatch[1]}: ${p.slice(0, 110)}`);
    }
    const owner = fingerprintOwners.get(fp);
    if (owner && owner !== d.id) failures.push(`SHARED NON-SHARED MEDIA: ${fp} used by both ${owner} and ${d.id}`);
    fingerprintOwners.set(fp, d.id);
  }
}

// legacy media/videos orphan check
const media = await sb('project_media?select=id,project_id,media_url,is_approved');
const videos = await sb('project_videos?select=id,project_id,video_url,is_approved');
const dealIds = new Set(deals.rows.map((d) => String(d.id)));
if (media.ok) {
  const orphans = media.rows.filter((m) => !dealIds.has(String(m.project_id)));
  console.log('legacy_media_count:', media.rows.length, '| orphan_media_count:', orphans.length);
  if (orphans.length > 0) warnings.push(`${orphans.length}/${media.rows.length} project_media rows are orphans (UUID project_id cannot reference TEXT jv_deals.id)`);
} else {
  console.log('project_media unreadable (HTTP', media.status + ')');
}
if (videos.ok) {
  const approved = videos.rows.filter((v) => v.is_approved === true);
  const orphanVideos = videos.rows.filter((v) => !dealIds.has(String(v.project_id)));
  console.log('legacy_video_count:', videos.rows.length, '| approved:', approved.length, '| orphan_video_count:', orphanVideos.length);
} else {
  console.log('project_videos unreadable (HTTP', videos.status + ')');
}

// canonical reels (post-migration)
const reels = await sb('jv_deal_reels?select=id,project_id,video_url,published,visibility');
if (reels.ok) {
  const published = reels.rows.filter((r) => r.published === true);
  console.log('canonical_reel_count:', reels.rows.length, '| published_reel_count:', published.length);
  for (const r of published) {
    if (!/^https:\/\/.+\.(mp4|mov|m4v|webm)(\?.*)?$/i.test(String(r.video_url))) {
      failures.push(`published reel ${r.id} has invalid video_url: ${String(r.video_url).slice(0, 100)}`);
    }
  }
} else {
  console.log('jv_deal_reels not present yet (HTTP', reels.status + ') — run ivx-canonical-media-reels.sql');
  warnings.push('canonical jv_deal_reels table missing — published reels = 0 by definition');
}

// 7. minimum ownership parity — one formula, one basis
for (const d of deals.rows) {
  const minInvestment = Number(d.min_investment) > 0 ? Number(d.min_investment) : 50;
  const salePrice = Number(d.propertyValue) > 0 ? Number(d.propertyValue)
    : Number(d.estimated_value) > 0 ? Number(d.estimated_value)
    : Number(d.total_investment) > 0 ? Number(d.total_investment) : 0;
  const pct = salePrice > 0 ? ((minInvestment / salePrice) * 100).toFixed(4) : 'n/a';
  console.log(`ownership ${d.id}: min=$${minInvestment} / salePrice=$${salePrice} → ${pct}% minimum ownership`);
}

console.log('\n=== RESULT ===');
for (const w of warnings) console.log('WARN:', w);
for (const f of failures) console.log('FAIL:', f);
console.log(failures.length === 0 ? 'INTEGRITY: PASS' : `INTEGRITY: FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);
