import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchRawEvents, computeAnalytics, fetchExtraCounts } from '@/lib/analytics-compute';
import type { ComputedAnalytics } from '@/lib/analytics-compute';
import { usePresenceTracker } from '@/lib/realtime-presence';

export type PeriodType = '1h' | '24h' | '7d' | '30d' | '90d' | 'all';
export type TabType = 'overview' | 'acquisition' | 'funnel' | 'geo' | 'insights' | 'live' | 'leads';

export interface UseAnalyticsReportResult {
  data: ComputedAnalytics | null;
  isLoading: boolean;
  isError: boolean;
  errorMsg: string;
  isConnected: boolean;
  lastUpdated: string;
  fetchCount: number;
  period: PeriodType;
  setPeriod: (p: PeriodType) => void;
  activeTab: TabType;
  setActiveTab: (t: TabType) => void;
  manualRefreshing: boolean;
  onRefresh: () => Promise<void>;
  presenceState: ReturnType<typeof usePresenceTracker>;
  diagnostics: {
    pendingCount: number;
    queuedCount: number;
    hasNoRealData: boolean;
  };
}

const LIVE_ANALYTICS_REFRESH_INTERVAL_MS = 60_000;
const STANDARD_ANALYTICS_REFRESH_INTERVAL_MS = 180_000;
const ANALYTICS_STALE_TIME_MS = 60_000;

export function useAnalyticsReport(): UseAnalyticsReportResult {
  const [period, setPeriod] = useState<PeriodType>('all');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [manualRefreshing, setManualRefreshing] = useState<boolean>(false);
  const [fetchCount, setFetchCount] = useState<number>(0);
  const queryClient = useQueryClient();

  const pollInterval = activeTab === 'live'
    ? LIVE_ANALYTICS_REFRESH_INTERVAL_MS
    : STANDARD_ANALYTICS_REFRESH_INTERVAL_MS;

  const analyticsQuery = useQuery<ComputedAnalytics | null>({
    queryKey: ['analytics.report.hook', { period }],
    queryFn: async () => {
      console.log('[AnalyticsHook] Fetching — period:', period);

      const rawEvents = await fetchRawEvents(period);
      console.log('[AnalyticsHook] Raw events:', rawEvents.length);

      if (rawEvents.length === 0) {
        console.log('[AnalyticsHook] No events found for period:', period);
        return computeAnalytics([], period);
      }

      const appEvents = rawEvents.filter(e => {
        const props = e.properties as Record<string, unknown> | undefined;
        return props?.source === 'app';
      }).length;
      const landingEvents = rawEvents.length - appEvents;
      console.log('[AnalyticsHook] Breakdown — app:', appEvents, ', landing:', landingEvents);

      const computed = computeAnalytics(rawEvents, period);

      const extras = await fetchExtraCounts();
      if (extras.registeredUserCount > 0) {
        computed.registeredUsers = extras.registeredUserCount;
      }
      if (extras.waitlistCount > 0) {
        computed.waitlistLeads = extras.waitlistCount;
      }
      computed.totalLeads = computed.registeredUsers + computed.waitlistLeads;

      console.log('[AnalyticsHook] Computed:', computed.pageViews, 'views,', computed.uniqueSessions, 'sessions, leads:', computed.totalLeads);
      setFetchCount(prev => prev + 1);
      return computed;
    },
    staleTime: ANALYTICS_STALE_TIME_MS,
    gcTime: 1000 * 60 * 10,
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
    networkMode: 'always',
    retry: 1,
    retryDelay: 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const data = (analyticsQuery.data as ComputedAnalytics | undefined) ?? null;
  const isLoading = analyticsQuery.isLoading && !analyticsQuery.data;
  const isError = analyticsQuery.isError && !data;
  const errorMsg = analyticsQuery.error?.message || 'Failed to load analytics';
  const isConnected = !!data || analyticsQuery.isSuccess;
  const lastUpdated = analyticsQuery.dataUpdatedAt
    ? new Date(analyticsQuery.dataUpdatedAt).toLocaleTimeString()
    : '';

  const onRefresh = useCallback(async () => {
    setManualRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['analytics.report.hook'] });
    setManualRefreshing(false);
  }, [queryClient]);

  const presenceState = usePresenceTracker();

  const hasNoRealData = data != null && data.pageViews === 0 && data.uniqueSessions === 0 && data.totalLeads === 0;

  const diagnostics = useMemo(() => ({
    pendingCount: 0,
    queuedCount: 0,
    hasNoRealData,
  }), [hasNoRealData]);

  return {
    data,
    isLoading,
    isError,
    errorMsg,
    isConnected,
    lastUpdated,
    fetchCount,
    period,
    setPeriod,
    activeTab,
    setActiveTab,
    manualRefreshing,
    onRefresh,
    presenceState,
    diagnostics,
  };
}
