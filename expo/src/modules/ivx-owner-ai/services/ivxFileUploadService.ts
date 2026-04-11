import { IVX_OWNER_AI_BUCKET, IVX_OWNER_AI_MAX_UPLOAD_BYTES, type IVXUploadInput, type IVXUploadedFile } from '@/shared/ivx';
import { getIVXSupabaseClient } from '@/lib/ivx-supabase-client';
import { IVX_OWNER_AI_ROOM_ID } from '@/constants/ivx-owner-ai';

const IVX_OWNER_FILE_URL_TTL_SECONDS = 60 * 60;

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

export const ivxFileUploadService = {
  async uploadOwnerFile(params: {
    upload: IVXUploadInput;
    conversationId?: string;
  }): Promise<IVXUploadedFile> {
    const client = getIVXSupabaseClient();
    const fileName = sanitizeFileName(params.upload.name);
    const payload = await readUploadPayload(params.upload);

    if (typeof IVX_OWNER_AI_MAX_UPLOAD_BYTES === 'number' && payload.size && payload.size > IVX_OWNER_AI_MAX_UPLOAD_BYTES) {
      throw new Error('File exceeds the IVX Owner AI upload limit.');
    }

    const conversationId = params.conversationId?.trim() || IVX_OWNER_AI_ROOM_ID;
    const storagePath = `owner-room/${conversationId}/${Date.now()}-${fileName}`;

    console.log('[IVXFileUploadService] Uploading file:', {
      bucket: IVX_OWNER_AI_BUCKET,
      storagePath,
      mimeType: payload.mimeType,
      size: payload.size,
      source: payload.source,
    });

    const uploadResult = await client.storage.from(IVX_OWNER_AI_BUCKET).upload(storagePath, payload.body, {
      contentType: payload.mimeType ?? undefined,
      upsert: false,
    });

    if (uploadResult.error) {
      console.log('[IVXFileUploadService] Upload failed:', uploadResult.error.message);
      throw new Error(uploadResult.error.message);
    }

    const signedUrlResult = await client.storage.from(IVX_OWNER_AI_BUCKET).createSignedUrl(storagePath, IVX_OWNER_FILE_URL_TTL_SECONDS);

    if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
      console.log('[IVXFileUploadService] Signed URL creation failed:', signedUrlResult.error?.message ?? 'missing signed url');
      throw new Error(signedUrlResult.error?.message ?? 'Failed to create a secure file URL.');
    }

    return {
      bucket: IVX_OWNER_AI_BUCKET,
      path: storagePath,
      publicUrl: signedUrlResult.data.signedUrl,
      fileName,
      mimeType: payload.mimeType,
      size: payload.size,
      source: payload.source,
    };
  },
};
