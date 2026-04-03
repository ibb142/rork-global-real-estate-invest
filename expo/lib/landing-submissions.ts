import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { logAudit } from '@/lib/audit-trail';

export interface LandingSubmission {
  id?: string;
  source: string;
  type: 'investment' | 'registration';
  deal_id?: string;
  deal_name?: string;
  investment_type?: string;
  investment_amount?: number;
  ownership_percent?: number;
  expected_roi?: number;
  full_name: string;
  email: string;
  phone?: string;
  status: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  notes?: string;
}

export async function fetchLandingSubmissions(page = 0, pageSize = 50): Promise<LandingSubmission[]> {
  if (!isSupabaseConfigured()) {
    console.log('[LandingSubmissions] Supabase not configured');
    return [];
  }

  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('landing_submissions')
      .select('*')
      .order('submitted_at', { ascending: false })
      .range(from, to);

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')) {
        console.log('[LandingSubmissions] Table not found — create landing_submissions table in Supabase');
        return [];
      }
      console.log('[LandingSubmissions] Query error:', error.message);
      return [];
    }

    console.log('[LandingSubmissions] Fetched', data?.length ?? 0, 'submissions');
    return (data ?? []) as LandingSubmission[];
  } catch (err) {
    console.log('[LandingSubmissions] Fetch error:', (err as Error)?.message);
    return [];
  }
}

export async function updateSubmissionStatus(
  id: string,
  status: string,
  reviewedBy: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('landing_submissions')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy,
        notes: notes ?? null,
      })
      .eq('id', id);

    if (error) {
      console.log('[LandingSubmissions] Update error:', error.message);
      return { success: false, error: error.message };
    }

    try {
      await logAudit({
        entityType: 'landing_submission',
        entityId: id,
        entityTitle: `Landing submission status: ${status}`,
        action: 'UPDATE',
        source: 'admin',
        details: { status, reviewedBy, notes },
      });
    } catch (auditErr) {
      console.log('[LandingSubmissions] Audit log failed (non-critical):', (auditErr as Error)?.message);
    }

    console.log('[LandingSubmissions] Updated submission', id, 'to', status);
    return { success: true };
  } catch (err) {
    console.log('[LandingSubmissions] Update error:', (err as Error)?.message);
    return { success: false, error: (err as Error)?.message };
  }
}

export async function fetchSubmissionCount(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  try {
    const { count, error } = await supabase
      .from('landing_submissions')
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.log('[LandingSubmissions] Count error:', error.message);
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function getSubmissionStats(): Promise<{
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  totalInvestmentAmount: number;
}> {
  const submissions = await fetchLandingSubmissions(0, 500);
  return {
    total: submissions.length,
    pending: submissions.filter(s => s.status === 'pending').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
    totalInvestmentAmount: submissions
      .filter(s => s.type === 'investment' && s.status !== 'rejected')
      .reduce((sum, s) => sum + (s.investment_amount ?? 0), 0),
  };
}
