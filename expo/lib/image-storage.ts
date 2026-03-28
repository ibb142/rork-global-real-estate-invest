import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getAuthUserId } from './auth-store';
import { scopedKey } from './project-storage';

const IMAGE_REGISTRY_KEY = scopedKey('image_registry');


export interface StoredImage {
  id: string;
  uri: string;
  originalUri: string;
  entityType: 'property' | 'profile' | 'document' | 'kyc' | 'general';
  entityId: string;
  uploadedBy: string;
  uploadedAt: string;
  isProtected: boolean;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface ImageRegistry {
  [entityKey: string]: StoredImage[];
}

function makeEntityKey(entityType: string, entityId: string): string {
  return `${entityType}::${entityId}`;
}

function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

async function getRegistry(): Promise<ImageRegistry> {
  try {
    const raw = await AsyncStorage.getItem(IMAGE_REGISTRY_KEY);
    if (raw) {
      return JSON.parse(raw) as ImageRegistry;
    }
  } catch (err) {
    console.log('[ImageStorage] Failed to load registry:', (err as Error)?.message);
  }
  return {};
}

async function saveRegistry(registry: ImageRegistry): Promise<void> {
  try {
    await AsyncStorage.setItem(IMAGE_REGISTRY_KEY, JSON.stringify(registry));
    console.log('[ImageStorage] Registry saved successfully');
  } catch (err) {
    console.log('[ImageStorage] Failed to save registry:', (err as Error)?.message);
  }
}

async function syncImageToSupabase(image: StoredImage): Promise<void> {
  const userId = getAuthUserId();
  if (!userId) return;

  try {
    await supabase.from('image_registry').upsert({
      id: image.id,
      user_id: userId,
      deal_id: image.entityId || null,
      url: image.uri,
      storage_path: image.originalUri,
      is_protected: image.isProtected,
    });
    console.log('[ImageStorage] Synced to Supabase:', image.id);
  } catch (err) {
    console.log('[ImageStorage] Supabase sync failed:', err);
  }
}

async function removeImageFromSupabase(imageId: string): Promise<void> {
  try {
    await supabase.from('image_registry').delete().eq('id', imageId);
    console.log('[ImageStorage] Removed from Supabase:', imageId);
  } catch (err) {
    console.log('[ImageStorage] Supabase remove failed:', err);
  }
}

async function getLegacyFileSystem() {
  if (Platform.OS === 'web') return null;
  try {
    const mod = await import('expo-file-system/legacy');
    return mod;
  } catch {
    console.warn('[ImageStorage] Legacy file system not available');
    return null;
  }
}

async function copyToLocalStorage(sourceUri: string, imageId: string): Promise<string> {
  if (Platform.OS === 'web') {
    return sourceUri;
  }

  const LegacyFS = await getLegacyFileSystem();
  if (!LegacyFS || !LegacyFS.documentDirectory) {
    return sourceUri;
  }

  try {
    const dir = `${LegacyFS.documentDirectory}ivx_images/`;
    const dirInfo = await LegacyFS.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await LegacyFS.makeDirectoryAsync(dir, { intermediates: true });
    }

    const extension = sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
    const destUri = `${dir}${imageId}.${extension}`;

    if (sourceUri.startsWith('http')) {
      const downloadResult = await LegacyFS.downloadAsync(sourceUri, destUri);
      console.log('[ImageStorage] Downloaded remote image to:', downloadResult.uri);
      return downloadResult.uri;
    } else {
      await LegacyFS.copyAsync({ from: sourceUri, to: destUri });
      console.log('[ImageStorage] Copied local image to:', destUri);
      return destUri;
    }
  } catch (err) {
    console.log('[ImageStorage] Failed to copy image, using original URI:', (err as Error)?.message);
    return sourceUri;
  }
}

export async function storeImage(
  uri: string,
  entityType: StoredImage['entityType'],
  entityId: string,
  uploadedBy: string,
  options?: { fileName?: string; mimeType?: string; sizeBytes?: number }
): Promise<StoredImage> {
  const imageId = generateImageId();
  const localUri = await copyToLocalStorage(uri, imageId);

  const storedImage: StoredImage = {
    id: imageId,
    uri: localUri,
    originalUri: uri,
    entityType,
    entityId,
    uploadedBy,
    uploadedAt: new Date().toISOString(),
    isProtected: true,
    fileName: options?.fileName,
    mimeType: options?.mimeType,
    sizeBytes: options?.sizeBytes,
  };

  const registry = await getRegistry();
  const key = makeEntityKey(entityType, entityId);

  if (!registry[key]) {
    registry[key] = [];
  }
  registry[key].push(storedImage);

  await saveRegistry(registry);
  void syncImageToSupabase(storedImage);

  try {
    const { registerImageBackup } = await import('./image-backup');
    void registerImageBackup({
      imageId,
      entityType,
      entityId,
      primaryUrl: localUri,
      localUri: uri !== localUri ? uri : undefined,
    });
  } catch (err) {
    console.log('[ImageStorage] Backup registration failed (non-critical):', (err as Error)?.message);
  }

  console.log('[ImageStorage] Stored image:', imageId, 'for', key);
  return storedImage;
}

export async function storeMultipleImages(
  uris: string[],
  entityType: StoredImage['entityType'],
  entityId: string,
  uploadedBy: string
): Promise<StoredImage[]> {
  const results: StoredImage[] = [];
  for (const uri of uris) {
    const stored = await storeImage(uri, entityType, entityId, uploadedBy);
    results.push(stored);
  }
  return results;
}

export async function getEntityImages(
  entityType: StoredImage['entityType'],
  entityId: string
): Promise<StoredImage[]> {
  const userId = getAuthUserId();
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('image_registry')
        .select('*')
        .eq('user_id', userId)
        .eq('deal_id', entityId);

      if (!error && data && data.length > 0) {
        console.log('[ImageStorage] Loaded from Supabase:', data.length, 'images');
        return data.map((row: any) => ({
          id: row.id,
          uri: row.url || '',
          originalUri: row.storage_path || row.url || '',
          entityType: entityType,
          entityId: row.deal_id || entityId,
          uploadedBy: row.user_id || '',
          uploadedAt: row.created_at || new Date().toISOString(),
          isProtected: row.is_protected ?? true,
        }));
      }
    } catch (err) {
      console.log('[ImageStorage] Supabase fetch failed, using local:', err);
    }
  }

  const registry = await getRegistry();
  const key = makeEntityKey(entityType, entityId);
  return registry[key] || [];
}

export async function getEntityImageUris(
  entityType: StoredImage['entityType'],
  entityId: string
): Promise<string[]> {
  const images = await getEntityImages(entityType, entityId);
  return images.map(img => img.uri);
}

export async function removeImage(imageId: string): Promise<boolean> {
  const registry = await getRegistry();

  for (const key of Object.keys(registry)) {
    const images = registry[key];
    if (!images) continue;
    const imageIndex = images.findIndex(img => img.id === imageId);
    if (imageIndex >= 0) {
      const image = images[imageIndex];
      if (!image) continue;
      if (image.isProtected) {
        console.warn('[ImageStorage] Cannot remove protected image:', imageId);
        return false;
      }

      if (Platform.OS !== 'web') {
        const LegacyFS = await getLegacyFileSystem();
        if (LegacyFS && LegacyFS.documentDirectory && image.uri.startsWith(LegacyFS.documentDirectory)) {
          try {
            await LegacyFS.deleteAsync(image.uri, { idempotent: true });
          } catch (err) {
            console.log('[ImageStorage] Failed to delete file:', (err as Error)?.message);
          }
        }
      }

      images.splice(imageIndex, 1);
      registry[key] = images;
      await saveRegistry(registry);
      void removeImageFromSupabase(imageId);
      console.log('[ImageStorage] Removed image:', imageId);
      return true;
    }
  }

  console.warn('[ImageStorage] Image not found:', imageId);
  return false;
}

export async function setImageProtection(imageId: string, isProtected: boolean): Promise<void> {
  const registry = await getRegistry();

  for (const key of Object.keys(registry)) {
    const images = registry[key];
    if (!images) continue;
    const image = images.find(img => img.id === imageId);
    if (image) {
      image.isProtected = isProtected;
      await saveRegistry(registry);

      try {
        await supabase.from('image_registry').update({ is_protected: isProtected }).eq('id', imageId);
      } catch (err) {
        console.log('[ImageStorage] Supabase protection update failed:', err);
      }

      console.log('[ImageStorage] Image protection set:', imageId, isProtected);
      return;
    }
  }
}

export async function getAllStoredImages(): Promise<StoredImage[]> {
  const userId = getAuthUserId();
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('image_registry')
        .select('*')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });

      if (!error && data && data.length > 0) {
        console.log('[ImageStorage] All images from Supabase:', data.length);
        return data.map((row: any) => ({
          id: row.id,
          uri: row.url || '',
          originalUri: row.storage_path || row.url || '',
          entityType: 'general' as const,
          entityId: row.deal_id || '',
          uploadedBy: row.user_id || '',
          uploadedAt: row.created_at || new Date().toISOString(),
          isProtected: row.is_protected ?? true,
        }));
      }
    } catch (err) {
      console.log('[ImageStorage] Supabase all images fetch failed:', err);
    }
  }

  const registry = await getRegistry();
  const all: StoredImage[] = [];
  for (const key of Object.keys(registry)) {
    const images = registry[key];
    if (images) all.push(...images);
  }
  return all;
}

export async function getStorageStats(): Promise<{
  totalImages: number;
  protectedImages: number;
  byEntityType: Record<string, number>;
}> {
  const all = await getAllStoredImages();
  const byEntityType: Record<string, number> = {};

  for (const img of all) {
    byEntityType[img.entityType] = (byEntityType[img.entityType] || 0) + 1;
  }

  return {
    totalImages: all.length,
    protectedImages: all.filter(img => img.isProtected).length,
    byEntityType,
  };
}

export async function clearAllImages(): Promise<void> {
  if (Platform.OS !== 'web') {
    const LegacyFS = await getLegacyFileSystem();
    if (LegacyFS && LegacyFS.documentDirectory) {
      try {
        const dir = `${LegacyFS.documentDirectory}ivx_images/`;
        const dirInfo = await LegacyFS.getInfoAsync(dir);
        if (dirInfo.exists) {
          await LegacyFS.deleteAsync(dir, { idempotent: true });
        }
      } catch (err) {
        console.log('[ImageStorage] Failed to clear image directory:', (err as Error)?.message);
      }
    }
  }
  await AsyncStorage.removeItem(IMAGE_REGISTRY_KEY);

  const userId = getAuthUserId();
  if (userId) {
    try {
      await supabase.from('image_registry').delete().eq('user_id', userId);
      console.log('[ImageStorage] Cleared all images from Supabase');
    } catch (err) {
      console.log('[ImageStorage] Supabase clear failed:', err);
    }
  }

  console.log('[ImageStorage] All images cleared');
}
