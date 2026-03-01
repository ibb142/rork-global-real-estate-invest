import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
  ArrowLeftRight,
  Building2,
  TrendingUp,
  DollarSign,
  Clock,
  Shield,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  X,
  Crown,
  Megaphone,
  UserPlus,
  Percent,
  Handshake,
  MessageSquare,
  Radio,
  BarChart3,
  Star,
  Sparkles,
  Image,
  Play,
  FileText,
  Settings,
  Bell,
  Share2,
  Wallet,
  Scale,
  Landmark,
  Globe,
  Send,
  Database,
  Mail,
  Crosshair,
  Brain,
  Flame,
  KeyRound,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { adminStats, getRecentTransactions, getPendingKycMembers } from '@/mocks/admin';

const ADMIN_MODULES = [
  { id: 'owner-controls', name: 'Owner Controls', icon: Crown, iconName: 'Crown', route: '/admin/owner-controls', category: 'Core' },
  { id: 'dashboard', name: 'Dashboard', icon: TrendingUp, iconName: 'TrendingUp', route: '/admin/dashboard', category: 'Core' },
  { id: 'investor-profits', name: 'Investor Profits', icon: DollarSign, iconName: 'DollarSign', route: '/admin/investor-profits', category: 'Finance' },
  { id: 'members', name: 'Members', icon: Users, iconName: 'Users', route: '/admin/members', category: 'Users' },
  { id: 'transactions', name: 'Transactions', icon: ArrowLeftRight, iconName: 'ArrowLeftRight', route: '/admin/transactions', category: 'Finance' },
  { id: 'properties', name: 'Properties', icon: Building2, iconName: 'Building2', route: '/admin/properties', category: 'Assets' },
  { id: 'marketing', name: 'Marketing', icon: Megaphone, iconName: 'Megaphone', route: '/admin/marketing', category: 'Marketing' },
  { id: 'team', name: 'Team Management', icon: UserPlus, iconName: 'UserPlus', route: '/admin/team', category: 'Users' },
  { id: 'fees', name: 'Fees & Pricing', icon: Percent, iconName: 'Percent', route: '/admin/fees', category: 'Finance' },
  { id: 'land-partners', name: 'Land Partners', icon: Handshake, iconName: 'Handshake', route: '/admin/land-partners', category: 'Partners' },
  { id: 'engagement', name: 'User Engagement', icon: MessageSquare, iconName: 'MessageSquare', route: '/admin/engagement', category: 'Marketing' },
  { id: 'broadcast', name: 'Alerts & Broadcast', icon: Radio, iconName: 'Radio', route: '/admin/broadcast', category: 'Marketing' },
  { id: 'growth', name: 'Growth Analytics', icon: BarChart3, iconName: 'BarChart3', route: '/admin/growth', category: 'Analytics' },
  { id: 'influencers', name: 'Influencers', icon: Star, iconName: 'Star', route: '/admin/influencers', category: 'Marketing' },

  { id: 'banners', name: 'Banners', icon: Image, iconName: 'Image', route: '/admin/banners', category: 'Marketing' },
  { id: 'intro', name: 'Intro Screens', icon: Play, iconName: 'Play', route: '/admin/intro', category: 'Settings' },
  { id: 'app-docs', name: 'Docs, API & Legal', icon: FileText, iconName: 'FileText', route: '/admin/app-docs', category: 'Resources' },

  { id: 'social-command', name: 'Social & Content', icon: Share2, iconName: 'Share2', route: '/admin/social-command', category: 'Marketing' },
  { id: 'lender-directory', name: 'Lender Directory', icon: Landmark, iconName: 'Landmark', route: '/admin/lender-directory', category: 'Lenders' },
  { id: 'lender-search', name: 'Lender Discovery', icon: Globe, iconName: 'Globe', route: '/admin/lender-search', category: 'Lenders' },
  { id: 'ai-outreach', name: 'AI Outreach', icon: Send, iconName: 'Send', route: '/admin/ai-outreach', category: 'Lenders' },
  { id: 'lender-sync', name: 'Lender Auto-Sync', icon: Database, iconName: 'Database', route: '/admin/lender-sync', category: 'Lenders' },
  { id: 'email-engine', name: 'Email Engine', icon: Mail, iconName: 'Mail', route: '/admin/email-engine', category: 'Lenders' },
  { id: 'ai-video', name: 'AI Video Studio', icon: Play, iconName: 'Play', route: '/admin/ai-video', category: 'AI Tools' },
  { id: 'traffic-control', name: 'Traffic Control', icon: Crosshair, iconName: 'Crosshair', route: '/admin/traffic-control', category: 'Marketing' },
  { id: 'lead-intelligence', name: 'Lead Intelligence', icon: Brain, iconName: 'Brain', route: '/admin/lead-intelligence', category: 'Marketing' },
  { id: 'viral-growth', name: 'Viral Growth Hub', icon: Flame, iconName: 'Flame', route: '/admin/viral-growth', category: 'Marketing' },
  { id: 'api-keys', name: 'API Keys Vault', icon: KeyRound, iconName: 'KeyRound', route: '/admin/api-keys', category: 'Settings' },
  { id: 'email-inbox', name: 'AI Email Inbox', icon: Mail, iconName: 'Mail', route: '/admin/email-inbox', category: 'Marketing' },
];

export default function AdminDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isSmall = width < 375;
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const stats = adminStats;
  const recentTransactions = getRecentTransactions(5);
  const pendingKyc = getPendingKycMembers();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return ADMIN_MODULES;
    const query = searchQuery.toLowerCase();
    return ADMIN_MODULES.filter(
      (module) =>
        module.name.toLowerCase().includes(query) ||
        module.category.toLowerCase().includes(query) ||
        module.iconName.toLowerCase().includes(query) ||
        module.id.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const groupedModules = useMemo(() => {
    const groups: Record<string, typeof ADMIN_MODULES> = {};
    filteredModules.forEach((module) => {
      if (!groups[module.category]) {
        groups[module.category] = [];
      }
      groups[module.category].push(module);
    });
    return groups;
  }, [filteredModules]);

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const getTransactionIcon = useCallback((type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownRight size={16} color={Colors.positive} />;
      case 'withdrawal':
        return <ArrowUpRight size={16} color={Colors.negative} />;
      case 'buy':
        return <ArrowDownRight size={16} color={Colors.primary} />;
      case 'sell':
        return <ArrowUpRight size={16} color={Colors.accent} />;
      default:
        return <DollarSign size={16} color={Colors.textSecondary} />;
    }
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin Dashboard</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => setShowSearch(true)}
          >
            <Search size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exitButton}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.exitButtonText}>Exit Admin</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={showSearch}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSearch(false)}
      >
        <SafeAreaView style={styles.searchModal}>
          <View style={styles.searchHeader}>
            <View style={styles.searchInputContainer}>
              <Search size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search modules, features..."
                placeholderTextColor={Colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowSearch(false);
                setSearchQuery('');
              }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.searchResults} showsVerticalScrollIndicator={false}>
            {Object.entries(groupedModules).map(([category, modules]) => (
              <View key={category} style={styles.categorySection}>
                <Text style={styles.categoryTitle}>{category}</Text>
                {modules.map((module) => {
                  const IconComponent = module.icon;
                  return (
                    <TouchableOpacity
                      key={module.id}
                      style={styles.moduleItem}
                      onPress={() => {
                        setShowSearch(false);
                        setSearchQuery('');
                        router.push(module.route as any);
                      }}
                    >
                      <View style={styles.moduleIcon}>
                        <IconComponent size={20} color={Colors.primary} />
                      </View>
                      <View style={styles.moduleInfo}>
                        <Text style={styles.moduleName}>{module.name}</Text>
                        <Text style={styles.moduleCategory}>{module.category}</Text>
                      </View>
                      <ChevronRight size={18} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            {filteredModules.length === 0 && (
              <View style={styles.noResults}>
                <Search size={48} color={Colors.textTertiary} />
                <Text style={styles.noResultsText}>No modules found</Text>
                <Text style={styles.noResultsSubtext}>Try a different search term</Text>
              </View>
            )}
            <View style={styles.searchBottomPadding} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/admin/members' as any)}
          >
            <View style={[styles.statIcon, { backgroundColor: Colors.primary + '20' }]}>
              <Users size={22} color={Colors.primary} />
            </View>
            <Text style={styles.statValue}>{stats.totalMembers}</Text>
            <Text style={styles.statLabel}>Total Members</Text>
            <Text style={styles.statSubtext}>{stats.activeMembers} active</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/admin/transactions' as any)}
          >
            <View style={[styles.statIcon, { backgroundColor: Colors.accent + '20' }]}>
              <ArrowLeftRight size={22} color={Colors.accent} />
            </View>
            <Text style={styles.statValue}>{stats.totalTransactions}</Text>
            <Text style={styles.statLabel}>Transactions</Text>
            <Text style={styles.statSubtext}>{formatCurrency(stats.totalVolume)} vol</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/admin/properties' as any)}
          >
            <View style={[styles.statIcon, { backgroundColor: Colors.positive + '20' }]}>
              <Building2 size={22} color={Colors.positive} />
            </View>
            <Text style={styles.statValue}>{stats.totalProperties}</Text>
            <Text style={styles.statLabel}>Properties</Text>
            <Text style={styles.statSubtext}>{stats.liveProperties} live</Text>
          </TouchableOpacity>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.warning + '20' }]}>
              <TrendingUp size={22} color={Colors.warning} />
            </View>
            <Text style={styles.statValue}>{formatCurrency(stats.totalInvested)}</Text>
            <Text style={styles.statLabel}>Total Invested</Text>
            <Text style={styles.statSubtext}>All time</Text>
          </View>
        </View>

        {pendingKyc.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Shield size={18} color={Colors.warning} />
                <Text style={styles.sectionTitle}>Pending KYC ({pendingKyc.length})</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/admin/members' as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {pendingKyc.map((member) => (
              <TouchableOpacity
                key={member.id}
                style={styles.kycCard}
                onPress={() => router.push(`/admin/member/${member.id}` as any)}
              >
                <View style={styles.kycInfo}>
                  <Text style={styles.kycName}>
                    {member.firstName} {member.lastName}
                  </Text>
                  <Text style={styles.kycEmail}>{member.email}</Text>
                </View>
                <View style={styles.kycStatus}>
                  <View
                    style={[
                      styles.statusBadge,
                      member.kycStatus === 'in_review'
                        ? styles.statusInReview
                        : styles.statusPending,
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {member.kycStatus === 'in_review' ? 'In Review' : 'Pending'}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={Colors.textSecondary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Clock size={18} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/admin/transactions' as any)}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {recentTransactions.map((tx) => (
            <View key={tx.id} style={styles.txCard}>
              <View style={styles.txIcon}>{getTransactionIcon(tx.type)}</View>
              <View style={styles.txInfo}>
                <Text style={styles.txUser}>{tx.userName}</Text>
                <Text style={styles.txDesc}>{tx.description}</Text>
                <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
              </View>
              <View style={styles.txAmount}>
                <Text
                  style={[
                    styles.txValue,
                    tx.amount > 0 ? styles.positive : styles.negative,
                  ]}
                >
                  {tx.amount > 0 ? '+' : ''}
                  {formatCurrency(Math.abs(tx.amount))}
                </Text>
                <View
                  style={[
                    styles.txStatusBadge,
                    tx.status === 'completed'
                      ? styles.txCompleted
                      : tx.status === 'pending'
                      ? styles.txPending
                      : styles.txFailed,
                  ]}
                >
                  <Text style={styles.txStatusText}>{tx.status}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.modulesSection}>
          <Text style={styles.modulesSectionTitle}>All Modules</Text>
          {Object.entries(
            ADMIN_MODULES.reduce<Record<string, typeof ADMIN_MODULES>>((acc, mod) => {
              if (!acc[mod.category]) acc[mod.category] = [];
              acc[mod.category].push(mod);
              return acc;
            }, {})
          ).map(([category, mods]) => (
            <View key={category} style={styles.categoryBlock}>
              <Text style={styles.categoryLabel}>{category}</Text>
              <View style={styles.moduleGrid}>
                {mods.map((mod) => {
                  const IconComp = mod.icon;
                  return (
                    <TouchableOpacity
                      key={mod.id}
                      style={styles.modCard}
                      onPress={() => router.push(mod.route as any)}
                      testID={`admin-module-${mod.id}`}
                    >
                      <View style={styles.modIconWrap}>
                        <IconComp size={22} color={Colors.primary} />
                      </View>
                      <Text style={styles.modName}>{mod.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    flexShrink: 1,
  },
  exitButton: {
    backgroundColor: Colors.negative + '20',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exitButtonText: {
    color: Colors.negative,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  searchButton: {
    backgroundColor: Colors.primary + '15',
    padding: 10,
    borderRadius: 10,
  },
  searchModal: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  searchResults: {
    flex: 1,
    paddingHorizontal: 16,
  },
  categorySection: {
    marginTop: 20,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  moduleItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  moduleIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 12,
  },
  moduleInfo: {
    flex: 1,
  },
  moduleName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  moduleCategory: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  noResults: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 60,
  },
  noResultsText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 16,
  },
  noResultsSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  searchBottomPadding: {
    height: 40,
  },
  content: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  statCard: {
    width: '47%',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  statSubtext: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  section: {
    padding: 20,
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  seeAll: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
  kycCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  kycInfo: {
    flex: 1,
  },
  kycName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  kycEmail: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  kycStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPending: {
    backgroundColor: Colors.warning + '20',
  },
  statusInReview: {
    backgroundColor: Colors.primary + '20',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.black,
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txUser: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  txDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  txDate: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  txAmount: {
    alignItems: 'flex-end',
  },
  txValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  positive: {
    color: Colors.positive,
  },
  negative: {
    color: Colors.negative,
  },
  txStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  txCompleted: {
    backgroundColor: Colors.positive + '20',
  },
  txPending: {
    backgroundColor: Colors.warning + '20',
  },
  txFailed: {
    backgroundColor: Colors.negative + '20',
  },
  txStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.black,
    textTransform: 'capitalize',
  },
  modulesSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  modulesSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  categoryBlock: {
    marginBottom: 24,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  moduleGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  modCard: {
    flex: 1,
    minWidth: '29%' as any,
    maxWidth: '32%' as any,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  modIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  modName: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.text,
    textAlign: 'center' as const,
    lineHeight: 14,
  },
  bottomPadding: {
    height: 120,
  },
});
