import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import {
  X,
  TrendingUp,
  Shield,
  Zap,
  ChevronRight,
  MapPin,
  Landmark,
  Coins,
  CheckCircle,
  Lock,
  AlertCircle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { formatCurrencyWithDecimals, formatCurrencyCompact } from '@/lib/formatters';
import { purchaseJVInvestment } from '@/lib/investment-service';
import { useQueryClient } from '@tanstack/react-query';

type InvestType = 'jv' | 'shares';

interface QuickBuyDeal {
  id: string;
  title: string;
  projectName: string;
  totalInvestment: number;
  expectedROI: number;
  photo?: string;
  propertyAddress?: string;
  type?: string;
  minInvestment?: number;
}

interface QuickBuyModalProps {
  visible: boolean;
  onClose: () => void;
  deal: QuickBuyDeal | null;
  onNavigateToFullInvest: (dealId: string) => void;
}

const JV_AMOUNTS = [25000, 50000, 75000, 100000, 150000, 250000];
const SHARES_AMOUNTS = [100, 500, 1000, 5000, 10000, 25000];

export default function QuickBuyModal({ visible, onClose, deal, onNavigateToFullInvest }: QuickBuyModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [investType, setInvestType] = useState<InvestType>('jv');
  const [step, setStep] = useState<'select' | 'confirm' | 'processing' | 'success'>('select');
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const queryClient = useQueryClient();

  const activeAmounts = investType === 'jv' ? JV_AMOUNTS : SHARES_AMOUNTS;
  const minAmount = investType === 'jv' ? 25000 : (deal?.minInvestment ?? 50);

  useEffect(() => {
    if (visible) {
      setStep('select');
      setSelectedAmount(25000);
      setCustomAmount('');
      setInvestType('jv');
      setPurchaseError(null);
      setConfirmationNumber('');
      successScale.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 1,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim, successScale]);

  const handleSelectAmount = useCallback((amount: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAmount(amount);
    setCustomAmount('');
  }, []);

  const handleCustomAmountChange = useCallback((text: string) => {
    const clean = text.replace(/[^0-9]/g, '');
    setCustomAmount(clean);
    if (clean) {
      setSelectedAmount(parseInt(clean, 10));
    }
  }, []);

  const equityPercent = deal ? (selectedAmount / deal.totalInvestment) * 100 : 0;
  const estimatedReturn = deal ? selectedAmount * (deal.expectedROI / 100) : 0;

  const handleContinue = useCallback(() => {
    if (!deal) return;
    if (selectedAmount < minAmount) {
      Alert.alert('Minimum Investment', investType === 'jv'
        ? `JV Direct minimum investment is $25,000`
        : `Minimum investment is ${formatCurrencyWithDecimals(deal.minInvestment ?? 50)}`);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('confirm');
  }, [deal, selectedAmount, minAmount, investType]);

  const handleConfirmPurchase = useCallback(async () => {
    if (!deal) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setStep('processing');
    setPurchaseError(null);

    try {
      console.log('[QuickBuy] Submitting real purchase to Supabase...', {
        dealId: deal.id,
        amount: selectedAmount,
        type: investType,
      });

      const eqPct = deal.totalInvestment > 0 ? (selectedAmount / deal.totalInvestment) * 100 : 0;

      const result = await purchaseJVInvestment({
        jvDealId: deal.id,
        jvTitle: deal.title,
        jvProjectName: deal.projectName,
        investmentPool: investType === 'jv' ? 'jv_direct' : 'token_shares',
        amount: selectedAmount,
        equityPercent: eqPct,
        expectedROI: deal.expectedROI,
        paymentMethod: 'bank',
      });

      if (result.success) {
        console.log('[QuickBuy] Purchase successful:', result.confirmationNumber);
        setConfirmationNumber(result.confirmationNumber);
        setStep('success');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        void queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
        void queryClient.invalidateQueries({ queryKey: ['holdings'] });
        void queryClient.invalidateQueries({ queryKey: ['transactions'] });
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });

        Animated.spring(successScale, {
          toValue: 1,
          friction: 4,
          tension: 50,
          useNativeDriver: true,
        }).start();
      } else {
        console.error('[QuickBuy] Purchase failed:', result.error, result.message);
        setPurchaseError(result.message);
        setStep('confirm');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Purchase Failed', result.message);
      }
    } catch (error) {
      console.error('[QuickBuy] Unexpected error:', error);
      const msg = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      setPurchaseError(msg);
      setStep('confirm');
      Alert.alert('Error', msg);
    }
  }, [deal, selectedAmount, investType, successScale, queryClient]);

  const handleGoToFullInvest = useCallback(() => {
    if (!deal) return;
    onClose();
    setTimeout(() => onNavigateToFullInvest(deal.id), 300);
  }, [deal, onClose, onNavigateToFullInvest]);

  if (!deal) return null;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={modalStyles.overlay}>
          <TouchableOpacity style={modalStyles.backdropTouch} activeOpacity={1} onPress={onClose} />
          <Animated.View style={[modalStyles.sheet, { transform: [{ translateY }] }]}>
            <View style={modalStyles.handle} />

            <View style={modalStyles.headerRow}>
              <Text style={modalStyles.headerTitle}>
                {step === 'select' ? 'Quick Invest' : step === 'confirm' ? 'Confirm' : step === 'success' ? 'Done!' : 'Processing'}
              </Text>
              <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose}>
                <X size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={modalStyles.dealRow}>
              {deal.photo ? (
                <Image source={{ uri: deal.photo }} style={modalStyles.dealThumb} />
              ) : (
                <View style={[modalStyles.dealThumb, modalStyles.dealThumbPlaceholder]}>
                  <Landmark size={20} color={Colors.primary} />
                </View>
              )}
              <View style={modalStyles.dealInfo}>
                <Text style={modalStyles.dealName} numberOfLines={1}>{deal.projectName}</Text>
                {deal.propertyAddress ? (
                  <View style={modalStyles.dealAddressRow}>
                    <MapPin size={10} color={Colors.textTertiary} />
                    <Text style={modalStyles.dealAddress} numberOfLines={1}>{deal.propertyAddress}</Text>
                  </View>
                ) : null}
                <View style={modalStyles.dealMetaRow}>
                  <Text style={modalStyles.dealInvestment}>{formatCurrencyCompact(deal.totalInvestment)}</Text>
                  <View style={modalStyles.dealRoiBadge}>
                    <TrendingUp size={10} color="#00C48C" />
                    <Text style={modalStyles.dealRoi}>{deal.expectedROI}% ROI</Text>
                  </View>
                </View>
              </View>
            </View>

            {step === 'select' && (
              <>
                <View style={modalStyles.typeRow}>
                  <TouchableOpacity
                    style={[modalStyles.typeBtn, investType === 'jv' && modalStyles.typeBtnActive]}
                    onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setInvestType('jv'); setSelectedAmount(25000); setCustomAmount(''); }}
                  >
                    <Landmark size={16} color={investType === 'jv' ? '#00C48C' : Colors.textTertiary} />
                    <Text style={[modalStyles.typeBtnText, investType === 'jv' && modalStyles.typeBtnTextActive]}>JV Direct</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[modalStyles.typeBtn, investType === 'shares' && modalStyles.typeBtnActive]}
                    onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setInvestType('shares'); setSelectedAmount(1000); setCustomAmount(''); }}
                  >
                    <Coins size={16} color={investType === 'shares' ? Colors.primary : Colors.textTertiary} />
                    <Text style={[modalStyles.typeBtnText, investType === 'shares' && modalStyles.typeBtnTextActive]}>Token Shares</Text>
                  </TouchableOpacity>
                </View>

                <Text style={modalStyles.amountLabel}>{investType === 'jv' ? `Select Amount (Min $25K)` : 'Select Amount'}</Text>
                <View style={modalStyles.amountsGrid}>
                  {activeAmounts.map(amt => (
                    <TouchableOpacity
                      key={amt}
                      style={[modalStyles.amountChip, selectedAmount === amt && !customAmount && modalStyles.amountChipActive]}
                      onPress={() => handleSelectAmount(amt)}
                    >
                      <Text style={[modalStyles.amountChipText, selectedAmount === amt && !customAmount && modalStyles.amountChipTextActive]}>
                        {amt >= 1000 ? `$${(amt / 1000)}K` : `$${amt}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={modalStyles.customInputRow}>
                  <Text style={modalStyles.customPrefix}>$</Text>
                  <TextInput
                    style={modalStyles.customInput}
                    value={customAmount}
                    onChangeText={handleCustomAmountChange}
                    placeholder="Custom amount"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>

                <View style={modalStyles.previewRow}>
                  <View style={modalStyles.previewItem}>
                    <Text style={modalStyles.previewLabel}>You Invest</Text>
                    <Text style={modalStyles.previewValue}>{formatCurrencyWithDecimals(selectedAmount)}</Text>
                  </View>
                  <View style={modalStyles.previewDivider} />
                  <View style={modalStyles.previewItem}>
                    <Text style={modalStyles.previewLabel}>Ownership</Text>
                    <Text style={[modalStyles.previewValue, { color: Colors.primary }]}>{equityPercent.toFixed(2)}%</Text>
                  </View>
                  <View style={modalStyles.previewDivider} />
                  <View style={modalStyles.previewItem}>
                    <Text style={modalStyles.previewLabel}>Est. Return</Text>
                    <Text style={[modalStyles.previewValue, { color: '#00C48C' }]}>{formatCurrencyCompact(estimatedReturn)}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[modalStyles.ctaBtn, selectedAmount < minAmount && modalStyles.ctaBtnDisabled]}
                  onPress={handleContinue}
                  disabled={selectedAmount < minAmount}
                  testID="quick-buy-continue"
                >
                  <Zap size={18} color="#000" />
                  <Text style={modalStyles.ctaBtnText}>Continue — {formatCurrencyWithDecimals(selectedAmount)}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={modalStyles.fullFlowBtn} onPress={handleGoToFullInvest}>
                  <Text style={modalStyles.fullFlowText}>View Full Details</Text>
                  <ChevronRight size={14} color={Colors.primary} />
                </TouchableOpacity>
              </>
            )}

            {step === 'confirm' && (
              <>
                <View style={modalStyles.confirmCard}>
                  <View style={modalStyles.confirmRow}>
                    <Text style={modalStyles.confirmLabel}>Investment Type</Text>
                    <Text style={modalStyles.confirmValue}>{investType === 'jv' ? 'JV Direct' : 'Token Shares'}</Text>
                  </View>
                  <View style={modalStyles.confirmRow}>
                    <Text style={modalStyles.confirmLabel}>Amount</Text>
                    <Text style={modalStyles.confirmValueBold}>{formatCurrencyWithDecimals(selectedAmount)}</Text>
                  </View>
                  <View style={modalStyles.confirmRow}>
                    <Text style={modalStyles.confirmLabel}>Ownership</Text>
                    <Text style={modalStyles.confirmValue}>{equityPercent.toFixed(2)}%</Text>
                  </View>
                  <View style={modalStyles.confirmRow}>
                    <Text style={modalStyles.confirmLabel}>Expected ROI</Text>
                    <Text style={[modalStyles.confirmValue, { color: '#00C48C' }]}>{deal.expectedROI}%</Text>
                  </View>
                  <View style={modalStyles.confirmRow}>
                    <Text style={modalStyles.confirmLabel}>Est. Annual Return</Text>
                    <Text style={[modalStyles.confirmValue, { color: '#00C48C' }]}>{formatCurrencyWithDecimals(estimatedReturn)}</Text>
                  </View>
                  <View style={modalStyles.confirmDivider} />
                  <View style={modalStyles.confirmRow}>
                    <Text style={modalStyles.confirmLabelBold}>Total Due</Text>
                    <Text style={modalStyles.confirmValueTotal}>{formatCurrencyWithDecimals(selectedAmount)}</Text>
                  </View>
                </View>

                {purchaseError && (
                  <View style={modalStyles.errorBanner}>
                    <AlertCircle size={14} color="#FF4444" />
                    <Text style={modalStyles.errorBannerText}>{purchaseError}</Text>
                  </View>
                )}

                <View style={modalStyles.securityRow}>
                  <Shield size={14} color={Colors.info} />
                  <Text style={modalStyles.securityText}>Protected by FDIC-insured escrow</Text>
                </View>

                <TouchableOpacity
                  style={modalStyles.ctaBtn}
                  onPress={handleConfirmPurchase}
                  testID="quick-buy-confirm"
                >
                  <Lock size={16} color="#000" />
                  <Text style={modalStyles.ctaBtnText}>Confirm Purchase</Text>
                </TouchableOpacity>

                <TouchableOpacity style={modalStyles.backBtn} onPress={() => setStep('select')}>
                  <Text style={modalStyles.backBtnText}>Go Back</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'processing' && (
              <View style={modalStyles.processingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={modalStyles.processingText}>Processing your investment...</Text>
                <Text style={modalStyles.processingSubtext}>Securing your position in {deal.projectName}</Text>
              </View>
            )}

            {step === 'success' && (
              <Animated.View style={[modalStyles.successWrap, { transform: [{ scale: successScale }] }]}>
                <View style={modalStyles.successCircle}>
                  <CheckCircle size={48} color="#00C48C" />
                </View>
                <Text style={modalStyles.successTitle}>Investment Confirmed!</Text>
                <Text style={modalStyles.successSubtext}>
                  You invested {formatCurrencyWithDecimals(selectedAmount)} in {deal.projectName}
                </Text>

                <View style={modalStyles.successStats}>
                  <View style={modalStyles.successStatItem}>
                    <Text style={modalStyles.successStatValue}>{formatCurrencyWithDecimals(selectedAmount)}</Text>
                    <Text style={modalStyles.successStatLabel}>Invested</Text>
                  </View>
                  <View style={modalStyles.successStatDivider} />
                  <View style={modalStyles.successStatItem}>
                    <Text style={[modalStyles.successStatValue, { color: '#00C48C' }]}>{equityPercent.toFixed(2)}%</Text>
                    <Text style={modalStyles.successStatLabel}>Ownership</Text>
                  </View>
                  <View style={modalStyles.successStatDivider} />
                  <View style={modalStyles.successStatItem}>
                    <Text style={[modalStyles.successStatValue, { color: Colors.primary }]}>{confirmationNumber || `INV-${Date.now().toString(36).slice(-5).toUpperCase()}`}</Text>
                    <Text style={modalStyles.successStatLabel}>Ref #</Text>
                  </View>
                </View>

                <TouchableOpacity style={modalStyles.ctaBtn} onPress={onClose}>
                  <Text style={modalStyles.ctaBtnText}>Done</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: '92%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 16,
  },
  dealThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.backgroundSecondary,
  },
  dealThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealInfo: {
    flex: 1,
  },
  dealName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 3,
  },
  dealAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 4,
  },
  dealAddress: {
    fontSize: 11,
    color: Colors.textTertiary,
    flex: 1,
  },
  dealMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dealInvestment: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  dealRoiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#00C48C15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dealRoi: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#00C48C',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  typeBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '0A',
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  typeBtnTextActive: {
    color: Colors.text,
  },
  amountLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  amountsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  amountChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    minWidth: '30%' as any,
    alignItems: 'center',
  },
  amountChipActive: {
    backgroundColor: Colors.primary + '18',
    borderColor: Colors.primary,
  },
  amountChipText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  amountChipTextActive: {
    color: Colors.primary,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 16,
    gap: 4,
  },
  customPrefix: {
    fontSize: 20,
    fontWeight: '300' as const,
    color: Colors.textTertiary,
  },
  customInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 18,
  },
  previewItem: {
    flex: 1,
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  previewDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.surfaceBorder,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 8,
  },
  ctaBtnDisabled: {
    opacity: 0.4,
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: '#000',
  },
  fullFlowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  fullFlowText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  confirmCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 14,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  confirmLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  confirmValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  confirmValueBold: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  confirmDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 4,
  },
  confirmLabelBold: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  confirmValueTotal: {
    fontSize: 20,
    fontWeight: '900' as const,
    color: Colors.primary,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  securityText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3D1515',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FF444430',
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#FF6B6B',
    lineHeight: 18,
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  processingWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 14,
  },
  processingText: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  processingSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#00C48C15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: Colors.text,
    marginBottom: 6,
  },
  successSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  successStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 20,
    width: '100%',
  },
  successStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  successStatValue: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 3,
  },
  successStatLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
  },
  successStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.surfaceBorder,
  },
});
