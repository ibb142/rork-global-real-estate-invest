import { describe, expect, it } from 'bun:test';
import {
  extractSupabaseAnonKey,
  extractSupabaseUrl,
  PRODUCTION_SUPABASE_ANON_KEY,
  PRODUCTION_SUPABASE_URL,
  resolveSupabaseAnonKey,
  resolveSupabaseUrl,
} from '@/lib/supabase-env';

const PRODUCTION_REF = 'kvclcdjmjghndxsngfzb';
const OTHER_REF = 'biikwnqdhsdzyxecekht';

const otherProjectUrl = `https://${OTHER_REF}.supabase.co`;
const otherProjectAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpaWt3bnFkaHNkenl4ZWNla2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDQwNjcyMDAsImV4cCI6MjAxOTY0MzIwMH0.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk';

describe('supabase-env sanitizer', () => {
  it('extracts a real hosted URL from polluted env text', () => {
    const raw = 'Supabase URL   https://kvclcdjmjghndxsngfzb.supabase.co   extra text';
    expect(extractSupabaseUrl(raw)).toBe('https://kvclcdjmjghndxsngfzb.supabase.co');
  });

  it('extracts the production anon JWT from polluted env text', () => {
    const raw = `label ${PRODUCTION_SUPABASE_ANON_KEY} suffix`;
    expect(extractSupabaseAnonKey(raw)).toBe(PRODUCTION_SUPABASE_ANON_KEY);
  });

  it('returns null when no hosted URL is present', () => {
    expect(extractSupabaseUrl('just some random text')).toBeNull();
  });

  it('returns null when no JWT is present', () => {
    expect(extractSupabaseAnonKey('sb_publishable_abc123')).toBeNull();
  });
});

describe('resolveSupabaseUrl', () => {
  it('uses the env URL when it points to the production project', () => {
    const prev = process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_URL = PRODUCTION_SUPABASE_URL;
    expect(resolveSupabaseUrl()).toBe(PRODUCTION_SUPABASE_URL);
    process.env.EXPO_PUBLIC_SUPABASE_URL = prev;
  });

  it('falls back to production URL when env points to a different hosted project', () => {
    const prev = process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_URL = otherProjectUrl;
    expect(resolveSupabaseUrl()).toBe(PRODUCTION_SUPABASE_URL);
    process.env.EXPO_PUBLIC_SUPABASE_URL = prev;
  });

  it('falls back to production URL when env is missing', () => {
    const prev = process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(resolveSupabaseUrl()).toBe(PRODUCTION_SUPABASE_URL);
    if (prev !== undefined) process.env.EXPO_PUBLIC_SUPABASE_URL = prev;
  });
});

describe('resolveSupabaseAnonKey', () => {
  it('uses the env anon key when it belongs to the production project', () => {
    const prev = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = PRODUCTION_SUPABASE_ANON_KEY;
    expect(resolveSupabaseAnonKey()).toBe(PRODUCTION_SUPABASE_ANON_KEY);
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = prev;
  });

  it('falls back to production anon key when env key belongs to a different project', () => {
    const prev = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = otherProjectAnonKey;
    expect(resolveSupabaseAnonKey()).toBe(PRODUCTION_SUPABASE_ANON_KEY);
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = prev;
  });

  it('falls back to production anon key when env key is not a JWT', () => {
    const prev = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_abc123';
    expect(resolveSupabaseAnonKey()).toBe(PRODUCTION_SUPABASE_ANON_KEY);
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = prev;
  });
});
