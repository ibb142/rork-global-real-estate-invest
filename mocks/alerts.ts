/**
 * =============================================================================
 * ALERT MOCK DATA - mocks/alerts.ts
 * =============================================================================
 */

import { Alert, AlertRule, AlertSettings, AlertStats, SystemHealth } from '@/types';

export const mockAlertSettings: AlertSettings = {
  ownerPhone: '+15616443503',
  ownerEmail: 'owner@ipxholding.com',
  ownerName: 'IPX Owner',
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

export const mockAlerts: Alert[] = [
  {
    id: 'alert-1',
    ruleId: 'rule-large-transaction',
    ruleName: 'Large Transaction Alert',
    category: 'transaction',
    severity: 'high',
    title: 'Large Deposit Detected',
    message: 'David Lee deposited $50,000 via wire transfer.',
    details: { amount: 50000, type: 'deposit', userName: 'David Lee' },
    status: 'resolved',
    channels: ['sms', 'whatsapp', 'push'],
    sentTo: ['sms', 'whatsapp', 'push'],
    triggeredAt: '2025-02-15T09:30:00Z',
    acknowledgedAt: '2025-02-15T09:32:00Z',
    acknowledgedBy: 'admin-1',
    resolvedAt: '2025-02-15T09:45:00Z',
    resolvedBy: 'admin-1',
  },
  {
    id: 'alert-2',
    ruleId: 'rule-large-withdrawal',
    ruleName: 'Large Withdrawal Request',
    category: 'financial',
    severity: 'high',
    title: 'Large Withdrawal Request',
    message: 'Sarah Williams requested a withdrawal of $8,500.',
    details: { amount: 8500, userName: 'Sarah Williams' },
    status: 'active',
    channels: ['sms', 'whatsapp'],
    sentTo: ['sms', 'whatsapp'],
    triggeredAt: '2025-02-15T14:22:00Z',
  },
  {
    id: 'alert-3',
    ruleId: 'rule-suspicious-activity',
    ruleName: 'Suspicious Activity Alert',
    category: 'fraud',
    severity: 'critical',
    title: 'Multiple Failed Login Attempts',
    message: 'User account emma.davis@example.com had 5 failed login attempts from IP 185.220.101.45.',
    details: { email: 'emma.davis@example.com', attempts: 5, ip: '185.220.101.45' },
    status: 'acknowledged',
    channels: ['sms', 'whatsapp', 'email', 'push'],
    sentTo: ['sms', 'whatsapp', 'email', 'push'],
    triggeredAt: '2025-02-15T11:15:00Z',
    acknowledgedAt: '2025-02-15T11:18:00Z',
    acknowledgedBy: 'admin-1',
  },
  {
    id: 'alert-4',
    ruleId: 'rule-failed-kyc',
    ruleName: 'KYC Rejection Alert',
    category: 'kyc',
    severity: 'medium',
    title: 'KYC Verification Rejected',
    message: 'Michael Brown\'s KYC was rejected due to blurry document images.',
    details: { userName: 'Michael Brown', reason: 'Blurry document images' },
    status: 'resolved',
    channels: ['email', 'push'],
    sentTo: ['email', 'push'],
    triggeredAt: '2025-02-14T16:00:00Z',
    resolvedAt: '2025-02-14T17:30:00Z',
    resolvedBy: 'admin-4',
  },
  {
    id: 'alert-5',
    ruleId: 'rule-new-high-value-user',
    ruleName: 'New High-Value User',
    category: 'user_activity',
    severity: 'medium',
    title: 'High-Value New User',
    message: 'New user James Chen deposited $50,000 as their first deposit.',
    details: { userName: 'James Chen', amount: 50000 },
    status: 'resolved',
    channels: ['push', 'email'],
    sentTo: ['push', 'email'],
    triggeredAt: '2025-02-14T09:00:00Z',
    resolvedAt: '2025-02-14T09:30:00Z',
    resolvedBy: 'admin-1',
  },
  {
    id: 'alert-6',
    ruleId: 'rule-daily-volume',
    ruleName: 'High Daily Volume',
    category: 'financial',
    severity: 'low',
    title: 'Daily Volume Milestone',
    message: 'Daily transaction volume exceeded $100,000 ($142,350 total).',
    details: { volume: 142350 },
    status: 'resolved',
    channels: ['email'],
    sentTo: ['email'],
    triggeredAt: '2025-02-13T23:59:00Z',
    resolvedAt: '2025-02-14T08:00:00Z',
    resolvedBy: 'admin-2',
  },
];

export const mockAlertStats: AlertStats = {
  totalAlerts: 47,
  activeAlerts: 2,
  criticalAlerts: 3,
  highAlerts: 8,
  resolvedToday: 5,
  avgResolutionTimeMinutes: 28,
  alertsByCategory: {
    security: 5,
    transaction: 12,
    kyc: 8,
    system: 2,
    fraud: 4,
    compliance: 1,
    user_activity: 9,
    financial: 6,
  },
  alertsBySeverity: {
    low: 15,
    medium: 18,
    high: 11,
    critical: 3,
  },
  alertTrend: [
    { date: '2025-02-09', count: 5 },
    { date: '2025-02-10', count: 8 },
    { date: '2025-02-11', count: 6 },
    { date: '2025-02-12', count: 9 },
    { date: '2025-02-13', count: 7 },
    { date: '2025-02-14', count: 6 },
    { date: '2025-02-15', count: 6 },
  ],
};

export const mockSystemHealth: SystemHealth = {
  status: 'healthy',
  uptime: 2592000000,
  lastChecked: new Date().toISOString(),
  services: [
    { name: 'API Server', status: 'up', responseTime: 45 },
    { name: 'Database', status: 'up', responseTime: 12 },
    { name: 'Payment Gateway', status: 'up', responseTime: 180 },
    { name: 'KYC Service', status: 'up', responseTime: 250 },
    { name: 'Email Service', status: 'up', responseTime: 85 },
    { name: 'SMS/WhatsApp (Twilio)', status: 'up', responseTime: 120 },
    { name: 'Push Notifications', status: 'up', responseTime: 65 },
    { name: 'AI Analytics', status: 'up', responseTime: 340 },
  ],
  metrics: {
    activeUsers: 156,
    transactionsPerHour: 23,
    errorRate: 0.02,
    avgResponseTime: 115,
  },
};

export const getAlertStats = (): AlertStats => mockAlertStats;
export const getSystemHealth = (): SystemHealth => mockSystemHealth;
export const getRecentAlerts = (limit: number = 20): Alert[] => mockAlerts.slice(0, limit);
export const getActiveAlerts = (): Alert[] => mockAlerts.filter(a => a.status === 'active');
export const getCriticalAlerts = (): Alert[] => mockAlerts.filter(a => a.severity === 'critical' && a.status !== 'resolved');
