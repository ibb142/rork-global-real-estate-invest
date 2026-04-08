import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import type { ChatFileType } from '../types/chat';

const CHAT_UPLOAD_BUCKET = 'chat-uploads';

type UploadResult = {
  url: string;
  fileType: ChatFileType;
};

function guessFileType(mimeType?: string | null): ChatFileType {
  if (!mimeType) {
    return 'file';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  return 'file';
}

function sanitizeFileName(name?: string | null): string {
  const fallback = `upload-${Date.now()}`;
  const value = (name ?? '').trim();
  if (!value) {
    return fallback;
  }

  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

async function requestMediaPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return true;
  }

  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (result.status !== 'granted') {
    Alert.alert('Permission required', 'Please allow media library access to upload an attachment.');
    return false;
  }

  return true;
}

async function getUploadBody(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read the selected file.');
  }

  return response.arrayBuffer();
}

async function uploadToSupabase(
  uri: string,
  mimeType?: string | null,
  name?: string | null,
): Promise<UploadResult> {
  console.log('[UploadService] Starting upload:', { uri, mimeType, name });

  const body = await getUploadBody(uri);
  const safeName = sanitizeFileName(name);
  const path = `chat/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(CHAT_UPLOAD_BUCKET).upload(path, body, {
    contentType: mimeType ?? undefined,
    upsert: false,
  });

  if (error) {
    console.log('[UploadService] Upload error:', error.message);
    throw new Error(error.message || 'Upload failed.');
  }

  const { data } = supabase.storage.from(CHAT_UPLOAD_BUCKET).getPublicUrl(path);
  console.log('[UploadService] Upload completed:', data.publicUrl);

  return {
    url: data.publicUrl,
    fileType: guessFileType(mimeType),
  };
}

export const uploadService = {
  async pickImageAndUpload(): Promise<UploadResult | null> {
    const hasPermission = await requestMediaPermission();
    if (!hasPermission) {
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.85,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      console.log('[UploadService] Image upload cancelled');
      return null;
    }

    const asset = result.assets[0];
    if (!asset) {
      return null;
    }

    return uploadToSupabase(asset.uri, asset.mimeType ?? 'image/jpeg', asset.fileName ?? null);
  },

  async pickVideoAndUpload(): Promise<UploadResult | null> {
    const hasPermission = await requestMediaPermission();
    if (!hasPermission) {
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      quality: 0.85,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      console.log('[UploadService] Video upload cancelled');
      return null;
    }

    const asset = result.assets[0];
    if (!asset) {
      return null;
    }

    return uploadToSupabase(asset.uri, asset.mimeType ?? 'video/mp4', asset.fileName ?? null);
  },

  async pickDocumentAndUpload(): Promise<UploadResult | null> {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/pdf', '*/*'],
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      console.log('[UploadService] Document upload cancelled');
      return null;
    }

    const asset = result.assets[0];
    if (!asset) {
      return null;
    }

    return uploadToSupabase(asset.uri, asset.mimeType ?? 'application/octet-stream', asset.name ?? null);
  },
};
