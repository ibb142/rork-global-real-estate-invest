/**
 * =============================================================================
 * ALERT MOCK DATA - mocks/alerts.ts
 * =============================================================================
 */

import { Alert, AlertSettings, AlertStats, SystemHealth } from '@/types';

export const mockAlertSettings: AlertSettings = {
  ownerPhone: '+15616443503',
  ownerEmail: 'owner@ipxholding.com',
  ownerName: 'IVXHOLDINGS Owner',
  enableSMS: true,
  enableWhatsApp: true,
  enableEmail: true,
  enablePush: true,
  quietHoursStart: undefined,
  quietHoursEnd: undefined,
  escalationTimeMinutes: 15,
  dailyDigestEnabled: true,
  dailyDigestTime: '09:00',
};

export const mockAlerts: Alert[] = [];

export const mockAlertStats: AlertStats = {
  totalAlerts: 0,
  activeAlerts: 0,
  criticalAlerts: 0,
  highAlerts: 0,
  resolvedToday: 0,
  avgResolutionTimeMinutes: 0,
  alertsByCategory: {
    security: 0,
    transaction: 0,
    kyc: 0,
    system: 0,
    fraud: 0,
    compliance: 0,
    user_activity: 0,
    financial: 0,
  },
  alertsBySeverity: {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  },
  alertTrend: [],
};

export const mockSystemHealth: SystemHealth = {
  status: 'healthy',
  uptime: 0,
  lastChecked: new Date().toISOString(),
  services: [
    { name: 'API Server', status: 'up', responseTime: 0 },
    { name: 'Database', status: 'up', responseTime: 0 },
    { name: 'Payment Gateway', status: 'up', responseTime: 0 },
    { name: 'KYC Service', status: 'up', responseTime: 0 },
    { name: 'Email Service', status: 'up', responseTime: 0 },
    { name: 'SMS/WhatsApp (Twilio)', status: 'up', responseTime: 0 },
    { name: 'Push Notifications', status: 'up', responseTime: 0 },
    { name: 'AI Analytics', status: 'up', responseTime: 0 },
  ],
  metrics: {
    activeUsers: 0,
    transactionsPerHour: 0,
    errorRate: 0,
    avgResponseTime: 0,
  },
};

export const getAlertStats = (): AlertStats => mockAlertStats;
export const getSystemHealth = (): SystemHealth => mockSystemHealth;
export const getRecentAlerts = (limit: number = 20): Alert[] => mockAlerts.slice(0, limit);
export const getActiveAlerts = (): Alert[] => mockAlerts.filter(a => a.status === 'active');
export const getCriticalAlerts = (): Alert[] => mockAlerts.filter(a => a.severity === 'critical' && a.status !== 'resolved');
