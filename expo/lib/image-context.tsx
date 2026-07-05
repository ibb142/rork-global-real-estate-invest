import { useMemo, useCallback } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  StoredImage,
  getEntityImages,
  storeImage,
  storeMultipleImages,
  removeImage,
  getAllStoredImages,
  getStorageStats,
} from './image-storage';

export const [ImageStorageProvider, useImageStorage] = createContextHook(() => {
  const queryClient = useQueryClient();

  const allImagesQuery = useQuery({
    queryKey: ['stored-images', 'all'],
    queryFn: getAllStoredImages,
    staleTime: 30000,
  });

  const statsQuery = useQuery({
    queryKey: ['stored-images', 'stats'],
    queryFn: getStorageStats,
    staleTime: 60000,
  });

  const storeMutation = useMutation({
    mutationFn: async (params: {
      uri: string;
      entityType: StoredImage['entityType'];
      entityId: string;
      uploadedBy: string;
      options?: { fileName?: string; mimeType?: string; sizeBytes?: number };
    }) => {
      return storeImage(
        params.uri,
        params.entityType,
        params.entityId,
        params.uploadedBy,
        params.options
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stored-images'] });
      void queryClient.invalidateQueries({ queryKey: ['entity-images'] });
    },
  });

  const storeMultipleMutation = useMutation({
    mutationFn: async (params: {
      uris: string[];
      entityType: StoredImage['entityType'];
      entityId: string;
      uploadedBy: string;
    }) => {
      return storeMultipleImages(
        params.uris,
        params.entityType,
        params.entityId,
        params.uploadedBy
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stored-images'] });
      void queryClient.invalidateQueries({ queryKey: ['entity-images'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (imageId: string) => {
      return removeImage(imageId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stored-images'] });
      void queryClient.invalidateQueries({ queryKey: ['entity-images'] });
    },
  });

  const refreshImages = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['stored-images'] });
    void queryClient.invalidateQueries({ queryKey: ['entity-images'] });
  }, [queryClient]);

  return useMemo(() => ({
    allImages: allImagesQuery.data ?? [],
    stats: statsQuery.data,
    isLoading: allImagesQuery.isLoading,
    storeImage: storeMutation.mutateAsync,
    storeMultipleImages: storeMultipleMutation.mutateAsync,
    removeImage: removeMutation.mutateAsync,
    isStoring: storeMutation.isPending || storeMultipleMutation.isPending,
    isRemoving: removeMutation.isPending,
    refreshImages,
  }), [
    allImagesQuery.data,
    allImagesQuery.isLoading,
    statsQuery.data,
    storeMutation.mutateAsync,
    storeMutation.isPending,
    storeMultipleMutation.mutateAsync,
    storeMultipleMutation.isPending,
    removeMutation.mutateAsync,
    removeMutation.isPending,
    refreshImages,
  ]);
});

export function useEntityImages(entityType: StoredImage['entityType'], entityId: string) {
  const query = useQuery({
    queryKey: ['entity-images', entityType, entityId],
    queryFn: () => getEntityImages(entityType, entityId),
    staleTime: 30000,
    enabled: !!entityId,
  });

  return {
    images: query.data ?? [],
    imageUris: (query.data ?? []).map(img => img.uri),
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
