import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getEnvConfig } from '@/lib/env-config';

export type BackendProvider = 'supabase' | 'aws' | 'custom';

export interface StorageUploadResult {
  success: boolean;
  url: string | null;
  key: string | null;
  error: string | null;
}

export interface StorageListResult {
  success: boolean;
  files: { name: string; size: number; lastModified: string }[];
  error: string | null;
}

export interface BackendHealthResult {
  provider: BackendProvider;
  database: 'ok' | 'degraded' | 'down';
  auth: 'ok' | 'degraded' | 'down';
  storage: 'ok' | 'degraded' | 'down';
  realtime: 'ok' | 'degraded' | 'down';
  latencyMs: number;
}

function getActiveProvider(): BackendProvider {
  if (isSupabaseConfigured()) return 'supabase';
  return 'custom';
}

export async function uploadFile(
  bucket: string,
  path: string,
  file: Blob | ArrayBuffer,
  contentType: string
): Promise<StorageUploadResult> {
  const provider = getActiveProvider();
  console.log(`[BackendService] uploadFile provider=${provider} bucket=${bucket} path=${path}`);

  if (provider === 'supabase') {
    return uploadToSupabase(bucket, path, file, contentType);
  }

  return uploadToS3(bucket, path, file, contentType);
}

async function uploadToSupabase(
  bucket: string,
  path: string,
  file: Blob | ArrayBuffer,
  contentType: string
): Promise<StorageUploadResult> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType, upsert: true });

    if (error) {
      console.log('[BackendService] Supabase upload error:', error.message);
      return { success: false, url: null, key: null, error: error.message };
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

    return {
      success: true,
      url: urlData.publicUrl,
      key: data.path,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.log('[BackendService] Supabase upload exception:', message);
    return { success: false, url: null, key: null, error: message };
  }
}

async function uploadToS3(
  bucket: string,
  path: string,
  _file: Blob | ArrayBuffer,
  _contentType: string
): Promise<StorageUploadResult> {
  const config = getEnvConfig();
  const s3Bucket = config.aws.s3Bucket;

  console.log(`[BackendService] S3 upload would target: s3://${s3Bucket}/${bucket}/${path}`);
  console.log('[BackendService] S3 direct upload requires presigned URL from backend API');

  return {
    success: false,
    url: null,
    key: `${bucket}/${path}`,
    error: 'S3 upload requires presigned URL endpoint — use backend API',
  };
}

export function getPublicUrl(bucket: string, path: string): string {
  const provider = getActiveProvider();

  if (provider === 'supabase') {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  const config = getEnvConfig();
  if (config.aws.cloudfrontDomain) {
    return `https://${config.aws.cloudfrontDomain}/${bucket}/${path}`;
  }

  return `https://${config.aws.s3Bucket}.s3.${config.aws.region}.amazonaws.com/${bucket}/${path}`;
}

export async function queryTable<T = Record<string, unknown>>(
  table: string,
  options: {
    select?: string;
    filter?: Record<string, unknown>;
    order?: { column: string; ascending?: boolean };
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ data: T[] | null; error: string | null; count: number | null }> {
  const provider = getActiveProvider();
  console.log(`[BackendService] queryTable provider=${provider} table=${table}`);

  if (provider !== 'supabase') {
    return { data: null, error: 'Only Supabase provider currently supports direct table queries', count: null };
  }

  try {
    let query = supabase
      .from(table)
      .select(options.select || '*', { count: 'exact' });

    if (options.filter) {
      for (const [key, value] of Object.entries(options.filter)) {
        query = query.eq(key, value);
      }
    }

    if (options.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      return { data: null, error: error.message, count: null };
    }

    return { data: data as T[], error: null, count };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Query failed';
    return { data: null, error: message, count: null };
  }
}

export async function checkBackendHealth(): Promise<BackendHealthResult> {
  const provider = getActiveProvider();
  const start = Date.now();
  const result: BackendHealthResult = {
    provider,
    database: 'down',
    auth: 'down',
    storage: 'down',
    realtime: 'down',
    latencyMs: 0,
  };

  if (provider === 'supabase') {
    try {
      const dbCheck = supabase.from('profiles').select('id').limit(1);
      const authCheck = supabase.auth.getSession();

      const [dbRes, authRes] = await Promise.all([dbCheck, authCheck]);

      result.database = dbRes.error ? 'degraded' : 'ok';
      result.auth = authRes.error ? 'degraded' : 'ok';

      const config = getEnvConfig();
      result.realtime = config.supabase.url ? 'ok' : 'down';

      const storageRes = await supabase.storage.listBuckets();
      result.storage = storageRes.error ? 'degraded' : 'ok';
    } catch {
      console.log('[BackendService] Health check failed');
    }
  }

  result.latencyMs = Date.now() - start;
  console.log(`[BackendService] Health: db=${result.database} auth=${result.auth} storage=${result.storage} rt=${result.realtime} (${result.latencyMs}ms)`);

  return result;
}

export function getActiveBackendProvider(): BackendProvider {
  return getActiveProvider();
}

export function getBackendInfo(): {
  provider: BackendProvider;
  supabaseConfigured: boolean;
  awsConfigured: boolean;
  supabaseUrl: string;
  awsRegion: string;
  s3Bucket: string;
} {
  const config = getEnvConfig();
  return {
    provider: getActiveProvider(),
    supabaseConfigured: isSupabaseConfigured(),
    awsConfigured: !!(config.aws.region && config.aws.s3Bucket),
    supabaseUrl: config.supabase.url,
    awsRegion: config.aws.region,
    s3Bucket: config.aws.s3Bucket,
  };
}
