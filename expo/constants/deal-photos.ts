export const CASA_ROSARIO_PHOTOS: string[] = [
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/junpisw15h6borglpbckz',
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/2s8bcg6npyx96xcfrr5rm',
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t8rc86kynbs64jopcujtf',
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/bxqj57n0z60oqoxaqvnlo',
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/idr3twi8x1q8skiyl9sm7',
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/q28qwxwmig7m8qr5m83jh',
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/p6gks5os79lycfghdkupz',
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/g9g9wbb8r1epd4hc9qifl',
];

export const PEREZ_RESIDENCE_PHOTOS: string[] = [
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/junpisw15h6borglpbckz',
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/2s8bcg6npyx96xcfrr5rm',
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t8rc86kynbs64jopcujtf',
  'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/bxqj57n0z60oqoxaqvnlo',
];

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createInlineDealPlaceholder(title: string, subtitle: string): string {
  const safeTitle = escapeSvgText(title);
  const safeSubtitle = escapeSvgText(subtitle);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#050505" />
        <stop offset="100%" stop-color="#171717" />
      </linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#bg)" />
    <rect x="52" y="52" width="1496" height="796" rx="34" fill="#101010" stroke="#5E4E17" stroke-width="3" />
    <text x="120" y="170" fill="#FFD700" font-size="42" font-family="Arial, Helvetica, sans-serif" font-weight="700" letter-spacing="6">IVX HOLDINGS</text>
    <text x="120" y="426" fill="#FFFFFF" font-size="82" font-family="Arial, Helvetica, sans-serif" font-weight="800">${safeTitle}</text>
    <text x="120" y="496" fill="#A3A3A3" font-size="38" font-family="Arial, Helvetica, sans-serif">${safeSubtitle}</text>
    <text x="120" y="620" fill="#ECECEC" font-size="34" font-family="Arial, Helvetica, sans-serif">Verified media pending publication.</text>
    <text x="120" y="674" fill="#ECECEC" font-size="34" font-family="Arial, Helvetica, sans-serif">Fallback photos are intentionally disabled to prevent mismatched property imagery.</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const JACKSONVILLE_PRIME_PHOTOS: string[] = [
  createInlineDealPlaceholder('IVX JACKSONVILLE PRIME', 'Jacksonville, FL'),
];

let _storagePhotoCache: Map<string, { photos: string[]; fetchedAt: number }> = new Map();
const STORAGE_CACHE_TTL = 5 * 60 * 1000;
let _dealPhotosBucketKnownMissing = false;
let _dealPhotosBucketLoggedMissing = false;

export async function fetchPhotosFromStorageBucket(dealId: string): Promise<string[]> {
  if (!dealId) return [];
  if (_dealPhotosBucketKnownMissing) {
    if (!_dealPhotosBucketLoggedMissing) {
      console.log('[DealPhotos] deal-photos bucket unavailable — skipping storage photo recovery');
      _dealPhotosBucketLoggedMissing = true;
    }
    return [];
  }

  const cached = _storagePhotoCache.get(dealId);
  if (cached && Date.now() - cached.fetchedAt < STORAGE_CACHE_TTL) {
    return cached.photos;
  }

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseKey) return [];

  try {
    const listUrl = `${supabaseUrl}/storage/v1/object/list/deal-photos`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(listUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: dealId + '/', limit: 50, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) {
        const errorText = await res.text().catch(() => '');
        if (errorText.toLowerCase().includes('bucket not found')) {
          _dealPhotosBucketKnownMissing = true;
          console.log('[DealPhotos] deal-photos bucket not found — disabling storage photo recovery');
          return [];
        }
      }
      console.log('[DealPhotos] Storage list failed:', res.status, 'for deal:', dealId);
      return [];
    }
    _dealPhotosBucketKnownMissing = false;
    const files = await res.json() as Array<{ name: string; id?: string }>;
    if (!Array.isArray(files) || files.length === 0) return [];
    const photos = files
      .filter(f => f.name && /\.(jpg|jpeg|png|webp|heic)$/i.test(f.name))
      .map(f => `${supabaseUrl}/storage/v1/object/public/deal-photos/${dealId}/${f.name}`);
    if (photos.length > 0) {
      console.log('[DealPhotos] Found', photos.length, 'photos in Storage bucket for deal:', dealId);
      _storagePhotoCache.set(dealId, { photos, fetchedAt: Date.now() });
    }
    return photos;
  } catch (err) {
    console.log('[DealPhotos] Storage bucket fetch error for', dealId, ':', (err as Error)?.message);
    return [];
  }
}

export function clearStoragePhotoCache(): void {
  _storagePhotoCache.clear();
  _dealPhotosBucketKnownMissing = false;
  _dealPhotosBucketLoggedMissing = false;
}

export function getCasaRosarioPhotos(): string[] {
  return CASA_ROSARIO_PHOTOS;
}

export function getPerezResidencePhotos(): string[] {
  return PEREZ_RESIDENCE_PHOTOS;
}

interface DealPhotoIdentity {
  title?: string;
  projectName?: string;
  project_name?: string;
}

interface FallbackMatch {
  id: string;
  keywords: string[];
  photos: string[];
}

const FALLBACK_REGISTRY: FallbackMatch[] = [
  { id: 'casa_rosario', keywords: ['CASA ROSARIO', 'ONE STOP DEVELOPMENT TWO'], photos: CASA_ROSARIO_PHOTOS },
  { id: 'perez_residence', keywords: ['PEREZ RESIDENCE', 'PEREZ'], photos: PEREZ_RESIDENCE_PHOTOS },
  { id: 'jacksonville_prime', keywords: ['JACKSONVILLE PRIME', 'IVX JACKSONVILLE', 'ONE STOP CONSTRUCTORS'], photos: JACKSONVILLE_PRIME_PHOTOS },
];

function getDealSearchString(deal: DealPhotoIdentity): string {
  return (
    (deal.title || '') + ' ' + (deal.projectName || '') + ' ' + (deal.project_name || '')
  ).toUpperCase();
}

function normalizePhotoFingerprint(photo: string): string {
  if (!photo || typeof photo !== 'string') return '';
  if (photo.startsWith('data:image/')) {
    return photo.slice(0, 120);
  }

  try {
    const parsed = new URL(photo);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return photo.split('?')[0]?.replace(/\/+$/, '').toLowerCase() ?? '';
  }
}

function dedupePhotos(photos: string[]): string[] {
  return Array.from(new Set(photos.filter((photo) => typeof photo === 'string' && photo.length > 5)));
}

function getMatchingFallbackEntries(searchStr: string): FallbackMatch[] {
  return FALLBACK_REGISTRY.filter((entry) => entry.keywords.some((keyword) => searchStr.includes(keyword)));
}

export function sanitizeDealPhotosForDeal(deal: DealPhotoIdentity, photos: string[]): string[] {
  const filtered = dedupePhotos(filterOutStockPhotos(photos));
  if (filtered.length === 0) return [];

  const searchStr = getDealSearchString(deal);
  const matchedEntries = getMatchingFallbackEntries(searchStr);
  const allowedFingerprints = new Set<string>();
  const blockedFingerprints = new Map<string, string>();

  for (const entry of matchedEntries) {
    for (const photo of entry.photos) {
      const fingerprint = normalizePhotoFingerprint(photo);
      if (fingerprint) {
        allowedFingerprints.add(fingerprint);
      }
    }
  }

  for (const entry of FALLBACK_REGISTRY) {
    if (matchedEntries.some((matched) => matched.id === entry.id)) continue;
    for (const photo of entry.photos) {
      const fingerprint = normalizePhotoFingerprint(photo);
      if (fingerprint && !allowedFingerprints.has(fingerprint)) {
        blockedFingerprints.set(fingerprint, entry.id);
      }
    }
  }

  return filtered.filter((photo) => {
    if (!photo.startsWith('http')) return true;
    const fingerprint = normalizePhotoFingerprint(photo);
    const blockedBy = blockedFingerprints.get(fingerprint);
    if (!blockedBy || allowedFingerprints.has(fingerprint)) return true;
    console.log('[DealPhotos] BLOCKED cross-mapped photo for deal:', searchStr || 'unknown', '| blockedBy:', blockedBy, '| photo:', photo.substring(0, 120));
    return false;
  });
}

export function getFallbackPhotosForDeal(deal: DealPhotoIdentity): string[] {
  const searchStr = getDealSearchString(deal);

  for (const entry of FALLBACK_REGISTRY) {
    for (const kw of entry.keywords) {
      if (searchStr.includes(kw) && entry.photos.length > 0) {
        console.log('[DealPhotos] Fallback matched:', kw, '→', entry.photos.length, 'photos');
        return entry.photos;
      }
    }
  }
  return [];
}

export const STOCK_PHOTO_DOMAINS = [
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

export function isStockPhoto(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return STOCK_PHOTO_DOMAINS.some(domain => lower.includes(domain));
}

export function filterOutStockPhotos(photos: string[]): string[] {
  if (!Array.isArray(photos)) return [];
  const filtered = photos.filter(p => {
    if (typeof p !== 'string' || p.length <= 5) return false;
    if (!p.startsWith('http') && !p.startsWith('data:image/')) return false;
    if (isStockPhoto(p)) {
      console.log('[DealPhotos] BLOCKED stock photo:', p.substring(0, 80));
      return false;
    }
    return true;
  });
  return filtered;
}
