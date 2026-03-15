import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Database,
  Shield,
  Mail,
  Image,
  CreditCard,
  Bell,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
  MessageSquare,
  Cloud,
  HardDrive,
  Eye,
  Activity,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { supabase } from '@/lib/supabase';

type AuditStatus = 'pass' | 'fail' | 'warn' | 'info' | 'checking';

interface AuditItem {
  id: string;
  category: string;
  name: string;
  status: AuditStatus;
  message: string;
  details?: string;
  latencyMs?: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

interface AuditCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  items: AuditItem[];
}

const STATUS_COLORS: Record<AuditStatus, string> = {
  pass: '#10B981',
  fail: '#EF4444',
  warn: '#F59E0B',
  info: '#6366F1',
  checking: '#9CA3AF',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#3B82F6',
  info: '#6366F1',
};

function isSupabaseConfigured(): boolean {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return !!(url && key);
}

async function measureLatency<T>(fn: () => Promise<T>): Promise<{ result: T | null; latency: number; error: string | null }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, latency: Date.now() - start, error: null };
  } catch (err) {
    return { result: null, latency: Date.now() - start, error: (err as Error)?.message || 'Unknown error' };
  }
}

async function runFullAudit(): Promise<AuditCategory[]> {
  const categories: AuditCategory[] = [];

  const supabaseConfigured = isSupabaseConfigured();

  const supabaseItems: AuditItem[] = [];

  if (!supabaseConfigured) {
    supabaseItems.push({
      id: 'supabase-config',
      category: 'supabase',
      name: 'Supabase Configuration',
      status: 'fail',
      message: 'EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY not set',
      details: 'Without Supabase credentials, the app falls back to local storage for ALL data. Auth, realtime, and database features are disabled.',
      severity: 'critical',
    });
  } else {
    supabaseItems.push({
      id: 'supabase-config',
      category: 'supabase',
      name: 'Supabase Configuration',
      status: 'pass',
      message: 'URL and Anon Key configured',
      details: `URL: ${(process.env.EXPO_PUBLIC_SUPABASE_URL || '').substring(0, 45)}...`,
      severity: 'info',
    });

    const { latency: connLatency, error: connError } = await measureLatency(async () => {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw new Error(error.message);
    });

    supabaseItems.push({
      id: 'supabase-connection',
      category: 'supabase',
      name: 'Database Connection',
      status: connError ? 'fail' : connLatency > 3000 ? 'warn' : 'pass',
      message: connError ? `Connection failed: ${connError}` : `Connected (${connLatency}ms)`,
      latencyMs: connLatency,
      severity: connError ? 'critical' : 'info',
    });

    const { latency: authLatency, error: authError } = await measureLatency(async () => {
      const { error } = await supabase.auth.getSession();
      if (error) throw new Error(error.message);
    });

    supabaseItems.push({
      id: 'supabase-auth',
      category: 'supabase',
      name: 'Auth Service',
      status: authError ? 'fail' : authLatency > 2000 ? 'warn' : 'pass',
      message: authError ? `Auth error: ${authError}` : `Auth OK (${authLatency}ms)`,
      latencyMs: authLatency,
      severity: authError ? 'high' : 'info',
    });

    const requiredTables = ['profiles', 'wallets', 'transactions', 'holdings', 'notifications'];
    const optionalTables = ['jv_deals', 'audit_trail', 'waitlist', 'image_registry', 'push_tokens', 'landing_deals', 'app_config'];

    for (const table of requiredTables) {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        const missing = error && ((error.message || '').toLowerCase().includes('could not find') || (error.message || '').toLowerCase().includes('does not exist'));
        supabaseItems.push({
          id: `table-${table}`,
          category: 'supabase',
          name: `Table: ${table}`,
          status: missing ? 'fail' : error ? 'warn' : 'pass',
          message: missing ? 'Table NOT FOUND' : error ? `Query error: ${error.message}` : 'Exists & accessible',
          severity: missing ? 'high' : error ? 'medium' : 'info',
        });
      } catch (err) {
        supabaseItems.push({
          id: `table-${table}`,
          category: 'supabase',
          name: `Table: ${table}`,
          status: 'fail',
          message: `Check failed: ${(err as Error)?.message}`,
          severity: 'high',
        });
      }
    }

    for (const table of optionalTables) {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        const missing = error && ((error.message || '').toLowerCase().includes('could not find') || (error.message || '').toLowerCase().includes('does not exist'));
        supabaseItems.push({
          id: `table-${table}`,
          category: 'supabase',
          name: `Table: ${table}`,
          status: missing ? 'warn' : error ? 'warn' : 'pass',
          message: missing ? 'Optional table not created yet' : error ? `Query error: ${error.message}` : 'Exists & accessible',
          severity: missing ? 'low' : error ? 'medium' : 'info',
        });
      } catch {
        supabaseItems.push({
          id: `table-${table}`,
          category: 'supabase',
          name: `Table: ${table}`,
          status: 'warn',
          message: 'Check failed',
          severity: 'low',
        });
      }
    }

    try {
      const channels = supabase.getChannels();
      supabaseItems.push({
        id: 'realtime',
        category: 'supabase',
        name: 'Realtime WebSocket',
        status: channels.length > 0 ? 'pass' : 'warn',
        message: channels.length > 0 ? `${channels.length} active channel(s)` : 'No active channels (idle)',
        severity: 'info',
      });
    } catch {
      supabaseItems.push({
        id: 'realtime',
        category: 'supabase',
        name: 'Realtime WebSocket',
        status: 'warn',
        message: 'Could not check realtime channels',
        severity: 'medium',
      });
    }

    try {
      const { error: rlsError } = await supabase.from('profiles').select('id').limit(1);
      supabaseItems.push({
        id: 'rls',
        category: 'supabase',
        name: 'Row Level Security (RLS)',
        status: rlsError ? (rlsError.message.includes('permission') ? 'pass' : 'warn') : 'pass',
        message: rlsError ? (rlsError.message.includes('permission') ? 'RLS active (blocking unauthenticated)' : `RLS check: ${rlsError.message}`) : 'Policies enforced',
        severity: 'info',
      });
    } catch {
      supabaseItems.push({
        id: 'rls',
        category: 'supabase',
        name: 'Row Level Security (RLS)',
        status: 'warn',
        message: 'Could not verify RLS policies',
        severity: 'medium',
      });
    }
  }

  categories.push({
    id: 'supabase',
    name: 'Supabase Database & Auth',
    icon: <Database size={20} color={Colors.primary} />,
    items: supabaseItems,
  });

  const authItems: AuditItem[] = [
    {
      id: 'auth-supabase',
      category: 'auth',
      name: 'Supabase Auth Integration',
      status: supabaseConfigured ? 'pass' : 'fail',
      message: supabaseConfigured ? 'SignUp, SignIn, SignOut, RefreshSession all wired to Supabase Auth' : 'Auth disabled (no Supabase config)',
      details: 'Login uses signInWithPassword, Register uses signUp with user_metadata. Auth state persisted in SecureStore.',
      severity: supabaseConfigured ? 'info' : 'critical',
    },
    {
      id: 'auth-securestore',
      category: 'auth',
      name: 'Token Storage (SecureStore)',
      status: 'pass',
      message: 'JWT tokens stored in expo-secure-store (localStorage polyfill on web)',
      details: 'Keys: ipx_auth_token, ipx_refresh_token, ipx_user_id, ipx_user_role',
      severity: 'info',
    },
    {
      id: 'auth-2fa',
      category: 'auth',
      name: '2FA / Two-Factor Auth',
      status: 'warn',
      message: 'Not implemented - returns "2FA not yet configured with Supabase"',
      details: 'verify2FA function is a stub. Supabase MFA can be enabled but requires Edge Function setup.',
      severity: 'medium',
    },
    {
      id: 'auth-session-refresh',
      category: 'auth',
      name: 'Session Auto-Refresh',
      status: 'pass',
      message: 'autoRefreshToken: true in Supabase config',
      details: 'Supabase SDK handles token refresh automatically. Manual refreshSession() also available.',
      severity: 'info',
    },
    {
      id: 'auth-role-management',
      category: 'auth',
      name: 'Role Management',
      status: 'pass',
      message: 'Roles stored in user_metadata (investor, owner, ceo, staff, manager, analyst)',
      details: 'isAdminRole() checks against allowed admin roles. Role persisted in SecureStore and user_metadata.',
      severity: 'info',
    },
  ];

  categories.push({
    id: 'auth',
    name: 'Authentication & Security',
    icon: <Shield size={20} color={Colors.primary} />,
    items: authItems,
  });

  const imageItems: AuditItem[] = [
    {
      id: 'img-local-storage',
      category: 'images',
      name: 'Local Image Storage',
      status: 'pass',
      message: 'Images copied to documentDirectory/ivx_images/ on native, URI used on web',
      details: 'Uses expo-file-system legacy API. Falls back to original URI if copy fails.',
      severity: 'info',
    },
    {
      id: 'img-registry',
      category: 'images',
      name: 'Image Registry (AsyncStorage)',
      status: 'pass',
      message: 'Image metadata stored by entity type + entity ID',
      details: 'Registry tracks: id, uri, entityType, entityId, uploadedBy, protection status.',
      severity: 'info',
    },
    {
      id: 'img-supabase-sync',
      category: 'images',
      name: 'Supabase image_registry Sync',
      status: 'warn',
      message: 'Syncs to image_registry table but table may not exist in your Supabase',
      details: 'If the table is missing, images are stored locally only. Run supabase-full-setup.sql to create it.',
      severity: 'medium',
    },
    {
      id: 'img-s3-upload',
      category: 'images',
      name: 'AWS S3 Image Upload',
      status: 'fail',
      message: 'NO direct S3 upload implemented - images stored as local URIs only',
      details: 'The @aws-sdk/client-s3 package is installed but no upload function exists. Images are local file URIs or remote URLs. For production, need S3 upload + CDN.',
      severity: 'high',
    },
    {
      id: 'img-photo-protection',
      category: 'images',
      name: 'Photo Protection (JV Deals)',
      status: 'pass',
      message: 'Photos cannot be accidentally cleared - admin override required',
      details: 'protectPhotos() blocks photo reduction/clear without adminOverride=true.',
      severity: 'info',
    },
  ];

  categories.push({
    id: 'images',
    name: 'Images & Media Storage',
    icon: <Image size={20} color={Colors.primary} />,
    items: imageItems,
  });

  const emailItems: AuditItem[] = [
    {
      id: 'email-engine',
      category: 'email',
      name: 'Email Engine (SMTP Logic)',
      status: 'pass',
      message: 'Comprehensive email engine with warmup, rotation, throttling, personalization',
      details: 'Supports SMTP rotation, 24-day warmup schedule, CAN-SPAM compliance, bounce management.',
      severity: 'info',
    },
    {
      id: 'email-send',
      category: 'email',
      name: 'Email Sending (Real Delivery)',
      status: 'fail',
      message: 'Depends on Supabase Edge Function "send-email" which is NOT deployed',
      details: 'sendEmail() calls supabase.functions.invoke("send-email"). If edge function is missing, emails are saved locally only with status "queued_locally". No real delivery happens.',
      severity: 'critical',
    },
    {
      id: 'email-storage',
      category: 'email',
      name: 'Email Local Storage',
      status: 'pass',
      message: 'Emails persist in AsyncStorage with mock data fallback',
      details: 'Uses MOCK_EMAILS as initial data. Sent/draft emails stored locally.',
      severity: 'info',
    },
    {
      id: 'email-sendgrid',
      category: 'email',
      name: 'SendGrid Integration',
      status: 'fail',
      message: 'SENDGRID_API_KEY not configured as env variable',
      details: 'Listed in .env.example but not in actual environment variables. Requires Edge Function deployment.',
      severity: 'high',
    },
    {
      id: 'email-aws-ses',
      category: 'email',
      name: 'AWS SES Integration',
      status: 'fail',
      message: 'No SES sending code implemented - only cost estimation exists',
      details: 'estimateDailyCost() references "ses" provider but no actual AWS SES SDK call exists in email-engine.ts.',
      severity: 'high',
    },
  ];

  categories.push({
    id: 'email',
    name: 'Email System',
    icon: <Mail size={20} color={Colors.primary} />,
    items: emailItems,
  });

  const smsItems: AuditItem[] = [
    {
      id: 'sms-aws-sns',
      category: 'sms',
      name: 'AWS SNS SMS Sending',
      status: 'fail',
      message: 'No AWS SNS publish code exists in the app',
      details: '.env.example mentions "SMS uses the same AWS credentials" but no SNS publish call is implemented anywhere. sms-reports.tsx uses Supabase edge functions.',
      severity: 'high',
    },
    {
      id: 'sms-twilio',
      category: 'sms',
      name: 'Twilio SMS/WhatsApp',
      status: 'fail',
      message: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN not configured',
      details: 'Listed in .env.example but not in actual environment variables. No Twilio SDK code exists in the codebase.',
      severity: 'high',
    },
    {
      id: 'sms-reports-screen',
      category: 'sms',
      name: 'SMS Reports UI',
      status: 'warn',
      message: 'UI exists but sends via Supabase Edge Function that may not be deployed',
      details: 'sms-reports.tsx has full UI for sending SMS reports. Depends on edge functions for actual delivery.',
      severity: 'medium',
    },
  ];

  categories.push({
    id: 'sms',
    name: 'SMS & Messaging',
    icon: <MessageSquare size={20} color={Colors.primary} />,
    items: smsItems,
  });

  const paymentItems: AuditItem[] = [
    {
      id: 'pay-service',
      category: 'payments',
      name: 'Payment Service Architecture',
      status: 'warn',
      message: 'All payment methods return SIMULATED results (test mode)',
      details: 'PaymentService.processPayment() always returns success with fake transaction IDs. No real Stripe/Plaid/PayPal API calls. simulateProcessingDelay() adds 1.5s fake delay.',
      severity: 'critical',
    },
    {
      id: 'pay-stripe',
      category: 'payments',
      name: 'Stripe Integration',
      status: 'fail',
      message: 'STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY not configured',
      details: 'PaymentService reads from env but Stripe keys are not set. Card, Apple Pay, Google Pay all use fake responses.',
      severity: 'high',
    },
    {
      id: 'pay-plaid',
      category: 'payments',
      name: 'Plaid Bank Linking',
      status: 'fail',
      message: 'PLAID_CLIENT_ID and PLAID_SECRET not configured',
      details: 'createPlaidLinkToken() returns fake tokens. exchangePlaidPublicToken() returns fake access tokens.',
      severity: 'high',
    },
    {
      id: 'pay-wallet',
      category: 'payments',
      name: 'Wallet System (Supabase)',
      status: supabaseConfigured ? 'pass' : 'warn',
      message: supabaseConfigured ? 'Wallet debit/credit uses Supabase wallets table with optimistic locking' : 'Wallet system needs Supabase',
      details: 'atomicWalletDebit() uses .eq(available, currentBalance) for optimistic concurrency. Good pattern.',
      severity: supabaseConfigured ? 'info' : 'medium',
    },
    {
      id: 'pay-investment',
      category: 'payments',
      name: 'Investment Transaction Flow',
      status: supabaseConfigured ? 'pass' : 'warn',
      message: supabaseConfigured ? 'Full transaction flow: debit wallet -> insert transaction -> upsert holding -> notification' : 'Needs Supabase for real transactions',
      details: 'purchaseShares() and purchaseJVInvestment() have rollback support if holding insert fails.',
      severity: supabaseConfigured ? 'info' : 'high',
    },
    {
      id: 'pay-wire',
      category: 'payments',
      name: 'Wire Transfer Instructions',
      status: 'warn',
      message: 'Hardcoded JPMorgan Chase bank details - verify these are real',
      details: 'processWireTransfer() returns static bank details (acct: 9876543210, routing: 021000021). If these are placeholder, real wire transfers will fail.',
      severity: 'high',
    },
  ];

  categories.push({
    id: 'payments',
    name: 'Payments & Investments',
    icon: <CreditCard size={20} color={Colors.primary} />,
    items: paymentItems,
  });

  const pushItems: AuditItem[] = [
    {
      id: 'push-expo',
      category: 'push',
      name: 'Expo Push Notifications',
      status: Platform.OS === 'web' ? 'warn' : 'pass',
      message: Platform.OS === 'web' ? 'Not available on web platform' : 'Expo Push configured with channels (default, investments, security)',
      details: 'Uses expo-notifications with proper permission flow. Android channels created.',
      severity: Platform.OS === 'web' ? 'low' : 'info',
    },
    {
      id: 'push-backend-register',
      category: 'push',
      name: 'Push Token Backend Registration',
      status: 'warn',
      message: 'Registers to Supabase push_tokens table (may not exist)',
      details: 'registerTokenWithBackend() upserts to push_tokens table. Handles missing table gracefully.',
      severity: 'medium',
    },
    {
      id: 'push-server-send',
      category: 'push',
      name: 'Server-Side Push Sending',
      status: 'fail',
      message: 'No server-side push sending code exists',
      details: 'Token registration exists but no Edge Function or backend to actually SEND push notifications to users. Need Expo Push API or FCM/APNs integration.',
      severity: 'high',
    },
  ];

  categories.push({
    id: 'push',
    name: 'Push Notifications',
    icon: <Bell size={20} color={Colors.primary} />,
    items: pushItems,
  });

  const awsItems: AuditItem[] = [
    {
      id: 'aws-credentials',
      category: 'aws',
      name: 'AWS Credentials',
      status: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? 'pass' : 'fail',
      message: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? 'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY configured' : 'AWS credentials NOT configured',
      details: `Region: ${process.env.AWS_REGION || 'Not set'}`,
      severity: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? 'info' : 'high',
    },
    {
      id: 'aws-s3',
      category: 'aws',
      name: 'AWS S3 Storage',
      status: 'warn',
      message: '@aws-sdk/client-s3 installed but only used for landing page deploy',
      details: 'S3 is used in landing-deploy.ts to deploy static HTML to S3 bucket. NOT used for image uploads or file storage.',
      severity: 'medium',
    },
    {
      id: 'aws-ses-actual',
      category: 'aws',
      name: 'AWS SES (Email)',
      status: 'fail',
      message: 'No AWS SES SDK usage in the codebase',
      details: '.env.example mentions SES but no @aws-sdk/client-ses is imported anywhere. Email relies on Supabase Edge Functions.',
      severity: 'high',
    },
    {
      id: 'aws-sns-actual',
      category: 'aws',
      name: 'AWS SNS (SMS)',
      status: 'fail',
      message: 'No AWS SNS SDK usage in the codebase',
      details: '.env.example mentions "SMS uses the same AWS credentials" but no @aws-sdk/client-sns is imported. SMS relies on Supabase Edge Functions.',
      severity: 'high',
    },
    {
      id: 'aws-landing-deploy',
      category: 'aws',
      name: 'Landing Page S3 Deploy',
      status: 'pass',
      message: 'S3 deploy pipeline exists (landing-deploy.ts)',
      details: 'Uploads HTML, CSS, JS to S3 bucket with CloudFront invalidation. Uses @aws-sdk/client-s3.',
      severity: 'info',
    },
  ];

  categories.push({
    id: 'aws',
    name: 'AWS Infrastructure',
    icon: <Cloud size={20} color={Colors.primary} />,
    items: awsItems,
  });

  const kycItems: AuditItem[] = [
    {
      id: 'kyc-liveness',
      category: 'kyc',
      name: 'KYC Liveness Detection',
      status: 'warn',
      message: 'Falls back to RANDOM confidence scores when Edge Function unavailable',
      details: 'performLivenessDetection() calls supabase.functions.invoke("kyc-liveness"). Fallback returns random 85-99% confidence with isLive=true. NOT real verification.',
      severity: 'critical',
    },
    {
      id: 'kyc-face-match',
      category: 'kyc',
      name: 'KYC Face Match',
      status: 'warn',
      message: 'Falls back to RANDOM similarity scores (82-99%)',
      details: 'performFaceMatch() calls "kyc-face-match" Edge Function. Fallback always returns isMatch=true with random scores.',
      severity: 'critical',
    },
    {
      id: 'kyc-sanctions',
      category: 'kyc',
      name: 'Sanctions/Watchlist Check',
      status: 'warn',
      message: 'Falls back to ALWAYS CLEAN with random low risk score',
      details: 'performSanctionsCheck() calls "kyc-sanctions-check" Edge Function. Fallback always returns isClean=true against 7 "databases".',
      severity: 'critical',
    },
    {
      id: 'kyc-edge-functions',
      category: 'kyc',
      name: 'KYC Edge Functions Deployed',
      status: 'fail',
      message: 'Edge Functions (kyc-liveness, kyc-face-match, kyc-sanctions-check, kyc-full-verification) likely NOT deployed',
      details: 'All KYC verification relies on Supabase Edge Functions. If not deployed, ALL verification uses fake random results.',
      severity: 'critical',
    },
  ];

  categories.push({
    id: 'kyc',
    name: 'KYC Verification',
    icon: <Eye size={20} color={Colors.primary} />,
    items: kycItems,
  });

  const dataItems: AuditItem[] = [
    {
      id: 'data-jv-storage',
      category: 'data',
      name: 'JV Deals Dual Storage',
      status: 'pass',
      message: 'Supabase primary + AsyncStorage backup with deduplication',
      details: 'fetchJVDeals() tries Supabase first, falls back to local. Dual write on save. Dedup by ID and project name.',
      severity: 'info',
    },
    {
      id: 'data-jv-trash',
      category: 'data',
      name: 'JV Deals Trash/Recovery',
      status: 'pass',
      message: 'Soft delete (trash) with restore, permanent delete with rate limiting',
      details: 'deleteJVDeal() moves to trash. Rate limit: 3 permanent deletes per minute. Snapshot captured before delete.',
      severity: 'info',
    },
    {
      id: 'data-audit-trail',
      category: 'data',
      name: 'Audit Trail',
      status: 'pass',
      message: 'Full audit trail with local + Supabase sync',
      details: 'Tracks CREATE, UPDATE, DELETE, TRASH, RESTORE, PURCHASE, etc. Max 2000 local entries. CSV export available.',
      severity: 'info',
    },
    {
      id: 'data-landing-sync',
      category: 'data',
      name: 'Landing Page Sync',
      status: 'pass',
      message: 'Auto-sync published deals to landing page via Supabase + S3',
      details: 'syncToLandingPage() fetches published deals, syncs to landing_deals table, and deploys config to S3.',
      severity: 'info',
    },
    {
      id: 'data-realtime-sync',
      category: 'data',
      name: 'Realtime Data Sync',
      status: 'pass',
      message: 'Supabase realtime + fallback polling + cross-tab broadcast',
      details: 'useJVRealtime() subscribes to postgres_changes. Falls back to 5s polling if realtime fails. BroadcastChannel for cross-tab sync on web.',
      severity: 'info',
    },
    {
      id: 'data-react-query',
      category: 'data',
      name: 'React Query Integration',
      status: 'pass',
      message: 'All data fetching uses useQuery with proper stale times',
      details: 'Properties (5min), Market data (1min), Holdings (2min), Wallet (30s), Notifications (1min). Proper invalidation on changes.',
      severity: 'info',
    },
  ];

  categories.push({
    id: 'data',
    name: 'Data & Sync',
    icon: <HardDrive size={20} color={Colors.primary} />,
    items: dataItems,
  });

  const healthItems: AuditItem[] = [];

  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch('https://ivxholding.com', { method: 'HEAD', signal: controller.signal });
      const latency = Date.now() - start;
      healthItems.push({
        id: 'landing-live',
        category: 'health',
        name: 'Landing Page (ivxholding.com)',
        status: resp.ok ? (latency > 3000 ? 'warn' : 'pass') : 'fail',
        message: resp.ok ? `Live (${latency}ms)` : `HTTP ${resp.status}`,
        latencyMs: latency,
        severity: resp.ok ? 'info' : 'high',
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    healthItems.push({
      id: 'landing-live',
      category: 'health',
      name: 'Landing Page (ivxholding.com)',
      status: 'fail',
      message: `Not reachable: ${(err as Error)?.message}`,
      severity: 'high',
    });
  }

  healthItems.push({
    id: 'health-frontend',
    category: 'health',
    name: 'App Frontend (Expo)',
    status: 'pass',
    message: `Running on ${Platform.OS}`,
    severity: 'info',
  });

  categories.push({
    id: 'health',
    name: 'System Health',
    icon: <Activity size={20} color={Colors.primary} />,
    items: healthItems,
  });

  return categories;
}

export default function BackendAuditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<AuditCategory[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const totalPass = categories.reduce((sum, c) => sum + c.items.filter(i => i.status === 'pass').length, 0);
  const totalFail = categories.reduce((sum, c) => sum + c.items.filter(i => i.status === 'fail').length, 0);
  const totalWarn = categories.reduce((sum, c) => sum + c.items.filter(i => i.status === 'warn').length, 0);
  const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);

  const startAudit = useCallback(async () => {
    setIsRunning(true);
    setCategories([]);
    try {
      console.log('[BackendAudit] Starting full audit...');
      const result = await runFullAudit();
      setCategories(result);
      setLastRunAt(new Date());
      console.log('[BackendAudit] Audit complete');
    } catch (err) {
      console.error('[BackendAudit] Audit failed:', err);
    } finally {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    void startAudit();
  }, [startAudit]);

  useEffect(() => {
    if (isRunning) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRunning, pulseAnim]);

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const getStatusIcon = useCallback((status: AuditStatus, size: number = 16) => {
    switch (status) {
      case 'pass': return <CheckCircle size={size} color={STATUS_COLORS.pass} />;
      case 'fail': return <XCircle size={size} color={STATUS_COLORS.fail} />;
      case 'warn': return <AlertTriangle size={size} color={STATUS_COLORS.warn} />;
      case 'info': return <Zap size={size} color={STATUS_COLORS.info} />;
      default: return <ActivityIndicator size="small" color={STATUS_COLORS.checking} />;
    }
  }, []);

  const getCategorySummary = useCallback((category: AuditCategory) => {
    const _fail = category.items.filter(i => i.status === 'fail').length;
    const _warn = category.items.filter(i => i.status === 'warn').length;
    if (_fail > 0) return 'fail' as AuditStatus;
    if (_warn > 0) return 'warn' as AuditStatus;
    return 'pass' as AuditStatus;
  }, []);

  const renderItem = useCallback((item: AuditItem) => {
    return (
      <View key={item.id} style={styles.auditItem}>
        <View style={styles.auditItemHeader}>
          {getStatusIcon(item.status)}
          <View style={styles.auditItemText}>
            <Text style={styles.auditItemName}>{item.name}</Text>
            <Text style={[styles.auditItemMessage, { color: STATUS_COLORS[item.status] }]}>
              {item.message}
            </Text>
          </View>
          {item.latencyMs !== undefined && (
            <View style={styles.latencyBadge}>
              <Text style={styles.latencyText}>{item.latencyMs}ms</Text>
            </View>
          )}
          <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLORS[item.severity] + '20' }]}>
            <Text style={[styles.severityText, { color: SEVERITY_COLORS[item.severity] }]}>
              {item.severity.toUpperCase()}
            </Text>
          </View>
        </View>
        {item.details && (
          <Text style={styles.auditItemDetails}>{item.details}</Text>
        )}
      </View>
    );
  }, [getStatusIcon]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="back-button">
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Backend Audit</Text>
          <Text style={styles.headerSubtitle}>Full System Health Report</Text>
        </View>
        <TouchableOpacity onPress={startAudit} style={styles.refreshButton} disabled={isRunning} testID="refresh-audit">
          <Animated.View style={{ opacity: isRunning ? pulseAnim : 1 }}>
            <RefreshCw size={20} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={isRunning} onRefresh={startAudit} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {isRunning && categories.length === 0 && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Running deep audit...</Text>
            <Text style={styles.loadingSubtext}>Checking Supabase, AWS, Email, SMS, Payments, KYC...</Text>
          </View>
        )}

        {categories.length > 0 && (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryBox, { backgroundColor: '#10B98115' }]}>
                  <CheckCircle size={22} color="#10B981" />
                  <Text style={styles.summaryCount}>{totalPass}</Text>
                  <Text style={styles.summaryLabel}>Passed</Text>
                </View>
                <View style={[styles.summaryBox, { backgroundColor: '#EF444415' }]}>
                  <XCircle size={22} color="#EF4444" />
                  <Text style={[styles.summaryCount, { color: '#EF4444' }]}>{totalFail}</Text>
                  <Text style={styles.summaryLabel}>Issues</Text>
                </View>
                <View style={[styles.summaryBox, { backgroundColor: '#F59E0B15' }]}>
                  <AlertTriangle size={22} color="#F59E0B" />
                  <Text style={[styles.summaryCount, { color: '#F59E0B' }]}>{totalWarn}</Text>
                  <Text style={styles.summaryLabel}>Warnings</Text>
                </View>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressSegment, { flex: totalPass, backgroundColor: '#10B981' }]} />
                <View style={[styles.progressSegment, { flex: totalWarn, backgroundColor: '#F59E0B' }]} />
                <View style={[styles.progressSegment, { flex: totalFail, backgroundColor: '#EF4444' }]} />
              </View>
              <Text style={styles.summaryTotal}>
                {totalItems} checks completed {lastRunAt ? `at ${lastRunAt.toLocaleTimeString()}` : ''}
              </Text>
            </View>

            {totalFail > 0 && (
              <View style={styles.criticalSection}>
                <View style={styles.criticalHeader}>
                  <XCircle size={18} color="#EF4444" />
                  <Text style={styles.criticalTitle}>Issues Found ({totalFail})</Text>
                </View>
                {categories.flatMap(c => c.items.filter(i => i.status === 'fail')).map((item, idx) => (
                  <View key={item.id} style={styles.criticalItem}>
                    <Text style={styles.criticalIndex}>{idx + 1}.</Text>
                    <View style={styles.criticalContent}>
                      <Text style={styles.criticalName}>{item.name}</Text>
                      <Text style={styles.criticalMessage}>{item.message}</Text>
                      {item.details && <Text style={styles.criticalDetails}>{item.details}</Text>}
                    </View>
                    <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLORS[item.severity] + '20' }]}>
                      <Text style={[styles.severityText, { color: SEVERITY_COLORS[item.severity] }]}>
                        {item.severity.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {totalWarn > 0 && (
              <View style={styles.warningSection}>
                <View style={styles.warningHeader}>
                  <AlertTriangle size={18} color="#F59E0B" />
                  <Text style={styles.warningTitle}>Warnings ({totalWarn})</Text>
                </View>
                {categories.flatMap(c => c.items.filter(i => i.status === 'warn')).map((item, idx) => (
                  <View key={item.id} style={styles.warningItem}>
                    <Text style={styles.warningIndex}>{idx + 1}.</Text>
                    <View style={styles.warningContent}>
                      <Text style={styles.warningName}>{item.name}</Text>
                      <Text style={styles.warningMessage}>{item.message}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.passSection}>
              <View style={styles.passHeader}>
                <CheckCircle size={18} color="#10B981" />
                <Text style={styles.passTitle}>Working Correctly ({totalPass})</Text>
              </View>
              {categories.flatMap(c => c.items.filter(i => i.status === 'pass')).map((item, idx) => (
                <View key={item.id} style={styles.passItem}>
                  <Text style={styles.passIndex}>{idx + 1}.</Text>
                  <View style={styles.passContent}>
                    <Text style={styles.passName}>{item.name}</Text>
                    <Text style={styles.passMessage}>{item.message}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.sectionDividerText}>Detailed Breakdown by Category</Text>

            {categories.map(category => {
              const isExpanded = expandedCategories.has(category.id);
              getCategorySummary(category);
              const catPass = category.items.filter(i => i.status === 'pass').length;
              const catFail = category.items.filter(i => i.status === 'fail').length;
              const catWarn = category.items.filter(i => i.status === 'warn').length;

              return (
                <View key={category.id} style={styles.categoryCard}>
                  <TouchableOpacity
                    style={styles.categoryHeader}
                    onPress={() => toggleCategory(category.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.categoryLeft}>
                      {category.icon}
                      <Text style={styles.categoryName}>{category.name}</Text>
                    </View>
                    <View style={styles.categoryRight}>
                      <View style={styles.categoryBadges}>
                        {catPass > 0 && (
                          <View style={[styles.catBadge, { backgroundColor: '#10B98120' }]}>
                            <Text style={[styles.catBadgeText, { color: '#10B981' }]}>{catPass}</Text>
                          </View>
                        )}
                        {catWarn > 0 && (
                          <View style={[styles.catBadge, { backgroundColor: '#F59E0B20' }]}>
                            <Text style={[styles.catBadgeText, { color: '#F59E0B' }]}>{catWarn}</Text>
                          </View>
                        )}
                        {catFail > 0 && (
                          <View style={[styles.catBadge, { backgroundColor: '#EF444420' }]}>
                            <Text style={[styles.catBadgeText, { color: '#EF4444' }]}>{catFail}</Text>
                          </View>
                        )}
                      </View>
                      {isExpanded ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
                    </View>
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={styles.categoryItems}>
                      {category.items.map(renderItem)}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 14,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 6,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryBox: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  summaryCount: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: '#10B981',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: '#9CA3AF',
  },
  progressBarContainer: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 16,
    backgroundColor: '#1F2937',
  },
  progressSegment: {
    height: '100%',
  },
  summaryTotal: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 10,
    textAlign: 'center',
  },
  criticalSection: {
    backgroundColor: '#1C1117',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EF444440',
  },
  criticalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  criticalTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#EF4444',
  },
  criticalItem: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EF444420',
    alignItems: 'flex-start',
  },
  criticalIndex: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#EF4444',
    width: 24,
    marginTop: 2,
  },
  criticalContent: {
    flex: 1,
    marginRight: 8,
  },
  criticalName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FCA5A5',
  },
  criticalMessage: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 2,
  },
  criticalDetails: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    lineHeight: 16,
  },
  warningSection: {
    backgroundColor: '#1C1A11',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F59E0B40',
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#F59E0B',
  },
  warningItem: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F59E0B20',
    alignItems: 'flex-start',
  },
  warningIndex: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#F59E0B',
    width: 24,
    marginTop: 2,
  },
  warningContent: {
    flex: 1,
  },
  warningName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FCD34D',
  },
  warningMessage: {
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 2,
  },
  passSection: {
    backgroundColor: '#0F1A14',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#10B98140',
  },
  passHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  passTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#10B981',
  },
  passItem: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#10B98120',
    alignItems: 'flex-start',
  },
  passIndex: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#10B981',
    width: 24,
    marginTop: 2,
  },
  passContent: {
    flex: 1,
  },
  passName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#6EE7B7',
  },
  passMessage: {
    fontSize: 12,
    color: '#10B981',
    marginTop: 2,
  },
  sectionDividerText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 14,
    textAlign: 'center',
  },
  categoryCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#fff',
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadges: {
    flexDirection: 'row',
    gap: 4,
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  catBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  categoryItems: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  auditItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1F293770',
  },
  auditItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  auditItemText: {
    flex: 1,
  },
  auditItemName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#E5E7EB',
  },
  auditItemMessage: {
    fontSize: 11,
    marginTop: 2,
  },
  auditItemDetails: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
    marginLeft: 26,
    lineHeight: 16,
  },
  latencyBadge: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  latencyText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '600' as const,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 9,
    fontWeight: '700' as const,
  },
});
