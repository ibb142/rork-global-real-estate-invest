export const queryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60,
      retry: (failureCount: number) => failureCount < 2,
      retryDelay: (attemptIndex: number) => {
        const base = Math.min(2000 * 2 ** attemptIndex, 30000);
        const jitter = Math.random() * 1000;
        return base + jitter;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: "online" as const,
      throwOnError: false,
      refetchOnError: false,
      refetchInterval: false as const,
      structuralSharing: true,
    },
    mutations: {
      retry: 2,
      retryDelay: (attemptIndex: number) => {
        const base = Math.min(2000 * 2 ** attemptIndex, 15000);
        const jitter = Math.random() * 500;
        return base + jitter;
      },
      networkMode: "online" as const,
      throwOnError: false,
    },
  },
};
