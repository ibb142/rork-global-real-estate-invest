import { httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  const url = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  if (!url) {
    console.warn('[tRPC] EXPO_PUBLIC_RORK_API_BASE_URL is not set — using fallback');
    return 'http://localhost:3000';
  }
  return url;
};

let _trpcClient: ReturnType<typeof trpc.createClient> | null = null;

function getTrpcClient() {
  if (!_trpcClient) {
    try {
      _trpcClient = trpc.createClient({
        links: [
          httpLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
          }),
        ],
      });
    } catch (e) {
      console.error('[tRPC] Failed to create client:', (e as Error)?.message);
      _trpcClient = trpc.createClient({
        links: [
          httpLink({
            url: 'http://localhost:3000/api/trpc',
            transformer: superjson,
          }),
        ],
      });
    }
  }
  return _trpcClient;
}

export const trpcClient = getTrpcClient();
