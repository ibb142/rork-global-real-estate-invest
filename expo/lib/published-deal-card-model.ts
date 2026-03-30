import type { ParsedJVDeal, DealTrustInfo } from '@/lib/parse-deal';

export interface PublishedDealCardModel {
  id: string;
  title: string;
  developerName: string;
  addressShort: string;
  addressFull: string;
  descriptionShort: string;
  totalInvestment: number;
  expectedROI: number;
  timeline: string;
  partnersCount: number;
  badges: string[];
  minInvestment: number;
  photos: string[];
  dealType: string;
  status: string;
  exitStrategy: string;
  distributionFrequency: string;
  publishedAt: string;
  displayOrder: number;
  city: string;
  state: string;
  country: string;
  trustVerified: boolean;
  trustIndicators: string[];
}

export const CANONICAL_MIN_INVESTMENT = 50;
export const CANONICAL_DISTRIBUTION_LABEL = 'Monthly';
export const CANONICAL_PLATFORM_TAGLINE = 'Access curated real estate opportunities backed by real assets. Start investing from $50 with fractional ownership and build long-term wealth.';

export const CANONICAL_CLAIMS = {
  minInvestment: 50,
  minInvestmentLabel: '$50',
  distributionFrequency: 'Monthly',
  distributionDisclaimer: 'Distribution frequency varies by deal. See deal details for specifics.',
  platformName: 'IVX Holdings LLC',
  riskDisclaimer: 'All investments involve risk. Past performance is not indicative of future results.',
  complianceNote: 'Investments offered through IVX Holdings LLC. Not FDIC insured.',
  noFdicInsurance: true,
  noSecRegistration: true,
  noLiveTradingYet: true,
  disclaimers: [
    'Not FDIC insured. Not bank guaranteed. May lose value.',
    'Securities offered through IVX Holdings LLC. Past performance is not indicative of future results.',
    'Distribution frequency varies by deal type and is subject to change.',
    'Minimum investment amounts may vary by deal.',
  ] as readonly string[],
  removedClaims: [
    'FDIC protected',
    'SEC compliant',
    '24/7 trading',
    '$2.1B Assets Under Management',
    '52K+ Investors',
    '$1 minimum investment',
  ] as readonly string[],
} as const;

export function validatePublicClaim(claim: string): { valid: boolean; reason?: string } {
  const removed = CANONICAL_CLAIMS.removedClaims.map(c => c.toLowerCase());
  const lower = claim.toLowerCase();

  if (removed.some(r => lower.includes(r.toLowerCase()))) {
    return { valid: false, reason: `Claim "${claim}" has been removed from approved messaging` };
  }

  if (lower.includes('fdic') && !lower.includes('not fdic')) {
    return { valid: false, reason: 'FDIC claims are not permitted — platform is not FDIC insured' };
  }

  if (lower.includes('sec compliant') || lower.includes('sec registered')) {
    return { valid: false, reason: 'SEC compliance/registration claims require legal verification' };
  }

  if (lower.includes('24/7 trading') || lower.includes('live trading')) {
    return { valid: false, reason: 'Live/24/7 trading is not yet available' };
  }

  if (lower.includes('$1 minimum') || lower.includes('$1 min')) {
    return { valid: false, reason: `Canonical minimum investment is ${CANONICAL_CLAIMS.minInvestmentLabel}` };
  }

  return { valid: true };
}

function extractShortAddress(deal: {
  city?: string;
  state?: string;
  propertyAddress?: string;
  property_address?: string;
}): string {
  const city = (deal.city || '').trim();
  const state = (deal.state || '').trim();
  if (city && state) return `${city}, ${state}`;
  const address = (deal.propertyAddress || deal.property_address || '').trim();
  if (address) {
    const parts = address.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
    }
    return address;
  }
  return '';
}

function extractDeveloperName(deal: {
  projectName?: string;
  project_name?: string;
  trustInfo?: DealTrustInfo | Record<string, unknown>;
  trust_info?: string | Record<string, unknown>;
}): string {
  let trustInfo: DealTrustInfo | Record<string, unknown> | undefined = deal.trustInfo as DealTrustInfo | undefined;
  if (!trustInfo && deal.trust_info) {
    if (typeof deal.trust_info === 'string') {
      try { trustInfo = JSON.parse(deal.trust_info); } catch { trustInfo = undefined; }
    } else {
      trustInfo = deal.trust_info as Record<string, unknown>;
    }
  }

  if (trustInfo && typeof trustInfo === 'object') {
    const llc = (trustInfo as DealTrustInfo).llcName;
    if (llc) return llc;
    const builder = (trustInfo as DealTrustInfo).builderName;
    if (builder) return builder;
  }

  const projectName = (deal.projectName || deal.project_name || '').trim();
  if (projectName) {
    if (projectName.toUpperCase().includes('LLC')) return projectName;
    return `${projectName} LLC`;
  }
  return 'IVX Holdings LLC';
}

function extractTimeline(deal: {
  trustInfo?: DealTrustInfo | Record<string, unknown>;
  trust_info?: string | Record<string, unknown>;
}): string {
  let trustInfo: DealTrustInfo | undefined;
  if (deal.trustInfo && typeof deal.trustInfo === 'object') {
    trustInfo = deal.trustInfo as DealTrustInfo;
  } else if (deal.trust_info) {
    if (typeof deal.trust_info === 'string') {
      try { trustInfo = JSON.parse(deal.trust_info) as DealTrustInfo; } catch { trustInfo = undefined; }
    } else {
      trustInfo = deal.trust_info as unknown as DealTrustInfo;
    }
  }

  if (trustInfo) {
    if (trustInfo.timelineMin && trustInfo.timelineMax) {
      const unit = trustInfo.timelineUnit === 'years' ? 'yr' : 'mo';
      return `${trustInfo.timelineMin}\u2013${trustInfo.timelineMax} ${unit}`;
    }
    if (trustInfo.timelineMax) {
      const unit = trustInfo.timelineUnit === 'years' ? 'yr' : 'mo';
      return `${trustInfo.timelineMax} ${unit}`;
    }
  }
  return '14\u201324 mo';
}

function extractBadges(deal: Record<string, unknown>): string[] {
  const badges: string[] = [];
  const type = (typeof deal.type === 'string' ? deal.type : '').toLowerCase();
  if (type) {
    const formatted = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    badges.push(formatted);
  }

  let trustInfo: DealTrustInfo | undefined;
  if (deal.trustInfo && typeof deal.trustInfo === 'object') {
    trustInfo = deal.trustInfo as DealTrustInfo;
  }

  if (trustInfo?.titleVerified) badges.push('Title Verified');
  if (trustInfo?.insuranceCoverage) badges.push('Insured');
  if (trustInfo?.escrowProtected) badges.push('Escrow Protected');
  if (trustInfo?.permitStatus === 'approved') badges.push('Permitted');
  if (trustInfo?.thirdPartyAudit) badges.push('Audited');

  return badges;
}

function extractTrustIndicators(deal: Record<string, unknown>): string[] {
  const indicators: string[] = [];
  let trustInfo: DealTrustInfo | undefined;
  if (deal.trustInfo && typeof deal.trustInfo === 'object') {
    trustInfo = deal.trustInfo as DealTrustInfo;
  }
  if (trustInfo?.titleVerified) indicators.push('title_verified');
  if (trustInfo?.insuranceCoverage) indicators.push('insured');
  if (trustInfo?.escrowProtected) indicators.push('escrow');
  if (trustInfo?.permitStatus === 'approved') indicators.push('permitted');
  if (trustInfo?.thirdPartyAudit) indicators.push('audited');
  return indicators;
}

function getPartnersCount(partners: unknown): number {
  if (typeof partners === 'number') return partners;
  if (Array.isArray(partners)) return partners.length;
  if (typeof partners === 'string') {
    try {
      const p = JSON.parse(partners);
      return Array.isArray(p) ? p.length : 0;
    } catch { return 0; }
  }
  return 0;
}

function str(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return fallback;
}

export function mapDealToCardModel(deal: Record<string, unknown>): PublishedDealCardModel {
  const photos = extractPhotos(deal);
  const description = str(deal.description).trim();
  const descShort = description.length > 200 ? description.substring(0, 197) + '...' : description;

  return {
    id: str(deal.id),
    title: str(deal.title) || str(deal.projectName) || str(deal.project_name),
    developerName: extractDeveloperName(deal as any),
    addressShort: extractShortAddress(deal as any),
    addressFull: str(deal.propertyAddress) || str(deal.property_address),
    descriptionShort: descShort,
    totalInvestment: Number(deal.totalInvestment || deal.total_investment || 0),
    expectedROI: Number(deal.expectedROI || deal.expected_roi || 0),
    timeline: extractTimeline(deal as any),
    partnersCount: getPartnersCount(deal.partners),
    badges: extractBadges(deal),
    minInvestment: CANONICAL_MIN_INVESTMENT,
    photos,
    dealType: str(deal.type, 'development'),
    status: str(deal.status, 'active'),
    exitStrategy: str(deal.exitStrategy) || str(deal.exit_strategy) || 'Sale upon completion',
    distributionFrequency: CANONICAL_DISTRIBUTION_LABEL,
    publishedAt: str(deal.publishedAt) || str(deal.published_at),
    displayOrder: Number(deal.displayOrder ?? deal.display_order ?? 999),
    city: str(deal.city),
    state: str(deal.state),
    country: str(deal.country),
    trustVerified: extractTrustIndicators(deal).length >= 3,
    trustIndicators: extractTrustIndicators(deal),
  };
}

function extractPhotos(deal: Record<string, unknown>): string[] {
  let raw: unknown = deal.photos;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = []; }
  }
  if (!Array.isArray(raw)) return [];

  const PLACEHOLDER_DOMAINS = [
    'picsum.photos', 'via.placeholder.com', 'placehold.co',
    'placekitten.com', 'loremflickr.com', 'dummyimage.com',
    'fakeimg.pl', 'lorempixel.com', 'placeholder.com',
  ];

  return (raw as string[]).filter((p: string) => {
    if (typeof p !== 'string' || p.length <= 5) return false;
    if (!p.startsWith('http') && !p.startsWith('data:image/')) return false;
    const lower = p.toLowerCase();
    return !PLACEHOLDER_DOMAINS.some(domain => lower.includes(domain));
  });
}

export function mapParsedDealToCardModel(deal: ParsedJVDeal): PublishedDealCardModel {
  return mapDealToCardModel(deal as unknown as Record<string, unknown>);
}

export function generateLandingDealHtml(card: PublishedDealCardModel): string {
  const photoHtml = card.photos.length > 0
    ? card.photos.map(p => `<img src="${escapeHtml(p)}" alt="${escapeHtml(card.title)}" loading="lazy" />`).join('')
    : `<div class="live-deal-no-photo"><span>🏗️</span><span>Photos coming soon</span></div>`;

  const hasGallery = card.photos.length > 1;
  const galleryDotsHtml = hasGallery
    ? `<div class="live-deal-photo-dots">${card.photos.map((_, i) => `<div class="live-deal-photo-dot${i === 0 ? ' active' : ''}" data-idx="${i}"></div>`).join('')}</div>`
    : '';

  const photoCounter = card.photos.length > 1
    ? `<div class="live-deal-photo-count">1/${card.photos.length}</div>`
    : '';

  const verifiedCount = card.trustIndicators.length;
  const verifiedBadge = verifiedCount >= 3
    ? `<div class="live-deal-verified-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00C48C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> VERIFIED</div>`
    : '';

  const trustBadgesHtml = card.trustIndicators.map(ind => {
    const config: Record<string, { label: string; icon: string }> = {
      title_verified: { label: 'Title Verified', icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00C48C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
      insured: { label: 'Insured', icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4A90D9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
      escrow: { label: 'Escrow', icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
      permitted: { label: 'Permitted', icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00C48C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
      audited: { label: 'Audited', icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00C48C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
    };
    const c = config[ind];
    if (!c) return '';
    return `<span class="live-deal-trust-badge">${c.icon} ${c.label}</span>`;
  }).join('');

  return `
    <div class="live-deal-card" data-deal-id="${escapeHtml(card.id)}">
      <div class="live-deal-gallery">
        ${hasGallery ? `<div class="live-deal-gallery-slider cr-slider">${photoHtml}</div>` : photoHtml}
        ${galleryDotsHtml}
        <div class="live-deal-overlay-badge"><div class="live-deal-overlay-dot"></div> LIVE</div>
        ${verifiedBadge}
        ${photoCounter}
      </div>
      <div class="live-deal-content">
        <div class="live-deal-title">${escapeHtml(card.title || card.developerName)}</div>
        ${card.addressShort ? `<div class="live-deal-location"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6A6A6A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${escapeHtml(card.addressShort)}</div>` : ''}
        <div class="live-deal-divider"></div>
        <div class="live-deal-metrics">
          <div class="live-deal-metric">
            <div class="live-deal-metric-val">${formatCompact(card.totalInvestment)}</div>
            <div class="live-deal-metric-lbl">Investment</div>
          </div>
          <div class="live-deal-metric-div"></div>
          <div class="live-deal-metric">
            <div class="live-deal-metric-val">${card.expectedROI}%</div>
            <div class="live-deal-metric-lbl">ROI</div>
          </div>
          <div class="live-deal-metric-div"></div>
          <div class="live-deal-metric">
            <div class="live-deal-metric-val">${escapeHtml(card.timeline)}</div>
            <div class="live-deal-metric-lbl">Timeline</div>
          </div>
        </div>
        <div class="live-deal-divider"></div>
        <div class="live-deal-developer-row">
          <div class="live-deal-developer-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v3h4v-3h3v3h4c.6 0 1-.4 1-1v-3"/><path d="M2 18V8c0-.6.4-1 1-1h18c.6 0 1 .4 1 1v10"/><path d="M9 7V4c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v3"/></svg></div>
          <span class="live-deal-developer-text">Developed by <span class="live-deal-developer-name">${escapeHtml(card.developerName)}</span></span>
        </div>
        <div class="live-deal-trust-indicators">
          ${trustBadgesHtml}
        </div>
        <div class="live-deal-actions">
          <button class="live-deal-details-btn" onclick="openInvestModal('${escapeHtml(card.id)}','${escapeJs(card.title)}',${card.totalInvestment},${card.expectedROI},'${escapeJs(card.addressShort)}')">Details</button>
          <button class="live-deal-invest-btn" onclick="openInvestModal('${escapeHtml(card.id)}','${escapeJs(card.title)}',${card.totalInvestment},${card.expectedROI},'${escapeJs(card.addressShort)}')">Invest Now</button>
        </div>
        <div class="live-deal-min-invest">Invest from <strong>${card.minInvestment}</strong></div>
      </div>
    </div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJs(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

export function generateLandingInvestModalJs(supabaseUrl: string, supabaseAnonKey: string): string {
  return `
<script>
var _activeDeal = null;
var _supabaseUrl = '${supabaseUrl}';
var _supabaseAnonKey = '${supabaseAnonKey}';

function openInvestModal(dealId, dealTitle, totalInvestment, expectedRoi, address) {
  console.log('[Landing] openInvestModal called:', dealId, dealTitle, totalInvestment, expectedRoi, address);
  _activeDeal = {
    deal_id: dealId,
    deal_name: dealTitle,
    total_investment: totalInvestment,
    expected_roi: expectedRoi,
    address: address
  };
  var modal = document.getElementById('ivx-invest-modal');
  if (!modal) { console.error('[Landing] invest modal element not found'); return; }
  var titleEl = modal.querySelector('.invest-modal-deal-name');
  if (titleEl) titleEl.textContent = dealTitle || 'Unknown Deal';
  var addrEl = modal.querySelector('.invest-modal-address');
  if (addrEl) addrEl.textContent = address || '';
  var investEl = modal.querySelector('.invest-modal-total');
  if (investEl) investEl.textContent = '
  return {
    id: card.id,
    title: card.title,
    developer_name: card.developerName,
    address_short: card.addressShort,
    address_full: card.addressFull,
    description_short: card.descriptionShort,
    total_investment: card.totalInvestment,
    expected_roi: card.expectedROI,
    timeline: card.timeline,
    partners_count: card.partnersCount,
    badges: card.badges,
    min_investment: card.minInvestment,
    photos: card.photos,
    deal_type: card.dealType,
    status: card.status,
    exit_strategy: card.exitStrategy,
    distribution_frequency: card.distributionFrequency,
    published_at: card.publishedAt,
    display_order: card.displayOrder,
    city: card.city,
    state: card.state,
    country: card.country,
    trust_verified: card.trustVerified,
    trust_indicators: card.trustIndicators,
  };
}
 + Number(totalInvestment || 0).toLocaleString();
  var roiEl = modal.querySelector('.invest-modal-roi');
  if (roiEl) roiEl.textContent = (expectedRoi || 0) + '% ROI';
  updateOwnershipCalc();
  modal.style.display = 'flex';
}

function closeInvestModal() {
  var modal = document.getElementById('ivx-invest-modal');
  if (modal) modal.style.display = 'none';
  _activeDeal = null;
}

function updateOwnershipCalc() {
  var amountInput = document.getElementById('invest-amount-input');
  if (!amountInput || !_activeDeal) return;
  var amount = parseFloat(amountInput.value.replace(/[^0-9.]/g, '')) || 0;
  var total = _activeDeal.total_investment || 1;
  var ownership = (amount / total) * 100;
  var roi = _activeDeal.expected_roi || 0;
  var profit = amount * (roi / 100);
  var ownerEl = document.getElementById('invest-ownership');
  if (ownerEl) ownerEl.textContent = ownership.toFixed(2) + '%';
  var profitEl = document.getElementById('invest-profit');
  if (profitEl) profitEl.textContent = '
  return {
    id: card.id,
    title: card.title,
    developer_name: card.developerName,
    address_short: card.addressShort,
    address_full: card.addressFull,
    description_short: card.descriptionShort,
    total_investment: card.totalInvestment,
    expected_roi: card.expectedROI,
    timeline: card.timeline,
    partners_count: card.partnersCount,
    badges: card.badges,
    min_investment: card.minInvestment,
    photos: card.photos,
    deal_type: card.dealType,
    status: card.status,
    exit_strategy: card.exitStrategy,
    distribution_frequency: card.distributionFrequency,
    published_at: card.publishedAt,
    display_order: card.displayOrder,
    city: card.city,
    state: card.state,
    country: card.country,
    trust_verified: card.trustVerified,
    trust_indicators: card.trustIndicators,
  };
}
 + profit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  var payoutEl = document.getElementById('invest-payout');
  if (payoutEl) payoutEl.textContent = '
  return {
    id: card.id,
    title: card.title,
    developer_name: card.developerName,
    address_short: card.addressShort,
    address_full: card.addressFull,
    description_short: card.descriptionShort,
    total_investment: card.totalInvestment,
    expected_roi: card.expectedROI,
    timeline: card.timeline,
    partners_count: card.partnersCount,
    badges: card.badges,
    min_investment: card.minInvestment,
    photos: card.photos,
    deal_type: card.dealType,
    status: card.status,
    exit_strategy: card.exitStrategy,
    distribution_frequency: card.distributionFrequency,
    published_at: card.publishedAt,
    display_order: card.displayOrder,
    city: card.city,
    state: card.state,
    country: card.country,
    trust_verified: card.trustVerified,
    trust_indicators: card.trustIndicators,
  };
}
 + (amount + profit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function submitLandingInvestment() {
  if (!_activeDeal) { alert('No deal selected. Please click Invest on a deal card.'); return; }
  var form = document.getElementById('invest-form');
  if (!form) return;
  var fullName = (form.querySelector('[name="full_name"]') || {}).value || '';
  var email = (form.querySelector('[name="email"]') || {}).value || '';
  var phone = (form.querySelector('[name="phone"]') || {}).value || '';
  var amountInput = document.getElementById('invest-amount-input');
  var amount = parseFloat((amountInput ? amountInput.value : '0').replace(/[^0-9.]/g, '')) || 0;
  if (!fullName || !email || amount <= 0) {
    alert('Please fill in your name, email, and investment amount.');
    return;
  }
  var total = _activeDeal.total_investment || 1;
  var ownership = (amount / total) * 100;
  var payload = {
    source: 'landing_page',
    deal_id: _activeDeal.deal_id,
    deal_name: _activeDeal.deal_name,
    investment_type: 'fractional_shares',
    investment_amount: amount,
    ownership_percent: parseFloat(ownership.toFixed(4)),
    expected_roi: _activeDeal.expected_roi,
    full_name: fullName,
    email: email,
    phone: phone,
    status: 'pending',
    submitted_at: new Date().toISOString()
  };
  console.log('[Landing] Submitting investment:', JSON.stringify(payload));
  var submitBtn = document.getElementById('invest-submit-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }
  fetch(_supabaseUrl + '/rest/v1/landing_submissions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': _supabaseAnonKey,
      'Authorization': 'Bearer ' + _supabaseAnonKey,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(payload)
  }).then(function(res) {
    console.log('[Landing] Submit response:', res.status);
    if (res.ok) {
      showInvestSuccess(payload);
    } else {
      res.text().then(function(t) { console.error('[Landing] Submit error:', t); });
      alert('Submission failed. Please try again or contact support.');
    }
  }).catch(function(err) {
    console.error('[Landing] Submit network error:', err);
    alert('Network error. Please check your connection and try again.');
  }).finally(function() {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Confirm Investment'; }
  });
}

function showInvestSuccess(payload) {
  var modal = document.getElementById('ivx-invest-modal');
  if (!modal) return;
  var content = modal.querySelector('.invest-modal-content');
  if (content) {
    content.innerHTML = '<div style="text-align:center;padding:40px 20px">' +
      '<div style="font-size:48px;margin-bottom:16px">\u2705</div>' +
      '<h3 style="color:#00C48C;margin-bottom:8px">Investment Submitted</h3>' +
      '<p style="color:#999;margin-bottom:16px">Your investment of 
  return {
    id: card.id,
    title: card.title,
    developer_name: card.developerName,
    address_short: card.addressShort,
    address_full: card.addressFull,
    description_short: card.descriptionShort,
    total_investment: card.totalInvestment,
    expected_roi: card.expectedROI,
    timeline: card.timeline,
    partners_count: card.partnersCount,
    badges: card.badges,
    min_investment: card.minInvestment,
    photos: card.photos,
    deal_type: card.dealType,
    status: card.status,
    exit_strategy: card.exitStrategy,
    distribution_frequency: card.distributionFrequency,
    published_at: card.publishedAt,
    display_order: card.displayOrder,
    city: card.city,
    state: card.state,
    country: card.country,
    trust_verified: card.trustVerified,
    trust_indicators: card.trustIndicators,
  };
}
 + payload.investment_amount.toLocaleString() + ' in ' + (payload.deal_name || 'this deal') + ' has been submitted for review.</p>' +
      '<p style="color:#666;font-size:13px">We will contact you at ' + payload.email + ' to finalize your investment.</p>' +
      '<button onclick="closeInvestModal()" style="margin-top:24px;padding:12px 32px;background:#00C48C;color:#000;border:none;border-radius:12px;font-weight:700;cursor:pointer">Done</button>' +
      '</div>';
  }
}

function submitLandingRegistration() {
  var form = document.getElementById('register-form');
  if (!form) return;
  var fullName = (form.querySelector('[name="full_name"]') || {}).value || '';
  var email = (form.querySelector('[name="email"]') || {}).value || '';
  var phone = (form.querySelector('[name="phone"]') || {}).value || '';
  if (!fullName || !email) {
    alert('Please fill in your name and email.');
    return;
  }
  var payload = {
    source: 'landing_page',
    type: 'registration',
    full_name: fullName,
    email: email,
    phone: phone,
    status: 'pending',
    submitted_at: new Date().toISOString()
  };
  console.log('[Landing] Submitting registration:', JSON.stringify(payload));
  var submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }
  fetch(_supabaseUrl + '/rest/v1/landing_submissions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': _supabaseAnonKey,
      'Authorization': 'Bearer ' + _supabaseAnonKey,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(payload)
  }).then(function(res) {
    console.log('[Landing] Registration response:', res.status);
    if (res.ok) {
      alert('Registration submitted! We will be in touch.');
      form.reset();
    } else {
      res.text().then(function(t) { console.error('[Landing] Registration error:', t); });
      alert('Registration failed. Please try again.');
    }
  }).catch(function(err) {
    console.error('[Landing] Registration network error:', err);
    alert('Network error. Please check your connection.');
  }).finally(function() {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign Up'; }
  });
}
</script>`;
}

export function generateCanonicalDealJson(card: PublishedDealCardModel): Record<string, unknown> {
  return {
    id: card.id,
    title: card.title,
    developer_name: card.developerName,
    address_short: card.addressShort,
    address_full: card.addressFull,
    description_short: card.descriptionShort,
    total_investment: card.totalInvestment,
    expected_roi: card.expectedROI,
    timeline: card.timeline,
    partners_count: card.partnersCount,
    badges: card.badges,
    min_investment: card.minInvestment,
    photos: card.photos,
    deal_type: card.dealType,
    status: card.status,
    exit_strategy: card.exitStrategy,
    distribution_frequency: card.distributionFrequency,
    published_at: card.publishedAt,
    display_order: card.displayOrder,
    city: card.city,
    state: card.state,
    country: card.country,
    trust_verified: card.trustVerified,
    trust_indicators: card.trustIndicators,
  };
}
