import { supabase } from '@/lib/supabase';

export interface LandingConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiBaseUrl: string;
  appUrl: string;
  deployedAt: string;
}

export function getSupabaseCredentials(): { url: string; anonKey: string; configured: boolean } {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const configured = !!(url && anonKey && url.length > 10 && anonKey.length > 10);
  console.log('[LandingConfig] Supabase URL:', url ? url.substring(0, 40) + '...' : '(empty)');
  console.log('[LandingConfig] Supabase Key:', anonKey ? anonKey.substring(0, 20) + '...' : '(empty)');
  console.log('[LandingConfig] Configured:', configured);
  return { url, anonKey, configured };
}

export function generateLandingConfig(): LandingConfig {
  const { url, anonKey } = getSupabaseCredentials();
  const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');
  const appUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');

  return {
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    apiBaseUrl,
    appUrl,
    deployedAt: new Date().toISOString(),
  };
}

export function generateDeployCommand(): string {
  const { url, anonKey } = getSupabaseCredentials();
  if (!url || !anonKey) {
    return '# Supabase credentials not configured in project settings\n# Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY first';
  }

  return [
    `EXPO_PUBLIC_SUPABASE_URL="${url}" \\`,
    `EXPO_PUBLIC_SUPABASE_ANON_KEY="${anonKey}" \\`,
    `AWS_ACCESS_KEY_ID="YOUR_AWS_KEY" \\`,
    `AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET" \\`,
    `AWS_REGION="us-east-1" \\`,
    `node deploy-landing.mjs`,
  ].join('\n');
}

export function generateDeployCommandFull(awsKey: string, awsSecret: string, awsRegion: string = 'us-east-1'): string {
  const { url, anonKey } = getSupabaseCredentials();
  return [
    `EXPO_PUBLIC_SUPABASE_URL="${url}" \\`,
    `EXPO_PUBLIC_SUPABASE_ANON_KEY="${anonKey}" \\`,
    `AWS_ACCESS_KEY_ID="${awsKey}" \\`,
    `AWS_SECRET_ACCESS_KEY="${awsSecret}" \\`,
    `AWS_REGION="${awsRegion}" \\`,
    `node deploy-landing.mjs`,
  ].join('\n');
}

export async function pushConfigToSupabase(): Promise<{ success: boolean; error?: string }> {
  const config = generateLandingConfig();

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return { success: false, error: 'Supabase credentials not configured' };
  }

  try {
    const { error: upsertError } = await supabase
      .from('app_config')
      .upsert({
        key: 'landing_config',
        value: JSON.stringify(config),
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      const msg = (upsertError.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')) {
        console.log('[LandingConfig] app_config table not found — creating via insert...');
        return { success: false, error: 'app_config table not found. Create it in Supabase first.' };
      }
      console.log('[LandingConfig] Upsert error:', upsertError.message);
      return { success: false, error: upsertError.message };
    }

    console.log('[LandingConfig] Config pushed to Supabase app_config table ✓');
    return { success: true };
  } catch (err) {
    console.log('[LandingConfig] Push failed:', (err as Error)?.message);
    return { success: false, error: (err as Error)?.message };
  }
}

export function getSupabaseRestUrl(): string {
  const { url } = getSupabaseCredentials();
  if (!url) return '';
  return `${url}/rest/v1`;
}

export function generateConfigJson(): string {
  const config = generateLandingConfig();
  return JSON.stringify(config, null, 2);
}

export function getLandingPageSupabaseFetchUrl(): string {
  const { url, anonKey } = getSupabaseCredentials();
  if (!url || !anonKey) return '';
  return `${url}/rest/v1/jv_deals?select=*&published=eq.true&status=eq.active&order=created_at.desc&apikey=${anonKey}`;
}
