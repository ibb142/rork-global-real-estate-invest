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

function formatCurrencyWithDecimals(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(asNumber(amount));
}

function formatCurrencyCompact(amount) {
  const safeAmount = asNumber(amount);
  if (safeAmount >= 1000000000) return `${(safeAmount / 1000000000).toFixed(2)}B`;
  if (safeAmount >= 1000000) return `${(safeAmount / 1000000).toFixed(2)}M`;
  if (safeAmount >= 1000) return `$${new Intl.NumberFormat('en-US').format(Math.round(safeAmount))}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
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

function buildOwnershipText(minInvestment, salePrice) {
  if (!(minInvestment > 0) || !(salePrice > 0)) return 'Ownership updates from live sale price';
  const percent = (minInvestment / salePrice) * 100;
  return `${percent.toFixed(percent >= 1 ? 2 : 4)}% minimum ownership`;
}

function getMinimumOwnershipLabel(minInvestment, salePrice) {
  if (!(minInvestment > 0) || !(salePrice > 0)) return 'Live sync pending';
  return `${((minInvestment / salePrice) * 100).toFixed(4)}% min`;
}

function normalizeTrustInfo(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return {};
}

function getDealAddressShort(deal) {
  const addressShort = asString(deal.addressShort || deal.address_short || '').trim();
  if (addressShort) return addressShort;
  if (deal.city && deal.state) return `${asString(deal.city).trim()}, ${asString(deal.state).trim()}`;
  const propertyAddress = asString(deal.propertyAddress || deal.property_address || '').trim();
  if (propertyAddress) {
    const parts = propertyAddress.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
    return propertyAddress;
  }
  return '';
}

function getDealSalePrice(deal, trustInfo) {
  const salePrice = asNumber(
    deal.salePrice || deal.sale_price || trustInfo.salePrice || trustInfo.sale_price ||
    deal.propertyValue || deal.property_value || deal.estimated_value ||
    deal.totalInvestment || deal.total_investment
  );
  return salePrice > 0 ? salePrice : 0;
}

function getDealMinInvestment(deal, trustInfo) {
  const minInvestment = asNumber(
    deal.minInvestment || deal.min_investment || deal.minimum_investment ||
    trustInfo.minInvestment || trustInfo.min_investment || 50
  );
  return minInvestment > 0 ? minInvestment : 50;
}

function getDealFractionalSharePrice(deal, trustInfo, minInvestment) {
  const sharePrice = asNumber(
    deal.fractionalSharePrice || deal.fractional_share_price ||
    trustInfo.fractionalSharePrice || trustInfo.fractional_share_price || minInvestment
  );
  return sharePrice > 0 ? sharePrice : minInvestment;
}

function getDealOwnershipText(deal, trustInfo, minInvestment, salePrice) {
  const explicit = asString(deal.ownershipText || deal.ownership_text || trustInfo.ownershipLabel || trustInfo.ownership_label).trim();
  return explicit || buildOwnershipText(minInvestment, salePrice);
}

function getDealDeveloperName(deal, trustInfo) {
  return asString(
    trustInfo.llcName || trustInfo.builderName ||
    deal.developerName || deal.developer_name ||
    deal.projectName || deal.project_name || 'IVX Holdings LLC'
  ).trim();
}

function getDealPostVideos(deal) {
  const postVideos = deal.postVideos || deal.post_videos || deal.dealVideos || deal.deal_videos || deal.videos || [];
  if (Array.isArray(postVideos) && postVideos.length > 0) return postVideos;
  return [];
}

function isRenderableGalleryPhoto(value) {
  const v = asString(value).trim();
  return v.length > 0 && !v.startsWith('data:image/gif;base64,R0lGODlhAQABA');
}

function getPhotoSourceBadgeHtml(source) {
  const map = {
    db: { cls: 'db', label: 'Database' },
    storage: { cls: 'storage', label: 'Cloud Storage' },
    fallback: { cls: 'fallback', label: 'Fallback' },
  };
  const entry = map[source] || { cls: 'missing', label: 'No Photo' };
  return `<div class="live-deal-source-badge ${entry.cls}">${entry.label}</div>`;
}

export function generateLandingCardHtml(deal) {
  const card = deal && typeof deal === 'object' ? deal : {};
  const trustInfo = normalizeTrustInfo(card.trustInfo || card.trust_info || {});
  const photos = (Array.isArray(card.photos) ? card.photos : []).filter(isRenderableGalleryPhoto).slice(0, 8);
  const dealVideos = getDealPostVideos(card);
  const verifiedCount = [trustInfo.titleVerified, trustInfo.insuranceCoverage, trustInfo.escrowProtected, trustInfo.permitStatus === 'approved', trustInfo.thirdPartyAudit].filter(Boolean).length;
  const verifiedBadgeHtml = verifiedCount >= 3 ? '<div class="live-deal-verified-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> VERIFIED</div>' : '';
  const photoSourceBadgeHtml = getPhotoSourceBadgeHtml(card.photoSource || (photos.length > 0 ? 'db' : 'none'));
  const salePrice = getDealSalePrice(card, trustInfo);
  const minInvestment = getDealMinInvestment(card, trustInfo);
  const shareEntryPrice = getDealFractionalSharePrice(card, trustInfo, minInvestment);
  const ownershipText = getDealOwnershipText(card, trustInfo, minInvestment, salePrice);
  const minimumOwnershipLabel = getMinimumOwnershipLabel(minInvestment, salePrice);
  const location = getDealAddressShort(card);
  const developerName = getDealDeveloperName(card, trustInfo);
  const dealType = asString(card.deal_type || card.type || 'investment').toLowerCase();
  const typeLabel = dealType === 'jv' ? 'JV Deal' : (dealType === 'development' ? 'Development' : 'Investment');
  const showEntryPill = Math.abs(shareEntryPrice - minInvestment) > 0.009;
  const slideTotal = dealVideos.length + photos.length;
  const sliderId = 'slider-' + (card.id || Math.random().toString(36).substr(2, 6));
  const firstThumb = (photos[0] || (typeof dealVideos[0] === 'string' ? '' : (dealVideos[0] && dealVideos[0].thumbnail_url) || '')) || '';

  let mediaHtml = '';
  if (slideTotal > 0) {
    let imgsHtml = '';
    for (let dvi = 0; dvi < dealVideos.length; dvi++) {
      const dv = dealVideos[dvi] || {};
      const dvSrc = typeof dv === 'string' ? dv : (dv.video_url || dv.url || '');
      if (!dvSrc) continue;
      const dvPoster = typeof dv === 'string' ? '' : (dv.thumbnail_url || dv.cover_url || '');
      imgsHtml += `<video ${/\.m3u8($|\?)/.test(dvSrc) ? `data-hls="${escapeHtml(dvSrc)}"` : `src="${escapeHtml(dvSrc)}"`}${dvPoster ? ` poster="${escapeHtml(dvPoster)}"` : ''} data-igplay="1" preload="metadata" muted loop playsinline controls controlslist="nodownload noremoteplayback" style="min-width:100%;width:100%;height:100%;object-fit:cover;scroll-snap-align:start;flex:0 0 100%;background:#000;"></video>`;
    }
    for (let pi = 0; pi < photos.length; pi++) {
      imgsHtml += `<img src="${escapeHtml(photos[pi])}" alt="" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" style="min-width:100%;width:100%;height:100%;object-fit:cover;scroll-snap-align:start;flex:0 0 100%;" onerror="this.closest('.ivx-imm-gallery')?.classList.add('ivx-imm-gallery-empty');this.remove();" />`;
    }
    let dotsHtml = '';
    if (slideTotal > 1) {
      dotsHtml = `<div class="live-deal-photo-dots" data-slider="${sliderId}">${Array.from({ length: slideTotal }, (_, di) => `<div class="live-deal-photo-dot${di === 0 ? ' active' : ''}" data-idx="${di}"></div>`).join('')}</div>`;
    }
    mediaHtml = `<div class="ivx-imm-gallery" style="position:relative;min-width:100%;min-height:100%;width:100%;height:100%;">`
      + `<div class="live-deal-gallery-slider" id="${sliderId}" style="position:absolute;inset:0;">${imgsHtml}</div>`
      + `<div class="live-deal-overlay-badge"><div class="live-deal-overlay-dot"></div> LIVE</div>`
      + photoSourceBadgeHtml + verifiedBadgeHtml
      + (slideTotal > 1 ? `<div class="live-deal-photo-count">1/${slideTotal}</div>` : '')
      + dotsHtml
      + `</div>`;
  } else {
    const dealTitle = escapeHtml(asString(card.title || 'Deal').toUpperCase());
    const dealSubtitle = escapeHtml(location ? `${location} · ${formatCurrencyCompact(asNumber(card.totalInvestment || card.total_investment || 0))}` : formatCurrencyCompact(asNumber(card.totalInvestment || card.total_investment || 0)));
    mediaHtml = `<div class="ivx-imm-gallery" style="position:relative;min-width:100%;min-height:100%;width:100%;height:100%;">`
      + `<div class="live-deal-gallery-slider" style="position:absolute;inset:0;">`
      + `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#1A1A1A 0%,#141414 50%,#000000 100%);gap:8px;position:relative;overflow:hidden;">`
      + `<div style="position:absolute;inset:0;background:radial-gradient(ellipse 60% 50% at 50% 40%,rgba(255,215,0,0.06),transparent 70%);pointer-events:none;"></div>`
      + `<div style="width:56px;height:56px;border-radius:16px;background:rgba(255,215,0,0.1);border:1.5px solid rgba(255,215,0,0.2);display:flex;align-items:center;justify-content:center;font-size:24px;position:relative;z-index:1;">&#127960;</div>`
      + `<div style="font-size:13px;font-weight:800;color:#FFD700;letter-spacing:1px;position:relative;z-index:1;text-align:center;padding:0 16px;">${dealTitle}</div>`
      + `<div style="font-size:10px;color:#6A6A6A;position:relative;z-index:1;">${dealSubtitle}</div>`
      + `</div></div>`
      + `<div class="live-deal-overlay-badge"><div class="live-deal-overlay-dot"></div> LIVE</div>`
      + photoSourceBadgeHtml + verifiedBadgeHtml
      + `</div>`;
  }

  const expectedRoi = asNumber(card.expectedROI || card.expected_roi || 0);
  const city = escapeHtml(card.city || location || '');
  const title = escapeHtml(card.title || card.projectName || card.project_name || 'Untitled');
  const subtitle = escapeHtml(card.projectName || card.project_name || title);
  const dealId = escapeHtml(card.id || '');
  const firstVideoThumb = firstThumb ? `<img class="ivx-imm-thumb" src="${escapeHtml(firstThumb)}" alt="" loading="lazy" />` : '';

  return `<div class="live-deal-card" data-deal-id="${dealId}">`
    + `<div class="ivx-imm-media">`
    + mediaHtml
    + `<div class="ivx-imm-overlay">`
    + `<div class="ivx-imm-top">`
    + `<div class="ivx-imm-badges">`
    + `<span class="ivx-imm-badge ivx-imm-badge-filled">${escapeHtml(typeLabel)}</span>`
    + `<span class="ivx-imm-badge ivx-imm-badge-outline">ACTIVE</span>`
    + `</div>`
    + `<div class="ivx-imm-actions-right">`
    + `<button class="ivx-imm-icon" aria-label="Like" onclick="event.stopPropagation();">&#9825;</button>`
    + `<button class="ivx-imm-icon" aria-label="Comment" onclick="event.stopPropagation();">&#128172;</button>`
    + `<button class="ivx-imm-icon" aria-label="Save" onclick="event.stopPropagation();">&#128278;</button>`
    + `<button class="ivx-imm-icon" aria-label="Share" onclick="event.stopPropagation();">&#8599;</button>`
    + `</div>`
    + `</div>`
    + `<div class="ivx-imm-bottom">`
    + `<div class="ivx-imm-title-block">`
    + `<div class="ivx-imm-title">${title}</div>`
    + `<div class="ivx-imm-subtitle">${subtitle} &mdash; ${escapeHtml(typeLabel)}</div>`
    + (city ? `<div class="ivx-imm-loc">&#128205; ${city}</div>` : '')
    + `</div>`
    + `<div class="ivx-imm-stats">`
    + `<div class="ivx-imm-stat"><span class="ivx-imm-stat-v">${escapeHtml(String(expectedRoi))}%</span><span class="ivx-imm-stat-l">ROI</span></div>`
    + `<div class="ivx-imm-stat"><span class="ivx-imm-stat-v">${escapeHtml(formatCurrencyWithDecimals(minInvestment))}</span><span class="ivx-imm-stat-l">Min Invest</span></div>`
    + `<div class="ivx-imm-stat"><span class="ivx-imm-stat-v">${escapeHtml(minimumOwnershipLabel)}</span><span class="ivx-imm-stat-l">Min Ownership</span></div>`
    + `</div>`
    + `<div class="ivx-imm-actions-row">`
    + `<span class="ivx-imm-pill">Tokenized</span>`
    + `<span class="ivx-imm-pill">${escapeHtml(typeLabel)}</span>`
    + `<span class="ivx-imm-pill">E</span>`
    + firstVideoThumb
    + `<span class="ivx-imm-ai-badge">&#10024; Restyle with AI</span>`
    + `</div>`
    + `<div class="ivx-imm-btns">`
    + `<button class="ivx-imm-details" onclick="investInDeal('${dealId}');">View Deal</button>`
    + `<button class="ivx-imm-invest" onclick="investInDeal('${dealId}');">Invest Now</button>`
    + `</div>`
    + `<div class="ivx-imm-caption">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`
    + `Add a caption...`
    + `</div>`
    + `</div>`
    + `</div>`
    + `</div>`;
}
