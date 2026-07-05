function asString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseMaybeJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return asString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJs(value) {
  return asString(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

function formatCurrencyCompact(amount) {
  const safeAmount = asNumber(amount);
  if (safeAmount >= 1000000000) return `${(safeAmount / 1000000000).toFixed(2)}B`;
  if (safeAmount >= 1000000) return `${(safeAmount / 1000000).toFixed(2)}M`;
  if (safeAmount >= 1000) return `${new Intl.NumberFormat('en-US').format(Math.round(safeAmount))}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

function formatCurrencyWithDecimals(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(asNumber(amount));
}

function formatMarketValue(amount) {
  const compact = formatCurrencyCompact(amount);
  return compact.startsWith('$') ? compact : `$${compact}`;
}

function isRenderablePhotoUrl(value) {
  const normalized = asString(value).trim();
  return normalized.length > 0 && !normalized.startsWith('data:image/gif;base64,R0lGODlhAQABA');
}

function extractLocation(card) {
  const addressShort = asString(card.addressShort || card.address_short).trim();
  if (addressShort) return addressShort;
  const city = asString(card.city).trim();
  const state = asString(card.state).trim();
  if (city && state) return `${city}, ${state}`;
  const propertyAddress = asString(card.propertyAddress || card.property_address).trim();
  if (propertyAddress) {
    const parts = propertyAddress.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
    }
    return propertyAddress;
  }
  return '';
}

function extractTimeline(card, trustInfo) {
  const explicitTimeline = asString(card.timeline).trim();
  if (explicitTimeline) return explicitTimeline;
  const min = asNumber(trustInfo.timelineMin ?? trustInfo.timeline_min);
  const max = asNumber(trustInfo.timelineMax ?? trustInfo.timeline_max);
  const unit = (trustInfo.timelineUnit || trustInfo.timeline_unit) === 'years' ? 'yr' : 'mo';
  if (min > 0 && max > 0) return `${min}–${max} ${unit}`;
  if (max > 0) return `${max} ${unit}`;
  if (min > 0) return `${min} ${unit}`;
  return '';
}

function buildOwnershipText(minInvestment, salePrice) {
  if (!(minInvestment > 0) || !(salePrice > 0)) return '';
  const percent = (minInvestment / salePrice) * 100;
  return `${percent.toFixed(percent >= 1 ? 2 : 4)}% ownership at minimum`;
}

export function generateLandingCardHtml(rawCard) {
  const card = rawCard && typeof rawCard === 'object' ? rawCard : {};
  const trustInfo = parseMaybeJsonObject(card.trustInfo || card.trust_info) || {};
  const photos = (Array.isArray(card.photos) ? card.photos : []).filter(isRenderablePhotoUrl);
  const location = extractLocation(card);
  const salePrice = asNumber(card.salePrice || card.sale_price || card.propertyValue || card.property_value || card.totalInvestment || card.total_investment);
  const minInvestment = Math.max(asNumber(card.minInvestment || card.min_investment || card.minimum_investment || trustInfo.minInvestment || trustInfo.min_investment || 50), 1);
  const shareEntryPrice = Math.max(asNumber(card.fractionalSharePrice || card.fractional_share_price || trustInfo.fractionalSharePrice || trustInfo.fractional_share_price || minInvestment), 1);
  const ownershipText = asString(card.ownershipText || card.ownership_text || trustInfo.ownershipLabel || trustInfo.ownership_label).trim() || buildOwnershipText(minInvestment, salePrice);
  const minOwnershipLabel = salePrice > 0 ? `${((minInvestment / salePrice) * 100).toFixed(4)}% min` : 'Live sync pending';
  const investmentAmountLabel = formatMarketValue(card.totalInvestment || card.total_investment || 0);
  const salePriceLabel = formatMarketValue(salePrice);
  const timeline = extractTimeline(card, trustInfo);
  const showEntryPill = Math.abs(shareEntryPrice - minInvestment) > 0.009;
  const developerName = asString(trustInfo.llcName || trustInfo.builderName || card.projectName || card.project_name || card.developerName || card.developer_name || 'IVX Holdings LLC').trim();
  let verifiedCount = 0;
  if (trustInfo.titleVerified) verifiedCount += 1;
  if (trustInfo.insuranceCoverage) verifiedCount += 1;
  if (trustInfo.escrowProtected) verifiedCount += 1;
  if (trustInfo.permitStatus === 'approved') verifiedCount += 1;
  if (trustInfo.thirdPartyAudit) verifiedCount += 1;

  const imageSection = photos.length > 0
    ? `<div class="live-deal-gallery" style="position:relative;">
        <div class="live-deal-gallery-slider" id="slider-${escapeHtml(card.id || Math.random().toString(36).slice(2, 8))}">
          ${photos.map((photo) => `<img src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" onerror="this.closest('.live-deal-gallery')?.classList.add('live-deal-gallery-empty');this.remove();" />`).join('')}
        </div>
        ${photos.length > 1 ? `<div class="live-deal-photo-dots">${photos.map((_, idx) => `<div class="live-deal-photo-dot${idx === 0 ? ' active' : ''}" data-idx="${idx}"></div>`).join('')}</div>` : ''}
        ${photos.length > 1 ? `<div class="live-deal-photo-count">1/${photos.length}</div>` : ''}
        <div class="live-deal-overlay-badge"><div class="live-deal-overlay-dot"></div> LIVE</div>
        ${verifiedCount >= 3 ? `<div class="live-deal-verified-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> VERIFIED</div>` : ''}
      </div>`
    : '';

  const trustBadges = [
    trustInfo.titleVerified ? '<div class="live-deal-trust-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>Title Verified</span></div>' : '',
    trustInfo.insuranceCoverage ? '<div class="live-deal-trust-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4A90D9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>Insured</span></div>' : '',
    trustInfo.escrowProtected ? '<div class="live-deal-trust-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>Escrow</span></div>' : '',
    trustInfo.permitStatus === 'approved' ? '<div class="live-deal-trust-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>Permitted</span></div>' : '',
  ].filter(Boolean).join('');

  return `<div class="live-deal-card" data-deal-id="${escapeHtml(card.id)}">
    ${imageSection}
    <div class="live-deal-content">
      <div class="live-deal-header-row">
        <div style="flex:1;min-width:0;">
          <div class="live-deal-title">${escapeHtml(card.title || card.projectName || 'Untitled')}</div>
          ${location ? `<div class="live-deal-location"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6A6A6A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${escapeHtml(location)}</div>` : ''}
        </div>
        <div class="live-deal-market-pill live-deal-sale-pill" style="min-width:118px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.24);">
          <div class="live-deal-market-pill-label">Sale Price</div>
          <div class="live-deal-market-pill-value" style="color:#FFD700;">${escapeHtml(salePriceLabel)}</div>
          <div class="live-deal-market-pill-label" style="color:#22C55E;">${escapeHtml(minOwnershipLabel)}</div>
        </div>
      </div>
      <div class="live-deal-divider"></div>
      <div class="live-deal-metrics">
        <div class="live-deal-metric"><div class="live-deal-metric-val">${escapeHtml(investmentAmountLabel)}</div><div class="live-deal-metric-lbl">Investment</div></div>
        <div class="live-deal-metric-div"></div>
        <div class="live-deal-metric"><div class="live-deal-metric-val">${escapeHtml(String(asNumber(card.expectedROI || card.expected_roi)))}%</div><div class="live-deal-metric-lbl">ROI</div></div>
        <div class="live-deal-metric-div"></div>
        <div class="live-deal-metric"><div class="live-deal-metric-val">${escapeHtml(timeline)}</div><div class="live-deal-metric-lbl">Timeline</div></div>
      </div>
      <div class="live-deal-divider"></div>
      <div class="live-deal-market-strip">
        <div class="live-deal-market-pill"><div class="live-deal-market-pill-label">Fractional</div><div class="live-deal-market-pill-value">from ${escapeHtml(formatCurrencyWithDecimals(minInvestment))}</div></div>
        ${showEntryPill ? `<div class="live-deal-market-pill"><div class="live-deal-market-pill-label">Entry</div><div class="live-deal-market-pill-value">${escapeHtml(formatCurrencyWithDecimals(shareEntryPrice))}</div></div>` : ''}
        <div class="live-deal-market-pill"><div class="live-deal-market-pill-label">Ownership</div><div class="live-deal-market-pill-value">${escapeHtml(minOwnershipLabel)}</div></div>
      </div>
      <div class="live-deal-ownership-hint">${escapeHtml(ownershipText)}</div>
      <div class="live-deal-developer-row">
        <div class="live-deal-developer-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v3h4v-3h3v3h4c.6 0 1-.4 1-1v-3"/><path d="M2 18V8c0-.6.4-1 1-1h18c.6 0 1 .4 1 1v10"/><path d="M9 7V4c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v3"/></svg></div>
        <span class="live-deal-developer-text">Developed by <span class="live-deal-developer-name">${escapeHtml(developerName)}</span></span>
      </div>
      ${trustBadges ? `<div class="live-deal-trust-indicators">${trustBadges}</div>` : ''}
      <div class="live-deal-actions">
        <button class="live-deal-details-btn" onclick="openInvestModal('${escapeHtml(card.id)}','${escapeJs(card.title || card.projectName || '')}',${asNumber(card.totalInvestment || card.total_investment)},${asNumber(card.expectedROI || card.expected_roi)},'${escapeJs(location)}',${salePrice},${minInvestment},${shareEntryPrice})">Details</button>
        <button class="live-deal-invest-btn" onclick="openInvestModal('${escapeHtml(card.id)}','${escapeJs(card.title || card.projectName || '')}',${asNumber(card.totalInvestment || card.total_investment)},${asNumber(card.expectedROI || card.expected_roi)},'${escapeJs(location)}',${salePrice},${minInvestment},${shareEntryPrice})">Invest Now</button>
      </div>
      <div class="live-deal-min-invest">Fractional starts at <strong>${escapeHtml(formatCurrencyWithDecimals(minInvestment))}</strong> · <strong>${escapeHtml(ownershipText)}</strong></div>
    </div>
  </div>`;
}
