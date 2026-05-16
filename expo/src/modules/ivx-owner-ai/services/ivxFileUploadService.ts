import { IVX_CHAT_UPLOAD_BUCKET, IVX_OWNER_AI_BUCKET, IVX_OWNER_AI_MAX_UPLOAD_BYTES, type IVXUploadInput, type IVXUploadedFile } from '@/shared/ivx';
import { getIVXAccessToken, getIVXOwnerAIConfigAudit, getIVXSupabaseClient } from '@/lib/ivx-supabase-client';
import { IVX_OWNER_AI_ROOM_ID } from '@/constants/ivx-owner-ai';

const IVX_OWNER_FILE_URL_TTL_SECONDS = 60 * 60;

type BackendSignedUploadResponse = {
  bucket?: unknown;
  path?: unknown;
  signedUploadUrl?: unknown;
  readUrl?: unknown;
  publicUrl?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  size?: unknown;
};

function sanitizeFileName(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return `ivx-upload-${Date.now()}`;
  }

  return trimmedValue.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function resolveMimeType(upload: IVXUploadInput, fallbackType: string | null): string | null {
  const explicitType = upload.type?.trim() ?? '';
  if (explicitType.length > 0) {
    return explicitType;
  }

  if (fallbackType && fallbackType.trim().length > 0) {
    return fallbackType.trim();
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildOwnerRouteUrls(path: string): string[] {
  const audit = getIVXOwnerAIConfigAudit();
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined): void => {
    const trimmedValue = value?.trim();
    if (!trimmedValue || seen.has(trimmedValue)) return;
    seen.add(trimmedValue);
    urls.push(trimmedValue);
  };

  if (audit.activeBaseUrl) {
    push(`${audit.activeBaseUrl.replace(/\/+$/, '')}${path}`);
  }
  for (const endpoint of audit.candidateEndpoints) {
    const normalizedEndpoint = endpoint.replace(/\/+$/, '');
    if (normalizedEndpoint.endsWith('/api/ivx/owner-ai')) {
      push(`${normalizedEndpoint.slice(0, -'/api/ivx/owner-ai'.length)}${path}`);
    } else if (normalizedEndpoint.endsWith('/ivx/owner-ai')) {
      push(`${normalizedEndpoint.slice(0, -'/ivx/owner-ai'.length)}${path}`);
    }
  }
  return urls;
}

async function ownerRouteFetchJson(path: string, body: Record<string, unknown>): Promise<unknown> {
  const accessToken = await getIVXAccessToken();
  if (!accessToken) {
    throw new Error('Owner session token is not connected.');
  }

  const urls = buildOwnerRouteUrls(path);
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      const payload: unknown = text ? JSON.parse(text) as unknown : null;
      if (!response.ok) {
        const message = isRecord(payload) ? String(payload.error ?? payload.detail ?? '') : '';
        throw new Error(message || `Owner upload route failed with HTTP ${response.status}.`);
      }
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Owner upload route failed.');
    }
  }

  throw lastError ?? new Error('Owner upload backend URL is not configured.');
}

async function uploadBytesToSignedUrl(input: {
  signedUploadUrl: string;
  body: ArrayBuffer | Blob;
  contentType: string | null;
}): Promise<void> {
  const response = await fetch(input.signedUploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': input.contentType ?? 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: input.body as BodyInit,
  });
  if (!response.ok) {
    throw new Error(`Signed storage upload failed with HTTP ${response.status}.`);
  }
}

async function readUploadPayload(upload: IVXUploadInput): Promise<{
  body: ArrayBuffer | Blob;
  mimeType: string | null;
  size: number | null;
  source: 'web' | 'mobile';
}> {
  if (upload.file) {
    const body = await upload.file.arrayBuffer();
    const mimeType = resolveMimeType(upload, upload.file.type ?? null);
    const size = typeof upload.size === 'number'
      ? upload.size
      : typeof upload.file.size === 'number'
        ? upload.file.size
        : null;

    return {
      body,
      mimeType,
      size,
      source: 'web',
    };
  }

  if (upload.uri) {
    const response = await fetch(upload.uri);
    const blob = await response.blob();
    const mimeType = resolveMimeType(upload, blob.type ?? null);
    const size = typeof upload.size === 'number'
      ? upload.size
      : typeof blob.size === 'number'
        ? blob.size
        : null;

    return {
      body: blob,
      mimeType,
      size,
      source: 'mobile',
    };
  }

  throw new Error('No upload payload was provided.');
}

async function uploadViaBackendSignedUrl(input: {
  fileName: string;
  payload: Awaited<ReturnType<typeof readUploadPayload>>;
  conversationId: string;
}): Promise<IVXUploadedFile> {
  const responsePayload = await ownerRouteFetchJson('/api/upload', {
    bucket: IVX_CHAT_UPLOAD_BUCKET,
    fileName: input.fileName,
    mimeType: input.payload.mimeType,
    sizeBytes: input.payload.size,
    conversationId: input.conversationId,
  });
  const response = (isRecord(responsePayload) ? responsePayload : {}) as BackendSignedUploadResponse;
  const signedUploadUrl = typeof response.signedUploadUrl === 'string' ? response.signedUploadUrl : '';
  const storagePath = typeof response.path === 'string' ? response.path : '';
  const bucket = typeof response.bucket === 'string' ? response.bucket : IVX_CHAT_UPLOAD_BUCKET;
  const readUrl = typeof response.publicUrl === 'string'
    ? response.publicUrl
    : typeof response.readUrl === 'string'
      ? response.readUrl
      : '';

  if (!signedUploadUrl || !storagePath || !readUrl) {
    throw new Error('Backend upload route did not return a complete signed upload response.');
  }

  await uploadBytesToSignedUrl({
    signedUploadUrl,
    body: input.payload.body,
    contentType: input.payload.mimeType,
  });

  return {
    bucket,
    path: storagePath,
    publicUrl: readUrl,
    fileName: typeof response.fileName === 'string' ? response.fileName : input.fileName,
    mimeType: typeof response.mimeType === 'string' ? response.mimeType : input.payload.mimeType,
    size: typeof response.sizeBytes === 'number'
      ? response.sizeBytes
      : typeof response.size === 'number'
        ? response.size
        : input.payload.size,
    source: input.payload.source,
  };
}

async function uploadViaDirectSupabaseFallback(input: {
  fileName: string;
  payload: Awaited<ReturnType<typeof readUploadPayload>>;
  conversationId: string;
}): Promise<IVXUploadedFile> {
  const client = getIVXSupabaseClient();
  const storagePath = `owner-room/${input.conversationId}/${Date.now()}-${input.fileName}`;

  console.log('[IVXFileUploadService] Uploading file through direct Supabase fallback:', {
    bucket: IVX_OWNER_AI_BUCKET,
    storagePath,
    mimeType: input.payload.mimeType,
    size: input.payload.size,
    source: input.payload.source,
  });

  const uploadResult = await client.storage.from(IVX_OWNER_AI_BUCKET).upload(storagePath, input.payload.body, {
    contentType: input.payload.mimeType ?? undefined,
    upsert: false,
  });

  if (uploadResult.error) {
    console.log('[IVXFileUploadService] Direct fallback upload failed:', uploadResult.error.message);
    throw new Error(uploadResult.error.message);
  }

  const signedUrlResult = await client.storage.from(IVX_OWNER_AI_BUCKET).createSignedUrl(storagePath, IVX_OWNER_FILE_URL_TTL_SECONDS);

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    console.log('[IVXFileUploadService] Direct fallback signed URL creation failed:', signedUrlResult.error?.message ?? 'missing signed url');
    throw new Error(signedUrlResult.error?.message ?? 'Failed to create a secure file URL.');
  }

  return {
    bucket: IVX_OWNER_AI_BUCKET,
    path: storagePath,
    publicUrl: signedUrlResult.data.signedUrl,
    fileName: input.fileName,
    mimeType: input.payload.mimeType,
    size: input.payload.size,
    source: input.payload.source,
  };
}

export const ivxFileUploadService = {
  async uploadOwnerFile(params: {
    upload: IVXUploadInput;
    conversationId?: string;
  }): Promise<IVXUploadedFile> {
    const fileName = sanitizeFileName(params.upload.name);
    const payload = await readUploadPayload(params.upload);

    if (typeof IVX_OWNER_AI_MAX_UPLOAD_BYTES === 'number' && payload.size && payload.size > IVX_OWNER_AI_MAX_UPLOAD_BYTES) {
      throw new Error('File exceeds the IVX Owner AI upload limit.');
    }

    const conversationId = params.conversationId?.trim() || IVX_OWNER_AI_ROOM_ID;

    try {
      console.log('[IVXFileUploadService] Requesting backend-signed IVX chat upload:', {
        bucket: IVX_CHAT_UPLOAD_BUCKET,
        conversationId,
        mimeType: payload.mimeType,
        size: payload.size,
        source: payload.source,
      });
      return await uploadViaBackendSignedUrl({ fileName, payload, conversationId });
    } catch (error) {
      console.log('[IVXFileUploadService] Backend-signed upload unavailable, trying direct fallback:', error instanceof Error ? error.message : 'unknown');
      return await uploadViaDirectSupabaseFallback({ fileName, payload, conversationId });
    }
  },
};
