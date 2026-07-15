import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { ChatAttachment } from '@/types';
import type { PublicChatImageInput, PublicChatDocumentInput } from '@/lib/public-chat';

/**
 * Chat file upload helper.
 *
 * The in-app Chat tab forwards attachments to the deployed `/public/chat`
 * endpoint, whose BLOCK 3 visual-intelligence layer reads images and BLOCK 5
 * OCR layer reads deal-room PDFs. Those layers fetch the file by URL server-side
 * — so a picked local file must first be uploaded to a public URL.
 */

const STORAGE_BUCKET = 'deal-photos';
const ATTACHMENT_PREFIX = 'chat-attachments';

export type PickedChatFile = {
  uri: string;
  name: string;
  mimeType: string;
  kind: 'image' | 'document';
};

function generateId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extensionFor(name: string, mimeType: string): string {
  const dot = name.lastIndexOf('.');
  if (dot >= 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase();
  }
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('csv')) return 'csv';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.startsWith('image/')) return 'jpg';
  return 'bin';
}

/** Open the photo library and return the picked image (or null if cancelled). */
export async function pickChatImage(): Promise<PickedChatFile | null> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Photo library permission is required to attach an image.');
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
    allowsMultipleSelection: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? `image-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    kind: 'image',
  };
}

/** Open the document picker for deal-room files (PDF / CSV / TXT / image). */
export async function pickChatDocument(): Promise<PickedChatFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'text/csv', 'text/plain', 'image/*'],
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? 'application/octet-stream';
  return {
    uri: asset.uri,
    name: asset.name ?? `document-${Date.now()}`,
    mimeType,
    kind: mimeType.startsWith('image/') ? 'image' : 'document',
  };
}

function getSupabaseUrl(): string {
  return (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
}

/**
 * Upload a picked file to public storage and return its hosted URL. Already
 * hosted http(s) URLs are returned as-is. Throws an actionable error on failure.
 */
export async function uploadChatAttachment(file: PickedChatFile): Promise<string> {
  if ((file.uri.startsWith('https://') || file.uri.startsWith('http://')) && !file.uri.startsWith('blob:')) {
    return file.uri;
  }

  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    throw new Error('Storage is not configured (missing EXPO_PUBLIC_SUPABASE_URL).');
  }

  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  const ext = extensionFor(file.name, file.mimeType);
  const path = `${ATTACHMENT_PREFIX}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  console.log('[ChatAttachments] Uploading', file.kind, file.mimeType, '->', path);

  if (Platform.OS === 'web') {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
      contentType: file.mimeType,
      upsert: true,
    });
    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  } else {
    let token = anonKey;
    try {
      const session = await supabase.auth.getSession();
      token = session?.data?.session?.access_token || anonKey;
    } catch {
      token = anonKey;
    }

    const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${path}`;
    const result = await FileSystem.uploadAsync(uploadUrl, file.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: file.mimeType,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    });

    if (result.status < 200 || result.status >= 300) {
      let detail = `HTTP ${result.status}`;
      try {
        const parsed = JSON.parse(result.body) as { error?: string; message?: string };
        detail = parsed.error || parsed.message || detail;
      } catch {
        if (result.body) detail = result.body.slice(0, 160);
      }
      throw new Error(`Upload failed: ${detail}`);
    }
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) {
    throw new Error('Upload succeeded but the public URL could not be resolved.');
  }

  console.log('[ChatAttachments] Uploaded:', publicUrl.slice(0, 96));
  return publicUrl;
}

/** Build a pending (uploading) attachment record from a freshly picked file. */
export function createPendingAttachment(file: PickedChatFile): ChatAttachment {
  return {
    id: generateId(),
    kind: file.kind,
    name: file.name,
    mimeType: file.mimeType,
    localUri: file.uri,
    url: null,
    status: 'uploading',
  };
}

/** Split ready attachments into the `images` / `documents` payloads `/public/chat` expects. */
export function toPublicChatPayload(attachments: ChatAttachment[]): {
  images: PublicChatImageInput[];
  documents: PublicChatDocumentInput[];
} {
  const images: PublicChatImageInput[] = [];
  const documents: PublicChatDocumentInput[] = [];

  for (const attachment of attachments) {
    if (attachment.status !== 'ready' || !attachment.url) {
      continue;
    }
    if (attachment.kind === 'image') {
      images.push({ url: attachment.url, type: attachment.mimeType });
    } else {
      documents.push({ url: attachment.url, name: attachment.name, type: attachment.mimeType });
    }
  }

  return { images, documents };
}
