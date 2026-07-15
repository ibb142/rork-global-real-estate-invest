/**
 * Reusable progressive loading hook for paginated FlatList data.
 *
 * Fetches the first page immediately, then loads more pages on demand
 * via `loadMore()`. Supports cursor-based and offset-based pagination,
 * background refresh, and React Query caching.
 *
 * @example
 * const { data, isLoading, isFetchingMore, loadMore, hasMore, refresh } = useProgressiveList({
 *   queryKey: ['projects'],
 *   fetchPage: async (page, pageSize) => { ... return { items, hasMore } },
 *   pageSize: 10,
 * });
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export type ProgressiveListResult<T> = {
  items: T[];
  hasMore: boolean;
};

export type FetchPageFn<T> = (page: number, pageSize: number) => Promise<ProgressiveListResult<T>>;

export type UseProgressiveListOptions<T> = {
  queryKey: string[];
  fetchPage: FetchPageFn<T>;
  pageSize: number;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
  onError?: (err: Error) => void;
};

export type UseProgressiveListReturn<T> = {
  data: T[];
  isLoading: boolean;
  isFetchingMore: boolean;
  isError: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  isRefreshing: boolean;
  totalCount: number;
};

export function useProgressiveList<T>({
  queryKey,
  fetchPage,
  pageSize,
  enabled = true,
  staleTime = 1000 * 60 * 5,
  refetchInterval = false,
  onError,
}: UseProgressiveListOptions<T>): UseProgressiveListReturn<T> {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [allItems, setAllItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const accumulatedRef = useRef<T[]>([]);
  const pageRef = useRef<number>(1);

  // First page query — cached by React Query
  const firstPageQuery = useQuery<T[], Error>({
    queryKey: [...queryKey, 'page-1'],
    queryFn: async () => {
      const result = await fetchPage(1, pageSize);
      accumulatedRef.current = result.items;
      pageRef.current = 1;
      setHasMore(result.hasMore);
      return result.items;
    },
    enabled,
    staleTime,
    refetchInterval,
    retry: 1,
  });

  // Sync first page data into accumulated items
  useEffect(() => {
    if (firstPageQuery.data) {
      accumulatedRef.current = firstPageQuery.data;
      setAllItems(firstPageQuery.data);
      pageRef.current = 1;
    }
  }, [firstPageQuery.data]);

  // Handle first page error
  useEffect(() => {
    if (firstPageQuery.isError && onError) {
      onError(firstPageQuery.error);
    }
  }, [firstPageQuery.isError, firstPageQuery.error, onError]);

  const loadMore = useCallback(async () => {
    if (isFetchingMore || !hasMore) return;

    setIsFetchingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const result = await fetchPage(nextPage, pageSize);

      if (result.items.length > 0) {
        // Deduplicate by id if items have an id field
        const existingIds = new Set(
          accumulatedRef.current.map((item: any) => item?.id ?? item?.id)
        );
        const newItems = result.items.filter((item: any) => {
          const id = item?.id;
          if (id && existingIds.has(id)) return false;
          existingIds.add(id);
          return true;
        });

        accumulatedRef.current = [...accumulatedRef.current, ...newItems];
        setAllItems(accumulatedRef.current);
        pageRef.current = nextPage;
      }
      setHasMore(result.hasMore && result.items.length > 0);
    } catch (err) {
      console.error(`[ProgressiveList] loadMore error for ${queryKey.join('.')}:`, err);
      setHasMore(false);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, hasMore, fetchPage, pageSize, queryKey]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    accumulatedRef.current = [];
    setAllItems([]);
    setHasMore(true);
    pageRef.current = 1;
    setCurrentPage(1);
    try {
      await queryClient.invalidateQueries({ queryKey: [...queryKey, 'page-1'] });
      await firstPageQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, queryKey, firstPageQuery]);

  return {
    data: allItems,
    isLoading: firstPageQuery.isLoading,
    isFetchingMore,
    isError: firstPageQuery.isError,
    error: firstPageQuery.error ?? null,
    hasMore,
    loadMore,
    refresh,
    isRefreshing,
    totalCount: allItems.length,
  };
}
