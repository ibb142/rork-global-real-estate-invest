#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

loadEnv();

const PROJECT_ROOT = resolve(process.cwd());
const PUBLIC_BASE_URL = (process.env.INVESTOR_CTA_AUDIT_BASE_URL || 'https://ivxholding.com').trim().replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.INVESTOR_CTA_AUDIT_TIMEOUT_MS || '10000', 10);
const JACKSONVILLE_KEYWORDS = ['JACKSONVILLE', 'ONE STOP CONSTRUCTORS'];

function readText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function matchesJacksonvilleDeal(deal) {
  const haystack = [
    readText(deal?.id),
    readText(deal?.title),
    readText(deal?.name),
    readText(deal?.projectName),
    readText(deal?.project_name),
    readText(deal?.developerName),
    readText(deal?.developer_name),
    readText(deal?.city),
    readText(deal?.state),
  ].join(' ').toUpperCase();

  return JACKSONVILLE_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function pickPhotos(deal) {
  const photos = deal?.photos;
  if (Array.isArray(photos)) return photos.filter((photo) => typeof photo === 'string' && photo.trim().length > 0);
  return [];
}

function summarizeDealFields(deal) {
  const photos = pickPhotos(deal);
  return {
    id: readText(deal?.id),
    title: readText(deal?.title),
    projectName: readText(deal?.projectName) || readText(deal?.project_name),
    developerName: readText(deal?.developerName) || readText(deal?.developer_name),
    status: readText(deal?.status),
    city: readText(deal?.city),
    state: readText(deal?.state),
    displayOrder: readText(deal?.displayOrder) || readText(deal?.display_order),
    published: deal?.published === true || deal?.is_published === true,
    photosCount: photos.length,
    firstPhoto: photos[0] || '',
  };
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

function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function looksLikeCompanyName(value) {
  const normalized = readText(value).toUpperCase();
  return [
    ' LLC',
    ' INC',
    ' LTD',
    ' LP',
    ' CORP',
    ' CORPORATION',
    ' GROUP',
    ' DEVELOPMENT',
    ' DEVELOPERS',
    ' CONSTRUCT',
    ' BUILD',
    ' HOMES',
    ' REALTY',
    ' HOLDINGS',
    ' PROPERTIES',
    ' CAPITAL',
    ' VENTURES',
  ].some((token) => normalized.includes(token));
}

function getPartnerDeveloperName(partners) {
  const rankedRoles = ['developer', 'builder', 'sponsor', 'operator', 'manager'];
  for (const role of rankedRoles) {
    const match = partners.find((partner) => readText(partner?.role).toLowerCase().includes(role));
    const name = readText(match?.name);
    if (name) return name;
  }
  return readText(partners[0]?.name);
}

function resolveCanonicalIdentityLocal(deal) {
  const trustInfo = parseMaybeJsonObject(deal?.trustInfo ?? deal?.trust_info) ?? undefined;
  const partners = parseMaybeJsonArray(deal?.partners).filter((item) => item && typeof item === 'object');
  const explicitTitle = readText(deal?.title) || readText(deal?.name);
  const explicitProjectName = readText(deal?.projectName) || readText(deal?.project_name);
  const explicitDeveloperName = readText(deal?.developerName) || readText(deal?.developer_name);
  const titleLooksLikeDeveloper = explicitTitle && looksLikeCompanyName(explicitTitle);
  const developerMatchesProject = explicitDeveloperName && explicitProjectName && explicitDeveloperName === explicitProjectName;
  const developerCandidates = [
    developerMatchesProject ? '' : explicitDeveloperName,
    titleLooksLikeDeveloper ? explicitTitle : '',
    readText(deal?.partnerName),
    readText(deal?.partner_name),
    readText(trustInfo?.llcName),
    readText(trustInfo?.builderName),
    getPartnerDeveloperName(partners),
  ].filter(Boolean);
  const developerName = developerCandidates[0]
    || (looksLikeCompanyName(explicitProjectName) ? explicitProjectName : '')
    || 'IVX Holdings LLC';
  const title = explicitTitle || explicitProjectName || developerName || 'Untitled Deal';
  const projectName = explicitProjectName || explicitTitle || developerName || title;
  return { title, projectName, developerName };
}

const STOCK_PHOTO_DOMAINS = [
  'unsplash.com',
  'images.unsplash.com',
  'picsum.photos',
  'via.placeholder.com',
  'placehold.co',
  'placekitten.com',
  'loremflickr.com',
  'placeholder.com',
  'dummyimage.com',
  'fakeimg.pl',
  'lorempixel.com',
  'placeholdit.imgix.net',
  'source.unsplash.com',
  'pexels.com',
  'images.pexels.com',
  'stocksnap.io',
  'pixabay.com',
];

const FALLBACK_REGISTRY = [
  {
    id: 'casa_rosario',
    keywords: ['CASA ROSARIO', 'ONE STOP DEVELOPMENT TWO'],
    photos: [
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/junpisw15h6borglpbckz',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/2s8bcg6npyx96xcfrr5rm',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t8rc86kynbs64jopcujtf',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/bxqj57n0z60oqoxaqvnlo',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/idr3twi8x1q8skiyl9sm7',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/q28qwxwmig7m8qr5m83jh',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/p6gks5os79lycfghdkupz',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/g9g9wbb8r1epd4hc9qifl',
    ],
  },
  {
    id: 'perez_residence',
    keywords: ['PEREZ RESIDENCE', 'PEREZ'],
    photos: [
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/junpisw15h6borglpbckz',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/2s8bcg6npyx96xcfrr5rm',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t8rc86kynbs64jopcujtf',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/bxqj57n0z60oqoxaqvnlo',
    ],
  },
  {
    id: 'jacksonville_prime',
    keywords: ['JACKSONVILLE PRIME', 'IVX JACKSONVILLE', 'ONE STOP CONSTRUCTORS'],
    photos: ['data:image/svg+xml;charset=UTF-8,INLINE_JACKSONVILLE_PLACEHOLDER'],
  },
];

function normalizePhotoFingerprint(photo) {
  if (!photo || typeof photo !== 'string') return '';
  if (photo.startsWith('data:image/')) return photo.slice(0, 120);
  try {
    const parsed = new URL(photo);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return photo.split('?')[0]?.replace(/\/+$/, '').toLowerCase() ?? '';
  }
}

function filterOutStockPhotos(photos) {
  return photos.filter((photo) => {
    const normalized = readText(photo).toLowerCase();
    if (!normalized) return false;
    if (!normalized.startsWith('http') && !normalized.startsWith('data:image/')) return false;
    return !STOCK_PHOTO_DOMAINS.some((domain) => normalized.includes(domain));
  });
}

function dedupePhotos(photos) {
  return Array.from(new Set(photos.filter((photo) => typeof photo === 'string' && photo.length > 5)));
}

function getDealSearchString(deal) {
  return `${readText(deal?.title)} ${readText(deal?.projectName)} ${readText(deal?.project_name)}`.toUpperCase();
}

function sanitizeDealPhotosForDealLocal(deal, photos) {
  const filtered = dedupePhotos(filterOutStockPhotos(photos));
  if (filtered.length === 0) return [];
  const searchStr = getDealSearchString(deal);
  const matchedEntries = FALLBACK_REGISTRY.filter((entry) => entry.keywords.some((keyword) => searchStr.includes(keyword)));
  const allowedFingerprints = new Set();
  const blockedFingerprints = new Map();

  for (const entry of matchedEntries) {
    for (const photo of entry.photos) {
      const fingerprint = normalizePhotoFingerprint(photo);
      if (fingerprint) allowedFingerprints.add(fingerprint);
    }
  }

  for (const entry of FALLBACK_REGISTRY) {
    if (matchedEntries.some((matched) => matched.id === entry.id)) continue;
    for (const photo of entry.photos) {
      const fingerprint = normalizePhotoFingerprint(photo);
      if (fingerprint && !allowedFingerprints.has(fingerprint)) blockedFingerprints.set(fingerprint, entry.id);
    }
  }

  return filtered.filter((photo) => {
    if (!photo.startsWith('http')) return true;
    const fingerprint = normalizePhotoFingerprint(photo);
    const blockedBy = blockedFingerprints.get(fingerprint);
    if (!blockedBy || allowedFingerprints.has(fingerprint)) return true;
    return false;
  });
}

function appendPhotoVersion(photoUrl, version) {
  if (!version || !photoUrl.startsWith('http')) return photoUrl;
  try {
    const parsedUrl = new URL(photoUrl);
    parsedUrl.searchParams.set('ivxv', version);
    return parsedUrl.toString();
  } catch {
    const joiner = photoUrl.includes('?') ? '&' : '?';
    return `${photoUrl}${joiner}ivxv=${encodeURIComponent(version)}`;
  }
}

function buildCanonicalCardSnapshotLocal(sourceDeal) {
  const identity = resolveCanonicalIdentityLocal(sourceDeal);
  const photoVersion = readText(sourceDeal?.updatedAt)
    || readText(sourceDeal?.updated_at)
    || readText(sourceDeal?.publishedAt)
    || readText(sourceDeal?.published_at)
    || readText(sourceDeal?.createdAt)
    || readText(sourceDeal?.created_at);
  const photos = sanitizeDealPhotosForDealLocal({
    title: identity.title,
    projectName: identity.projectName,
    project_name: identity.projectName,
  }, parseMaybeJsonArray(sourceDeal?.photos)
    .map((photo) => readText(photo))
    .filter((photo) => photo.length > 0 && (photo.startsWith('https://') || photo.startsWith('http://')) && !photo.startsWith('data:image/')))
    .map((photo) => appendPhotoVersion(photo, photoVersion));

  return {
    title: identity.title,
    projectName: identity.projectName,
    developerName: identity.developerName,
    photos,
    photosCount: photos.length,
  };
}

function buildStrictJacksonvilleTrace(sourceDeal, publicDeal, landingDeal, directDeal) {
  if (!sourceDeal) {
    return {
      matched: false,
      source: null,
      canonical: null,
      publicPublished: publicDeal ? summarizeDealFields(publicDeal) : null,
      publicLanding: landingDeal ? summarizeDealFields(landingDeal) : null,
      directLanding: directDeal ? summarizeDealFields(directDeal) : null,
    };
  }

  const canonicalIdentity = resolveCanonicalIdentityLocal(sourceDeal);
  const canonicalCard = buildCanonicalCardSnapshotLocal(sourceDeal);
  const publicPublishedPhotos = pickPhotos(publicDeal);
  const publicLandingPhotos = pickPhotos(landingDeal);
  const directLandingPhotos = pickPhotos(directDeal);

  return {
    matched: true,
    source: {
      id: readText(sourceDeal?.id),
      rawTitle: readText(sourceDeal?.title),
      rawName: readText(sourceDeal?.name),
      rawProjectName: readText(sourceDeal?.projectName) || readText(sourceDeal?.project_name),
      rawDeveloperName: readText(sourceDeal?.developerName) || readText(sourceDeal?.developer_name),
      city: readText(sourceDeal?.city),
      state: readText(sourceDeal?.state),
      rawPhotos: pickPhotos(sourceDeal),
    },
    canonical: {
      title: canonicalIdentity.title,
      projectName: canonicalIdentity.projectName,
      developerName: canonicalIdentity.developerName,
      cardTitle: canonicalCard.title,
      cardProjectName: canonicalCard.projectName,
      cardDeveloperName: canonicalCard.developerName,
      cardPhotos: canonicalCard.photos,
      cardPhotosCount: canonicalCard.photos.length,
    },
    publicPublished: publicDeal ? {
      id: readText(publicDeal?.id),
      title: readText(publicDeal?.title),
      projectName: readText(publicDeal?.projectName) || readText(publicDeal?.project_name),
      developerName: readText(publicDeal?.developerName) || readText(publicDeal?.developer_name),
      photos: publicPublishedPhotos,
      photosCount: publicPublishedPhotos.length,
    } : null,
    publicLanding: landingDeal ? {
      id: readText(landingDeal?.id),
      title: readText(landingDeal?.title),
      projectName: readText(landingDeal?.projectName) || readText(landingDeal?.project_name),
      developerName: readText(landingDeal?.developerName) || readText(landingDeal?.developer_name),
      photos: publicLandingPhotos,
      photosCount: publicLandingPhotos.length,
    } : null,
    directLanding: directDeal ? {
      id: readText(directDeal?.id),
      title: readText(directDeal?.title),
      projectName: readText(directDeal?.projectName) || readText(directDeal?.project_name),
      developerName: readText(directDeal?.developerName) || readText(directDeal?.developer_name),
      photos: directLandingPhotos,
      photosCount: directLandingPhotos.length,
    } : null,
    comparisons: {
      publishedMatchesCanonicalTitle: readText(publicDeal?.title) === canonicalCard.title,
      publishedMatchesCanonicalProjectName: (readText(publicDeal?.projectName) || readText(publicDeal?.project_name)) === canonicalCard.projectName,
      publishedMatchesCanonicalDeveloperName: (readText(publicDeal?.developerName) || readText(publicDeal?.developer_name)) === canonicalCard.developerName,
      landingMatchesCanonicalTitle: readText(landingDeal?.title) === canonicalCard.title,
      landingMatchesCanonicalProjectName: (readText(landingDeal?.projectName) || readText(landingDeal?.project_name)) === canonicalCard.projectName,
      landingMatchesCanonicalDeveloperName: (readText(landingDeal?.developerName) || readText(landingDeal?.developer_name)) === canonicalCard.developerName,
      publishedMatchesCanonicalPhotos: JSON.stringify(publicPublishedPhotos.map(normalizePhotoFingerprint)) === JSON.stringify(canonicalCard.photos.map(normalizePhotoFingerprint)),
      landingMatchesCanonicalPhotos: JSON.stringify(publicLandingPhotos.map(normalizePhotoFingerprint)) === JSON.stringify(canonicalCard.photos.map(normalizePhotoFingerprint)),
    },
  };
}

async function inspectJacksonvilleRecord() {
  const sourceUrl = `${(process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')}/rest/v1/jv_deals?select=*&limit=200&order=display_order.asc.nullslast&order=published_at.desc.nullslast&order=updated_at.desc.nullslast&order=created_at.desc.nullslast`;
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const publicUrl = `${PUBLIC_BASE_URL}/api/published-jv-deals`;
  const landingUrl = `${PUBLIC_BASE_URL}/api/landing-deals`;
  const directBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');
  const directLandingUrl = directBaseUrl ? `${directBaseUrl}/api/landing-deals` : '';

  const details = [];
  const risks = [];
  const snapshots = {};

  if (!sourceUrl.startsWith('https://') || !anonKey) {
    risks.push('Jacksonville audit could not query source-of-truth because Supabase env is missing.');
    return buildResult('jacksonville_record_trace', false, details, risks, { snapshots });
  }

  try {
    const sourceResponse = await fetchWithTimeout(sourceUrl, {
      headers: {
        Accept: 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'user-agent': 'IVXInvestorCtaAudit/1.0',
      },
    });
    const sourceRows = await sourceResponse.json();
    const sourceMatches = Array.isArray(sourceRows) ? sourceRows.filter(matchesJacksonvilleDeal) : [];
    const primarySourceMatch = sourceMatches[0] || null;
    snapshots.source = sourceMatches.map(summarizeDealFields);
    details.push(sourceMatches.length > 0
      ? `Source-of-truth currently exposes ${String(sourceMatches.length)} Jacksonville candidate row(s).`
      : 'Source-of-truth currently exposes no Jacksonville candidate rows.');

    const publicResponse = await fetchWithTimeout(publicUrl, {
      headers: { Accept: 'application/json', 'user-agent': 'IVXInvestorCtaAudit/1.0' },
    });
    const publicPayload = await publicResponse.json();
    const publicDeals = Array.isArray(publicPayload?.deals) ? publicPayload.deals : Array.isArray(publicPayload) ? publicPayload : [];
    const publicMatches = publicDeals.filter(matchesJacksonvilleDeal);
    const primaryPublicMatch = publicMatches[0] || null;
    snapshots.publicPublishedDeals = publicMatches.map(summarizeDealFields);
    details.push(publicMatches.length > 0
      ? `Public published deals endpoint exposes ${String(publicMatches.length)} Jacksonville card(s).`
      : 'Public published deals endpoint exposes no Jacksonville card.');

    const landingResponse = await fetchWithTimeout(landingUrl, {
      headers: { Accept: 'application/json', 'user-agent': 'IVXInvestorCtaAudit/1.0' },
    });
    const landingPayload = await landingResponse.json();
    const landingDeals = Array.isArray(landingPayload?.deals) ? landingPayload.deals : Array.isArray(landingPayload) ? landingPayload : [];
    const landingMatches = landingDeals.filter(matchesJacksonvilleDeal);
    const primaryLandingMatch = landingMatches[0] || null;
    snapshots.publicLandingDeals = landingMatches.map(summarizeDealFields);
    details.push(landingMatches.length > 0
      ? `Public landing deals endpoint exposes ${String(landingMatches.length)} Jacksonville card(s).`
      : 'Public landing deals endpoint exposes no Jacksonville card.');

    let primaryDirectMatch = null;
    if (directLandingUrl) {
      const directResponse = await fetchWithTimeout(directLandingUrl, {
        headers: { Accept: 'application/json', 'user-agent': 'IVXInvestorCtaAudit/1.0' },
      });
      const directPayload = await directResponse.json();
      const directDeals = Array.isArray(directPayload?.deals) ? directPayload.deals : Array.isArray(directPayload) ? directPayload : [];
      const directMatches = directDeals.filter(matchesJacksonvilleDeal);
      primaryDirectMatch = directMatches[0] || null;
      snapshots.directLandingDeals = directMatches.map(summarizeDealFields);
      details.push(directMatches.length > 0
        ? `Direct landing deals endpoint exposes ${String(directMatches.length)} Jacksonville card(s).`
        : 'Direct landing deals endpoint exposes no Jacksonville card.');
    }

    snapshots.strictTrace = buildStrictJacksonvilleTrace(primarySourceMatch, primaryPublicMatch, primaryLandingMatch, primaryDirectMatch);

    if (snapshots.strictTrace?.matched) {
      const trace = snapshots.strictTrace;
      details.push(`Strict trace title path: source raw title="${trace.source?.rawTitle || ''}" name="${trace.source?.rawName || ''}" -> canonical title="${trace.canonical?.cardTitle || ''}" -> public title="${trace.publicPublished?.title || ''}".`);
      details.push(`Strict trace project path: source raw project="${trace.source?.rawProjectName || ''}" -> canonical project="${trace.canonical?.cardProjectName || ''}" -> public project="${trace.publicPublished?.projectName || ''}".`);
      details.push(`Strict trace developer path: source raw developer="${trace.source?.rawDeveloperName || ''}" -> canonical developer="${trace.canonical?.cardDeveloperName || ''}" -> public developer="${trace.publicPublished?.developerName || ''}".`);
      details.push(`Strict trace photo path: source raw count=${String(trace.source?.rawPhotos?.length || 0)} -> canonical card count=${String(trace.canonical?.cardPhotosCount || 0)} -> public count=${String(trace.publicPublished?.photosCount || 0)}.`);
    }

    if ((snapshots.source?.length || 0) === 0 && (snapshots.publicPublishedDeals?.length || 0) === 0 && (snapshots.publicLandingDeals?.length || 0) === 0) {
      details.push('End-to-end result: Jacksonville is absent from source-of-truth and absent from the live public mirrored payloads.');
    }

    if ((snapshots.source?.length || 0) === 0 && ((snapshots.publicPublishedDeals?.length || 0) > 0 || (snapshots.publicLandingDeals?.length || 0) > 0)) {
      risks.push('Jacksonville is absent from source-of-truth but still present in a live mirrored payload.');
    }

    if ((snapshots.source?.length || 0) > 0 && ((snapshots.publicPublishedDeals?.length || 0) === 0 || (snapshots.publicLandingDeals?.length || 0) === 0)) {
      risks.push('Jacksonville still exists in source-of-truth but is missing from one or more live public payloads.');
    }

    const strictTrace = snapshots.strictTrace;
    if (strictTrace?.matched) {
      if (!strictTrace.comparisons?.publishedMatchesCanonicalTitle) {
        risks.push('Jacksonville public published title does not match canonical mapped title.');
      }
      if (!strictTrace.comparisons?.publishedMatchesCanonicalProjectName) {
        risks.push('Jacksonville public published project name does not match canonical mapped project name.');
      }
      if (!strictTrace.comparisons?.publishedMatchesCanonicalDeveloperName) {
        risks.push('Jacksonville public published developer line does not match canonical mapped developer line.');
      }
      if (!strictTrace.comparisons?.publishedMatchesCanonicalPhotos) {
        risks.push('Jacksonville public published photos do not match canonical mapped photos.');
      }
      if (!strictTrace.comparisons?.landingMatchesCanonicalTitle) {
        risks.push('Jacksonville public landing title does not match canonical mapped title.');
      }
      if (!strictTrace.comparisons?.landingMatchesCanonicalProjectName) {
        risks.push('Jacksonville public landing project name does not match canonical mapped project name.');
      }
      if (!strictTrace.comparisons?.landingMatchesCanonicalDeveloperName) {
        risks.push('Jacksonville public landing developer line does not match canonical mapped developer line.');
      }
      if (!strictTrace.comparisons?.landingMatchesCanonicalPhotos) {
        risks.push('Jacksonville public landing photos do not match canonical mapped photos.');
      }
    }

    const ok = risks.length === 0;
    return buildResult('jacksonville_record_trace', ok, details, risks, { snapshots });
  } catch (error) {
    return buildResult('jacksonville_record_trace', false, ['Unable to trace Jacksonville record end-to-end.'], [error instanceof Error ? error.message : 'request failed'], { snapshots });
  }
}

function hasPattern(text, regex) {
  return regex.test(text);
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function buildResult(name, ok, details, risks = [], extra = {}) {
  return {
    name,
    ok,
    details,
    risks,
    ...extra,
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectLiveLanding() {
  const url = `${PUBLIC_BASE_URL}/`;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'user-agent': 'IVXInvestorCtaAudit/1.0',
      },
    });
    const html = await response.text();
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const lowerHtml = html.toLowerCase();
    const ctaCount = countMatches(html, /<(a|button)\b/gi);
    const formCount = countMatches(html, /<form\b/gi);
    const visibleInvestorWords = ['invest', 'member', 'deal', 'owner'].filter((token) => lowerHtml.includes(token));
    const details = [
      response.ok ? `Live landing responded with HTTP ${response.status}.` : `Live landing responded with HTTP ${response.status}.`,
      contentType ? `Live landing content-type is ${contentType}.` : 'Live landing content-type header missing.',
      `Detected ${String(ctaCount)} CTA-like elements and ${String(formCount)} forms in live HTML.`,
      visibleInvestorWords.length > 0 ? `Live HTML markers present: ${visibleInvestorWords.join(', ')}.` : 'No expected investor markers found in live HTML.',
    ];
    const risks = [];
    if (!response.ok) risks.push('Live landing did not return an OK response.');
    if (!contentType.includes('text/html')) risks.push(`Unexpected content-type on live landing: ${contentType || 'unknown'}.`);
    if (ctaCount < 3) risks.push('Too few CTA/button elements detected in live landing HTML.');
    if (formCount < 1) risks.push('No form element detected in live landing HTML.');

    return buildResult('live_landing_surface', risks.length === 0, details, risks, {
      url,
      status: response.status,
      ctaCount,
      formCount,
    });
  } catch (error) {
    return buildResult('live_landing_surface', false, ['Unable to inspect live landing HTML.'], [error instanceof Error ? error.message : 'request failed'], {
      url,
      status: 0,
      ctaCount: 0,
      formCount: 0,
    });
  }
}

async function inspectInvestorCtaCode() {
  const landingSource = await readFile(resolve(PROJECT_ROOT, 'app/landing.tsx'), 'utf8');
  const intakeSource = await readFile(resolve(PROJECT_ROOT, 'components/InvestorIntakeForm.tsx'), 'utf8');
  const waitlistSource = await readFile(resolve(PROJECT_ROOT, 'lib/waitlist-service.ts'), 'utf8');

  const details = [];
  const risks = [];

  const landingUsesInvestorIntake = hasPattern(landingSource, /function\s+LandingWaitlistForm\s*\([\s\S]*?<InvestorIntakeForm[\s\S]*variant="landing"[\s\S]*source="landing_page"/);
  details.push(landingUsesInvestorIntake
    ? 'Landing CTA surface mounts InvestorIntakeForm in landing mode.'
    : 'Landing CTA surface does not clearly mount InvestorIntakeForm in landing mode.');

  const intakeRequiresOtpBeforeSubmit = hasPattern(intakeSource, /if\s*\(!phoneVerified\)\s*\{[\s\S]*Please verify your cell number with OTP first\./);
  details.push(intakeRequiresOtpBeforeSubmit
    ? 'Investor intake blocks submit until OTP verification is complete.'
    : 'Investor intake does not clearly block submit on OTP verification.');

  const intakeRequiresCompliance = hasPattern(intakeSource, /if\s*\(!identityReviewAccepted\)[\s\S]*if\s*\(!taxResponsibilityAccepted\)[\s\S]*if\s*\(isCorporate\s*&&\s*!entityAuthorityAccepted\)/);
  details.push(intakeRequiresCompliance
    ? 'Investor intake blocks submit until compliance acknowledgements are accepted.'
    : 'Investor intake compliance gating is incomplete.');

  const intakeSubmitCallsWaitlist = hasPattern(intakeSource, /const\s+result\s*=\s*await\s+submitWaitlistEntry\(/);
  details.push(intakeSubmitCallsWaitlist
    ? 'Investor intake submits through submitWaitlistEntry().' 
    : 'Investor intake does not clearly submit through submitWaitlistEntry().');

  const intakeSuccessNeedsPersistedId = hasPattern(intakeSource, /if\s*\(!result\.success\s*\|\|\s*!result\.confirmedWrite\s*\|\|\s*!result\.persistedId\)/)
    && hasPattern(intakeSource, /onSuccess:\s*\(result\)\s*=>\s*\{[\s\S]*setSubmitted\(true\)/);
  details.push(intakeSuccessNeedsPersistedId
    ? 'Investor intake success UI only renders after success + confirmedWrite + persistedId.'
    : 'Investor intake success UI is not clearly gated on confirmed persisted write evidence.');

  const waitlistValidatesInputs = hasPattern(waitlistSource, /if\s*\(!validateFullName\(data\.full_name\)\)/)
    && hasPattern(waitlistSource, /if\s*\(!validateEmail\(data\.email\)\)/)
    && hasPattern(waitlistSource, /if\s*\(!validatePhone\(data\.phone\)\)/)
    && hasPattern(waitlistSource, /if\s*\(!data\.phone_verified\)/);
  details.push(waitlistValidatesInputs
    ? 'Persistence layer re-validates name, email, phone, and phone_verified before insert.'
    : 'Persistence layer input validation is incomplete.');

  const waitlistRequiresRowId = hasPattern(waitlistSource, /\.from\('waitlist_entries'\)[\s\S]*\.select\('id'\)[\s\S]*\.maybeSingle\(\)/)
    && hasPattern(waitlistSource, /if\s*\(!insertedEntry\?\.id\)/)
    && hasPattern(waitlistSource, /confirmedWrite:\s*true,[\s\S]*persistedTable:\s*'waitlist_entries',[\s\S]*persistedId:\s*insertedEntry\.id/);
  details.push(waitlistRequiresRowId
    ? 'Primary waitlist_entries path only returns success after Supabase returns a persisted row id.'
    : 'Primary waitlist_entries path is not clearly proving a persisted row id.');

  const legacyFallbackRequiresRowId = hasPattern(waitlistSource, /async function submitToLegacyWaitlist/) 
    && hasPattern(waitlistSource, /\.from\('waitlist'\)[\s\S]*\.select\('id'\)[\s\S]*\.maybeSingle\(\)/)
    && hasPattern(waitlistSource, /if\s*\(!insertedLegacyRow\?\.id\)/)
    && hasPattern(waitlistSource, /confirmedWrite:\s*true,[\s\S]*persistedTable:\s*'waitlist',[\s\S]*persistedId:\s*insertedLegacyRow\.id/);
  details.push(legacyFallbackRequiresRowId
    ? 'Legacy waitlist fallback also requires a persisted row id before success.'
    : 'Legacy waitlist fallback is not clearly proving a persisted row id.');

  const uploadFailureFallsBack = hasPattern(waitlistSource, /uploadInvestorIntakeFile[\s\S]*return file;/);
  if (uploadFailureFallsBack) {
    risks.push('Human-risk: document upload failure is non-blocking; a lead can persist even if proof/ID files did not reach storage.');
  }

  const confirmationEmailAsync = hasPattern(waitlistSource, /void\s+sendConfirmationEmail\(data\.full_name,\s*data\.email\)/);
  if (confirmationEmailAsync) {
    risks.push('Human-risk: confirmation email is best-effort and async; saved leads may exist without the investor receiving email confirmation.');
  }

  const otpDependsOnSupabase = hasPattern(waitlistSource, /supabase\.auth\.signInWithOtp\(/)
    && hasPattern(waitlistSource, /supabase\.auth\.verifyOtp\(/);
  if (otpDependsOnSupabase) {
    risks.push('Human-risk: the path depends on real Supabase SMS delivery and verifyOtp behavior, which this terminal cannot prove with a real phone.');
  }

  const localBrowserAssumptions = hasPattern(intakeSource, /Platform\.OS\s*===\s*'web'[\s\S]*window\.location\.search/);
  if (localBrowserAssumptions) {
    risks.push('Human-risk: web attribution and real-browser behavior still depend on actual browser/runtime conditions outside this terminal.');
  }

  const ok = landingUsesInvestorIntake
    && intakeRequiresOtpBeforeSubmit
    && intakeRequiresCompliance
    && intakeSubmitCallsWaitlist
    && intakeSuccessNeedsPersistedId
    && waitlistValidatesInputs
    && waitlistRequiresRowId
    && legacyFallbackRequiresRowId;

  return buildResult('investor_cta_code_trace', ok, details, risks, {
    files: [
      'app/landing.tsx',
      'components/InvestorIntakeForm.tsx',
      'lib/waitlist-service.ts',
    ],
  });
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printResult(result) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
  if (typeof result.url === 'string') console.log(`  url: ${result.url}`);
  if (typeof result.status === 'number') console.log(`  status: ${result.status}`);
  if (Array.isArray(result.files) && result.files.length > 0) console.log(`  files: ${result.files.join(', ')}`);
  result.details.forEach((detail) => console.log(`  detail: ${detail}`));
  if (result.risks.length > 0) {
    result.risks.forEach((risk) => console.log(`  risk: ${risk}`));
  }
}

async function main() {
  console.log('[InvestorCTAAudit] Starting strict investor CTA audit...');
  console.log(`[InvestorCTAAudit] base url: ${PUBLIC_BASE_URL}`);

  const [liveLandingResult, codeTraceResult, jacksonvilleTraceResult] = await Promise.all([
    inspectLiveLanding(),
    inspectInvestorCtaCode(),
    inspectJacksonvilleRecord(),
  ]);

  printSection('Live landing evidence');
  printResult(liveLandingResult);

  printSection('Investor CTA code trace');
  printResult(codeTraceResult);

  printSection('Jacksonville record trace');
  printResult(jacksonvilleTraceResult);
  if (jacksonvilleTraceResult.snapshots && typeof jacksonvilleTraceResult.snapshots === 'object') {
    console.log('  snapshots:', JSON.stringify(jacksonvilleTraceResult.snapshots, null, 2));
  }

  printSection('Manual verification still required');
  const checklist = [
    'Submit one real investor intake on a real phone and confirm the SMS OTP is delivered and accepted.',
    'Confirm the persisted lead actually appears in admin waitlist review with the expected email, phone, and compliance fields.',
    'If you use proof-of-funds or ID uploads, confirm the uploaded file URLs open correctly from admin review.',
    'Confirm the investor receives the expected confirmation email/SMS follow-up in the real mailbox/phone.',
  ];
  checklist.forEach((item, index) => console.log(`${index + 1}. ${item}`));

  const failedResults = [liveLandingResult, codeTraceResult, jacksonvilleTraceResult].filter((result) => !result.ok);
  printSection('Summary');
  if (failedResults.length === 0) {
    console.log('PASS strict investor CTA code-side audit is green.');
    if (codeTraceResult.risks.length > 0) {
      console.log(`OPEN HUMAN RISKS ${String(codeTraceResult.risks.length)} items still require manual proof.`);
    }
  } else {
    console.log(`FAIL ${String(failedResults.length)} checks failed.`);
    failedResults.forEach((result) => console.log(`- ${result.name}`));
    process.exitCode = 2;
  }
}

void main();
