import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { ChatFileType, UploadableFile, WebUploadFile } from '../types/chat';

type UploadAsset = {
  uri: string;
  mimeType?: string | null;
  name?: string | null;
  fileName?: string | null;
  file?: unknown;
  size?: number | null;
};

function isWebUploadFile(value: unknown): value is WebUploadFile {
  return !!value && typeof value === 'object' && typeof (value as WebUploadFile).arrayBuffer === 'function';
}

function sanitizeFileName(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return `upload-${Date.now()}`;
  }

  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function guessUploadFileType(mimeType?: string | null): ChatFileType {
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

function buildUploadableFile(asset: UploadAsset): UploadableFile {
  const name = sanitizeFileName(asset.fileName ?? asset.name ?? null);
  const file = isWebUploadFile(asset.file) ? asset.file : null;

  return {
    uri: asset.uri,
    file,
    name,
    type: asset.mimeType ?? file?.type ?? null,
    size: typeof asset.size === 'number' ? asset.size : typeof file?.size === 'number' ? file.size : null,
  };
}

async function requestMediaPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return true;
  }

  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (result.status !== 'granted') {
    Alert.alert('Permission required', 'Please allow media library access to attach a file.');
    return false;
  }

  return true;
}

export const uploadService = {
  async pickImage(): Promise<UploadableFile | null> {
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
      console.log('[UploadService] Image pick cancelled');
      return null;
    }

    const asset = result.assets[0] as UploadAsset | undefined;
    if (!asset) {
      return null;
    }

    console.log('[UploadService] Picked image attachment:', {
      uri: asset.uri,
      mimeType: asset.mimeType ?? null,
      fileName: asset.fileName ?? asset.name ?? null,
    });

    return buildUploadableFile(asset);
  },

  async pickVideo(): Promise<UploadableFile | null> {
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
      console.log('[UploadService] Video pick cancelled');
      return null;
    }

    const asset = result.assets[0] as UploadAsset | undefined;
    if (!asset) {
      return null;
    }

    console.log('[UploadService] Picked video attachment:', {
      uri: asset.uri,
      mimeType: asset.mimeType ?? null,
      fileName: asset.fileName ?? asset.name ?? null,
    });

    return buildUploadableFile(asset);
  },

  async pickDocument(): Promise<UploadableFile | null> {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/pdf', '*/*'],
      base64: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      console.log('[UploadService] Document pick cancelled');
      return null;
    }

    const asset = result.assets[0] as UploadAsset | undefined;
    if (!asset) {
      return null;
    }

    console.log('[UploadService] Picked document attachment:', {
      uri: asset.uri,
      mimeType: asset.mimeType ?? null,
      fileName: asset.fileName ?? asset.name ?? null,
    });

    return buildUploadableFile(asset);
  },
};
