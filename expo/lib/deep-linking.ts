import { Linking } from 'react-native';

export const DEEP_LINK_PREFIX = ['rork-app://', 'https://ivxholding.com'];

export interface DeepLinkConfig {
  screens: Record<string, string>;
}

export const LINKING_CONFIG: DeepLinkConfig = {
  screens: {
    'property/[id]': 'property/:id',
    'wallet': 'wallet',
    'kyc-verification': 'kyc',
    'referrals': 'referrals',
    'notifications': 'notifications',
    'login': 'login',
    'signup': 'signup',
    'jv-invest': 'invest/jv',
    'buy-shares': 'invest/shares',
  },
};

export async function getInitialURL(): Promise<string | null> {
  try {
    const url = await Linking.getInitialURL();
    if (url) {
      console.log('[DeepLink] Initial URL:', url);
    }
    return url;
  } catch {
    return null;
  }
}

export function parseDeepLink(url: string): { screen: string; params: Record<string, string> } | null {
  try {
    const stripped = url
      .replace('rork-app://', '')
      .replace('https://ivxholding.com/', '')
      .replace(/^\//, '');

    const [path, queryString] = stripped.split('?');
    const params: Record<string, string> = {};

    if (queryString) {
      const searchParams = new URLSearchParams(queryString);
      searchParams.forEach((value, key) => {
        params[key] = value;
      });
    }

    console.log('[DeepLink] Parsed:', path, params);
    return { screen: path || 'index', params };
  } catch {
    return null;
  }
}

console.log('[DeepLink] Config loaded — prefixes:', DEEP_LINK_PREFIX.join(', '));
