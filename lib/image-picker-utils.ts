import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';
import { storeImage, storeMultipleImages, StoredImage } from './image-storage';

export interface PickImageOptions {
  allowsMultiple?: boolean;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  entityType: StoredImage['entityType'];
  entityId: string;
  uploadedBy: string;
}

async function requestMediaPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Please grant photo library access to upload images.',
      [{ text: 'OK' }]
    );
    return false;
  }
  return true;
}

async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;

  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Please grant camera access to take photos.',
      [{ text: 'OK' }]
    );
    return false;
  }
  return true;
}

export async function pickImagesFromLibrary(
  options: PickImageOptions
): Promise<StoredImage[]> {
  const hasPermission = await requestMediaPermission();
  if (!hasPermission) return [];

  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: options.allowsMultiple ?? true,
      quality: options.quality ?? 0.85,
      allowsEditing: !options.allowsMultiple,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      console.log('[ImagePicker] User cancelled image selection');
      return [];
    }

    console.log('[ImagePicker] Selected', result.assets.length, 'images');

    const uris = result.assets.map(asset => asset.uri);
    const storedImages = await storeMultipleImages(
      uris,
      options.entityType,
      options.entityId,
      options.uploadedBy
    );

    console.log('[ImagePicker] Stored', storedImages.length, 'images permanently');
    return storedImages;
  } catch (err) {
    console.log('[ImagePicker] Error picking images:', (err as Error)?.message);
    Alert.alert('Error', 'Failed to select images. Please try again.');
    return [];
  }
}

export async function takePhotoWithCamera(
  options: PickImageOptions
): Promise<StoredImage | null> {
  const hasPermission = await requestCameraPermission();
  if (!hasPermission) return null;

  try {
    const result = await ImagePicker.launchCameraAsync({
      quality: options.quality ?? 0.85,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      console.log('[ImagePicker] User cancelled camera');
      return null;
    }

    const asset = result.assets[0];
    console.log('[ImagePicker] Captured photo:', asset.uri);

    const storedImage = await storeImage(
      asset.uri,
      options.entityType,
      options.entityId,
      options.uploadedBy,
      {
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        sizeBytes: asset.fileSize ?? undefined,
      }
    );

    console.log('[ImagePicker] Stored camera photo permanently:', storedImage.id);
    return storedImage;
  } catch (err) {
    console.log('[ImagePicker] Error taking photo:', (err as Error)?.message);
    Alert.alert('Error', 'Failed to capture photo. Please try again.');
    return null;
  }
}

export function showImagePickerOptions(
  options: PickImageOptions,
  onComplete: (images: StoredImage[]) => void
): void {
  Alert.alert(
    'Add Photos',
    'Choose how to add images',
    [
      {
        text: 'Camera',
        onPress: async () => {
          const photo = await takePhotoWithCamera(options);
          if (photo) onComplete([photo]);
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const images = await pickImagesFromLibrary(options);
          if (images.length > 0) onComplete(images);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]
  );
}
