/**
 * IVX Enterprise Access Control — Role Dashboard
 * Displays a dashboard tailored to the user's enterprise role.
 * Routes: /ivx/role-dashboard?role=staff|admin|investor|buyer|member
 */
import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft, Crown, Users, Shield, TrendingUp, Wallet, Building2,
  FileText, Settings, Bell, ChevronRight, Lock, BarChart3,
  Mail, Briefcase, Home as HomeIcon, User,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useEnterpriseAccess } from '@/lib/enterprise-access-context';
import {
  ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_DEFINITIONS,
  type EnterpriseRole,
} from '@/constants/enterprise-roles';

interface DashboardTile {
  id: string;
  label: string;
  icon: typeof Users;
  route: string;
  color: string;
  description: string;
}

function getDashboardTiles(role: EnterpriseRole): DashboardTile[] {
  const def = ROLE_DEFINITIONS[role];
  const tiles: DashboardTile[] = [];

  for (const perm of def.permissions) {
    switch (perm.module) {
      case 'dashboard':
        tiles.push({
          id: 'dashboard',
          label: 'Dashboard',
          icon: BarChart3,
          route: '/(tabs)/(home)/home',
          color: Colors.info,
          description: 'Overview and analytics',
        });
        break;
      case 'properties':
        tiles.push({
          id: 'properties',
          label: 'Properties',
          icon: Building2,
          route: '/(tabs)/(properties)/properties',
          color: Colors.success,
          description: 'Browse and manage properties',
        });
        break;
      case 'investments':
        tiles.push({
          id: 'investments',
          label: 'Investments',
          icon: TrendingUp,
          route: '/(tabs)/(portfolio)/portfolio',
          color: Colors.gold,
          description: 'Track investment portfolio',
        });
        break;
      case 'wallet':
        tiles.push({
          id: 'wallet',
          label: 'Wallet',
          icon: Wallet,
          route: '/(tabs)/(wallet)/wallet',
          color: Colors.green,
          description: 'View wallet balance and transactions',
        });
        break;
      case 'kyc':
        tiles.push({
          id: 'kyc',
          label: 'KYC',
          icon: FileText,
          route: '/kyc-verification',
          color: Colors.warning,
          description: 'Identity verification',
        });
        break;
      case 'deals':
        tiles.push({
          id: 'deals',
          label: 'Deals',
          icon: Briefcase,
          route: '/ivx/deal-tracking',
          color: Colors.blue,
          description: 'Active deals and pipeline',
        });
        break;
      case 'crm':
        tiles.push({
          id: 'crm',
          label: 'CRM',
          icon: Users,
          route: '/admin/dashboard',
          color: Colors.info,
          description: 'Customer relationship management',
        });
        break;
      case 'members':
        tiles.push({
          id: 'members',
          label: 'Members',
          icon: Users,
          route: '/admin/applications',
          color: Colors.info,
          description: 'Manage member accounts',
        });
        break;
      case 'staff':
        tiles.push({
          id: 'staff',
          label: 'Staff',
          icon: Shield,
          route: '/ivx/owner-control-center',
          color: Colors.gold,
          description: 'Manage staff and roles',
        });
        break;
      case 'landing':
        tiles.push({
          id: 'landing',
          label: 'Landing Page',
          icon: HomeIcon,
          route: '/admin/landing-control',
          color: Colors.success,
          description: 'Edit landing page content',
        });
        break;
      case 'developer':
        tiles.push({
          id: 'developer',
          label: 'IVX Developer',
          icon: Settings,
          route: '/ivx/developer-monitor',
          color: Colors.info,
          description: 'Control IVX Senior Developer',
        });
        break;
      case 'deployments':
        tiles.push({
          id: 'deployments',
          label: 'Deployments',
          icon: Settings,
          route: '/ivx/deploy',
          color: Colors.info,
          description: 'Deploy and monitor builds',
        });
        break;
      case 'settings':
        tiles.push({
          id: 'settings',
          label: 'Settings',
          icon: Settings,
          route: '/admin/feature-control',
          color: Colors.textSecondary,
          description: 'Platform settings',
        });
        break;
      case 'audit':
        tiles.push({
          id: 'audit',
          label: 'Audit Log',
          icon: FileText,
          route: '/ivx/enterprise-audit-log',
          color: Colors.warning,
          description: 'View audit trail',
        });
        break;
      case 'money':
        tiles.push({
          id: 'money',
          label: 'Money',
          icon: Wallet,
          route: '/(tabs)/(wallet)/wallet',
          color: Colors.green,
          description: 'Financial operations',
        });
        break;
      case 'emails':
        tiles.push({
          id: 'emails',
          label: 'Emails',
          icon: Mail,
          route: '/admin/email-management',
          color: Colors.info,
          description: 'Email campaigns and inbox',
        });
        break;
      case 'marketing':
        tiles.push({
          id: 'marketing',
          label: 'Marketing',
          icon: BarChart3,
          route: '/admin/marketing',
          color: Colors.info,
          description: 'Marketing and growth',
        });
        break;
      case 'documents':
        tiles.push({
          id: 'documents',
          label: 'Documents',
          icon: FileText,
          route: '/property-documents',
          color: Colors.textSecondary,
          description: 'Legal and property documents',
        });
        break;
    }
  }

  // Deduplicate by ID
  const seen = new Set<string>();
  return tiles.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

export default function RoleDashboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const { currentUser, loading } = useEnterpriseAccess();

  const effectiveRole = useMemo<EnterpriseRole>(() => {
    if (params.role && ROLE_LABELS[params.role as EnterpriseRole]) {
      return params.role as EnterpriseRole;
    }
    return currentUser?.role ?? 'member';
  }, [params.role, currentUser?.role]);

  const tiles = useMemo(() => getDashboardTiles(effectiveRole), [effectiveRole]);
  const roleDef = ROLE_DEFINITIONS[effectiveRole];

  if (loading && !currentUser) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{ROLE_LABELS[effectiveRole]} Dashboard</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Role banner */}
        <View style={[styles.roleBanner, effectiveRole === 'owner' && styles.roleBannerOwner]}>
          <View style={styles.roleBannerIcon}>
            {effectiveRole === 'owner' ? (
              <Crown size={24} color={Colors.gold} />
            ) : effectiveRole === 'staff' || effectiveRole === 'admin' ? (
              <Shield size={24} color={Colors.info} />
            ) : (
              <User size={24} color={Colors.textSecondary} />
            )}
          </View>
          <View style={styles.roleBannerInfo}>
            <Text style={styles.roleBannerTitle}>{ROLE_LABELS[effectiveRole]}</Text>
            <Text style={styles.roleBannerDept}>
              {currentUser?.department ?? 'general'} · Level {roleDef.hierarchyLevel}
            </Text>
          </View>
        </View>

        <Text style={styles.roleDescriptionText}>{ROLE_DESCRIPTIONS[effectiveRole]}</Text>

        {/* Capabilities summary */}
        <View style={styles.capabilitiesRow}>
          <CapabilityChip label="Invite" enabled={roleDef.canInvite} />
          <CapabilityChip label="Deploy" enabled={roleDef.canDeploy} />
          <CapabilityChip label="Money" enabled={roleDef.canManageMoney} />
          <CapabilityChip label="Secrets" enabled={roleDef.canAccessSecrets} />
        </View>

        {/* Dashboard tiles */}
        <Text style={styles.sectionTitle}>Your Modules ({tiles.length})</Text>

        {tiles.length === 0 ? (
          <View style={styles.emptyState}>
            <Lock size={32} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No modules assigned to your role yet.</Text>
            <Text style={styles.emptySubtext}>Contact the owner if you need additional access.</Text>
          </View>
        ) : (
          <View style={styles.tilesGrid}>
            {tiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <TouchableOpacity
                  key={tile.id}
                  style={styles.tile}
                  onPress={() => router.push(tile.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.tileIcon, { backgroundColor: tile.color + '20' }]}>
                    <Icon size={22} color={tile.color} />
                  </View>
                  <Text style={styles.tileLabel}>{tile.label}</Text>
                  <Text style={styles.tileDescription} numberOfLines={2}>{tile.description}</Text>
                  <ChevronRight size={14} color={Colors.textTertiary} style={{ marginTop: 4 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Quick links */}
        {effectiveRole !== 'member' && (
          <View style={styles.quickLinks}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push('/ivx/user-permissions' as any)}
            >
              <Shield size={18} color={Colors.info} />
              <Text style={styles.quickLinkText}>View Permission Matrix</Text>
              <ChevronRight size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
            {roleDef.canInvite && (
              <TouchableOpacity
                style={styles.quickLink}
                onPress={() => router.push('/ivx/invite-role' as any)}
              >
                <Users size={18} color={Colors.gold} />
                <Text style={styles.quickLinkText}>Invite Team Member</Text>
                <ChevronRight size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Owner-only links */}
        {effectiveRole === 'owner' && (
          <View style={styles.quickLinks}>
            <Text style={styles.sectionTitle}>Owner Controls</Text>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push('/ivx/owner-control-center' as any)}
            >
              <Crown size={18} color={Colors.gold} />
              <Text style={styles.quickLinkText}>Owner Control Center</Text>
              <ChevronRight size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push('/ivx/access-requests' as any)}
            >
              <Bell size={18} color={Colors.warning} />
              <Text style={styles.quickLinkText}>Access Requests</Text>
              <ChevronRight size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push('/ivx/enterprise-audit-log' as any)}
            >
              <FileText size={18} color={Colors.warning} />
              <Text style={styles.quickLinkText}>Enterprise Audit Log</Text>
              <ChevronRight size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CapabilityChip({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <View style={[styles.capChip, enabled ? styles.capChipEnabled : styles.capChipDisabled]}>
      <Text style={[styles.capChipText, enabled ? styles.capChipTextEnabled : styles.capChipTextDisabled]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 16, paddingBottom: 30 },
  roleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    backgroundColor: Colors.surface, borderRadius: 16, marginBottom: 12, borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  roleBannerOwner: { borderColor: Colors.gold, borderWidth: 2, backgroundColor: Colors.gold + '10' },
  roleBannerIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surfaceLight,
    justifyContent: 'center', alignItems: 'center',
  },
  roleBannerInfo: { flex: 1 },
  roleBannerTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  roleBannerDept: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  roleDescriptionText: { color: Colors.textSecondary, fontSize: 13, marginBottom: 16, lineHeight: 19 },
  capabilitiesRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  capChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  capChipEnabled: { backgroundColor: Colors.success + '20' },
  capChipDisabled: { backgroundColor: Colors.surfaceLight },
  capChipText: { fontSize: 11, fontWeight: '600' },
  capChipTextEnabled: { color: Colors.success },
  capChipTextDisabled: { color: Colors.textTertiary },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  tilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  tile: {
    width: '47%', backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.surfaceBorder, gap: 6,
  },
  tileIcon: {
    width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  tileLabel: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  tileDescription: { color: Colors.textTertiary, fontSize: 11, lineHeight: 15 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: Colors.textTertiary, fontSize: 14, fontWeight: '600' },
  emptySubtext: { color: Colors.textTertiary, fontSize: 12, textAlign: 'center' },
  quickLinks: { marginTop: 8 },
  quickLink: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 8, borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  quickLinkText: { color: Colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
});
