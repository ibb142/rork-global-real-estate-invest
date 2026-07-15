import { getIVXAccessToken, getIVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';

export type IVXMultimodalKind = 'image' | 'pdf' | 'video';

export type IVXMultimodalUpload = {
  bucket: string;
  path: string;
  signedUploadUrl: string;
  token: string;
  readUrl: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  kind: IVXMultimodalKind | 'other';
};

export type IVXMultimodalAnalysis = {
  file: { bucket?: string; path: string; mimeType: string | null; sizeBytes: number; kind: string };
  analysis: {
    kind: string;
    model: string | null;
    answer: string;
    pageCount?: number;
    charsAnalyzed?: number;
  };
  timestamp: string;
};

export type IVXMultimodalSummary = {
  file: { bucket?: string; path: string; mimeType: string | null; sizeBytes: number; kind: string };
  summary: {
    kind: string;
    model: string | null;
    answer: string;
    pageCount?: number;
    charsAnalyzed?: number;
  };
  timestamp: string;
};

export type IVXMultimodalDriveFile = {
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  kind: string;
  readUrl: string;
};

export type IVXTranscriptionResult = {
  text: string;
  transcript: string;
  provider: 'elevenlabs_scribe' | 'openai_whisper';
  model: string;
  languageCode: string | null;
  durationSeconds: number | null;
  fallbackUsed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildMultimodalUrls(path: string): string[] {
  const audit = getIVXOwnerAIConfigAudit();
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    urls.push(trimmed);
  };
  if (audit.activeBaseUrl) {
    push(`${audit.activeBaseUrl.replace(/\/+$/, '')}${path}`);
  }
  for (const endpoint of audit.candidateEndpoints) {
    const normalized = endpoint.replace(/\/+$/, '');
    if (normalized.endsWith('/api/ivx/owner-ai')) {
      push(`${normalized.slice(0, -'/api/ivx/owner-ai'.length)}${path}`);
    } else if (normalized.endsWith('/ivx/owner-ai')) {
      push(`${normalized.slice(0, -'/ivx/owner-ai'.length)}${path}`);
    }
  }
  return urls;
}

async function ownerFetchMultipart(path: string, body: FormData): Promise<unknown> {
  const accessToken = await getIVXAccessToken();
  const tokenPresent = !!accessToken;
  console.log('[IVXMultimodalService] Owner token check', { tokenPresent });
  if (!accessToken) {
    throw new Error('Owner session token is not connected.');
  }
  const urls = buildMultimodalUrls(path);
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      console.log('[IVXMultimodalService] Sending multipart request', { bearerHeaderPresent: true, url: path });
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body,
      });
      const text = await response.text();
      const payload: unknown = text ? JSON.parse(text) as unknown : null;
      if (!response.ok) {
        const message = isRecord(payload) ? String(payload.error ?? payload.detail ?? '') : '';
        throw new Error(message || `Multipart request failed with HTTP ${response.status}.`);
      }
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Multipart request failed.');
    }
  }
  throw lastError ?? new Error('Multimodal backend URL is not configured.');
}

async function ownerFetchJson(path: string, init: RequestInit): Promise<unknown> {
  const accessToken = await getIVXAccessToken();
  const tokenPresent = !!accessToken;
  console.log('[IVXMultimodalService] Owner token check', { tokenPresent });
  if (!accessToken) {
    throw new Error('Owner session token is not connected.');
  }
  const urls = buildMultimodalUrls(path);
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      console.log('[IVXMultimodalService] Sending JSON request', { bearerHeaderPresent: true, url: path });
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();
      const payload: unknown = text ? JSON.parse(text) as unknown : null;
      if (!response.ok) {
        const message = isRecord(payload) ? String(payload.error ?? payload.detail ?? '') : '';
        const deploymentMarker = isRecord(payload) && typeof payload.deploymentMarker === 'string' ? payload.deploymentMarker : null;
        if (response.status === 404 && /not found/i.test(message)) {
          throw new Error(`Multimodal file routes are not live on this backend deployment yet${deploymentMarker ? ` (${deploymentMarker})` : ''}. Backend health may be live, but this production route table is missing ${path}; redeploy the current backend before retrying uploads.`);
        }
        throw new Error(message || `Multimodal request failed with HTTP ${response.status}.`);
      }
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Multimodal request failed.');
    }
  }
  throw lastError ?? new Error('Multimodal backend URL is not configured.');
}

async function uploadBytesToSignedUrl(input: {
  signedUploadUrl: string;
  body: Blob | ArrayBuffer;
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
    throw new Error(`Storage upload failed with HTTP ${response.status}.`);
  }
}

function normalizeUpload(payload: unknown): IVXMultimodalUpload {
  const root = isRecord(payload) ? payload : {};
  const upload = isRecord(root.upload) ? root.upload : root;
  return {
    bucket: String(upload.bucket ?? ''),
    path: String(upload.path ?? ''),
    signedUploadUrl: String(upload.signedUploadUrl ?? ''),
    token: String(upload.token ?? ''),
    readUrl: typeof upload.readUrl === 'string' ? upload.readUrl : null,
    fileName: String(upload.fileName ?? ''),
    mimeType: typeof upload.mimeType === 'string' ? upload.mimeType : null,
    sizeBytes: typeof upload.sizeBytes === 'number' ? upload.sizeBytes : null,
    kind: (upload.kind as IVXMultimodalUpload['kind']) ?? 'other',
  };
}

export async function requestSignedUpload(input: {
  kind: IVXMultimodalKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
}): Promise<IVXMultimodalUpload> {
  const path = input.kind === 'image' ? '/api/upload/image'
    : input.kind === 'pdf' ? '/api/upload/pdf'
    : '/api/upload/video';
  const payload = await ownerFetchJson(path, {
    method: 'POST',
    body: JSON.stringify({
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    }),
  });
  return normalizeUpload(payload);
}

export async function uploadAndIngestFile(input: {
  kind: IVXMultimodalKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  body: Blob | ArrayBuffer;
}): Promise<IVXMultimodalUpload> {
  const upload = await requestSignedUpload({
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
  await uploadBytesToSignedUrl({
    signedUploadUrl: upload.signedUploadUrl,
    body: input.body,
    contentType: input.mimeType,
  });
  return upload;
}

export async function importGoogleDriveFile(driveUrl: string): Promise<IVXMultimodalDriveFile> {
  const payload = await ownerFetchJson('/api/google-drive/import', {
    method: 'POST',
    body: JSON.stringify({ driveUrl }),
  });
  const root = isRecord(payload) ? payload : {};
  const file = isRecord(root.file) ? root.file : {};
  return {
    bucket: String(file.bucket ?? ''),
    path: String(file.path ?? ''),
    fileName: String(file.fileName ?? ''),
    mimeType: typeof file.mimeType === 'string' ? file.mimeType : null,
    sizeBytes: typeof file.sizeBytes === 'number' ? file.sizeBytes : 0,
    kind: String(file.kind ?? 'other'),
    readUrl: String(file.readUrl ?? ''),
  };
}

export async function analyzeFile(input: { storagePath: string; bucket?: string | null; prompt?: string }): Promise<IVXMultimodalAnalysis> {
  const fileId = encodeURIComponent(input.storagePath);
  const payload = await ownerFetchJson(`/api/files/${fileId}/analyze`, {
    method: 'POST',
    body: JSON.stringify({ path: input.storagePath, bucket: input.bucket ?? undefined, prompt: input.prompt ?? '' }),
  });
  return payload as IVXMultimodalAnalysis;
}

export async function summarizeFile(input: { storagePath: string; bucket?: string | null }): Promise<IVXMultimodalSummary> {
  const fileId = encodeURIComponent(input.storagePath);
  const payload = await ownerFetchJson(`/api/files/${fileId}/summary`, {
    method: 'POST',
    body: JSON.stringify({ path: input.storagePath, bucket: input.bucket ?? undefined }),
  });
  return payload as IVXMultimodalSummary;
}

export async function transcribeAudioRecording(input: { uri: string; fileName?: string; mimeType?: string }): Promise<IVXTranscriptionResult> {
  const uri = input.uri.trim();
  if (!uri) {
    throw new Error('Recording URI is missing.');
  }

  const form = new FormData();
  const mimeType = input.mimeType?.trim() || (uri.endsWith('.webm') ? 'audio/webm' : 'audio/m4a');
  const fileName = input.fileName?.trim() || (mimeType.includes('webm') ? 'voice.webm' : 'voice.m4a');

  if (uri.startsWith('blob:') || uri.startsWith('data:')) {
    const response = await fetch(uri);
    const blob = await response.blob();
    form.append('file', blob, fileName);
  } else {
    form.append('file', { uri, name: fileName, type: mimeType } as unknown as Blob);
  }

  const payload = await ownerFetchMultipart('/api/audio/transcribe', form);
  const root = isRecord(payload) ? payload : {};
  const text = typeof root.text === 'string' ? root.text.trim() : typeof root.transcript === 'string' ? root.transcript.trim() : '';
  if (!text) {
    throw new Error(typeof root.error === 'string' ? root.error : 'Transcription returned no text.');
  }

  return {
    text,
    transcript: text,
    provider: root.provider === 'openai_whisper' ? 'openai_whisper' : 'elevenlabs_scribe',
    model: typeof root.model === 'string' ? root.model : 'unknown',
    languageCode: typeof root.languageCode === 'string' ? root.languageCode : null,
    durationSeconds: typeof root.durationSeconds === 'number' ? root.durationSeconds : null,
    fallbackUsed: root.fallbackUsed === true,
  };
}
