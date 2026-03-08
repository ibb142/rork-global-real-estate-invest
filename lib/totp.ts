const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): number[] {
  const cleaned = input.replace(/[\s=-]/g, '').toUpperCase();
  const bytes: number[] = [];
  let buffer = 0;
  let bitsLeft = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_CHARS.indexOf(cleaned[i]);
    if (val === -1) continue;
    buffer = (buffer << 5) | val;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buffer >> bitsLeft) & 0xff);
    }
  }
  return bytes;
}

function hmacSha1(key: number[], message: number[]): number[] {
  const blockSize = 64;
  let keyBytes = [...key];

  if (keyBytes.length > blockSize) {
    keyBytes = sha1(keyBytes);
  }
  while (keyBytes.length < blockSize) {
    keyBytes.push(0);
  }

  const iPad = keyBytes.map((b) => b ^ 0x36);
  const oPad = keyBytes.map((b) => b ^ 0x5c);

  const inner = sha1([...iPad, ...message]);
  return sha1([...oPad, ...inner]);
}

function sha1(data: number[]): number[] {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const msgLen = data.length;
  const bitLen = msgLen * 8;

  const padded = [...data, 0x80];
  while ((padded.length % 64) !== 56) {
    padded.push(0);
  }

  for (let i = 0; i < 8; i++) {
    padded.push((bitLen / Math.pow(2, 8 * (7 - i))) & 0xff);
  }

  for (let offset = 0; offset < padded.length; offset += 64) {
    const w: number[] = new Array(80);
    for (let i = 0; i < 16; i++) {
      w[i] =
        (padded[offset + i * 4] << 24) |
        (padded[offset + i * 4 + 1] << 16) |
        (padded[offset + i * 4 + 2] << 8) |
        padded[offset + i * 4 + 3];
    }
    for (let i = 16; i < 80; i++) {
      const val = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (val << 1) | (val >>> 31);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) & 0xffffffff;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) & 0xffffffff;
    h1 = (h1 + b) & 0xffffffff;
    h2 = (h2 + c) & 0xffffffff;
    h3 = (h3 + d) & 0xffffffff;
    h4 = (h4 + e) & 0xffffffff;
  }

  const result: number[] = [];
  for (const h of [h0, h1, h2, h3, h4]) {
    result.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  }
  return result;
}

export function generateTOTP(secret: string, timeStep = 30, digits = 6): string {
  const keyBytes = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep);

  const counterBytes: number[] = [];
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }

  const hmac = hmacSha1(keyBytes, counterBytes);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

export function getTimeRemaining(timeStep = 30): number {
  const epoch = Math.floor(Date.now() / 1000);
  return timeStep - (epoch % timeStep);
}

export function generateRandomSecret(): string {
  const chars = BASE32_CHARS;
  let secret = '';
  for (let i = 0; i < 32; i++) {
    secret += chars[Math.floor(Math.random() * chars.length)];
  }
  return secret;
}

function parseQueryParams(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!query) return params;
  const pairs = query.split('&');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.substring(0, eqIdx).toLowerCase();
    let value = pair.substring(eqIdx + 1);
    try {
      value = decodeURIComponent(value);
    } catch {}
    params[key] = value;
  }
  return params;
}

export function parseOtpAuthUri(uri: string): { issuer: string; account: string; secret: string } | null {
  try {
    let trimmed = uri.trim();
    console.log('[TOTP] Raw scanned data:', JSON.stringify(trimmed));
    console.log('[TOTP] Data length:', trimmed.length);
    console.log('[TOTP] First 20 chars:', JSON.stringify(trimmed.substring(0, 20)));

    trimmed = trimmed.replace(/^\s+|\s+$/g, '');
    trimmed = trimmed.replace(/[\x00-\x1f]/g, '');

    const otpauthMatch = trimmed.match(/otpauth:\/\//i);
    if (!otpauthMatch) {
      console.log('[TOTP] No otpauth:// found in data');

      const base32Match = trimmed.match(/^[A-Z2-7]+=*$/i);
      if (base32Match && trimmed.length >= 16) {
        console.log('[TOTP] Looks like a raw base32 secret');
        return {
          issuer: 'Unknown',
          account: 'manual',
          secret: trimmed.replace(/\s/g, '').toUpperCase(),
        };
      }
      return null;
    }

    const otpStart = trimmed.indexOf(otpauthMatch[0]);
    trimmed = trimmed.substring(otpStart);

    const schemeEnd = trimmed.indexOf('://') + 3;
    const afterScheme = trimmed.substring(schemeEnd);

    const slashIdx = afterScheme.indexOf('/');
    if (slashIdx === -1) {
      console.log('[TOTP] No slash after type, trying without label');
      const qIdx = afterScheme.indexOf('?');
      if (qIdx >= 0) {
        const paramsPart = afterScheme.substring(qIdx + 1);
        const params = parseQueryParams(paramsPart);
        const secret = (params['secret'] || '').replace(/\s/g, '').toUpperCase();
        if (secret) {
          return {
            issuer: params['issuer'] || 'Unknown',
            account: params['issuer'] || 'Unknown',
            secret,
          };
        }
      }
      return null;
    }

    const otpType = afterScheme.substring(0, slashIdx).toLowerCase();
    console.log('[TOTP] OTP type:', otpType);
    if (otpType !== 'totp' && otpType !== 'hotp') {
      console.log('[TOTP] Unknown OTP type, proceeding anyway:', otpType);
    }

    const rest = afterScheme.substring(slashIdx + 1);
    const qIdx = rest.indexOf('?');
    const labelPart = qIdx >= 0 ? rest.substring(0, qIdx) : rest;
    const paramsPart = qIdx >= 0 ? rest.substring(qIdx + 1) : '';

    let decodedLabel = '';
    try {
      decodedLabel = decodeURIComponent(labelPart);
    } catch {
      decodedLabel = labelPart;
    }

    console.log('[TOTP] Label:', decodedLabel);
    console.log('[TOTP] Params string:', paramsPart);

    let issuer = '';
    let account = decodedLabel;
    if (decodedLabel.includes(':')) {
      const colonIdx = decodedLabel.indexOf(':');
      issuer = decodedLabel.substring(0, colonIdx).trim();
      account = decodedLabel.substring(colonIdx + 1).trim();
    }

    const params = parseQueryParams(paramsPart);
    console.log('[TOTP] Parsed params:', JSON.stringify(params));

    const secret = (params['secret'] || '').replace(/[\s=-]/g, '').toUpperCase();
    if (params['issuer']) {
      issuer = params['issuer'];
    }

    console.log('[TOTP] Parsed - issuer:', issuer, 'account:', account, 'secret length:', secret.length);

    if (!secret) {
      console.log('[TOTP] No secret found in URI');
      return null;
    }

    const validBase32 = /^[A-Z2-7]+=*$/.test(secret);
    if (!validBase32) {
      console.log('[TOTP] Warning: secret may not be valid base32, but proceeding');
    }

    return { issuer: issuer || account || 'Unknown', account: account || issuer || 'Unknown', secret };
  } catch (e) {
    console.error('[TOTP] Parse error:', e);
    return null;
  }
}
