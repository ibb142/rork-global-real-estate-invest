import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEntityImageUris } from './image-storage';

export function usePropertyImages(propertyId: string, defaultImages: string[]): {
  images: string[];
  hasStoredImages: boolean;
  isLoading: boolean;
} {
  const storedQuery = useQuery({
    queryKey: ['entity-images', 'property', propertyId],
    queryFn: () => getEntityImageUris('property', propertyId),
    staleTime: 30000,
    enabled: !!propertyId,
  });

  const images = useMemo(() => {
    const stored = storedQuery.data ?? [];
    if (stored.length > 0) {
      return stored;
    }
    return defaultImages;
  }, [storedQuery.data, defaultImages]);

  return {
    images,
    hasStoredImages: (storedQuery.data ?? []).length > 0,
    isLoading: storedQuery.isLoading,
  };
}

export function useProfileImage(userId: string, defaultAvatar?: string): {
  avatarUri: string | undefined;
  hasStoredAvatar: boolean;
  isLoading: boolean;
} {
  const storedQuery = useQuery({
    queryKey: ['entity-images', 'profile', userId],
    queryFn: () => getEntityImageUris('profile', userId),
    staleTime: 30000,
    enabled: !!userId,
  });

  const avatarUri = useMemo(() => {
    const stored = storedQuery.data ?? [];
    if (stored.length > 0) {
      return stored[stored.length - 1];
    }
    return defaultAvatar;
  }, [storedQuery.data, defaultAvatar]);

  return {
    avatarUri,
    hasStoredAvatar: (storedQuery.data ?? []).length > 0,
    isLoading: storedQuery.isLoading,
  };
}
