import { useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface SearchResult {
  id: string;
  type: 'property' | 'deal' | 'document' | 'notification' | 'user';
  title: string;
  subtitle: string;
  route: string;
  icon: string;
}

export function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const search = useCallback(async (searchQuery: string) => {
    const q = searchQuery.trim();
    setQuery(q);
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const allResults: SearchResult[] = [];

    try {
      if (isSupabaseConfigured()) {
        const { data: deals } = await supabase
          .from('jv_deals')
          .select('id, title, location, status')
          .or(`title.ilike.%${q}%,location.ilike.%${q}%`)
          .limit(5);

        if (deals) {
          for (const deal of deals) {
            allResults.push({
              id: deal.id,
              type: 'deal',
              title: deal.title || 'Untitled Deal',
              subtitle: deal.location || deal.status || '',
              route: `/property/${deal.id}`,
              icon: 'building',
            });
          }
        }

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(5);

        if (profiles) {
          for (const profile of profiles) {
            allResults.push({
              id: profile.id,
              type: 'user',
              title: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown',
              subtitle: profile.email || '',
              route: `/admin/member/${profile.id}`,
              icon: 'user',
            });
          }
        }

        const { data: notifications } = await supabase
          .from('notifications')
          .select('id, title, body, type')
          .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
          .limit(5);

        if (notifications) {
          for (const notif of notifications) {
            allResults.push({
              id: notif.id,
              type: 'notification',
              title: notif.title || 'Notification',
              subtitle: notif.body?.slice(0, 80) || '',
              route: '/notifications',
              icon: 'bell',
            });
          }
        }
      }

      const staticRoutes: { title: string; subtitle: string; route: string; icon: string }[] = [
        { title: 'Wallet', subtitle: 'Deposits & withdrawals', route: '/wallet', icon: 'wallet' },
        { title: 'Portfolio', subtitle: 'Your investments', route: '/(tabs)/portfolio', icon: 'briefcase' },
        { title: 'KYC Verification', subtitle: 'Identity verification', route: '/kyc-verification', icon: 'shield' },
        { title: 'Security Settings', subtitle: 'Password & 2FA', route: '/security-settings', icon: 'lock' },
        { title: 'Notifications', subtitle: 'Alerts & updates', route: '/notifications', icon: 'bell' },
        { title: 'Referrals', subtitle: 'Invite friends & earn', route: '/referrals', icon: 'users' },
        { title: 'Legal', subtitle: 'Terms & privacy', route: '/legal', icon: 'file-text' },
        { title: 'Contract Generator', subtitle: 'Generate legal documents', route: '/contract-generator', icon: 'file-text' },
        { title: 'AI Gallery', subtitle: 'AI-generated content', route: '/ai-gallery', icon: 'image' },
        { title: 'Analytics Report', subtitle: 'App analytics', route: '/analytics-report', icon: 'bar-chart' },
      ];

      const matchedRoutes = staticRoutes.filter(
        r => r.title.toLowerCase().includes(q.toLowerCase()) || r.subtitle.toLowerCase().includes(q.toLowerCase())
      );

      for (const route of matchedRoutes) {
        allResults.push({
          id: `route_${route.route}`,
          type: 'document',
          title: route.title,
          subtitle: route.subtitle,
          route: route.route,
          icon: route.icon,
        });
      }

      console.log('[Search] Query:', q, '→', allResults.length, 'results');
      setResults(allResults);
    } catch (error) {
      console.log('[Search] Error:', (error as Error)?.message);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
  }, []);

  return { query, results, isSearching, search, clear };
}
