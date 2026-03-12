import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Animated,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  Shield,
  TrendingUp,
  DollarSign,
  Info,
  CheckCircle,
  CreditCard,
  Banknote,
  Wallet,
  Lock,
  Clock,
  Users,
  Percent,
  Calendar,
  MapPin,
  FileText,
  Handshake,
  BarChart3,
  Coins,
  Landmark,
  UserPlus,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { formatCurrencyWithDecimals } from '@/lib/formatters';
import { JV_AGREEMENT_TYPES, JVAgreement } from '@/mocks/jv-agreements';
import { fetchJVDealById } from '@/lib/jv-storage';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseJVInvestment } from '@/lib/investment-service';

type PaymentMethod = 'wallet' | 'bank' | 'wire';
type InvestmentPool = 'jv_direct' | 'token_shares';

const PAYMENT_METHODS: { id: PaymentMethod; label: string; desc: string; icon: typeof Wallet }[] = [
  { id: 'wallet', label: 'Wallet Balance', desc: 'Instant settlement', icon: Wallet },
  { id: 'bank', label: 'Bank Transfer (ACH)', desc: '1-3 business days', icon: Banknote },
  { id: 'wire', label: 'Wire Transfer', desc: 'Same day', icon: CreditCard },
];

const POOL_OPTIONS: { id: InvestmentPool; label: string; desc: string; icon: typeof Landmark; color: string }[] = [
  {
    id: 'jv_direct',
    label: 'JV Investment',
    desc: 'Direct equity stake in the project — become a JV partner with profit sharing',
    icon: Landmark,
    color: '#00C48C',
  },
  {
    id: 'token_shares',
    label: 'Token Shares',
    desc: 'Fractional ownership via tokenized shares — invest any amount, earn returns',
    icon: Coins,
    color: '#FFD700',
  },
];

export default function JVInvestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { jvId } = useLocalSearchParams<{ jvId: string }>();

  const jvQuery = useQuery({
    queryKey: ['jv-deal', jvId],
    queryFn: async () => {
      if (!jvId) return null;
      const data = await fetchJVDealById(jvId);
      if (!data) {
        console.log('[JVInvest] Deal not found:', jvId);
        return null;
      }
      return data as unknown as JVAgreement;
    },
    enabled: !!jvId,
    retry: 2,
  });
  const jv = jvQuery.data as JVAgreement | null | undefined;

  const pools = useMemo(() => {
    if (!jv?.poolTiers) return [];
    return jv.poolTiers.filter(t => t.status === 'open');
  }, [jv]);

  const [selectedPool, setSelectedPool] = useState<InvestmentPool>('jv_direct');
  const [investAmount, setInvestAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'pool' | 'amount' | 'review' | 'success'>('pool');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const balanceQuery = useQuery({
    queryKey: ['wallet-balance-jv'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('wallets').select('*').eq('user_id', user.id).single();
      return data;
    },
    staleTime: 1000 * 60,
  });
  const walletBalance = (balanceQuery.data as any)?.available ?? 0;
  const successAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  const selectedPoolData = useMemo(() => {
    return pools.find(p => p.type === selectedPool) || null;
  }, [pools, selectedPool]);

  const amount = useMemo(() => parseFloat(investAmount.replace(/,/g, '')) || 0, [investAmount]);
  const managementFee = jv ? amount * (jv.managementFee / 100) : 0;
  const totalCost = amount;
  const estimatedReturn = jv ? amount * (jv.expectedROI / 100) : 0;
  const poolRemaining = selectedPoolData ? selectedPoolData.targetAmount - selectedPoolData.currentRaised : (jv?.totalInvestment ?? 0);
  const equityPercent = jv ? (amount / jv.totalInvestment) * 100 : 0;
  const minInvestment = selectedPoolData?.minInvestment ?? 50;

  const typeConfig = useMemo(() => {
    if (!jv) return null;
    return JV_AGREEMENT_TYPES.find(t => t.id === jv.type);
  }, [jv]);

  const totalRaised = useMemo(() => {
    if (!jv?.poolTiers) return 0;
    return jv.poolTiers.reduce((s, t) => s + t.currentRaised, 0);
  }, [jv]);

  const totalInvestors = useMemo(() => {
    if (!jv?.poolTiers) return 0;
    return jv.poolTiers.reduce((s, t) => s + t.investorCount, 0);
  }, [jv]);

  const fundingProgress = jv ? (totalRaised / jv.totalInvestment) * 100 : 0;

  const handleSelectPool = useCallback((pool: InvestmentPool) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPool(pool);
  }, []);

  const handleContinueToAmount = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('amount');
  }, []);

  const handleContinueToReview = useCallback(() => {
    if (amount < minInvestment) {
      Alert.alert('Below Minimum', `Minimum investment is ${formatCurrencyWithDecimals(minInvestment)}`);
      return;
    }
    if (amount > poolRemaining) {
      Alert.alert('Exceeds Available', `Maximum available is ${formatCurrencyWithDecimals(poolRemaining)}`);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('review');
  }, [amount, minInvestment, poolRemaining]);

  const queryClient = useQueryClient();
  const [confirmationNum, setConfirmationNum] = useState('');

  const handleConfirmInvestment = useCallback(async () => {
    if (!agreedToTerms) {
      Alert.alert('Agreement Required', 'Please agree to the terms before proceeding.');
      return;
    }
    if (paymentMethod === 'wallet' && walletBalance < totalCost) {
      Alert.alert('Insufficient Funds', 'Your wallet balance is not enough. Try bank or wire transfer.');
      return;
    }
    if (!jv) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsProcessing(true);

    try {
      console.log('[JVInvest] Submitting real JV purchase to Supabase...');
      const result = await purchaseJVInvestment({
        jvDealId: jv.id || jvId || '',
        jvTitle: jv.title,
        jvProjectName: jv.projectName,
        investmentPool: selectedPool === 'jv_direct' ? 'jv_direct' : 'token_shares',
        amount,
        equityPercent,
        expectedROI: jv.expectedROI,
        paymentMethod,
      });

      if (result.success) {
        console.log('[JVInvest] Purchase successful:', result.confirmationNumber);
        setConfirmationNum(result.confirmationNumber);
        setStep('success');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        void queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
        void queryClient.invalidateQueries({ queryKey: ['wallet-balance-jv'] });
        void queryClient.invalidateQueries({ queryKey: ['holdings'] });
        void queryClient.invalidateQueries({ queryKey: ['transactions'] });
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });

        Animated.sequence([
          Animated.timing(successAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(checkScale, { toValue: 1, friction: 4, tension: 50, useNativeDriver: true }),
        ]).start();
      } else {
        console.error('[JVInvest] Purchase failed:', result.error, result.message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Investment Failed', result.message);
      }
    } catch (error) {
      console.error('[JVInvest] Unexpected error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [agreedToTerms, paymentMethod, walletBalance, totalCost, jv, jvId, selectedPool, amount, equityPercent, successAnim, checkScale, queryClient]);

  const handleAmountChange = useCallback((text: string) => {
    const clean = text.replace(/[^0-9]/g, '');
    if (clean === '') {
      setInvestAmount('');
      return;
    }
    const num = parseInt(clean, 10);
    setInvestAmount(num.toLocaleString('en-US'));
  }, []);

  const getStepTitle = useCallback(() => {
    switch (step) {
      case 'pool': return 'Choose How to Invest';
      case 'amount': return 'Investment Amount';
      case 'review': return 'Review & Confirm';
      case 'success': return 'Success';
      default: return 'Invest';
    }
  }, [step]);

  const goBack = useCallback(() => {
    if (step === 'amount') setStep('pool');
    else if (step === 'review') setStep('amount');
    else router.back();
  }, [step, router]);

  const poolLabel = selectedPool === 'jv_direct' ? 'JV Investment' : 'Token Shares';

  if (jvQuery.isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[styles.errorText, { marginTop: 16 }]}>Loading Deal...</Text>
        </View>
      </View>
    );
  }

  if (!jv && !jvQuery.isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Deal not found</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!jv) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (step === 'success') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.successContainer, { paddingTop: insets.top + 40 }]}>
          <Animated.View style={[styles.successCheckWrap, { opacity: successAnim, transform: [{ scale: checkScale }] }]}>
            <View style={styles.successCheckCircle}>
              <Handshake size={64} color={Colors.primary} />
            </View>
          </Animated.View>
          <Animated.View style={{ opacity: successAnim, width: '100%', alignItems: 'center' as const }}>
            <Text style={styles.successTitle}>Investment Confirmed!</Text>
            <Text style={styles.successSubtitle}>
              You are now an investor in {jv.projectName}
            </Text>

            <View style={styles.successCard}>
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Deal</Text>
                <Text style={styles.successValue}>{jv.title}</Text>
              </View>
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Investment Type</Text>
                <Text style={styles.successValue}>{poolLabel}</Text>
              </View>
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Amount Invested</Text>
                <Text style={styles.successValueGold}>{formatCurrencyWithDecimals(amount)}</Text>
              </View>
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Ownership Share</Text>
                <Text style={styles.successValue}>{equityPercent.toFixed(2)}%</Text>
              </View>
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Expected ROI</Text>
                <Text style={[styles.successValue, { color: Colors.success }]}>{jv.expectedROI}%</Text>
              </View>
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Confirmation #</Text>
                <Text style={styles.successValue}>{confirmationNum || `INV-${Date.now().toString(36).toUpperCase()}`}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.successPrimaryBtn}
              onPress={() => router.push('/jv-agreement' as any)}
            >
              <Text style={styles.successPrimaryBtnText}>View Agreements</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.successSecondaryBtn}
              onPress={() => router.push('/(tabs)/portfolio' as any)}
            >
              <Text style={styles.successSecondaryBtnText}>Go to Portfolio</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={goBack}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getStepTitle()}</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.dealBanner}>
              <Image
                source={jv.photos?.[0] ? { uri: jv.photos[0] } : require('@/assets/images/ivx-logo.png')}
                style={styles.dealThumb}
              />
              <View style={styles.dealBannerInfo}>
                <View style={styles.dealBannerRow}>
                  <Text style={styles.dealBannerName} numberOfLines={1}>{jv.title}</Text>
                  {typeConfig && (
                    <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '20' }]}>
                      <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
                        {typeConfig.icon} {typeConfig.label}
                      </Text>
                    </View>
                  )}
                </View>
                {jv.propertyAddress && (
                  <View style={styles.addressRow}>
                    <MapPin size={12} color={Colors.textTertiary} />
                    <Text style={styles.dealBannerAddress} numberOfLines={1}>{jv.propertyAddress}</Text>
                  </View>
                )}
                <View style={styles.dealBannerStats}>
                  <View style={styles.dealStat}>
                    <DollarSign size={12} color={Colors.primary} />
                    <Text style={styles.dealStatText}>{formatCurrencyWithDecimals(jv.totalInvestment)}</Text>
                  </View>
                  <View style={styles.dealStat}>
                    <TrendingUp size={12} color={Colors.success} />
                    <Text style={[styles.dealStatText, { color: Colors.success }]}>{jv.expectedROI}% ROI</Text>
                  </View>
                  <View style={styles.dealStat}>
                    <Users size={12} color={Colors.info} />
                    <Text style={styles.dealStatText}>{totalInvestors} Investors</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.fundingBar}>
              <View style={styles.fundingBarRow}>
                <Text style={styles.fundingBarLabel}>Total Raised</Text>
                <Text style={styles.fundingBarValue}>
                  {formatCurrencyWithDecimals(totalRaised)} of {formatCurrencyWithDecimals(jv.totalInvestment)}
                </Text>
              </View>
              <View style={styles.fundingProgress}>
                <View style={[styles.fundingProgressFill, { width: `${Math.min(fundingProgress, 100)}%` }]} />
              </View>
              <Text style={styles.fundingPercent}>{fundingProgress.toFixed(0)}% funded</Text>
            </View>

            {step === 'pool' && (
              <>
                <View style={styles.sectionWrap}>
                  <Text style={styles.sectionTitle}>How Would You Like to Invest?</Text>
                  <Text style={styles.sectionDesc}>
                    Anyone can invest — choose the option that fits your budget. No restrictions, no limits.
                  </Text>
                </View>

                {POOL_OPTIONS.map(opt => {
                  const isSelected = selectedPool === opt.id;
                  const poolData = pools.find(p => p.type === opt.id);
                  const raised = poolData?.currentRaised ?? 0;
                  const target = poolData?.targetAmount ?? 0;
                  const remaining = target - raised;
                  const progress = target > 0 ? (raised / target) * 100 : 0;
                  const investorCount = poolData?.investorCount ?? 0;
                  const IconComp = opt.icon;

                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.poolCard, isSelected && styles.poolCardActive]}
                      onPress={() => handleSelectPool(opt.id)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.poolHeader}>
                        <View style={[styles.poolIconWrap, { backgroundColor: opt.color + '20' }]}>
                          <IconComp size={24} color={opt.color} />
                        </View>
                        <View style={styles.poolHeaderInfo}>
                          <Text style={styles.poolLabel}>{opt.label}</Text>
                          <Text style={styles.poolDesc}>{opt.desc}</Text>
                        </View>
                        <View style={[styles.poolRadio, isSelected && styles.poolRadioActive]}>
                          {isSelected && <View style={styles.poolRadioDot} />}
                        </View>
                      </View>

                      {poolData && (
                        <View style={styles.poolStats}>
                          <View style={styles.poolProgressWrap}>
                            <View style={styles.poolProgressBar}>
                              <View style={[styles.poolProgressFill, { width: `${Math.min(progress, 100)}%`, backgroundColor: opt.color }]} />
                            </View>
                            <Text style={styles.poolProgressText}>{progress.toFixed(0)}%</Text>
                          </View>
                          <View style={styles.poolStatsRow}>
                            <View style={styles.poolStatItem}>
                              <Text style={styles.poolStatLabel}>Target</Text>
                              <Text style={styles.poolStatValue}>{formatCurrencyWithDecimals(target)}</Text>
                            </View>
                            <View style={styles.poolStatDivider} />
                            <View style={styles.poolStatItem}>
                              <Text style={styles.poolStatLabel}>Available</Text>
                              <Text style={[styles.poolStatValue, { color: Colors.success }]}>{formatCurrencyWithDecimals(remaining)}</Text>
                            </View>
                            <View style={styles.poolStatDivider} />
                            <View style={styles.poolStatItem}>
                              <Text style={styles.poolStatLabel}>Investors</Text>
                              <Text style={styles.poolStatValue}>{investorCount}</Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

                <View style={styles.openInvestBanner}>
                  <UserPlus size={18} color={Colors.info} />
                  <Text style={styles.openInvestText}>
                    Open to everyone — private lenders, individual investors, institutions. No caps, no restrictions.
                  </Text>
                </View>

                <View style={styles.dealTerms}>
                  <Text style={styles.dealTermsTitle}>Deal Terms</Text>
                  <View style={styles.termRow}>
                    <Calendar size={14} color={Colors.textSecondary} />
                    <Text style={styles.termLabel}>Duration</Text>
                    <Text style={styles.termValue}>
                      {new Date(jv.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} —{' '}
                      {new Date(jv.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={styles.termRow}>
                    <Percent size={14} color={Colors.textSecondary} />
                    <Text style={styles.termLabel}>Management Fee</Text>
                    <Text style={styles.termValue}>{jv.managementFee}%</Text>
                  </View>
                  <View style={styles.termRow}>
                    <BarChart3 size={14} color={Colors.textSecondary} />
                    <Text style={styles.termLabel}>Performance Fee</Text>
                    <Text style={styles.termValue}>{jv.performanceFee}%</Text>
                  </View>
                  <View style={styles.termRow}>
                    <Clock size={14} color={Colors.textSecondary} />
                    <Text style={styles.termLabel}>Distributions</Text>
                    <Text style={styles.termValue}>{jv.distributionFrequency.charAt(0).toUpperCase() + jv.distributionFrequency.slice(1)}</Text>
                  </View>
                  <View style={styles.termRow}>
                    <Lock size={14} color={Colors.textSecondary} />
                    <Text style={styles.termLabel}>Min Hold</Text>
                    <Text style={styles.termValue}>{jv.minimumHoldPeriod} months</Text>
                  </View>
                  <View style={styles.termRow}>
                    <FileText size={14} color={Colors.textSecondary} />
                    <Text style={styles.termLabel}>Exit Strategy</Text>
                    <Text style={styles.termValue}>{jv.exitStrategy}</Text>
                  </View>
                </View>
              </>
            )}

            {step === 'amount' && (
              <>
                <View style={styles.selectedPoolBanner}>
                  <View style={styles.selectedPoolInfo}>
                    <Text style={styles.selectedPoolLabel}>{poolLabel}</Text>
                    <Text style={styles.selectedPoolMeta}>
                      Min: {formatCurrencyWithDecimals(minInvestment)} • {formatCurrencyWithDecimals(poolRemaining)} available
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.changePoolBtn}
                    onPress={() => setStep('pool')}
                  >
                    <Text style={styles.changePoolText}>Change</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.amountSection}>
                  <Text style={styles.inputLabel}>Investment Amount (USD)</Text>
                  <View style={styles.amountInputWrap}>
                    <Text style={styles.currencyPrefix}>$</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={investAmount}
                      onChangeText={handleAmountChange}
                      keyboardType="numeric"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      placeholder="0"
                      placeholderTextColor={Colors.textTertiary}
                    />
                  </View>
                </View>

                <View style={styles.quickAmountSection}>
                  {[100, 500, 1000, 5000, 10000, 50000].filter(v => v <= poolRemaining).map(qty => (
                    <TouchableOpacity
                      key={qty}
                      style={[styles.quickAmountBtn, amount === qty && styles.quickAmountBtnActive]}
                      onPress={() => { Keyboard.dismiss(); setInvestAmount(qty.toLocaleString('en-US')); }}
                    >
                      <Text style={[styles.quickAmountText, amount === qty && styles.quickAmountTextActive]}>
                        {qty >= 1000 ? `$${(qty / 1000).toFixed(0)}K` : `$${qty}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.investSummary}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Investment Amount</Text>
                    <Text style={styles.summaryValue}>{formatCurrencyWithDecimals(amount)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Ownership Share</Text>
                    <Text style={[styles.summaryValue, { color: Colors.primary }]}>{equityPercent.toFixed(2)}%</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Mgmt Fee ({jv.managementFee}%/yr)</Text>
                    <Text style={styles.summaryValue}>{formatCurrencyWithDecimals(managementFee)}/yr</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabelBold}>Est. Return ({jv.expectedROI}%)</Text>
                    <Text style={[styles.summaryValueBold, { color: Colors.success }]}>{formatCurrencyWithDecimals(estimatedReturn)}</Text>
                  </View>
                </View>

                <View style={styles.protectionCard}>
                  <View style={styles.protectionRow}>
                    <Shield size={16} color={Colors.info} />
                    <Text style={styles.protectionText}>Investment protected by JV Operating Agreement</Text>
                  </View>
                  <View style={styles.protectionRow}>
                    <Lock size={16} color={Colors.primary} />
                    <Text style={styles.protectionText}>Funds held in FDIC-insured escrow until closing</Text>
                  </View>
                  <View style={styles.protectionRow}>
                    <FileText size={16} color={Colors.success} />
                    <Text style={styles.protectionText}>Governed by {jv.governingLaw}</Text>
                  </View>
                </View>
              </>
            )}

            {step === 'review' && (
              <>
                <View style={styles.paymentSection}>
                  <Text style={styles.inputLabel}>Payment Method</Text>
                  {PAYMENT_METHODS.map(pm => {
                    const IconComp = pm.icon;
                    const isSelected = paymentMethod === pm.id;
                    return (
                      <TouchableOpacity
                        key={pm.id}
                        style={[styles.paymentOption, isSelected && styles.paymentOptionActive]}
                        onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPaymentMethod(pm.id); }}
                      >
                        <View style={[styles.paymentIconWrap, isSelected && styles.paymentIconWrapActive]}>
                          <IconComp size={20} color={isSelected ? Colors.primary : Colors.textSecondary} />
                        </View>
                        <View style={styles.paymentInfo}>
                          <Text style={[styles.paymentLabel, isSelected && styles.paymentLabelActive]}>{pm.label}</Text>
                          <Text style={styles.paymentDesc}>
                            {pm.id === 'wallet' ? `Balance: ${formatCurrencyWithDecimals(walletBalance)}` : pm.desc}
                          </Text>
                        </View>
                        <View style={[styles.paymentRadio, isSelected && styles.paymentRadioActive]}>
                          {isSelected && <View style={styles.paymentRadioDot} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.reviewSummary}>
                  <Text style={styles.inputLabel}>Investment Summary</Text>
                  <View style={styles.reviewCard}>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Deal</Text>
                      <Text style={styles.reviewValue}>{jv.title}</Text>
                    </View>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Investment Type</Text>
                      <Text style={styles.reviewValue}>{poolLabel}</Text>
                    </View>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Amount</Text>
                      <Text style={styles.reviewValue}>{formatCurrencyWithDecimals(amount)}</Text>
                    </View>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Ownership</Text>
                      <Text style={styles.reviewValue}>{equityPercent.toFixed(2)}%</Text>
                    </View>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Expected ROI</Text>
                      <Text style={[styles.reviewValue, { color: Colors.success }]}>{jv.expectedROI}%</Text>
                    </View>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Distribution</Text>
                      <Text style={styles.reviewValue}>{jv.distributionFrequency.charAt(0).toUpperCase() + jv.distributionFrequency.slice(1)}</Text>
                    </View>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>Hold Period</Text>
                      <Text style={styles.reviewValue}>{jv.minimumHoldPeriod} months min.</Text>
                    </View>
                    <View style={styles.reviewDivider} />
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabelBold}>Total Investment</Text>
                      <Text style={styles.reviewValueBold}>{formatCurrencyWithDecimals(totalCost)}</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.termsCheck}
                  onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAgreedToTerms(prev => !prev); }}
                >
                  <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                    {agreedToTerms && <CheckCircle size={16} color={Colors.primary} />}
                  </View>
                  <Text style={styles.termsText}>
                    I have read and agree to the Investment Agreement, understand the risks, and acknowledge the {jv.minimumHoldPeriod}-month minimum hold period.
                  </Text>
                </TouchableOpacity>

                <View style={styles.disclaimerWrap}>
                  <Info size={14} color={Colors.textTertiary} />
                  <Text style={styles.disclaimerText}>
                    Investments involve risk of loss. Past performance does not guarantee future results. Disputes resolved via {jv.disputeResolution}.
                  </Text>
                </View>
              </>
            )}

            <View style={{ height: 140 }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {(step === 'pool' || step === 'amount' || step === 'review') && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {step === 'pool' ? (
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleContinueToAmount}
            >
              <Text style={styles.ctaButtonText}>
                Continue with {poolLabel}
              </Text>
            </TouchableOpacity>
          ) : step === 'amount' ? (
            <TouchableOpacity
              style={[styles.ctaButton, amount < minInvestment && styles.ctaButtonDisabled]}
              onPress={handleContinueToReview}
              disabled={amount < minInvestment}
            >
              <Text style={styles.ctaButtonText}>
                Continue — {formatCurrencyWithDecimals(amount)}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.ctaButton, (!agreedToTerms || isProcessing) && styles.ctaButtonDisabled]}
              onPress={handleConfirmInvestment}
              disabled={!agreedToTerms || isProcessing}
            >
              {isProcessing ? (
                <View style={styles.processingRow}>
                  <ActivityIndicator size="small" color={Colors.black} />
                  <Text style={styles.ctaButtonText}>Processing...</Text>
                </View>
              ) : (
                <View style={styles.processingRow}>
                  <Handshake size={18} color={Colors.black} />
                  <Text style={styles.ctaButtonText}>Confirm Investment</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  dealBanner: {
    flexDirection: 'row',
    margin: 16,
    marginBottom: 0,
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  dealThumb: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: Colors.backgroundSecondary,
  },
  dealBannerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  dealBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  dealBannerName: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  dealBannerAddress: {
    fontSize: 11,
    color: Colors.textTertiary,
    flex: 1,
  },
  dealBannerStats: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  dealStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dealStatText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  fundingBar: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 16,
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  fundingBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fundingBarLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  fundingBarValue: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  fundingProgress: {
    height: 8,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  fundingProgressFill: {
    height: 8,
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  fundingPercent: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'right' as const,
  },
  sectionWrap: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  poolCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  poolCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  poolHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  poolIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolHeaderInfo: {
    flex: 1,
  },
  poolLabel: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 3,
  },
  poolDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  poolRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  poolRadioActive: {
    borderColor: Colors.primary,
  },
  poolRadioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  poolStats: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  poolProgressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  poolProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  poolProgressFill: {
    height: 6,
    borderRadius: 3,
  },
  poolProgressText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  poolStatsRow: {
    flexDirection: 'row',
  },
  poolStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  poolStatLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 3,
  },
  poolStatValue: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  poolStatDivider: {
    width: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 2,
  },
  openInvestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    backgroundColor: Colors.info + '10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.info + '25',
  },
  openInvestText: {
    flex: 1,
    fontSize: 13,
    color: Colors.info,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  dealTerms: {
    marginHorizontal: 16,
    marginTop: 0,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  dealTermsTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 14,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  termLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  termValue: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
    maxWidth: '45%' as any,
    textAlign: 'right' as const,
  },
  selectedPoolBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: Colors.primary + '10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  selectedPoolInfo: {
    flex: 1,
  },
  selectedPoolLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  selectedPoolMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  changePoolBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  changePoolText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  amountSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  amountInputWrap: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 16,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  currencyPrefix: {
    fontSize: 28,
    fontWeight: '300' as const,
    color: Colors.textTertiary,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  quickAmountSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  quickAmountBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  quickAmountBtnActive: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  quickAmountTextActive: {
    color: Colors.primary,
  },
  investSummary: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 4,
  },
  summaryLabelBold: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  summaryValueBold: {
    fontSize: 18,
    fontWeight: '900' as const,
  },
  protectionCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  protectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  protectionText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  paymentSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    marginBottom: 8,
    gap: 12,
  },
  paymentOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  paymentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentIconWrapActive: {
    backgroundColor: Colors.primary + '20',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  paymentLabelActive: {
    color: Colors.primary,
  },
  paymentDesc: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  paymentRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentRadioActive: {
    borderColor: Colors.primary,
  },
  paymentRadioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  reviewSummary: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  reviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  reviewLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  reviewValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 6,
  },
  reviewLabelBold: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  reviewValueBold: {
    fontSize: 20,
    fontWeight: '900' as const,
    color: Colors.primary,
  },
  termsCheck: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  disclaimerWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 8,
    alignItems: 'flex-start',
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textTertiary,
    lineHeight: 17,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  ctaButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.4,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.black,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  successCheckWrap: {
    marginBottom: 24,
  },
  successCheckCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '900' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  successCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 28,
  },
  successRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  successLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  successValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  successValueGold: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  successPrimaryBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  successPrimaryBtnText: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.black,
  },
  successSecondaryBtn: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  successSecondaryBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  backBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backBtnText: {
    color: Colors.black,
    fontWeight: '700' as const,
  },
});
