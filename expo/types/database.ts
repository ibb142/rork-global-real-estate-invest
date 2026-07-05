export interface WalletRow {
  id: string;
  user_id: string;
  available: number;
  pending: number;
  invested: number;
  total: number;
  currency: string;
  created_at?: string;
  updated_at?: string;
}

export interface HoldingRow {
  id: string;
  user_id: string;
  property_id: string;
  shares: number;
  avg_cost_basis: number;
  current_value: number;
  total_return: number;
  total_return_percent: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  purchase_date?: string;
  created_at?: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  description: string;
  property_id?: string;
  property_name?: string;
  created_at?: string;
}

export interface ProfileRow {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  country?: string;
  avatar?: string;
  kyc_status?: string;
  total_invested?: number;
  total_returns?: number;
  updated_at?: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at?: string;
}

export interface JVDealRow {
  id: string;
  title?: string;
  projectName?: string;
  project_name?: string;
  type?: string;
  description?: string;
  partner_name?: string;
  partner_email?: string;
  partner_phone?: string;
  partner_type?: string;
  propertyAddress?: string;
  property_address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  lot_size?: number;
  lot_size_unit?: string;
  zoning?: string;
  property_type?: string;
  totalInvestment?: number;
  total_investment?: number;
  expectedROI?: number;
  expected_roi?: number;
  estimated_value?: number;
  appraised_value?: number;
  cash_payment_percent?: number;
  collateral_percent?: number;
  partner_profit_share?: number;
  developer_profit_share?: number;
  term_months?: number;
  cash_payment_amount?: number;
  collateral_amount?: number;
  distributionFrequency?: string;
  distribution_frequency?: string;
  exitStrategy?: string;
  exit_strategy?: string;
  partners?: string | unknown[];
  poolTiers?: string | Record<string, unknown>;
  pool_tiers?: string | Record<string, unknown>;
  status?: string;
  published?: boolean;
  publishedAt?: string;
  published_at?: string;
  photos?: string | string[];
  documents?: string;
  notes?: string;
  rejection_reason?: string;
  control_disclosure_accepted?: boolean;
  control_disclosure_accepted_at?: string;
  payment_structure?: string;
  user_id?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  submitted_at?: string;
  approved_at?: string;
  completed_at?: string;
  currency?: string;
  profitSplit?: string;
  startDate?: string;
  endDate?: string;
  trashedAt?: string;
}

export interface AuditTrailRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_title?: string;
  action: string;
  user_id?: string;
  user_role?: string;
  timestamp: string;
  details?: string;
  snapshot_before?: string;
  snapshot_after?: string;
  source?: string;
}

export interface JVAuditEvent {
  action: string;
  dealId: string;
  userId: string;
  role: string;
  dealTitle?: string;
  timestamp?: string;
}

export const VALID_PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif'] as const;
export const VALID_PHOTO_MIME_PREFIXES = ['image/', 'data:image/'] as const;
export const MAX_PHOTO_URL_LENGTH = 2048;
export const MAX_PHOTOS_PER_DEAL = 50;

export function isValidPhotoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.length < 5 || url.length > MAX_PHOTO_URL_LENGTH) return false;

  const lower = url.toLowerCase().trim();
  if (lower.startsWith('data:image/')) return true;
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    const hasImageExtension = VALID_PHOTO_EXTENSIONS.some(ext => {
      const urlWithoutQuery = lower.split('?')[0];
      return urlWithoutQuery.endsWith(ext);
    });
    if (hasImageExtension) return true;
    if (lower.includes('/image') || lower.includes('unsplash') || lower.includes('cloudinary') || lower.includes('r2.dev') || lower.includes('supabase')) {
      return true;
    }
    return true;
  }

  return false;
}

export function sanitizePhotos(photos: unknown): string[] {
  if (!photos) return [];
  if (!Array.isArray(photos)) {
    if (typeof photos === 'string') {
      try {
        const parsed = JSON.parse(photos);
        if (Array.isArray(parsed)) return sanitizePhotos(parsed);
      } catch {
        return [];
      }
    }
    return [];
  }
  return photos
    .filter((p): p is string => typeof p === 'string' && isValidPhotoUrl(p))
    .slice(0, MAX_PHOTOS_PER_DEAL);
}
