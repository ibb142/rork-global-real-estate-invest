import { httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/backend/trpc/app-router";
import { getAuthToken, getAuthUserId, getAuthUserRole } from "@/lib/auth-store";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  return process.env.EXPO_PUBLIC_RORK_API_BASE_URL || 'https://ivxholding.com';
};

export const trpcClient = trpc.createClient({
  links: [
    loggerLink({
      enabled: (opts) =>
        process.env.NODE_ENV === "development" &&
        opts.direction === "down" &&
        !(opts.result instanceof Error),
    }),
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
      maxURLLength: 2083,
      headers: () => {
        const token = getAuthToken();
        return {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        };
      },
    }),
  ],
});

export const queryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 3,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: "offlineFirst" as const,
      throwOnError: false,
      refetchOnError: false,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
      networkMode: "offlineFirst" as const,
      throwOnError: false,
    },
  },
};
