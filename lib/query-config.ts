export const queryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: (failureCount: number) => failureCount < 3,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: "always" as const,
      throwOnError: false,
      refetchOnError: true,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
      networkMode: "always" as const,
      throwOnError: false,
    },
  },
};
