import {
  CloudFrontClient,
  CreateInvalidationCommand,
  GetDistributionConfigCommand,
  ListDistributionsCommand,
  UpdateDistributionCommand,
} from '@aws-sdk/client-cloudfront';

const DOMAIN = 'ivxholding.com';
const WWW_DOMAIN = 'www.ivxholding.com';
const API_ORIGIN_URL = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
const API_ORIGIN_HOST = API_ORIGIN_URL ? new URL(API_ORIGIN_URL).host : '';
const DISTRIBUTION_ID = (process.env.CLOUDFRONT_DISTRIBUTION_ID || '').trim();
const CACHE_POLICY_CACHING_DISABLED = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
const ORIGIN_REQUEST_POLICY_ALL_VIEWER = '216adef6-5c7f-47e4-b989-5492eafa07d3';

if (!API_ORIGIN_HOST) {
  console.error('[CloudFrontFix] Missing EXPO_PUBLIC_RORK_API_BASE_URL or EXPO_PUBLIC_API_BASE_URL');
  process.exit(1);
}

const cloudfront = new CloudFrontClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').trim(),
  },
});

async function resolveDistributionId() {
  if (DISTRIBUTION_ID) {
    console.log('[CloudFrontFix] Using distribution from env:', DISTRIBUTION_ID);
    return DISTRIBUTION_ID;
  }

  const response = await cloudfront.send(new ListDistributionsCommand({}));
  const items = response.DistributionList?.Items ?? [];
  for (const item of items) {
    const aliases = item.Aliases?.Items ?? [];
    if (aliases.includes(DOMAIN) || aliases.includes(WWW_DOMAIN)) {
      console.log('[CloudFrontFix] Found distribution by alias:', item.Id, item.DomainName);
      return item.Id ?? null;
    }
  }

  return null;
}

function ensureApiOrigin(origins) {
  const items = origins?.Items ?? [];
  const existing = items.find((origin) => origin.Id === 'Api-Origin');
  if (existing) {
    existing.DomainName = API_ORIGIN_HOST;
    existing.CustomOriginConfig = {
      HTTPPort: 80,
      HTTPSPort: 443,
      OriginProtocolPolicy: 'https-only',
      OriginSslProtocols: {
        Quantity: 1,
        Items: ['TLSv1.2'],
      },
    };
  } else {
    items.push({
      Id: 'Api-Origin',
      DomainName: API_ORIGIN_HOST,
      CustomOriginConfig: {
        HTTPPort: 80,
        HTTPSPort: 443,
        OriginProtocolPolicy: 'https-only',
        OriginSslProtocols: {
          Quantity: 1,
          Items: ['TLSv1.2'],
        },
      },
    });
  }

  return {
    ...origins,
    Quantity: items.length,
    Items: items,
  };
}

function buildBehavior(pathPattern, methods) {
  return {
    PathPattern: pathPattern,
    TargetOriginId: 'Api-Origin',
    ViewerProtocolPolicy: 'redirect-to-https',
    AllowedMethods: {
      Quantity: methods.length,
      Items: methods,
      CachedMethods: {
        Quantity: 2,
        Items: ['GET', 'HEAD'],
      },
    },
    Compress: true,
    CachePolicyId: CACHE_POLICY_CACHING_DISABLED,
    OriginRequestPolicyId: ORIGIN_REQUEST_POLICY_ALL_VIEWER,
  };
}

function ensureOrderedBehaviors(current) {
  const items = (current?.Items ?? []).filter((item) => item.PathPattern !== '/api/*' && item.PathPattern !== '/health*');
  items.unshift(
    buildBehavior('/health*', ['GET', 'HEAD', 'OPTIONS']),
    buildBehavior('/api/*', ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE']),
  );

  return {
    ...current,
    Quantity: items.length,
    Items: items,
  };
}

async function invalidate(distributionId) {
  const result = await cloudfront.send(new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `api-routing-fix-${Date.now()}`,
      Paths: {
        Quantity: 3,
        Items: ['/api/*', '/health*', '/index.html'],
      },
    },
  }));

  console.log('[CloudFrontFix] Invalidation created:', result.Invalidation?.Id ?? 'unknown');
}

async function main() {
  const distributionId = await resolveDistributionId();
  if (!distributionId) {
    console.error('[CloudFrontFix] Could not find CloudFront distribution for ivxholding.com');
    process.exit(1);
  }

  const configResponse = await cloudfront.send(new GetDistributionConfigCommand({ Id: distributionId }));
  const distributionConfig = configResponse.DistributionConfig;
  const eTag = configResponse.ETag;

  if (!distributionConfig || !eTag) {
    console.error('[CloudFrontFix] Missing distribution config or ETag');
    process.exit(1);
  }

  distributionConfig.Origins = ensureApiOrigin(distributionConfig.Origins);
  distributionConfig.OrderedCacheBehaviors = ensureOrderedBehaviors(distributionConfig.OrderedCacheBehaviors);

  await cloudfront.send(new UpdateDistributionCommand({
    Id: distributionId,
    IfMatch: eTag,
    DistributionConfig: distributionConfig,
  }));

  console.log('[CloudFrontFix] Updated distribution:', distributionId);
  console.log('[CloudFrontFix] API origin host:', API_ORIGIN_HOST);
  await invalidate(distributionId);
}

main().catch((error) => {
  console.error('[CloudFrontFix] Fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
