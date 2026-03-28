export const S3_CONFIG = {
  bucket: process.env.AWS_S3_BUCKET || 'ivx-holdings-prod',
  region: process.env.AWS_REGION || 'us-east-1',
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
};

export const CLOUDFRONT_CONFIG = {
  distributionId: process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID || '',
  domainName: process.env.AWS_CLOUDFRONT_DOMAIN || 'cdn.ivxholding.com',
  originAccessIdentity: process.env.AWS_CLOUDFRONT_OAI || '',
};

export function getS3Key(prefix: keyof typeof S3_CONFIG.prefix, fileName: string): string {
  return `${S3_CONFIG.prefix[prefix]}${Date.now()}-${fileName}`;
}

export function getPublicUrl(key: string): string {
  if (CLOUDFRONT_CONFIG.domainName) {
    return `https://${CLOUDFRONT_CONFIG.domainName}/${key}`;
  }
  return `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${key}`;
}
