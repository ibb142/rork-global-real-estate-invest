import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Building2,
  DollarSign,
  Users,
  ChevronRight,
  Plus,
  X,
  Info,
  Handshake,
  Clock,
  Percent,
  Shield,
  Lock,
  TrendingUp,
  CheckCircle2,
  FileText,
  Eye,
  Star,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { formatCurrency } from '@/lib/formatters';
import {
  ipxFeeConfigs,
  ipxProfitStats,
  IPX_HOLDING_NAME,
} from '@/mocks/ipx-invest';
import { useIPX } from '@/lib/ipx-context';
import { useTranslation } from '@/lib/i18n-context';

export default function InvestScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { fractionalShares } = useIPX();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [showFeeInfo, setShowFeeInfo] = useState(false);

  const isXs = width < 340;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  const transactionFee = ipxFeeConfigs.find(f => f.feeType === 'transaction');

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerTitle}>{t('propertyInvestment')}</Text>
              <Text style={styles.headerSubtitle}>{t('fractionalOwnership')}</Text>
            </View>
            <TouchableOpacity
              style={styles.submitButton}
              onPress={() => router.push('/invest/submit-property' as any)}
            >
              <Plus size={18} color={Colors.black} />
              <Text style={styles.submitButtonText}>{t('submitLabel')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: Colors.primary + '20' }]}>
                <Building2 size={18} color={Colors.primary} />
              </View>
              <Text style={styles.statValue}>{fractionalShares.length}</Text>
              <Text style={styles.statLabel}>{t('properties')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: Colors.success + '20' }]}>
                <DollarSign size={18} color={Colors.success} />
              </View>
              <Text style={styles.statValue}>{formatCurrency(ipxProfitStats.totalProfit, true)}</Text>
              <Text style={styles.statLabel}>{t('totalVolume')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: Colors.info + '20' }]}>
                <Users size={18} color={Colors.info} />
              </View>
              <Text style={styles.statValue}>{ipxProfitStats.totalTransactions}</Text>
              <Text style={styles.statLabel}>{t('investors')}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.profitToolsCard}
          onPress={() => router.push('/invest/profit-tools' as any)}
          activeOpacity={0.9}
        >
          <View style={styles.profitToolsInner}>
            <View style={styles.profitToolsLeft}>
              <View style={styles.profitToolsIconRow}>
                <View style={[styles.profitToolsMiniIcon, { backgroundColor: '#00C48C20' }]}>
                  <Shield size={14} color="#00C48C" />
                </View>
                <View style={[styles.profitToolsMiniIcon, { backgroundColor: '#FFD70020' }]}>
                  <TrendingUp size={14} color="#FFD700" />
                </View>
                <View style={[styles.profitToolsMiniIcon, { backgroundColor: '#4A90D920' }]}>
                  <Star size={14} color="#4A90D9" />
                </View>
              </View>
              <Text style={styles.profitToolsTitle}>10 Profit Tools</Text>
              <Text style={styles.profitToolsSubtitle}>For lenders & investors</Text>
            </View>
            <View style={styles.profitToolsRight}>
              <Text style={styles.profitToolsReturn}>Up to 22%</Text>
              <Text style={styles.profitToolsReturnLabel}>Annual Returns</Text>
              <View style={styles.profitToolsCta}>
                <Text style={styles.profitToolsCtaText}>Explore</Text>
                <ChevronRight size={14} color="#000" />
              </View>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.feeInfoCard}
          onPress={() => setShowFeeInfo(true)}
          activeOpacity={0.8}
        >
          <View style={styles.feeInfoLeft}>
            <View style={styles.ipxBadge}>
              <Text style={styles.ipxBadgeText}>IVXHOLDINGS</Text>
            </View>
            <View>
              <Text style={styles.feeInfoTitle}>{IPX_HOLDING_NAME}</Text>
              <Text style={styles.feeInfoSubtitle}>
                {transactionFee?.percentage}% {t('feeOnTransactions')}
              </Text>
            </View>
          </View>
          <Info size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.debtAcquisitionCard}
          onPress={() => router.push('/invest/debt-acquisition' as any)}
          activeOpacity={0.9}
        >
          <View style={styles.debtAcquisitionGradient}>
            <View style={styles.debtAcquisitionHeader}>
              <View style={styles.debtAcquisitionIconContainer}>
                <Shield size={28} color={Colors.success} />
              </View>
              <View style={styles.debtAcquisitionBadge}>
                <Lock size={10} color={Colors.white} />
                <Text style={styles.debtAcquisitionBadgeText}>{t('firstLien')}</Text>
              </View>
            </View>
            <Text style={styles.debtAcquisitionTitle}>{t('tokenizedMortgage')}</Text>
            <Text style={styles.debtAcquisitionSubtitle}>
              {t('tokenizedMortgageDesc')}
            </Text>
            <View style={styles.debtAcquisitionTerms}>
              <View style={styles.debtAcquisitionTermItem}>
                <DollarSign size={14} color={Colors.primary} />
                <Text style={styles.debtAcquisitionTermText}>85% LTV</Text>
              </View>
              <View style={styles.debtAcquisitionTermItem}>
                <Lock size={14} color={Colors.success} />
                <Text style={styles.debtAcquisitionTermText}>{t('firstLien')}</Text>
              </View>
              <View style={styles.debtAcquisitionTermItem}>
                <TrendingUp size={14} color={Colors.success} />
                <Text style={styles.debtAcquisitionTermText}>~10% {t('yield')}</Text>
              </View>
            </View>
            <View style={styles.debtAcquisitionCta}>
              <Text style={styles.debtAcquisitionCtaText}>{t('viewProperties')}</Text>
              <ChevronRight size={18} color={Colors.white} />
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.landPartnerCard}
          onPress={() => router.push('/invest/land-partner' as any)}
          activeOpacity={0.9}
        >
          <View style={styles.landPartnerGradient}>
            <View style={styles.landPartnerHeader}>
              <View style={styles.landPartnerIconContainer}>
                <Handshake size={28} color={Colors.primary} />
              </View>
              <View style={styles.landPartnerBadge}>
                <Text style={styles.landPartnerBadgeText}>{t('newLabel')}</Text>
              </View>
            </View>
            <Text style={styles.landPartnerTitle}>{t('landPartnership')}</Text>
            <Text style={styles.landPartnerSubtitle}>
              {t('landPartnershipDesc')}
            </Text>
            <View style={styles.landPartnerTerms}>
              <View style={styles.landPartnerTermItem}>
                <DollarSign size={14} color={Colors.success} />
                <Text style={styles.landPartnerTermText}>{t('cashPercent60')}</Text>
              </View>
              <View style={styles.landPartnerTermItem}>
                <Percent size={14} color={Colors.primary} />
                <Text style={styles.landPartnerTermText}>{t('profitPercent30')}</Text>
              </View>
              <View style={styles.landPartnerTermItem}>
                <Clock size={14} color={Colors.info} />
                <Text style={styles.landPartnerTermText}>{t('months30')}</Text>
              </View>
            </View>
            <View style={styles.landPartnerCta}>
              <Text style={styles.landPartnerCtaText}>{t('submitYourLand')}</Text>
              <ChevronRight size={18} color={Colors.black} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.ownerGuaranteeCard}>
          <View style={styles.guaranteeHeader}>
            <View style={styles.guaranteeIconContainer}>
              <Shield size={24} color={Colors.success} />
            </View>
            <View style={styles.guaranteeMeta}>
              <Text style={styles.guaranteeTitle}>{t('ownerProtection')}</Text>
              <Text style={styles.guaranteeSubtitle}>{t('ownerProtectionDesc')}</Text>
            </View>
          </View>
          <View style={styles.guaranteeList}>
            {[
              { icon: <FileText size={16} color="#4ECDC4" />, text: t('guaranteeTitleLien') },
              { icon: <CheckCircle2 size={16} color={Colors.success} />, text: t('guaranteeEquity') },
              { icon: <Eye size={16} color="#45B7D1" />, text: t('guaranteeIdentity') },
              { icon: <DollarSign size={16} color={Colors.primary} />, text: t('guaranteeRental') },
            ].map((item, i) => (
              <View key={i} style={styles.guaranteeItem}>
                {item.icon}
                <Text style={styles.guaranteeItemText}>{item.text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.guaranteeCta}
            onPress={() => router.push('/trust-center' as any)}
            activeOpacity={0.7}
          >
            <Text style={styles.guaranteeCtaText}>{t('viewBillOfRights')}</Text>
            <ChevronRight size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal
        visible={showFeeInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFeeInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFeeInfo(false)}
        >
          <View style={styles.feeModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{IPX_HOLDING_NAME} {t('ipxFees')}</Text>
              <TouchableOpacity onPress={() => setShowFeeInfo(false)}>
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.feeModalDesc}>
              {t('ipxFeesDesc')}
            </Text>

            {ipxFeeConfigs.filter(f => f.isActive).map((fee) => (
              <View key={fee.id} style={styles.feeItem}>
                <View style={styles.feeItemHeader}>
                  <Text style={styles.feeItemName}>{fee.name}</Text>
                  <Text style={styles.feeItemPercent}>{fee.percentage}%</Text>
                </View>
                <Text style={styles.feeItemDesc}>{fee.description}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerCard: {
    margin: 20,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  headerSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submitButtonText: {
    color: Colors.black,
    fontWeight: '700' as const,
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.surfaceBorder,
  },
  feeInfoCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  feeInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  ipxBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ipxBadgeText: {
    color: Colors.black,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  feeInfoTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  feeInfoSubtitle: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  profitToolsCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#0A1628',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#4A90D930',
    overflow: 'hidden',
  },
  profitToolsInner: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profitToolsLeft: {
    flex: 1,
  },
  profitToolsIconRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  profitToolsMiniIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profitToolsTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900' as const,
    letterSpacing: -0.3,
  },
  profitToolsSubtitle: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginTop: 3,
  },
  profitToolsRight: {
    alignItems: 'center',
    gap: 4,
  },
  profitToolsReturn: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: '900' as const,
  },
  profitToolsReturnLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '500' as const,
  },
  profitToolsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 6,
  },
  profitToolsCtaText: {
    color: Colors.black,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  debtAcquisitionCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  debtAcquisitionGradient: {
    backgroundColor: '#0D2818',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  debtAcquisitionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  debtAcquisitionIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.success + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  debtAcquisitionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + '30',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  debtAcquisitionBadgeText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '800' as const,
  },
  debtAcquisitionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
    marginBottom: 6,
  },
  debtAcquisitionSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  debtAcquisitionTerms: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  debtAcquisitionTermItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  debtAcquisitionTermText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  debtAcquisitionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.success,
    borderRadius: 12,
    paddingVertical: 12,
  },
  debtAcquisitionCtaText: {
    color: Colors.white,
    fontWeight: '700' as const,
    fontSize: 15,
  },
  landPartnerCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  landPartnerGradient: {
    backgroundColor: '#1A1500',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  landPartnerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  landPartnerIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landPartnerBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  landPartnerBadgeText: {
    color: Colors.black,
    fontSize: 10,
    fontWeight: '800' as const,
  },
  landPartnerTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
    marginBottom: 6,
  },
  landPartnerSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  landPartnerTerms: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  landPartnerTermItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  landPartnerTermText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  landPartnerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  landPartnerCtaText: {
    color: Colors.black,
    fontWeight: '700' as const,
    fontSize: 15,
  },
  bottomPadding: {
    height: 120,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: 20,
  },
  feeModalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
  },
  feeModalDesc: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  feeItem: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  feeItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  feeItemName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  feeItemPercent: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  feeItemDesc: {
    color: Colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
  },
  ownerGuaranteeCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  guaranteeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  guaranteeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.success + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guaranteeMeta: {
    flex: 1,
  },
  guaranteeTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  guaranteeSubtitle: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  guaranteeList: {
    gap: 12,
    marginBottom: 16,
  },
  guaranteeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guaranteeItemText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  guaranteeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  guaranteeCtaText: {
    color: Colors.primary,
    fontWeight: '600' as const,
    fontSize: 14,
  },
});
