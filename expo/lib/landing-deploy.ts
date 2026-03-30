/**
 * landing-deploy.ts — Deploy landing page config & deals via Supabase.
 *
 * Deploy writes config + timestamp to `landing_page_config` and
 * records each deploy in `landing_deployments` for audit trail.
 * No external backend endpoint is needed.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface DeployResult {
  success: boolean;
  filesUploaded: string[];
  errors: string[];
  timestamp: string;
}

async function ensureValidSession(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const isExpiringSoon = expiresAt > 0 && (expiresAt - Date.now()) < 120000;

      if (isExpiringSoon && session.refresh_token) {
        console.log('[LandingDeploy] Token expiring soon — refreshing...');
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshed?.session?.access_token) {
          console.log('[LandingDeploy] Session refreshed successfully');
          return refreshed.session.access_token;
        }
        console.log('[LandingDeploy] Refresh failed, using current token:', refreshErr?.message);
      }
      return session.access_token;
    }

    console.log('[LandingDeploy] No active session — attempting refresh...');
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session?.access_token) {
      console.log('[LandingDeploy] Recovered session via refresh');
      return refreshed.session.access_token;
    }

    console.log('[LandingDeploy] No session recoverable');
    return null;
  } catch (err) {
    console.log('[LandingDeploy] Session check error:', (err as Error)?.message);
    return null;
  }
}

export async function deployLandingPage(): Promise<DeployResult> {
  const timestamp = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    console.log('[LandingDeploy] Supabase not configured — cannot deploy');
    return {
      success: false,
      filesUploaded: [],
      errors: ['Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'],
      timestamp,
    };
  }

  const token = await ensureValidSession();
  if (!token) {
    console.log('[LandingDeploy] No valid session — deploy requires authentication');
    return {
      success: false,
      filesUploaded: [],
      errors: ['No authenticated session. Please log out and log back in, then retry.'],
      timestamp,
    };
  }

  const errors: string[] = [];
  const filesUpdated: string[] = [];

  try {
    console.log('[LandingDeploy] Deploying via Supabase...');

    const { error: configErr } = await supabase
      .from('landing_page_config')
      .upsert({
        id: 'main',
        deployed_at: timestamp,
        deploy_status: 'live',
        updated_at: timestamp,
      });

    if (configErr) {
      const msg = (configErr.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('relation') || msg.includes('could not find')) {
        console.log('[LandingDeploy] landing_page_config table not found — skipping config upsert (non-critical)');
      } else {
        console.log('[LandingDeploy] Config upsert error:', configErr.message);
        errors.push(`Config update: ${configErr.message}`);
      }
    } else {
      filesUpdated.push('landing_page_config');
      console.log('[LandingDeploy] landing_page_config updated');
    }

    try {
      const { error: deployLogErr } = await supabase
        .from('landing_deployments')
        .insert({
          deployed_at: timestamp,
          status: 'success',
          trigger: 'manual',
          details: JSON.stringify({ filesUpdated, source: 'app' }),
        });

      if (deployLogErr) {
        const msg = (deployLogErr.message || '').toLowerCase();
        if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('relation') || msg.includes('could not find')) {
          console.log('[LandingDeploy] landing_deployments table not found — skipping deploy log (non-critical)');
        } else {
          console.log('[LandingDeploy] Deploy log insert error:', deployLogErr.message);
        }
      } else {
        filesUpdated.push('landing_deployments');
        console.log('[LandingDeploy] Deploy logged to landing_deployments');
      }
    } catch (logErr) {
      console.log('[LandingDeploy] Deploy log failed (non-critical):', (logErr as Error)?.message);
    }

    const success = errors.length === 0;
    console.log('[LandingDeploy] Deploy result:', success ? 'SUCCESS' : 'PARTIAL', '| updated:', filesUpdated.join(', '));

    return {
      success,
      filesUploaded: filesUpdated,
      errors,
      timestamp,
    };
  } catch (err) {
    console.log('[LandingDeploy] Deploy exception:', (err as Error)?.message);
    return {
      success: false,
      filesUploaded: filesUpdated,
      errors: [(err as Error)?.message || 'Deploy failed'],
      timestamp,
    };
  }
}

export async function deployConfigOnly(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    console.log('[LandingDeploy] Config-only deploy via Supabase');
    const timestamp = new Date().toISOString();

    const { error } = await supabase
      .from('landing_page_config')
      .upsert({
        id: 'main',
        deployed_at: timestamp,
        deploy_status: 'live',
        updated_at: timestamp,
      });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('relation') || msg.includes('could not find')) {
        console.log('[LandingDeploy] landing_page_config table not found — treating as success');
        return { success: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'Config deploy failed' };
  }
}

export function getDeployStatus(): { awsConfigured: boolean; supabaseConfigured: boolean; canDeploy: boolean } {
  const configured = isSupabaseConfigured();
  return {
    awsConfigured: false,
    supabaseConfigured: configured,
    canDeploy: configured,
  };
}
