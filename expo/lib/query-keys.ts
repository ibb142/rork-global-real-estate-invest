export const queryKeys = {
  auth: {
    profile: ['user-profile'] as const,
    securityProfile: ['security-profile'] as const,
  },
  wallet: {
    balance: ['wallet-balance'] as const,
    transactions: (page: number, limit: number) =>
      ['transactions', page, limit] as const,
  },
  holdings: {
    all: ['holdings'] as const,
  },
  properties: {
    all: ['properties'] as const,
    detail: (id: string) => ['property', id] as const,
  },
  market: {
    data: ['market-data'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
  },
} as const;
