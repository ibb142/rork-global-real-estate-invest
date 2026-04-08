import type { QueryClientConfig } from '@tanstack/react-query';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  if (typeof error === 'string') {
    return error.toLowerCase();
  }

  return '';
}

function isRetryableError(error: unknown): boolean {
  const message = getErrorMessage(error);

  if (!message) {
    return true;
  }

  if (
    message.includes('aborted')
    || message.includes('cancelled')
    || message.includes('canceled')
    || message.includes('401')
    || message.includes('403')
    || message.includes('404')
    || message.includes('422')
  ) {
    return false;
  }

  return (
    message.includes('network')
    || message.includes('timeout')
    || message.includes('fetch')
    || message.includes('500')
    || message.includes('502')
    || message.includes('503')
    || message.includes('504')
    || message.includes('429')
  );
}

export const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10,
      gcTime: 1000 * 60 * 60 * 2,
      retry: (failureCount: number, error: unknown) => {
        if (!isRetryableError(error)) {
          return false;
        }

        return failureCount < 2;
      },
      retryDelay: (attemptIndex: number) => {
        const base = Math.min(1500 * 2 ** attemptIndex, 15000);
        const jitter = Math.random() * 750;
        return base + jitter;
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'online',
      throwOnError: false,
      refetchInterval: false,
      structuralSharing: true,
    },
    mutations: {
      retry: (failureCount: number, error: unknown) => {
        if (!isRetryableError(error)) {
          return false;
        }

        return failureCount < 1;
      },
      retryDelay: (attemptIndex: number) => {
        const base = Math.min(1000 * 2 ** attemptIndex, 8000);
        const jitter = Math.random() * 500;
        return base + jitter;
      },
      networkMode: 'online',
      throwOnError: false,
    },
  },
};
