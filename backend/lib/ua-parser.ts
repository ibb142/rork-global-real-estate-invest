export interface ParsedUA {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  device: 'Mobile' | 'Tablet' | 'Desktop' | 'Bot' | 'Unknown';
  deviceModel: string;
  isBot: boolean;
}

export function parseUserAgent(ua: string): ParsedUA {
  if (!ua) {
    return { browser: 'Unknown', browserVersion: '', os: 'Unknown', osVersion: '', device: 'Unknown', deviceModel: '', isBot: false };
  }

  const isBot = /bot|crawler|spider|crawling|facebookexternalhit|slurp|googlebot|bingbot|yandex|baidu|duckduck/i.test(ua);

  let browser = 'Unknown';
  let browserVersion = '';

  if (/edg\//i.test(ua)) {
    browser = 'Edge';
    browserVersion = ua.match(/edg\/([\d.]+)/i)?.[1] || '';
  } else if (/opr\//i.test(ua) || /opera/i.test(ua)) {
    browser = 'Opera';
    browserVersion = ua.match(/(?:opr|opera)\/([\d.]+)/i)?.[1] || '';
  } else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) {
    browser = 'Chrome';
    browserVersion = ua.match(/chrome\/([\d.]+)/i)?.[1] || '';
  } else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) {
    browser = 'Safari';
    browserVersion = ua.match(/version\/([\d.]+)/i)?.[1] || '';
  } else if (/firefox\//i.test(ua)) {
    browser = 'Firefox';
    browserVersion = ua.match(/firefox\/([\d.]+)/i)?.[1] || '';
  } else if (/msie|trident/i.test(ua)) {
    browser = 'IE';
    browserVersion = ua.match(/(?:msie |rv:)([\d.]+)/i)?.[1] || '';
  } else if (/samsungbrowser/i.test(ua)) {
    browser = 'Samsung Browser';
    browserVersion = ua.match(/samsungbrowser\/([\d.]+)/i)?.[1] || '';
  }

  let os = 'Unknown';
  let osVersion = '';

  if (/iphone/i.test(ua)) {
    os = 'iOS';
    osVersion = ua.match(/iphone os ([\d_]+)/i)?.[1]?.replace(/_/g, '.') || '';
  } else if (/ipad/i.test(ua)) {
    os = 'iPadOS';
    osVersion = ua.match(/cpu os ([\d_]+)/i)?.[1]?.replace(/_/g, '.') || '';
  } else if (/mac os x/i.test(ua)) {
    os = 'macOS';
    osVersion = ua.match(/mac os x ([\d_.]+)/i)?.[1]?.replace(/_/g, '.') || '';
  } else if (/android/i.test(ua)) {
    os = 'Android';
    osVersion = ua.match(/android ([\d.]+)/i)?.[1] || '';
  } else if (/windows nt/i.test(ua)) {
    os = 'Windows';
    const ntVer = ua.match(/windows nt ([\d.]+)/i)?.[1] || '';
    const winMap: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' };
    osVersion = winMap[ntVer] || ntVer;
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  } else if (/cros/i.test(ua)) {
    os = 'Chrome OS';
  }

  let device: ParsedUA['device'] = 'Desktop';
  let deviceModel = '';

  if (isBot) {
    device = 'Bot';
  } else if (/iphone/i.test(ua)) {
    device = 'Mobile';
    deviceModel = 'iPhone';
  } else if (/ipad/i.test(ua)) {
    device = 'Tablet';
    deviceModel = 'iPad';
  } else if (/android/i.test(ua)) {
    if (/mobile/i.test(ua)) {
      device = 'Mobile';
    } else {
      device = 'Tablet';
    }
    const modelMatch = ua.match(/android [\d.]+;[^)]*?;\s*([^);]+)\s*(?:build|\/)/i);
    deviceModel = modelMatch?.[1]?.trim() || '';
    if (!deviceModel) {
      const simpleMatch = ua.match(/;\s*([a-z][a-z0-9\s\-_.]+)\s*build/i);
      deviceModel = simpleMatch?.[1]?.trim() || '';
    }
  } else if (/mobile|phone/i.test(ua)) {
    device = 'Mobile';
  } else if (/tablet/i.test(ua)) {
    device = 'Tablet';
  }

  return { browser, browserVersion, os, osVersion, device, deviceModel, isBot };
}

export function getClientIP(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first && first !== 'unknown') return first;
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp;

  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  const flyIp = headers.get('fly-client-ip');
  if (flyIp) return flyIp;

  return 'unknown';
}
