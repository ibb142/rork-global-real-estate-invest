import {
  fetchPhotosFromStorageBucket,
  filterOutStockPhotos,
  getFallbackPhotosForDeal,
} from '@/constants/deal-photos';
import type { PublishedDealCardModel } from '@/lib/published-deal-card-model';

export type DealPhotoSource = 'db' | 'storage' | 'fallback' | 'none';
export type DealPhotoHealthStatus = 'healthy' | 'warning' | 'broken';

export interface DealPhotoDiagnostic {
  dealId: string;
  dealTitle: string;
  source: DealPhotoSource;
  sourceLabel: string;
  sourceDescription: string;
  status: DealPhotoHealthStatus;
  statusLabel: string;
  resolvedPhotos: string[];
  dbPhotos: string[];
  storagePhotos: string[];
  fallbackPhotos: string[];
  issues: string[];
}

interface PhotoPresentation {
  label: string;
  description: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

const PHOTO_SOURCE_PRESENTATION: Record<DealPhotoSource, PhotoPresentation> = {
  db: {
    label: 'DB',
    description: 'Images loaded directly from the published deal record.',
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderColor: 'rgba(34,197,94,0.28)',
    textColor: '#7EF7A7',
  },
  storage: {
    label: 'Storage',
    description: 'Images recovered from the deal-photos storage bucket.',
    backgroundColor: 'rgba(74,144,217,0.14)',
    borderColor: 'rgba(74,144,217,0.28)',
    textColor: '#7CC4FF',
  },
  fallback: {
    label: 'Fallback',
    description: 'Images are coming from the curated fallback registry.',
    backgroundColor: 'rgba(255,215,0,0.14)',
    borderColor: 'rgba(255,215,0,0.28)',
    textColor: '#FFD700',
  },
  none: {
    label: 'Missing',
    description: 'No usable photo source is currently available.',
    backgroundColor: 'rgba(255,77,77,0.14)',
    borderColor: 'rgba(255,77,77,0.28)',
    textColor: '#FF7D7D',
  },
};

const PHOTO_HEALTH_PRESENTATION: Record<DealPhotoHealthStatus, PhotoPresentation> = {
  healthy: {
    label: 'Healthy',
    description: 'Primary photos are available and ready for investor traffic.',
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderColor: 'rgba(34,197,94,0.28)',
    textColor: '#7EF7A7',
  },
  warning: {
    label: 'Warning',
    description: 'The landing is covered, but photo recovery should be improved.',
    backgroundColor: 'rgba(255,184,0,0.14)',
    borderColor: 'rgba(255,184,0,0.28)',
    textColor: '#FFD36A',
  },
  broken: {
    label: 'Broken',
    description: 'This deal has no usable photo path and needs attention before ads.',
    backgroundColor: 'rgba(255,77,77,0.14)',
    borderColor: 'rgba(255,77,77,0.28)',
    textColor: '#FF7D7D',
  },
};

function dedupePhotos(photos: string[]): string[] {
  return Array.from(new Set(photos.filter((photo) => typeof photo === 'string' && photo.length > 5)));
}

export function getPhotoSourcePresentation(source: DealPhotoSource): PhotoPresentation {
  return PHOTO_SOURCE_PRESENTATION[source];
}

export function getPhotoHealthPresentation(status: DealPhotoHealthStatus): PhotoPresentation {
  return PHOTO_HEALTH_PRESENTATION[status];
}

export async function diagnoseDealPhotos(card: PublishedDealCardModel): Promise<DealPhotoDiagnostic> {
  const dbPhotos = dedupePhotos(filterOutStockPhotos(Array.isArray(card.photos) ? card.photos : []));
  const storagePhotos = dbPhotos.length === 0 && card.id
    ? dedupePhotos(await fetchPhotosFromStorageBucket(card.id))
    : [];
  const fallbackPhotos = dedupePhotos(getFallbackPhotosForDeal({
    title: card.title,
    projectName: card.developerName,
  }));

  let source: DealPhotoSource = 'none';
  let resolvedPhotos: string[] = [];
  const issues: string[] = [];

  if (dbPhotos.length > 0) {
    source = 'db';
    resolvedPhotos = dbPhotos;
  } else if (storagePhotos.length > 0) {
    source = 'storage';
    resolvedPhotos = storagePhotos;
    issues.push('Primary DB photos are missing; landing is recovering from storage bucket.');
  } else if (fallbackPhotos.length > 0) {
    source = 'fallback';
    resolvedPhotos = fallbackPhotos;
    issues.push('Primary DB and storage photos are missing; landing is using fallback registry photos.');
  } else {
    issues.push('No valid photo source found in DB, storage, or fallback registry.');
  }

  if (source === 'db' && dbPhotos.length === 1) {
    issues.push('Only 1 valid DB photo is available for this deal.');
  }

  const status: DealPhotoHealthStatus = source === 'none'
    ? 'broken'
    : (source === 'db' && dbPhotos.length > 1 ? 'healthy' : 'warning');

  const sourcePresentation = getPhotoSourcePresentation(source);
  const healthPresentation = getPhotoHealthPresentation(status);

  return {
    dealId: card.id,
    dealTitle: card.title || 'Untitled Deal',
    source,
    sourceLabel: sourcePresentation.label,
    sourceDescription: sourcePresentation.description,
    status,
    statusLabel: healthPresentation.label,
    resolvedPhotos,
    dbPhotos,
    storagePhotos,
    fallbackPhotos,
    issues,
  };
}

export async function diagnoseDealsPhotos(cards: PublishedDealCardModel[]): Promise<DealPhotoDiagnostic[]> {
  const diagnostics = await Promise.all(cards.map((card) => diagnoseDealPhotos(card)));
  return diagnostics.sort((a, b) => {
    const statusRank: Record<DealPhotoHealthStatus, number> = {
      broken: 0,
      warning: 1,
      healthy: 2,
    };
    if (statusRank[a.status] !== statusRank[b.status]) {
      return statusRank[a.status] - statusRank[b.status];
    }
    return a.dealTitle.localeCompare(b.dealTitle);
  });
}
