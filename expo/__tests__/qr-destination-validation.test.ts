import { describe, expect, test } from 'bun:test';
import { containsSensitivePayload, validateDestinationUrl } from '@/lib/qr-url';

describe('validateDestinationUrl (item 10)', () => {
  test('accepts real production destinations', () => {
    expect(validateDestinationUrl('https://ivxholding.com/property/casa-rosario').ok).toBe(true);
    expect(validateDestinationUrl('https://ipxholding.com/join?ref=abc').ok).toBe(true);
    expect(validateDestinationUrl('https://chat.ivxholding.com/').ok).toBe(true);
  });

  test('rejects empty values', () => {
    expect(validateDestinationUrl('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateDestinationUrl('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateDestinationUrl(null)).toEqual({ ok: false, reason: 'empty' });
    expect(validateDestinationUrl(undefined)).toEqual({ ok: false, reason: 'empty' });
  });

  test('rejects PLACEHOLDER and UNKNOWN values', () => {
    expect(validateDestinationUrl('https://example.com/PLACEHOLDER').reason).toBe('forbidden-value');
    expect(validateDestinationUrl('UNKNOWN').reason).toBe('forbidden-value');
    expect(validateDestinationUrl('https://site.com/?next=PENDING').reason).toBe('forbidden-value');
  });

  test('rejects localhost and loopback/LAN hosts', () => {
    expect(validateDestinationUrl('http://localhost:3000/pay').reason).toBe('forbidden-host');
    expect(validateDestinationUrl('http://127.0.0.1:8081').reason).toBe('forbidden-host');
    expect(validateDestinationUrl('http://192.168.1.20:19000').reason).toBe('forbidden-host');
    expect(validateDestinationUrl('http://10.0.0.5/admin').reason).toBe('forbidden-host');
  });

  test('rejects Rork preview URLs', () => {
    expect(validateDestinationUrl('https://h664fqwph5y1q3kpwevcn.rork.app/preview').reason).toBe('forbidden-host');
    expect(validateDestinationUrl('https://rork.app/pa/x/y').reason).toBe('forbidden-host');
  });

  test('rejects temporary Expo tunnel URLs', () => {
    expect(validateDestinationUrl('https://abc-123.exp.direct/--/route').reason).toBe('forbidden-host');
    expect(validateDestinationUrl('https://u.expo.dev/update/123').reason).toBe('forbidden-host');
  });

  test('rejects invalid protocols', () => {
    expect(validateDestinationUrl('exp://abc-123.ivx-tunnel.dev').reason).toBe('invalid-protocol');
    expect(validateDestinationUrl('javascript:alert(1)').reason).toBe('invalid-protocol');
    expect(validateDestinationUrl('file:///etc/passwd').reason).toBe('invalid-protocol');
  });

  test('rejects expired signed URLs', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(validateDestinationUrl(`https://cdn.ivx.com/doc.pdf?Expires=${past}&Signature=x`).reason).toBe('expired-signed-url');
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(validateDestinationUrl(`https://cdn.ivx.com/doc.pdf?Expires=${future}&Signature=x`).ok).toBe(true);
  });

  test('rejects garbage that is not a URL', () => {
    expect(validateDestinationUrl('not a url').reason).toBe('not-a-url');
  });
});

describe('containsSensitivePayload (item 16)', () => {
  test('detects GitHub tokens', () => {
    expect(containsSensitivePayload('https://x.com/?t=ghp_abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
    expect(containsSensitivePayload('github_pat_11AAAAAA0abcdefghijklmnopqrst')).toBe(true);
  });

  test('detects JWTs (Supabase/session tokens)', () => {
    expect(
      containsSensitivePayload('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc-def_ghi'),
    ).toBe(true);
  });

  test('detects password/api key query params', () => {
    expect(containsSensitivePayload('https://x.com/login?password=hunter2')).toBe(true);
    expect(containsSensitivePayload('https://x.com/?api_key=abcd1234')).toBe(true);
    expect(containsSensitivePayload('https://x.com/?session_token=deadbeef')).toBe(true);
  });

  test('passes clean production links', () => {
    expect(containsSensitivePayload('https://ivxholding.com/property/casa-rosario?ref=ivx')).toBe(false);
    expect(containsSensitivePayload('https://ipxholding.com/join?ref=IVX-PARTNER-01')).toBe(false);
  });
});
