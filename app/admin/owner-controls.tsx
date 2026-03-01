import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Crown,
  DollarSign,
  Building2,
  Percent,
  Settings,
  Lock,
  Unlock,
  Edit3,
  X,
  Check,
  ChevronRight,
  AlertCircle,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  ArrowLeft,
  Key,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { properties } from '@/mocks/properties';
import { feeConfigurations, getFeeStats, members, adminTransactions } from '@/mocks/admin';
import { Property, FeeConfiguration } from '@/types';

interface PlatformSettings {
  minInvestment: number;
  maxInvestment: number;
  platformFeePercent: number;
  dividendDistributionDay: number;
  autoReinvestEnabled: boolean;
  maintenanceMode: boolean;
  newSignupsEnabled: boolean;
  tradingEnabled: boolean;
}

interface PropertyControl extends Property {
  tradingPaused: boolean;
  priceAdjustment: number;
  ownerShare: number;
}

export default function OwnerControlsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'revenue' | 'properties' | 'fees' | 'settings'>('revenue');
  const [editFeeModalVisible, setEditFeeModalVisible] = useState(false);
  const [editPropertyModalVisible, setEditPropertyModalVisible] = useState(false);
  
  const [selectedFee, setSelectedFee] = useState<FeeConfiguration | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<PropertyControl | null>(null);

  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    minInvestment: 100,
    maxInvestment: 1000000,
    platformFeePercent: 2.5,
    dividendDistributionDay: 15,
    autoReinvestEnabled: true,
    maintenanceMode: false,
    newSignupsEnabled: true,
    tradingEnabled: true,
  });

  const [editedFee, setEditedFee] = useState({
    percentage: '',
    minFee: '',
    maxFee: '',
    isActive: true,
  });

  const [editedProperty, setEditedProperty] = useState({
    tradingPaused: false,
    priceAdjustment: '',
    ownerShare: '',
  });

  const feeStats = getFeeStats();

  const propertyControls: PropertyControl[] = useMemo(() => {
    return properties.map((p, index) => ({
      ...p,
      tradingPaused: index === 2,
      priceAdjustment: 0,
      ownerShare: 15 + (index * 2),
    }));
  }, []);

  const totalRevenue = useMemo(() => {
    const feeRevenue = feeStats.totalFeesCollected;
    const propertyCommissions = properties.reduce((sum, p) => {
      return sum + (p.currentRaise * 0.025);
    }, 0);
    return feeRevenue + propertyCommissions;
  }, [feeStats]);

  const monthlyRevenue = useMemo(() => {
    return feeStats.feesThisMonth + (properties.reduce((sum, p) => p.currentRaise, 0) * 0.025 / 12);
  }, [feeStats]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const openEditFeeModal = (fee: FeeConfiguration) => {
    setSelectedFee(fee);
    setEditedFee({
      percentage: fee.percentage.toString(),
      minFee: fee.minFee.toString(),
      maxFee: fee.maxFee.toString(),
      isActive: fee.isActive,
    });
    setEditFeeModalVisible(true);
  };

  const openEditPropertyModal = (property: PropertyControl) => {
    setSelectedProperty(property);
    setEditedProperty({
      tradingPaused: property.tradingPaused,
      priceAdjustment: property.priceAdjustment.toString(),
      ownerShare: property.ownerShare.toString(),
    });
    setEditPropertyModalVisible(true);
  };

  const handleSaveFee = () => {
    const percentage = parseFloat(editedFee.percentage);
    if (isNaN(percentage) || percentage < 0 || percentage > 50) {
      Alert.alert('Invalid Input', 'Percentage must be between 0 and 50%');
      return;
    }
    Alert.alert('Success', 'Fee configuration updated successfully');
    setEditFeeModalVisible(false);
  };

  const handleSaveProperty = () => {
    const ownerShare = parseFloat(editedProperty.ownerShare);
    if (isNaN(ownerShare) || ownerShare < 0 || ownerShare > 100) {
      Alert.alert('Invalid Input', 'Owner share must be between 0 and 100%');
      return;
    }
    Alert.alert('Success', 'Property controls updated successfully');
    setEditPropertyModalVisible(false);
  };

  const handleToggleTrading = (property: PropertyControl) => {
    const action = property.tradingPaused ? 'resume' : 'pause';
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} Trading`,
      `Are you sure you want to ${action} trading for ${property.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            Alert.alert('Success', `Trading ${action}d for ${property.name}`);
          },
        },
      ]
    );
  };

  const handleSaveSettings = () => {
    Alert.alert('Success', 'Platform settings updated successfully');
  };

  const renderRevenue = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.ownerBadge}>
        <Crown size={24} color="#FFD700" />
        <Text style={styles.ownerBadgeText}>Owner Dashboard</Text>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <Text style={styles.heroLabel}>Total Platform Revenue</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>
        <Text style={styles.heroValue}>{formatCurrency(totalRevenue)}</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <ArrowUpRight size={14} color={Colors.positive} />
            <Text style={styles.heroStatText}>+23.5% this month</Text>
          </View>
        </View>
      </View>

      <View style={styles.revenueGrid}>
        <View style={styles.revenueCard}>
          <View style={[styles.revenueIcon, { backgroundColor: Colors.positive + '20' }]}>
            <Banknote size={20} color={Colors.positive} />
          </View>
          <Text style={styles.revenueLabel}>Monthly Revenue</Text>
          <Text style={styles.revenueValue}>{formatCurrency(monthlyRevenue)}</Text>
        </View>
        <View style={styles.revenueCard}>
          <View style={[styles.revenueIcon, { backgroundColor: Colors.primary + '20' }]}>
            <Percent size={20} color={Colors.primary} />
          </View>
          <Text style={styles.revenueLabel}>Fee Revenue</Text>
          <Text style={styles.revenueValue}>{formatCurrency(feeStats.totalFeesCollected)}</Text>
        </View>
        <View style={styles.revenueCard}>
          <View style={[styles.revenueIcon, { backgroundColor: Colors.accent + '20' }]}>
            <Building2 size={20} color={Colors.accent} />
          </View>
          <Text style={styles.revenueLabel}>Property Commissions</Text>
          <Text style={styles.revenueValue}>{formatCurrency(totalRevenue - feeStats.totalFeesCollected)}</Text>
        </View>
        <View style={styles.revenueCard}>
          <View style={[styles.revenueIcon, { backgroundColor: Colors.warning + '20' }]}>
            <CircleDollarSign size={20} color={Colors.warning} />
          </View>
          <Text style={styles.revenueLabel}>Pending Fees</Text>
          <Text style={styles.revenueValue}>{formatCurrency(12.50)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Revenue Breakdown</Text>
      <View style={styles.breakdownCard}>
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownLeft}>
            <View style={[styles.breakdownDot, { backgroundColor: Colors.primary }]} />
            <Text style={styles.breakdownLabel}>Buy Transaction Fees</Text>
          </View>
          <View style={styles.breakdownRight}>
            <Text style={styles.breakdownValue}>{formatCurrency(feeStats.feesByType.buy)}</Text>
            <Text style={styles.breakdownPercent}>
              {((feeStats.feesByType.buy / feeStats.totalFeesCollected) * 100).toFixed(1)}%
            </Text>
          </View>
        </View>
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownLeft}>
            <View style={[styles.breakdownDot, { backgroundColor: Colors.accent }]} />
            <Text style={styles.breakdownLabel}>Sell Transaction Fees</Text>
          </View>
          <View style={styles.breakdownRight}>
            <Text style={styles.breakdownValue}>{formatCurrency(feeStats.feesByType.sell)}</Text>
            <Text style={styles.breakdownPercent}>
              {((feeStats.feesByType.sell / feeStats.totalFeesCollected) * 100).toFixed(1)}%
            </Text>
          </View>
        </View>
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownLeft}>
            <View style={[styles.breakdownDot, { backgroundColor: Colors.negative }]} />
            <Text style={styles.breakdownLabel}>Withdrawal Fees</Text>
          </View>
          <View style={styles.breakdownRight}>
            <Text style={styles.breakdownValue}>{formatCurrency(feeStats.feesByType.withdrawal)}</Text>
            <Text style={styles.breakdownPercent}>
              {((feeStats.feesByType.withdrawal / feeStats.totalFeesCollected) * 100).toFixed(1)}%
            </Text>
          </View>
        </View>
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownLeft}>
            <View style={[styles.breakdownDot, { backgroundColor: Colors.positive }]} />
            <Text style={styles.breakdownLabel}>Property Commissions</Text>
          </View>
          <View style={styles.breakdownRight}>
            <Text style={styles.breakdownValue}>{formatCurrency(totalRevenue - feeStats.totalFeesCollected)}</Text>
            <Text style={styles.breakdownPercent}>
              {(((totalRevenue - feeStats.totalFeesCollected) / totalRevenue) * 100).toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Platform Stats</Text>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{members.length}</Text>
          <Text style={styles.statLabel}>Total Users</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{properties.length}</Text>
          <Text style={styles.statLabel}>Properties</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{adminTransactions.length}</Text>
          <Text style={styles.statLabel}>Transactions</Text>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const renderProperties = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.infoCard}>
        <AlertCircle size={20} color={Colors.primary} />
        <Text style={styles.infoText}>
          Control trading status, pricing, and your ownership share for each property
        </Text>
      </View>

      {propertyControls.map((property) => (
        <View key={property.id} style={styles.propertyControlCard}>
          <View style={styles.propertyHeader}>
            <View style={styles.propertyInfo}>
              <Text style={styles.propertyName}>{property.name}</Text>
              <Text style={styles.propertyLocation}>{property.city}, {property.country}</Text>
            </View>
            <View style={[
              styles.tradingBadge,
              { backgroundColor: property.tradingPaused ? Colors.negative + '20' : Colors.positive + '20' }
            ]}>
              {property.tradingPaused ? (
                <Lock size={12} color={Colors.negative} />
              ) : (
                <Unlock size={12} color={Colors.positive} />
              )}
              <Text style={[
                styles.tradingBadgeText,
                { color: property.tradingPaused ? Colors.negative : Colors.positive }
              ]}>
                {property.tradingPaused ? 'Paused' : 'Active'}
              </Text>
            </View>
          </View>

          <View style={styles.propertyStats}>
            <View style={styles.propertyStat}>
              <Text style={styles.propertyStatLabel}>Price/Share</Text>
              <Text style={styles.propertyStatValue}>${property.pricePerShare.toFixed(2)}</Text>
            </View>
            <View style={styles.propertyStat}>
              <Text style={styles.propertyStatLabel}>Funded</Text>
              <Text style={styles.propertyStatValue}>
                {Math.round((property.currentRaise / property.targetRaise) * 100)}%
              </Text>
            </View>
            <View style={styles.propertyStat}>
              <Text style={styles.propertyStatLabel}>Your Share</Text>
              <Text style={[styles.propertyStatValue, { color: Colors.primary }]}>
                {property.ownerShare}%
              </Text>
            </View>
          </View>

          <View style={styles.propertyRevenue}>
            <Text style={styles.propertyRevenueLabel}>Your Revenue from this Property</Text>
            <Text style={styles.propertyRevenueValue}>
              {formatCurrency(property.currentRaise * (property.ownerShare / 100) * 0.1)}
            </Text>
          </View>

          <View style={styles.propertyActions}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { backgroundColor: property.tradingPaused ? Colors.positive + '15' : Colors.negative + '15' }
              ]}
              onPress={() => handleToggleTrading(property)}
            >
              {property.tradingPaused ? (
                <>
                  <Unlock size={16} color={Colors.positive} />
                  <Text style={[styles.actionBtnText, { color: Colors.positive }]}>Resume</Text>
                </>
              ) : (
                <>
                  <Lock size={16} color={Colors.negative} />
                  <Text style={[styles.actionBtnText, { color: Colors.negative }]}>Pause</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Colors.primary + '15' }]}
              onPress={() => openEditPropertyModal(property)}
            >
              <Edit3 size={16} color={Colors.primary} />
              <Text style={[styles.actionBtnText, { color: Colors.primary }]}>Configure</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const renderFees = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.infoCard}>
        <Percent size={20} color={Colors.primary} />
        <Text style={styles.infoText}>
          Set transaction fees to generate revenue from all platform activities
        </Text>
      </View>

      <View style={styles.feeSummary}>
        <View style={styles.feeSummaryItem}>
          <Text style={styles.feeSummaryLabel}>Total Fees Collected</Text>
          <Text style={styles.feeSummaryValue}>{formatCurrency(feeStats.totalFeesCollected)}</Text>
        </View>
        <View style={styles.feeSummaryDivider} />
        <View style={styles.feeSummaryItem}>
          <Text style={styles.feeSummaryLabel}>Avg Fee Amount</Text>
          <Text style={styles.feeSummaryValue}>{formatCurrency(feeStats.averageFeeAmount)}</Text>
        </View>
      </View>

      {feeConfigurations.map((fee) => (
        <TouchableOpacity
          key={fee.id}
          style={styles.feeCard}
          onPress={() => openEditFeeModal(fee)}
          activeOpacity={0.7}
        >
          <View style={styles.feeHeader}>
            <View style={styles.feeInfo}>
              <Text style={styles.feeName}>{fee.name}</Text>
              <Text style={styles.feeType}>{fee.type.toUpperCase()}</Text>
            </View>
            <View style={[
              styles.feeStatusBadge,
              { backgroundColor: fee.isActive ? Colors.positive + '20' : Colors.textSecondary + '20' }
            ]}>
              <Text style={[
                styles.feeStatusText,
                { color: fee.isActive ? Colors.positive : Colors.textSecondary }
              ]}>
                {fee.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <View style={styles.feeDetails}>
            <View style={styles.feeDetail}>
              <Text style={styles.feeDetailLabel}>Rate</Text>
              <Text style={styles.feeDetailValue}>{fee.percentage}%</Text>
            </View>
            <View style={styles.feeDetail}>
              <Text style={styles.feeDetailLabel}>Min</Text>
              <Text style={styles.feeDetailValue}>{formatCurrency(fee.minFee)}</Text>
            </View>
            <View style={styles.feeDetail}>
              <Text style={styles.feeDetailLabel}>Max</Text>
              <Text style={styles.feeDetailValue}>{formatCurrency(fee.maxFee)}</Text>
            </View>
          </View>

          <View style={styles.feeFooter}>
            <Text style={styles.feeFooterText}>Tap to edit</Text>
            <ChevronRight size={16} color={Colors.textTertiary} />
          </View>
        </TouchableOpacity>
      ))}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const renderSettings = () => (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.infoCard}>
        <Settings size={20} color={Colors.primary} />
        <Text style={styles.infoText}>
          Configure platform-wide settings and controls
        </Text>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>Investment Limits</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Minimum Investment</Text>
          <Text style={styles.settingValue}>{formatCurrency(platformSettings.minInvestment)}</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Maximum Investment</Text>
          <Text style={styles.settingValue}>{formatCurrency(platformSettings.maxInvestment)}</Text>
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>Platform Fee</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Commission Rate</Text>
          <Text style={[styles.settingValue, { color: Colors.primary }]}>
            {platformSettings.platformFeePercent}%
          </Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Dividend Distribution Day</Text>
          <Text style={styles.settingValue}>Day {platformSettings.dividendDistributionDay}</Text>
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>Platform Controls</Text>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Trading Enabled</Text>
            <Text style={styles.toggleDesc}>Allow users to buy and sell shares</Text>
          </View>
          <Switch
            value={platformSettings.tradingEnabled}
            onValueChange={(value) => setPlatformSettings({ ...platformSettings, tradingEnabled: value })}
            trackColor={{ false: Colors.border, true: Colors.primary + '80' }}
            thumbColor={platformSettings.tradingEnabled ? Colors.primary : Colors.textTertiary}
          />
        </View>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>New Signups</Text>
            <Text style={styles.toggleDesc}>Allow new user registrations</Text>
          </View>
          <Switch
            value={platformSettings.newSignupsEnabled}
            onValueChange={(value) => setPlatformSettings({ ...platformSettings, newSignupsEnabled: value })}
            trackColor={{ false: Colors.border, true: Colors.primary + '80' }}
            thumbColor={platformSettings.newSignupsEnabled ? Colors.primary : Colors.textTertiary}
          />
        </View>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Auto-Reinvest</Text>
            <Text style={styles.toggleDesc}>Enable automatic dividend reinvestment</Text>
          </View>
          <Switch
            value={platformSettings.autoReinvestEnabled}
            onValueChange={(value) => setPlatformSettings({ ...platformSettings, autoReinvestEnabled: value })}
            trackColor={{ false: Colors.border, true: Colors.primary + '80' }}
            thumbColor={platformSettings.autoReinvestEnabled ? Colors.primary : Colors.textTertiary}
          />
        </View>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Maintenance Mode</Text>
            <Text style={styles.toggleDesc}>Temporarily disable platform access</Text>
          </View>
          <Switch
            value={platformSettings.maintenanceMode}
            onValueChange={(value) => {
              if (value) {
                Alert.alert(
                  'Enable Maintenance Mode',
                  'This will prevent all users from accessing the platform. Are you sure?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Enable', style: 'destructive', onPress: () => setPlatformSettings({ ...platformSettings, maintenanceMode: true }) }
                  ]
                );
              } else {
                setPlatformSettings({ ...platformSettings, maintenanceMode: value });
              }
            }}
            trackColor={{ false: Colors.border, true: Colors.negative + '80' }}
            thumbColor={platformSettings.maintenanceMode ? Colors.negative : Colors.textTertiary}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.saveSettingsBtn} onPress={handleSaveSettings}>
        <Check size={20} color="#fff" />
        <Text style={styles.saveSettingsBtnText}>Save All Settings</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.apiKeysBtn}
        onPress={() => router.push('/admin/api-keys' as any)}
        activeOpacity={0.8}
      >
        <View style={styles.apiKeysBtnLeft}>
          <View style={styles.apiKeysBtnIcon}>
            <Key size={18} color="#FF9900" />
          </View>
          <View>
            <Text style={styles.apiKeysBtnTitle}>API Keys Vault</Text>
            <Text style={styles.apiKeysBtnSub}>View & copy all environment credentials</Text>
          </View>
        </View>
        <ChevronRight size={18} color={Colors.textSecondary} />
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={[styles.headerLeft, { flex: 1 }]}>
          <Crown size={28} color="#FFD700" />
          <View>
            <Text style={styles.title}>Owner Controls</Text>
            <Text style={styles.subtitle}>Full platform management</Text>
          </View>
        </View>
      </View>

      <View style={styles.tabContainer}>
        {[
          { key: 'revenue', label: 'Revenue', icon: DollarSign },
          { key: 'properties', label: 'Properties', icon: Building2 },
          { key: 'fees', label: 'Fees', icon: Percent },
          { key: 'settings', label: 'Settings', icon: Settings },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key as typeof activeTab)}
          >
            <tab.icon size={16} color={activeTab === tab.key ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'revenue' && renderRevenue()}
      {activeTab === 'properties' && renderProperties()}
      {activeTab === 'fees' && renderFees()}
      {activeTab === 'settings' && renderSettings()}

      <Modal
        visible={editFeeModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditFeeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Fee Configuration</Text>
              <TouchableOpacity onPress={() => setEditFeeModalVisible(false)}>
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {selectedFee && (
              <>
                <View style={styles.modalInfo}>
                  <Percent size={24} color={Colors.primary} />
                  <Text style={styles.modalInfoText}>{selectedFee.name}</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Fee Percentage (%)</Text>
                  <TextInput
                    style={styles.input}
                    value={editedFee.percentage}
                    onChangeText={(text) => setEditedFee({ ...editedFee, percentage: text })}
                    keyboardType="decimal-pad"
                    placeholder="0.0"
                    placeholderTextColor={Colors.textTertiary}
                  />
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Min Fee ($)</Text>
                    <TextInput
                      style={styles.input}
                      value={editedFee.minFee}
                      onChangeText={(text) => setEditedFee({ ...editedFee, minFee: text })}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={Colors.textTertiary}
                    />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Max Fee ($)</Text>
                    <TextInput
                      style={styles.input}
                      value={editedFee.maxFee}
                      onChangeText={(text) => setEditedFee({ ...editedFee, maxFee: text })}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={Colors.textTertiary}
                    />
                  </View>
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Fee Active</Text>
                  <Switch
                    value={editedFee.isActive}
                    onValueChange={(value) => setEditedFee({ ...editedFee, isActive: value })}
                    trackColor={{ false: Colors.border, true: Colors.primary + '80' }}
                    thumbColor={editedFee.isActive ? Colors.primary : Colors.textTertiary}
                  />
                </View>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveFee}>
                  <Check size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={editPropertyModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditPropertyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Property Controls</Text>
              <TouchableOpacity onPress={() => setEditPropertyModalVisible(false)}>
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {selectedProperty && (
              <>
                <View style={styles.modalInfo}>
                  <Building2 size={24} color={Colors.primary} />
                  <Text style={styles.modalInfoText}>{selectedProperty.name}</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Your Ownership Share (%)</Text>
                  <TextInput
                    style={styles.input}
                    value={editedProperty.ownerShare}
                    onChangeText={(text) => setEditedProperty({ ...editedProperty, ownerShare: text })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Colors.textTertiary}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Price Adjustment (%)</Text>
                  <TextInput
                    style={styles.input}
                    value={editedProperty.priceAdjustment}
                    onChangeText={(text) => setEditedProperty({ ...editedProperty, priceAdjustment: text })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Colors.textTertiary}
                  />
                  <Text style={styles.inputHint}>Positive to increase, negative to decrease price</Text>
                </View>

                <View style={styles.switchRow}>
                  <View>
                    <Text style={styles.switchLabel}>Pause Trading</Text>
                    <Text style={styles.switchHint}>Temporarily halt all trading for this property</Text>
                  </View>
                  <Switch
                    value={editedProperty.tradingPaused}
                    onValueChange={(value) => setEditedProperty({ ...editedProperty, tradingPaused: value })}
                    trackColor={{ false: Colors.border, true: Colors.negative + '80' }}
                    thumbColor={editedProperty.tradingPaused ? Colors.negative : Colors.textTertiary}
                  />
                </View>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProperty}>
                  <Check size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  headerLeft: { flex: 1, minWidth: 0 },
  title: { color: Colors.text, fontSize: 18, fontWeight: '800' as const, flexShrink: 1 },
  subtitle: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  tabContainer: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 12, padding: 4, marginBottom: 16, marginHorizontal: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { color: Colors.textSecondary, fontWeight: '600' as const, fontSize: 13 },
  tabTextActive: { color: Colors.black },
  content: { flex: 1, paddingHorizontal: 20 },
  ownerBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  ownerBadgeText: { fontSize: 11, fontWeight: '700' as const },
  heroCard: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: Colors.surfaceBorder },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  heroLabel: { color: Colors.textTertiary, fontSize: 13 },
  liveIndicator: { width: 4, borderRadius: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { color: Colors.textSecondary, fontSize: 13 },
  heroValue: { color: Colors.text, fontSize: 20, fontWeight: '800' as const },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroStat: { alignItems: 'center', gap: 2 },
  heroStatText: { color: Colors.textSecondary, fontSize: 13 },
  revenueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  revenueCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  revenueIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  revenueLabel: { color: Colors.textSecondary, fontSize: 13 },
  revenueValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const, marginBottom: 12 },
  breakdownCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownLabel: { color: Colors.textSecondary, fontSize: 13 },
  breakdownRight: { alignItems: 'flex-end' },
  breakdownValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  breakdownPercent: { color: Colors.primary, fontSize: 14, fontWeight: '700' as const },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statItem: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.surfaceBorder },
  statValue: { color: Colors.text, fontSize: 18, fontWeight: '800' as const },
  statLabel: { color: Colors.textTertiary, fontSize: 11 },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.surfaceBorder },
  infoCard: { backgroundColor: Colors.info + '10', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.info + '20' },
  infoText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  propertyControlCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  propertyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  propertyInfo: { flex: 1 },
  propertyName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  propertyLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tradingBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tradingBadgeText: { fontSize: 11, fontWeight: '700' as const },
  propertyStats: { flexDirection: 'row', gap: 12, marginTop: 8 },
  propertyStat: { gap: 2 },
  propertyStatLabel: { color: Colors.textSecondary, fontSize: 13 },
  propertyStatValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  propertyRevenue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  propertyRevenueLabel: { color: Colors.textSecondary, fontSize: 13 },
  propertyRevenueValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  propertyActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  actionBtnText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  feeSummary: { flexDirection: 'row', gap: 16, backgroundColor: Colors.backgroundSecondary, borderRadius: 10, padding: 12, marginBottom: 12 },
  feeSummaryItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  feeSummaryLabel: { color: Colors.textSecondary, fontSize: 13 },
  feeSummaryValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  feeSummaryDivider: { width: 1, height: 24, backgroundColor: Colors.surfaceBorder },
  feeCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  feeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  feeInfo: { flex: 1 },
  feeName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  feeType: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  feeStatusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  feeStatusText: { color: Colors.textSecondary, fontSize: 13 },
  feeDetails: { flexDirection: 'row', gap: 12, marginTop: 8 },
  feeDetail: { gap: 2 },
  feeDetailLabel: { color: Colors.textSecondary, fontSize: 13 },
  feeDetailValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  feeFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  feeFooterText: { color: Colors.textSecondary, fontSize: 13 },
  settingsCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  settingsTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingLabel: { color: Colors.textSecondary, fontSize: 13 },
  settingValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  toggleLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, flex: 1 },
  toggleDesc: { color: Colors.textTertiary, fontSize: 12, marginTop: 2 },
  saveSettingsBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  saveSettingsBtnText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  apiKeysBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#FF990030' },
  apiKeysBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  apiKeysBtnIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FF990015', alignItems: 'center', justifyContent: 'center' },
  apiKeysBtnTitle: { color: Colors.text, fontSize: 14, fontWeight: '700' as const },
  apiKeysBtnSub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  bottomPadding: { height: 40 },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' as const },
  modalInfo: { backgroundColor: Colors.backgroundSecondary, borderRadius: 12, padding: 12, marginBottom: 12 },
  modalInfoText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  inputGroup: { gap: 6, marginBottom: 12 },
  inputLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, marginBottom: 6 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, color: Colors.text, fontSize: 16, borderWidth: 1, borderColor: Colors.surfaceBorder },
  inputHint: { color: Colors.textTertiary, fontSize: 12, marginTop: 4 },
  inputRow: { flexDirection: 'row', gap: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  switchLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, flex: 1 },
  switchHint: { color: Colors.textTertiary, fontSize: 12, marginTop: 2 },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
});
