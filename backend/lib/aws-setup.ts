import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  PutBucketCorsCommand,
  PutPublicAccessBlockCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketTaggingCommand,
  GetBucketLocationCommand,
  BucketLocationConstraint,
} from "@aws-sdk/client-s3";

export const PROD_BUCKET_NAME = process.env.AWS_S3_BUCKET || "ivx-holdings-prod";
const rawRegion = (process.env.AWS_REGION || "").trim();
export const PROD_REGION = /^[a-z]{2}-[a-z]+-\d$/.test(rawRegion) ? rawRegion : "us-east-1";

let setupComplete = false;
let setupResult: AWSSetupResult | null = null;

export interface AWSSetupResult {
  success: boolean;
  bucket: string;
  region: string;
  steps: { name: string; status: "ok" | "warn" | "fail" | "skip"; message: string }[];
  timestamp: string;
}

function makeS3Client(): S3Client | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    console.warn("[AWS] Credentials not configured — skipping S3 setup");
    return null;
  }
  return new S3Client({
    region: PROD_REGION,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function ensureBucketExists(client: S3Client, bucket: string, region: string): Promise<{ status: "ok" | "fail" | "warn"; message: string }> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`[AWS] Bucket "${bucket}" already exists`);
    return { status: "ok", message: `Bucket "${bucket}" already exists` };
  } catch (err: any) {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      try {
        const createParams: any = { Bucket: bucket };
        if (region !== "us-east-1") {
          createParams.CreateBucketConfiguration = {
            LocationConstraint: region as BucketLocationConstraint,
          };
        }
        await client.send(new CreateBucketCommand(createParams));
        console.log(`[AWS] Created bucket "${bucket}" in ${region}`);
        return { status: "ok", message: `Created bucket "${bucket}" in ${region}` };
      } catch (createErr: any) {
        console.error("[AWS] Failed to create bucket:", createErr.message);
        return { status: "fail", message: `Failed to create bucket: ${createErr.message}` };
      }
    }
    if (err?.$metadata?.httpStatusCode === 301 || err?.name === "PermanentRedirect") {
      try {
        const loc = await client.send(new GetBucketLocationCommand({ Bucket: bucket }));
        const actualRegion = loc.LocationConstraint || "us-east-1";
        console.warn(`[AWS] Bucket "${bucket}" exists in different region: ${actualRegion}`);
        return { status: "warn", message: `Bucket exists in region: ${actualRegion}` };
      } catch {
        return { status: "warn", message: "Bucket exists (region mismatch)" };
      }
    }
    console.error("[AWS] HeadBucket error:", err.message);
    return { status: "fail", message: `Bucket check failed: ${err.message}` };
  }
}

async function blockPublicAccess(client: S3Client, bucket: string): Promise<{ status: "ok" | "fail"; message: string }> {
  try {
    await client.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      })
    );
    console.log("[AWS] Public access fully blocked on bucket");
    return { status: "ok", message: "All public access blocked" };
  } catch (err: any) {
    console.error("[AWS] Failed to block public access:", err.message);
    return { status: "fail", message: `Failed to block public access: ${err.message}` };
  }
}

async function enableVersioning(client: S3Client, bucket: string): Promise<{ status: "ok" | "fail"; message: string }> {
  try {
    await client.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: "Enabled" },
      })
    );
    console.log("[AWS] Versioning enabled on bucket");
    return { status: "ok", message: "Versioning enabled" };
  } catch (err: any) {
    console.error("[AWS] Failed to enable versioning:", err.message);
    return { status: "fail", message: `Failed to enable versioning: ${err.message}` };
  }
}

async function enableEncryption(client: S3Client, bucket: string): Promise<{ status: "ok" | "fail"; message: string }> {
  try {
    await client.send(
      new PutBucketEncryptionCommand({
        Bucket: bucket,
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: "AES256",
              },
              BucketKeyEnabled: true,
            },
          ],
        },
      })
    );
    console.log("[AWS] AES-256 server-side encryption enabled on bucket");
    return { status: "ok", message: "AES-256 server-side encryption enabled" };
  } catch (err: any) {
    console.error("[AWS] Failed to enable encryption:", err.message);
    return { status: "fail", message: `Failed to enable encryption: ${err.message}` };
  }
}

async function setCORSPolicy(client: S3Client, bucket: string): Promise<{ status: "ok" | "fail"; message: string }> {
  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["Authorization", "Content-Type", "x-amz-date", "x-amz-security-token"],
              AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
              AllowedOrigins: [
                "https://ivxholding.com",
                "https://www.ivxholding.com",
                "https://app.ivxholding.com",
                "https://*.ivxholding.com",
                "https://ivxholdings.com",
                "https://www.ivxholdings.com",
                "https://*.ivxholdings.com",
              ],
              ExposeHeaders: ["ETag", "x-amz-request-id"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      })
    );
    console.log("[AWS] CORS policy set on bucket");
    return { status: "ok", message: "CORS policy applied for ivxholdings.com" };
  } catch (err: any) {
    console.error("[AWS] Failed to set CORS policy:", err.message);
    return { status: "fail", message: `Failed to set CORS: ${err.message}` };
  }
}

async function setLifecycleRules(client: S3Client, bucket: string): Promise<{ status: "ok" | "fail"; message: string }> {
  try {
    await client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: "expire-temp-uploads",
              Status: "Enabled",
              Filter: { Prefix: "temp/" },
              Expiration: { Days: 1 },
            },
            {
              ID: "transition-old-docs-to-ia",
              Status: "Enabled",
              Filter: { Prefix: "document/" },
              Transitions: [
                { Days: 90, StorageClass: "STANDARD_IA" },
                { Days: 365, StorageClass: "GLACIER" },
              ],
            },
            {
              ID: "transition-tax-docs-glacier",
              Status: "Enabled",
              Filter: { Prefix: "tax/" },
              Transitions: [
                { Days: 180, StorageClass: "STANDARD_IA" },
                { Days: 730, StorageClass: "GLACIER" },
              ],
            },
            {
              ID: "expire-old-versions",
              Status: "Enabled",
              Filter: { Prefix: "" },
              NoncurrentVersionExpiration: { NoncurrentDays: 90 },
            },
            {
              ID: "abort-incomplete-multipart",
              Status: "Enabled",
              Filter: { Prefix: "" },
              AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
            },
          ],
        },
      })
    );
    console.log("[AWS] Lifecycle rules configured on bucket");
    return { status: "ok", message: "Lifecycle rules set (temp: 1d, docs: IA@90d/Glacier@365d, tax: IA@180d/Glacier@730d)" };
  } catch (err: any) {
    console.error("[AWS] Failed to set lifecycle rules:", err.message);
    return { status: "fail", message: `Failed to set lifecycle: ${err.message}` };
  }
}

async function tagBucket(client: S3Client, bucket: string): Promise<{ status: "ok" | "fail"; message: string }> {
  try {
    await client.send(
      new PutBucketTaggingCommand({
        Bucket: bucket,
        Tagging: {
          TagSet: [
            { Key: "Project", Value: "IVX-Holdings" },
            { Key: "Environment", Value: "production" },
            { Key: "ManagedBy", Value: "ivx-holdings-api" },
            { Key: "DataClass", Value: "confidential" },
          ],
        },
      })
    );
    console.log("[AWS] Production tags applied to bucket");
    return { status: "ok", message: "Tags applied: Project=IVX-Holdings, Environment=production" };
  } catch (err: any) {
    console.error("[AWS] Failed to tag bucket:", err.message);
    return { status: "fail", message: `Failed to tag bucket: ${err.message}` };
  }
}

export async function runAWSProductionSetup(): Promise<AWSSetupResult> {
  if (setupComplete && setupResult) {
    console.log("[AWS] Setup already completed, returning cached result");
    return setupResult;
  }

  const steps: AWSSetupResult["steps"] = [];
  const client = makeS3Client();

  if (!client) {
    const result: AWSSetupResult = {
      success: false,
      bucket: PROD_BUCKET_NAME,
      region: PROD_REGION,
      steps: [{ name: "Credentials", status: "skip", message: "AWS credentials not configured — storage running in local mode" }],
      timestamp: new Date().toISOString(),
    };
    setupResult = result;
    setupComplete = true;
    return result;
  }

  console.log(`[AWS] Starting production S3 setup: bucket=${PROD_BUCKET_NAME}, region=${PROD_REGION}`);

  const bucketResult = await ensureBucketExists(client, PROD_BUCKET_NAME, PROD_REGION);
  steps.push({ name: "S3 Bucket", ...bucketResult });

  if (bucketResult.status === "fail") {
    const result: AWSSetupResult = {
      success: false,
      bucket: PROD_BUCKET_NAME,
      region: PROD_REGION,
      steps,
      timestamp: new Date().toISOString(),
    };
    setupResult = result;
    setupComplete = true;
    return result;
  }

  const [publicBlock, versioning, encryption, cors, lifecycle, tags] = await Promise.all([
    blockPublicAccess(client, PROD_BUCKET_NAME),
    enableVersioning(client, PROD_BUCKET_NAME),
    enableEncryption(client, PROD_BUCKET_NAME),
    setCORSPolicy(client, PROD_BUCKET_NAME),
    setLifecycleRules(client, PROD_BUCKET_NAME),
    tagBucket(client, PROD_BUCKET_NAME),
  ]);

  steps.push(
    { name: "Public Access Block", ...publicBlock },
    { name: "Versioning", ...versioning },
    { name: "Encryption (AES-256)", ...encryption },
    { name: "CORS Policy", ...cors },
    { name: "Lifecycle Rules", ...lifecycle },
    { name: "Resource Tags", ...tags }
  );

  const failCount = steps.filter(s => s.status === "fail").length;
  const success = failCount === 0;

  console.log(`[AWS] Production setup complete — ${success ? "ALL PASSED" : `${failCount} FAILED`}`);
  steps.forEach(s => console.log(`  [${s.status.toUpperCase()}] ${s.name}: ${s.message}`));

  const result: AWSSetupResult = {
    success,
    bucket: PROD_BUCKET_NAME,
    region: PROD_REGION,
    steps,
    timestamp: new Date().toISOString(),
  };

  setupResult = result;
  setupComplete = true;
  return result;
}

export function getAWSSetupStatus(): AWSSetupResult | null {
  return setupResult;
}

export function getIAMPolicyDocument(): object {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AllowIVXHoldingsS3Access",
        Effect: "Allow",
        Action: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:GetObjectVersion",
          "s3:DeleteObjectVersion",
        ],
        Resource: [
          `arn:aws:s3:::${PROD_BUCKET_NAME}`,
          `arn:aws:s3:::${PROD_BUCKET_NAME}/*`,
        ],
      },
      {
        Sid: "AllowPresignedUrls",
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: [`arn:aws:s3:::${PROD_BUCKET_NAME}/*`],
        Condition: {
          StringEquals: { "s3:ExistingObjectTag/Project": "IVX-Holdings" },
        },
      },
      {
        Sid: "DenyDeleteBucket",
        Effect: "Deny",
        Action: ["s3:DeleteBucket"],
        Resource: [`arn:aws:s3:::${PROD_BUCKET_NAME}`],
      },
    ],
  };
}
