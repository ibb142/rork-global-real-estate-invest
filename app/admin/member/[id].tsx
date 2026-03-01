import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Ban,
  CheckCircle,
  Wallet,
  TrendingUp,
  Building2,
  Clock,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { getMemberById } from '@/mocks/admin';

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const member = getMemberById(id || '');

  if (!member) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Member not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleAction = (action: 'approve' | 'reject' | 'suspend' | 'activate') => {
    const messages: Record<string, string> = {
      approve: 'approve KYC for',
      reject: 'reject KYC for',
      suspend: 'suspend',
      activate: 'activate',
    };

    Alert.alert(
      `Confirm ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      `Are you sure you want to ${messages[action]} ${member.firstName} ${member.lastName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: action === 'reject' || action === 'suspend' ? 'destructive' : 'default',
          onPress: () => {
            Alert.alert('Success', `Action completed successfully`);
          },
        },
      ]
    );
  };

  const getKycStatusColor = () => {
    switch (member.kycStatus) {
      case 'approved':
        return Colors.positive;
      case 'in_review':
        return Colors.primary;
      case 'pending':
        return Colors.warning;
      case 'rejected':
        return Colors.negative;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Member Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          {member.avatar ? (
            <Image source={{ uri: member.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <User size={40} color={Colors.textSecondary} />
            </View>
          )}
          <Text style={styles.memberName}>
            {member.firstName} {member.lastName}
          </Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.kycBadge,
                { backgroundColor: getKycStatusColor() + '20' },
              ]}
            >
              <Text style={[styles.kycText, { color: getKycStatusColor() }]}>
                KYC: {member.kycStatus.replace('_', ' ')}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                member.status === 'active'
                  ? styles.statusActive
                  : member.status === 'suspended'
                  ? styles.statusSuspended
                  : styles.statusInactive,
              ]}
            >
              <Text style={styles.statusText}>{member.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Mail size={18} color={Colors.textSecondary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{member.email}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Phone size={18} color={Colors.textSecondary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{member.phone || 'Not provided'}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <MapPin size={18} color={Colors.textSecondary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Country</Text>
                <Text style={styles.infoValue}>{member.country}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Overview</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Wallet size={20} color={Colors.primary} />
              <Text style={styles.statValue}>{formatCurrency(member.walletBalance)}</Text>
              <Text style={styles.statLabel}>Wallet Balance</Text>
            </View>
            <View style={styles.statCard}>
              <TrendingUp size={20} color={Colors.positive} />
              <Text style={styles.statValue}>{formatCurrency(member.totalInvested)}</Text>
              <Text style={styles.statLabel}>Total Invested</Text>
            </View>
            <View style={styles.statCard}>
              <Building2 size={20} color={Colors.accent} />
              <Text style={styles.statValue}>{member.holdings}</Text>
              <Text style={styles.statLabel}>Holdings</Text>
            </View>
            <View style={styles.statCard}>
              <TrendingUp size={20} color={Colors.positive} />
              <Text style={styles.statValue}>{formatCurrency(member.totalReturns)}</Text>
              <Text style={styles.statLabel}>Total Returns</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Calendar size={18} color={Colors.textSecondary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Member Since</Text>
                <Text style={styles.infoValue}>{formatDate(member.createdAt)}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Clock size={18} color={Colors.textSecondary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Last Activity</Text>
                <Text style={styles.infoValue}>{formatDateTime(member.lastActivity)}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <TrendingUp size={18} color={Colors.textSecondary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Total Transactions</Text>
                <Text style={styles.infoValue}>{member.totalTransactions}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionsCard}>
            {(member.kycStatus === 'pending' || member.kycStatus === 'in_review') && (
              <>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleAction('approve')}
                >
                  <CheckCircle size={20} color={Colors.positive} />
                  <Text style={[styles.actionButtonText, { color: Colors.positive }]}>
                    Approve KYC
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleAction('reject')}
                >
                  <Ban size={20} color={Colors.negative} />
                  <Text style={[styles.actionButtonText, { color: Colors.negative }]}>
                    Reject KYC
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {member.status === 'active' ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleAction('suspend')}
              >
                <Ban size={20} color={Colors.negative} />
                <Text style={[styles.actionButtonText, { color: Colors.negative }]}>
                  Suspend Account
                </Text>
              </TouchableOpacity>
            ) : member.status === 'suspended' ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleAction('activate')}
              >
                <CheckCircle size={20} color={Colors.positive} />
                <Text style={[styles.actionButtonText, { color: Colors.positive }]}>
                  Activate Account
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  content: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  backLink: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '600',
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  memberName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kycBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  kycText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusActive: {
    backgroundColor: Colors.positive + '20',
  },
  statusSuspended: {
    backgroundColor: Colors.negative + '20',
  },
  statusInactive: {
    backgroundColor: Colors.textTertiary + '20',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    textTransform: 'capitalize',
  },
  section: {
    padding: 20,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 14,
  },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 50,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '47%',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 10,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  actionsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 100,
  },
});
