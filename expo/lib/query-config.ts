export const queryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 15,
      retry: (failureCount: number) => failureCount < 2,
      retryDelay: (attemptIndex: number) => Math.min(800 * 2 ** attemptIndex, 4000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: "always" as const,
      throwOnError: false,
      refetchOnError: false,
    },
    mutations: {
      retry: 1,
      retryDelay: 800,
      networkMode: "always" as const,
      throwOnError: false,
    },
  },
};
