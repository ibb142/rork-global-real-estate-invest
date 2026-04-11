import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAuthUserId } from '@/lib/auth-store';
import { useRealtimeTable } from '@/lib/realtime';

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'transaction' | 'kyc' | 'system' | 'investment' | 'alert' | 'promotion';
  read: boolean;
  data?: Record<string, unknown>;
  created_at: string;
}

const NOTIFICATION_QUERY_KEY = ['notifications'];
const NOTIFICATION_POLL_INTERVAL_MS = 180_000;

export function useNotifications() {
  const queryClient = useQueryClient();
  const userId = getAuthUserId();

  const query = useQuery({
    queryKey: NOTIFICATION_QUERY_KEY,
    queryFn: async (): Promise<AppNotification[]> => {
      if (!userId || !isSupabaseConfigured()) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.log('[Notifications] Fetch error:', error.message);
        return [];
      }
      console.log('[Notifications] Fetched', data?.length ?? 0, 'notifications');
      return (data as AppNotification[]) ?? [];
    },
    enabled: !!userId && isSupabaseConfigured(),
    staleTime: 60_000,
    refetchInterval: NOTIFICATION_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  useRealtimeTable('notifications', [NOTIFICATION_QUERY_KEY], {
    filter: userId ? `user_id=eq.${userId}` : undefined,
    onPayload: (payload) => {
      console.log('[Notifications] Realtime update:', payload.eventType);
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!isSupabaseConfigured()) return;
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);
      if (error) console.log('[Notifications] Mark read error:', error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !isSupabaseConfigured()) return;
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (error) console.log('[Notifications] Mark all read error:', error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY });
    },
  });

  const unreadCount = useMemo(() => {
    return (query.data ?? []).filter(n => !n.read).length;
  }, [query.data]);

  return {
    notifications: query.data ?? [],
    isLoading: query.isLoading,
    unreadCount,
    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
    refetch: query.refetch,
  };
}

export async function createNotification(notification: {
  userId: string;
  title: string;
  body: string;
  type: AppNotification['type'];
  data?: Record<string, unknown>;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: notification.userId,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      read: false,
      data: notification.data ?? {},
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.log('[Notifications] Create error:', error.message);
      return false;
    }
    console.log('[Notifications] Created:', notification.title);
    return true;
  } catch (e) {
    console.log('[Notifications] Create exception:', (e as Error)?.message);
    return false;
  }
}
