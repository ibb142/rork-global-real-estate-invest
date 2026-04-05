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

let _storagePhotoCache: Map<string, { photos: string[]; fetchedAt: number }> = new Map();
const STORAGE_CACHE_TTL = 5 * 60 * 1000;

export async function fetchPhotosFromStorageBucket(dealId: string): Promise<string[]> {
  if (!dealId) return [];

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
      console.log('[DealPhotos] Storage list failed:', res.status, 'for deal:', dealId);
      return [];
    }
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
}

export function getCasaRosarioPhotos(): string[] {
  return CASA_ROSARIO_PHOTOS;
}

export function getPerezResidencePhotos(): string[] {
  return PEREZ_RESIDENCE_PHOTOS;
}

interface FallbackMatch {
  keywords: string[];
  photos: string[];
}

const FALLBACK_REGISTRY: FallbackMatch[] = [
  { keywords: ['CASA ROSARIO', 'ONE STOP DEVELOPMENT TWO'], photos: CASA_ROSARIO_PHOTOS },
  { keywords: ['PEREZ RESIDENCE', 'PEREZ'], photos: PEREZ_RESIDENCE_PHOTOS },
  { keywords: ['JACKSONVILLE PRIME', 'IVX JACKSONVILLE', 'ONE STOP CONSTRUCTORS'], photos: CASA_ROSARIO_PHOTOS },
];

export function getFallbackPhotosForDeal(deal: { title?: string; projectName?: string; project_name?: string }): string[] {
  const searchStr = (
    (deal.title || '') + ' ' + (deal.projectName || '') + ' ' + (deal.project_name || '')
  ).toUpperCase();

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
