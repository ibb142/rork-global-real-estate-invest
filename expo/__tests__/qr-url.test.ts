import { describe, expect, test } from 'bun:test';
import {
  extractQrDestinationUrl,
  isProbablyHttpUrl,
  isQrImageUrl,
  safeUrlHost,
} from '@/lib/qr-url';

describe('isQrImageUrl', () => {
  test('detects api.qrserver.com create-qr-code URLs', () => {
    expect(
      isQrImageUrl('https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Fivxholding.com'),
    ).toBe(true);
  });

  test('detects qrserver host without params', () => {
    expect(isQrImageUrl('https://api.qrserver.com/v1/create-qr-code/')).toBe(true);
  });

  test('does not flag normal links', () => {
    expect(isQrImageUrl('https://ivxholding.com/join?ref=abc')).toBe(false);
    expect(isQrImageUrl('https://ivxholding.com/videos/casa-rosario.mp4')).toBe(false);
  });

  test('handles invalid input without crashing', () => {
    expect(isQrImageUrl(null)).toBe(false);
    expect(isQrImageUrl(undefined)).toBe(false);
    expect(isQrImageUrl('')).toBe(false);
    expect(isQrImageUrl('not a url at all')).toBe(false);
  });
});

describe('extractQrDestinationUrl', () => {
  test('extracts the encoded destination from qrserver URLs', () => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent('https://ipxholding.com/join?ref=xyz&utm_source=social')}`;
    expect(extractQrDestinationUrl(url)).toBe('https://ipxholding.com/join?ref=xyz&utm_source=social');
  });

  test('rejects non-http payloads (never exposes exp:// or token payloads)', () => {
    const expUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent('exp://some-tunnel.exp.direct')}`;
    expect(extractQrDestinationUrl(expUrl)).toBeNull();
    const secretPayload = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent('session-token-abc123')}`;
    expect(extractQrDestinationUrl(secretPayload)).toBeNull();
  });

  test('returns null for invalid input', () => {
    expect(extractQrDestinationUrl(null)).toBeNull();
    expect(extractQrDestinationUrl('https://api.qrserver.com/v1/create-qr-code/')).toBeNull();
  });
});

describe('isProbablyHttpUrl', () => {
  test('accepts http(s) only', () => {
    expect(isProbablyHttpUrl('https://ivxholding.com')).toBe(true);
    expect(isProbablyHttpUrl('exp://tunnel.exp.direct')).toBe(false);
    expect(isProbablyHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isProbablyHttpUrl('')).toBe(false);
  });
});

describe('safeUrlHost', () => {
  test('returns host only — never the payload', () => {
    expect(safeUrlHost('https://api.qrserver.com/v1/create-qr-code/?data=secret')).toBe('api.qrserver.com');
    expect(safeUrlHost('garbage')).toBe('invalid-url');
  });
});
