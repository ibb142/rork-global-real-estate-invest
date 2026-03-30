/**
 * s3-config.ts — AWS S3/CloudFront configuration reference.
 *
 * WARNING: This file is a REFERENCE ONLY for backend/CI pipeline configuration.
 * No client-side code should import or use this file.
 * All S3/CloudFront operations must be performed server-side only.
 *
 * If you need to upload files, use the backend API endpoints instead.
 */

export const S3_CONFIG = {
  bucket: 'ivx-holdings-prod',
  region: 'us-east-1',
  prefix: {
    documents: 'documents/',
    images: 'images/',
    avatars: 'avatars/',
    kyc: 'kyc/',
    contracts: 'contracts/',
    backups: 'backups/',
  },
  maxFileSizeMB: 50,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowedDocumentTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  signedUrlExpiry: 3600,
  publicRead: false,
} as const;

export const CLOUDFRONT_CONFIG = {
  domainName: 'cdn.ivxholding.com',
  cachePolicy: {
    images: {
      maxAge: 31536000,
      sMaxAge: 31536000,
      staleWhileRevalidate: 86400,
      immutable: true,
    },
    documents: {
      maxAge: 3600,
      sMaxAge: 86400,
      staleWhileRevalidate: 600,
      immutable: false,
    },
    api: {
      maxAge: 0,
      sMaxAge: 0,
      noStore: true,
    },
    static: {
      maxAge: 604800,
      sMaxAge: 2592000,
      staleWhileRevalidate: 86400,
      immutable: false,
    },
  },
} as const;

export type CachePolicyType = keyof typeof CLOUDFRONT_CONFIG.cachePolicy;

export function getCacheControlHeader(type: CachePolicyType): string {
  const policy = CLOUDFRONT_CONFIG.cachePolicy[type];
  if ('noStore' in policy && policy.noStore) {
    return 'no-store, no-cache, must-revalidate';
  }
  const parts: string[] = [];
  parts.push('public');
  parts.push(`max-age=${policy.maxAge}`);
  if (policy.sMaxAge) parts.push(`s-maxage=${policy.sMaxAge}`);
  if ('staleWhileRevalidate' in policy && policy.staleWhileRevalidate) {
    parts.push(`stale-while-revalidate=${policy.staleWhileRevalidate}`);
  }
  if ('immutable' in policy && policy.immutable) parts.push('immutable');
  return parts.join(', ');
}

export function getPublicUrl(key: string): string {
  if (CLOUDFRONT_CONFIG.domainName) {
    return `https://${CLOUDFRONT_CONFIG.domainName}/${key}`;
  }
  return `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${key}`;
}
