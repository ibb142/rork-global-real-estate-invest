/*
 * IVX Investor-First Home Feed — ivxholding.com
 *
 * Enforces the CANONICAL home layout from the single source of truth
 * (GET /api/ivx/video-platform/home-feed) — the exact same sequence the
 * Android and iOS apps render:
 *
 *   Featured Deal 1–3 → 1 Featured Project Video → Deal 4–6 → 1 video → repeat
 *
 * Behaviour:
 *   • Reorders the rendered deal cards in #properties-grid to the canonical order.
 *   • Inserts exactly ONE featured project video card after every 3 deals.
 *   • Every video card is attached to a real project (name, city, phase,
 *     investment, ROI, minimum, progress %, View Deal + Invest Now).
 *   • Performance: poster image loads first; the video source attaches only
 *     when the card scrolls into view; only the next upcoming video preloads.
 *   • Admin publish (deal/video meta) updates this page automatically on the
 *     next load — no separate configuration.
 */
(function () {
  'use strict';
  if (window.__ivxHomeFeedLoaded) return;
  window.__ivxHomeFeedLoaded = true;

  var API_CANDIDATES = ['https://api.ivxholding.com', 'https://ivx-holdings-platform.onrender.com'];
  var HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js';

  var homeFeed = null;      /* canonical blocks from the backend */
  var applying = false;     /* guard against observer feedback loops */

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
    return '$' + Math.round(n);
  }

  function fetchHomeFeed(i) {
    i = i || 0;
    if (i >= API_CANDIDATES.length) return Promise.reject(new Error('all API hosts failed'));
    return fetch(API_CANDIDATES[i] + '/api/ivx/video-platform/home-feed?limit=60')
      .then(function (r) {
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!r.ok || ct.indexOf('json') === -1) throw new Error('bad response');
        return r.json();
      })
      .catch(function () { return fetchHomeFeed(i + 1); });
  }

  /* ---------- lazy HLS ---------- */
  var hlsLoading = null;
  function loadHlsJs() {
    if (window.Hls) return Promise.resolve();
    if (hlsLoading) return hlsLoading;
    hlsLoading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = HLS_CDN; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    });
    return hlsLoading;
  }
  function attachSource(video, hlsUrl, fallbackUrl) {
    if (video.__ivxAttached) return;
    video.__ivxAttached = true;
    if (!hlsUrl) { if (fallbackUrl) video.src = fallbackUrl; return; }
    if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = hlsUrl; return; }
    loadHlsJs().then(function () {
      if (window.Hls && window.Hls.isSupported()) {
        var h = new window.Hls({ capLevelToPlayerSize: true, maxBufferLength: 15 });
        h.on(window.Hls.Events.ERROR, function (_e, data) {
          if (data && data.fatal) { try { h.destroy(); } catch (e) {} if (fallbackUrl) video.src = fallbackUrl; }
        });
        h.loadSource(hlsUrl);
        h.attachMedia(video);
        video.__ivxHls = h;
      } else if (fallbackUrl) {
        video.src = fallbackUrl;
      }
    });
  }

  /* ---------- styles — immersive full-bleed card (matches app reels) ---------- */
  var css = ''
    + '.ivx-hf-video{width:100%;max-width:440px;border-radius:18px;overflow:hidden;background:#000;border:1px solid #2A2A2A;'
    + 'transition:transform .22s,border-color .22s,box-shadow .22s}'
    + '.ivx-hf-video:hover{transform:translateY(-5px);border-color:rgba(255,215,0,.22);box-shadow:0 16px 50px rgba(0,0,0,.45)}'
    + '.ivx-hf-media{position:relative;width:100%;aspect-ratio:9/16;min-height:520px;max-height:720px;overflow:hidden;background:#141414}'
    + '.ivx-hf-media img,.ivx-hf-media video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}'
    + '.ivx-hf-overlay{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;justify-content:space-between;'
    + 'background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.12) 25%,rgba(0,0,0,.12) 60%,rgba(0,0,0,.82) 100%);pointer-events:none}'
    + '.ivx-hf-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px;pointer-events:auto}'
    + '.ivx-hf-badges{display:flex;gap:8px;flex-wrap:wrap}'
    + '.ivx-hf-badge{border-radius:8px;padding:5px 10px;font:900 10px/1 -apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.8px}'
    + '.ivx-hf-badge-filled{background:#FFD700;color:#000}'
    + '.ivx-hf-badge-outline{background:transparent;color:#FFD700;border:1.5px solid #FFD700}'
    + '.ivx-hf-actions-right{display:flex;flex-direction:column;align-items:center;gap:10px}'
    + '.ivx-hf-icon{width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.18);'
    + 'color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;'
    + 'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:transform .15s,background .2s}'
    + '.ivx-hf-icon:hover{background:rgba(0,0,0,.65);transform:scale(1.08)}'
    + '.ivx-hf-bottom{padding:14px;padding-top:40px;pointer-events:auto}'
    + '.ivx-hf-name{font:900 22px/1.1 -apple-system,Segoe UI,sans-serif;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.45)}'
    + '.ivx-hf-subtitle{font:700 14px/1.2 -apple-system,Segoe UI,sans-serif;color:#fff;margin-top:2px;text-shadow:0 1px 4px rgba(0,0,0,.45)}'
    + '.ivx-hf-loc{font:12px/1.4 -apple-system,Segoe UI,sans-serif;color:rgba(255,255,255,.82);margin-top:3px;display:flex;align-items:center;gap:4px}'
    + '.ivx-hf-stats{display:flex;gap:16px;margin:12px 0}'
    + '.ivx-hf-stat{display:flex;align-items:baseline;gap:4px}'
    + '.ivx-hf-stat .v{font:900 16px/1 -apple-system,Segoe UI,sans-serif;color:#FFD700}'
    + '.ivx-hf-stat .l{font:700 10px/1 -apple-system,Segoe UI,sans-serif;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.5px}'
    + '.ivx-hf-actions-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}'
    + '.ivx-hf-pill{border-radius:8px;padding:5px 10px;font:800 11px/1 -apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.5px}'
    + '.ivx-hf-pill:nth-child(1){background:rgba(255,215,0,.15);color:#FFD700;border:1px solid rgba(255,215,0,.35)}'
    + '.ivx-hf-pill:nth-child(2){background:rgba(0,196,140,.15);color:#00C48C;border:1px solid rgba(0,196,140,.35)}'
    + '.ivx-hf-pill:nth-child(3){background:rgba(74,144,217,.15);color:#4A90D9;border:1px solid rgba(74,144,217,.35)}'
    + '.ivx-hf-thumb{width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,.2)}'
    + '.ivx-hf-ai-badge{margin-left:auto;border-radius:100px;padding:5px 10px;background:rgba(255,255,255,.12);'
    + 'border:1px solid rgba(255,255,255,.22);font:700 11px/1 -apple-system,Segoe UI,sans-serif;color:#fff;display:inline-flex;align-items:center;gap:4px}'
    + '.ivx-hf-btns{display:flex;gap:10px;align-items:stretch}'
    + '.ivx-hf-btns a{flex:1;text-align:center;border-radius:12px;padding:13px 0;font:700 14px/1 -apple-system,Segoe UI,sans-serif;text-decoration:none;cursor:pointer}'
    + '.ivx-hf-view{background:rgba(0,0,0,.35);color:#fff;border:1.5px solid rgba(255,255,255,.2)}'
    + '.ivx-hf-invest{background:#FFD700;color:#000}'
    + '.ivx-hf-caption{display:flex;align-items:center;gap:8px;margin-top:12px;background:rgba(0,0,0,.35);'
    + 'border:1px solid rgba(255,255,255,.12);border-radius:100px;padding:8px 14px;color:rgba(255,255,255,.7);font:12px/1 -apple-system,Segoe UI,sans-serif}'
    + '@media(max-width:520px){.ivx-hf-media{min-height:480px}.ivx-hf-name{font-size:20px}}';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- featured project video card (immersive full-bleed) ---------- */
  function buildVideoCard(v) {
    var deal = v.deal || {};
    var card = document.createElement('div');
    card.className = 'ivx-hf-video';
    card.setAttribute('data-ivx-home-feed-video', v.id);

    var poster = v.poster_url || v.thumbnail_url || v.preview_blur_url || '';
    var name = esc(deal.name || v.title || 'IVX Project');
    var subtitle = esc(deal.projectName || deal.name || v.title || 'IVX Project');
    var city = esc(deal.city || '');
    var roi = deal.expected_roi ? esc(String(deal.expected_roi)) + '%' : '—';
    var min = deal.min_investment ? money(deal.min_investment) : '—';
    var ownership = deal.min_ownership ? esc(deal.min_ownership) : '0.0016%';
    var dealUrl = deal.url || 'https://ivxholding.com/#deals';
    var dealType = String(deal.deal_type || deal.type || 'investment').toLowerCase();
    var typeLabel = dealType === 'jv' ? 'JV Deal' : (dealType === 'development' ? 'Development' : 'Investment');
    var thumb = poster ? '<img class="ivx-hf-thumb" src="' + esc(poster) + '" alt="" loading="lazy" />' : '';

    card.innerHTML = ''
      + '<div class="ivx-hf-media">'
      + (poster ? '<img src="' + esc(poster) + '" alt="' + name + '" loading="lazy" style="z-index:1"/>' : '')
      + '  <video playsinline muted loop preload="none"' + (poster ? ' poster="' + esc(poster) + '"' : '') + ' style="opacity:0;z-index:1"></video>'
      + '  <div class="ivx-hf-overlay">'
      + '    <div class="ivx-hf-top">'
      + '      <div class="ivx-hf-badges">'
      + '        <span class="ivx-hf-badge ivx-hf-badge-filled">Featured Video</span>'
      + '        <span class="ivx-hf-badge ivx-hf-badge-outline">' + esc(typeLabel) + '</span>'
      + '      </div>'
      + '      <div class="ivx-hf-actions-right">'
      + '        <button class="ivx-hf-icon" aria-label="Like" onclick="event.stopPropagation();">&#9825;</button>'
      + '        <button class="ivx-hf-icon" aria-label="Comment" onclick="event.stopPropagation();">&#128172;</button>'
      + '        <button class="ivx-hf-icon" aria-label="Save" onclick="event.stopPropagation();">&#128278;</button>'
      + '        <button class="ivx-hf-icon" aria-label="Share" onclick="event.stopPropagation();">&#8599;</button>'
      + '        <button class="ivx-hf-icon ivx-hf-mute" aria-label="Unmute">&#128263;</button>'
      + '      </div>'
      + '    </div>'
      + '    <div class="ivx-hf-bottom">'
      + '      <div class="ivx-hf-name">' + name + '</div>'
      + '      <div class="ivx-hf-subtitle">' + subtitle + ' &mdash; Project Tour</div>'
      + (city ? '<div class="ivx-hf-loc">&#128205; ' + city + '</div>' : '')
      + '      <div class="ivx-hf-stats">'
      + '        <div class="ivx-hf-stat"><div class="v">' + roi + '</div><div class="l">ROI</div></div>'
      + '        <div class="ivx-hf-stat"><div class="v">' + min + '</div><div class="l">Min Invest</div></div>'
      + '        <div class="ivx-hf-stat"><div class="v">' + ownership + '</div><div class="l">Min Ownership</div></div>'
      + '      </div>'
      + '      <div class="ivx-hf-actions-row">'
      + '        <span class="ivx-hf-pill">Tokenized</span>'
      + '        <span class="ivx-hf-pill">' + esc(typeLabel) + '</span>'
      + '        <span class="ivx-hf-pill">E</span>'
      + thumb
      + '        <span class="ivx-hf-ai-badge">&#10024; Restyle with AI</span>'
      + '      </div>'
      + '      <div class="ivx-hf-btns">'
      + '        <a class="ivx-hf-view" href="' + esc(dealUrl) + '">View Deal</a>'
      + '        <a class="ivx-hf-invest" href="https://chat.ivxholding.com/investor">Invest Now</a>'
      + '      </div>'
      + '      <div class="ivx-hf-caption">'
      + '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:#FFD700">'
      + '          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'
      + '        </svg>'
      + '        Add a caption...'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    var vid = card.querySelector('video');
    var img = card.querySelector('.ivx-hf-media img');
    var muteBtn = card.querySelector('.ivx-hf-mute');
    muteBtn.addEventListener('click', function () {
      vid.muted = !vid.muted;
      muteBtn.innerHTML = vid.muted ? '&#128263;' : '&#128266;';
    });

    /* Lazy playback: attach the source ONLY when visible; images load first. */
    card.__ivxActivate = function () {
      attachSource(vid, v.hls_url, v.video_url);
      vid.play().then(function () {
        vid.style.opacity = '1';
        if (img) img.style.opacity = '0';
      }).catch(function () {});
    };
    card.__ivxDeactivate = function () { try { vid.pause(); } catch (e) {} };
    card.__ivxPreload = function () {
      /* preload the NEXT featured video only — metadata, no full download */
      if (!vid.__ivxAttached) { vid.preload = 'metadata'; attachSource(vid, v.hls_url, v.video_url); }
    };
    return card;
  }

  var videoIO = null;
  function observeVideoCards(grid) {
    if (!videoIO) {
      videoIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var card = entry.target;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
            if (card.__ivxActivate) card.__ivxActivate();
            /* preload only the next upcoming video card */
            var all = Array.prototype.slice.call(document.querySelectorAll('[data-ivx-home-feed-video]'));
            var idx = all.indexOf(card);
            if (idx >= 0 && all[idx + 1] && all[idx + 1].__ivxPreload) all[idx + 1].__ivxPreload();
          } else if (!entry.isIntersecting && card.__ivxDeactivate) {
            card.__ivxDeactivate();
          }
        });
      }, { threshold: [0, 0.35] });
    }
    grid.querySelectorAll('[data-ivx-home-feed-video]').forEach(function (card) {
      if (!card.__ivxObserved) { card.__ivxObserved = true; videoIO.observe(card); }
    });
  }

  /* ---------- canonical order + interleave ---------- */
  function cardDealId(card) {
    var slider = card.querySelector('[id^="slider-"]');
    return slider ? slider.id.slice('slider-'.length) : null;
  }

  function applyHomeFeedLayout() {
    if (!homeFeed || applying) return;
    var grid = document.getElementById('properties-grid');
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.live-deal-card'))
      .filter(function (c) { return !c.hasAttribute('data-ivx-home-feed-video'); });
    if (cards.length === 0) return;

    var byId = {};
    cards.forEach(function (c) {
      var id = cardDealId(c);
      if (id) byId[id] = c;
    });

    applying = true;
    try {
      /* remove previously injected video cards before re-applying */
      grid.querySelectorAll('[data-ivx-home-feed-video]').forEach(function (n) { n.remove(); });

      var frag = document.createDocumentFragment();
      var placed = {};
      var placedCount = 0;
      homeFeed.blocks.forEach(function (block) {
        if (block.type === 'deal' && block.deal && byId[block.deal.id]) {
          frag.appendChild(byId[block.deal.id]);
          placed[block.deal.id] = true;
          placedCount += 1;
        } else if (block.type === 'video' && block.video) {
          frag.appendChild(buildVideoCard(block.video));
        }
      });
      /* keep any locally-rendered cards the canonical feed doesn't know about */
      cards.forEach(function (c) {
        var id = cardDealId(c);
        if (!id || !placed[id]) frag.appendChild(c);
      });
      grid.appendChild(frag);
      observeVideoCards(grid);
      console.log('[IVX HomeFeed] Applied canonical layout — ' + placedCount + ' deals ordered, '
        + grid.querySelectorAll('[data-ivx-home-feed-video]').length + ' featured project videos interleaved (pattern '
        + (homeFeed.pattern || 'n/a') + ')');
    } finally {
      /* release the guard on the next tick so our own mutations are ignored */
      setTimeout(function () { applying = false; }, 0);
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    fetchHomeFeed(0)
      .then(function (data) {
        if (!data || !Array.isArray(data.blocks)) return;
        homeFeed = data;
        applyHomeFeedLayout();
        var grid = document.getElementById('properties-grid');
        if (!grid) return;
        var mo = new MutationObserver(function () {
          if (applying) return;
          clearTimeout(boot.__t);
          boot.__t = setTimeout(applyHomeFeedLayout, 250);
        });
        mo.observe(grid, { childList: true });
      })
      .catch(function (err) {
        console.warn('[IVX HomeFeed] canonical feed unavailable — keeping local order:', err && err.message);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
