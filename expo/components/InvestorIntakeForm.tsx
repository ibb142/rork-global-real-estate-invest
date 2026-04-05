import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  CheckCircle,
  CheckCircle2,
  FileText,
  Wallet,
  BarChart3,
  Clock,
  DollarSign,
  TrendingUp,
  Building2,
  ChevronDown,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { IntakeProofOfFundsFile } from '@/lib/investor-intake';
import {
  ACCREDITED_STATUS_OPTIONS,
  CALL_TIME_OPTIONS,
  INVESTMENT_RANGE_OPTIONS,
  INVESTOR_MEMBER_AGREEMENT_SECTIONS,
  INVESTOR_MEMBER_AGREEMENT_VERSION,
  INVESTOR_TIMELINE_STEPS,
  RETURN_EXPECTATION_OPTIONS,
} from '@/lib/investor-intake';
import {
  getErrorMessage,
  isFormValid,
  sendOtp,
  submitWaitlistEntry,
  uploadProofOfFundsFile,
  validateEmail,
  validatePhone,
  verifyOtp,
} from '@/lib/waitlist-service';

interface InvestorIntakeFormProps {
  variant: 'landing' | 'screen';
  source: string;
  pagePath: string;
  testIdPrefix: string;
}

interface InvestorFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  investmentRange: string;
  returnExpectation: string;
  bestTimeForCall: string;
  accreditedStatus: 'accredited' | 'non_accredited' | 'unsure' | null;
  signatureName: string;
}

type DropdownField = 'investmentRange' | 'returnExpectation' | 'bestTimeForCall' | 'accreditedStatus';

const MEMBER_ACCESS_ITEMS = [
  {
    id: 'member',
    title: 'Member sign up',
    description: 'Create a real investor profile with verified contact information before activation.',
    icon: Building2,
    accent: Colors.primary,
  },
  {
    id: 'wallet',
    title: 'Wallet readiness',
    description: 'Funding methods and wallet access are prepared before live allocations begin.',
    icon: Wallet,
    accent: Colors.info,
  },
  {
    id: 'records',
    title: 'Transaction records',
    description: 'Statements, transaction records, and timelines are kept visible for each member account.',
    icon: BarChart3,
    accent: Colors.success,
  },
] as const;

export default function InvestorIntakeForm({ variant, source, pagePath, testIdPrefix }: InvestorIntakeFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<InvestorFormState>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    investmentRange: '',
    returnExpectation: '',
    bestTimeForCall: '',
    accreditedStatus: 'unsure',
    signatureName: '',
  });
  const [activeDropdown, setActiveDropdown] = useState<DropdownField | null>(null);
  const [contactConsent, setContactConsent] = useState<boolean>(true);
  const [agreementAccepted, setAgreementAccepted] = useState<boolean>(false);
  const [proofOfFunds, setProofOfFunds] = useState<IntakeProofOfFundsFile | null>(null);
  const [proofUploadPending, setProofUploadPending] = useState<boolean>(false);
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState<string>('');
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [otpCooldown, setOtpCooldown] = useState<number>(0);
  const [otpSendCount, setOtpSendCount] = useState<number>(0);
  const [otpVerifyCount, setOtpVerifyCount] = useState<number>(0);
  const [otpError, setOtpError] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [otpSending, setOtpSending] = useState<boolean>(false);
  const [otpVerifying, setOtpVerifying] = useState<boolean>(false);
  const successScale = useRef(new Animated.Value(0.92)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fullName = useMemo(() => {
    return [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ').trim();
  }, [form.firstName, form.lastName]);

  const attribution = useMemo(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return {
        pagePath: `${window.location.pathname || pagePath}${window.location.search || ''}`,
        referrer: document.referrer || '',
        utm_source: params.get('utm_source') || '',
        utm_medium: params.get('utm_medium') || '',
        utm_campaign: params.get('utm_campaign') || '',
        utm_content: params.get('utm_content') || '',
        utm_term: params.get('utm_term') || '',
      };
    }

    return {
      pagePath,
      referrer: '',
      utm_source: '',
      utm_medium: '',
      utm_campaign: '',
      utm_content: '',
      utm_term: '',
    };
  }, [pagePath]);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
      }
    };
  }, []);

  const updateField = useCallback((field: keyof InvestorFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleDropdown = useCallback((field: DropdownField) => {
    setActiveDropdown((prev) => prev === field ? null : field);
  }, []);

  const selectDropdownValue = useCallback((field: DropdownField, value: string) => {
    if (field === 'accreditedStatus') {
      setForm((prev) => ({
        ...prev,
        accreditedStatus: value as InvestorFormState['accreditedStatus'],
      }));
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
    }
    setActiveDropdown(null);
  }, []);

  const startCooldown = useCallback(() => {
    setOtpCooldown(30);
    if (cooldownRef.current) {
      clearInterval(cooldownRef.current);
    }
    cooldownRef.current = setInterval(() => {
      setOtpCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) {
            clearInterval(cooldownRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendOtp = useCallback(async () => {
    setOtpError('');
    if (!validatePhone(form.phone)) {
      setOtpError(getErrorMessage('invalid_phone'));
      return;
    }
    if (otpSendCount >= 5) {
      setOtpError(getErrorMessage('rate_limited'));
      return;
    }

    setOtpSending(true);
    try {
      const result = await sendOtp(form.phone);
      if (result.success) {
        setOtpSendCount((prev) => prev + 1);
        setOtpSent(true);
        startCooldown();
        console.log('[InvestorIntake] OTP sent');
      } else {
        setOtpError(getErrorMessage(result.error ?? 'otp_send_failed'));
      }
    } catch (err) {
      console.log('[InvestorIntake] OTP send exception:', (err as Error)?.message);
      setOtpError(getErrorMessage('otp_send_failed'));
    } finally {
      setOtpSending(false);
    }
  }, [form.phone, otpSendCount, startCooldown]);

  const handleVerifyOtp = useCallback(async () => {
    setOtpError('');
    if (otpVerifyCount >= 5) {
      setOtpError(getErrorMessage('rate_limited'));
      return;
    }

    setOtpVerifying(true);
    setOtpVerifyCount((prev) => prev + 1);
    try {
      const result = await verifyOtp(form.phone, otpCode);
      if (result.success) {
        setPhoneVerified(true);
        setOtpError('');
        console.log('[InvestorIntake] OTP verified');
      } else {
        setOtpError(getErrorMessage(result.error ?? 'otp_invalid'));
      }
    } catch (err) {
      console.log('[InvestorIntake] OTP verify exception:', (err as Error)?.message);
      setOtpError(getErrorMessage('otp_invalid'));
    } finally {
      setOtpVerifying(false);
    }
  }, [form.phone, otpCode, otpVerifyCount]);

  const handlePickProofOfFunds = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset) {
        return;
      }

      const nextFile: IntakeProofOfFundsFile = {
        uri: asset.uri,
        name: asset.name || 'proof-of-funds',
        mimeType: asset.mimeType ?? null,
        size: asset.size ?? null,
      };

      setProofOfFunds(nextFile);
      console.log('[InvestorIntake] Proof of funds selected:', nextFile.name);
    } catch (err) {
      console.log('[InvestorIntake] Proof of funds picker exception:', (err as Error)?.message);
      Alert.alert('Upload Error', 'We could not open your document picker. Please try again.');
    }
  }, []);

  const signatureMatches = useMemo(() => {
    const normalizedSignature = form.signatureName.trim().toLowerCase();
    const normalizedFullName = fullName.trim().toLowerCase();
    if (!normalizedSignature || !normalizedFullName) {
      return false;
    }
    return normalizedSignature === normalizedFullName;
  }, [form.signatureName, fullName]);

  const canSubmit = useMemo(() => {
    return isFormValid(fullName, form.email, form.phone, phoneVerified, contactConsent)
      && agreementAccepted
      && signatureMatches
      && form.investmentRange.length > 0
      && form.returnExpectation.length > 0;
  }, [agreementAccepted, contactConsent, form.email, form.investmentRange, form.phone, form.returnExpectation, fullName, phoneVerified, signatureMatches]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      console.log('[InvestorIntake] Submitting lead');
      let uploadedProof = proofOfFunds;

      if (proofOfFunds?.uri && !proofOfFunds.publicUrl && !proofOfFunds.storagePath) {
        setProofUploadPending(true);
        uploadedProof = await uploadProofOfFundsFile(proofOfFunds);
        setProofOfFunds(uploadedProof);
        setProofUploadPending(false);
      }

      const result = await submitWaitlistEntry({
        full_name: fullName,
        first_name: form.firstName,
        last_name: form.lastName,
        email: form.email,
        phone: form.phone,
        accredited_status: form.accreditedStatus,
        consent: contactConsent,
        agreement_accepted: agreementAccepted,
        agreement_version: INVESTOR_MEMBER_AGREEMENT_VERSION,
        signature_name: form.signatureName,
        investment_range: form.investmentRange,
        return_expectation: form.returnExpectation,
        preferred_call_time: form.bestTimeForCall,
        best_time_for_call: form.bestTimeForCall,
        investment_timeline: INVESTOR_TIMELINE_STEPS.map((step) => step.label).join(' > '),
        membership_interest: 'waitlist',
        proof_of_funds_url: uploadedProof?.publicUrl ?? null,
        proof_of_funds_name: uploadedProof?.name ?? null,
        proof_of_funds_storage_path: uploadedProof?.storagePath ?? null,
        phone_verified: phoneVerified,
        source,
        page_path: attribution.pagePath,
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
        utm_content: attribution.utm_content,
        utm_term: attribution.utm_term,
        referrer: attribution.referrer,
      });

      if (!result.success) {
        throw new Error(result.error ?? 'submission_failed');
      }

      return result;
    },
    onSuccess: () => {
      setSubmitted(true);
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    },
    onError: (err: Error) => {
      setProofUploadPending(false);
      setFormError(getErrorMessage(err.message as any));
    },
  });

  const handleSubmit = useCallback(() => {
    setFormError('');
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError('Please enter your first and last name.');
      return;
    }
    if (!validateEmail(form.email)) {
      setFormError(getErrorMessage('invalid_email'));
      return;
    }
    if (!validatePhone(form.phone)) {
      setFormError(getErrorMessage('invalid_phone'));
      return;
    }
    if (!phoneVerified) {
      setFormError('Please verify your cell number with OTP first.');
      return;
    }
    if (!form.investmentRange) {
      setFormError('Please select how much you want to invest.');
      return;
    }
    if (!form.returnExpectation) {
      setFormError('Please select your return target.');
      return;
    }
    if (!contactConsent) {
      setFormError('Please allow IVX to contact you about investor onboarding.');
      return;
    }
    if (!agreementAccepted) {
      setFormError('Please accept the investor member terms and acknowledgements.');
      return;
    }
    if (!signatureMatches) {
      setFormError('Your typed signature must match your first and last name.');
      return;
    }
    submitMutation.mutate();
  }, [agreementAccepted, contactConsent, form.email, form.firstName, form.investmentRange, form.lastName, form.phone, form.returnExpectation, phoneVerified, signatureMatches, submitMutation]);

  if (submitted) {
    return (
      <Animated.View style={[styles.successWrap, { opacity: successOpacity, transform: [{ scale: successScale }] }]}> 
        <View style={styles.successIconWrap}>
          <CheckCircle size={56} color={Colors.success} />
        </View>
        <Text style={styles.successTitle}>Investor profile captured</Text>
        <Text style={styles.successSubtitle}>
          We saved your verified contact details, investor preferences, and agreement acknowledgement. Our team can now move you into member onboarding when the next opening is available.
        </Text>
        <View style={styles.successCard}>
          <Text style={styles.successCardLabel}>Call window</Text>
          <Text style={styles.successCardValue}>{form.bestTimeForCall || 'We will contact you by email first'}</Text>
        </View>
        <View style={styles.successCard}>
          <Text style={styles.successCardLabel}>Target allocation</Text>
          <Text style={styles.successCardValue}>{form.investmentRange}</Text>
        </View>
        <TouchableOpacity
          style={styles.primarySubmitButton}
          onPress={() => router.push('/signup' as any)}
          activeOpacity={0.85}
          testID={`${testIdPrefix}-create-member-account`}
        >
          <Text style={styles.primarySubmitText}>Create Member Account</Text>
          <ArrowRight size={16} color="#000" />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const surfaceStyle = variant === 'landing' ? styles.surfaceLanding : styles.surfaceScreen;

  return (
    <View style={[styles.container, surfaceStyle]}>
      <View style={styles.row}>
        <View style={styles.halfField}>
          <View style={styles.inputWrap}>
            <User size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor={Colors.inputPlaceholder}
              value={form.firstName}
              onChangeText={(value) => updateField('firstName', value)}
              autoCapitalize="words"
              testID={`${testIdPrefix}-first-name`}
            />
          </View>
        </View>
        <View style={styles.halfField}>
          <View style={styles.inputWrap}>
            <User size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.input}
              placeholder="Last name"
              placeholderTextColor={Colors.inputPlaceholder}
              value={form.lastName}
              onChangeText={(value) => updateField('lastName', value)}
              autoCapitalize="words"
              testID={`${testIdPrefix}-last-name`}
            />
          </View>
        </View>
      </View>

      <View style={styles.inputWrap}>
        <Mail size={18} color={Colors.textTertiary} />
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={Colors.inputPlaceholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={form.email}
          onChangeText={(value) => updateField('email', value)}
          testID={`${testIdPrefix}-email`}
        />
      </View>

      <View style={styles.otpRow}>
        <View style={[styles.inputWrap, styles.otpPhoneWrap]}>
          <Phone size={18} color={Colors.textTertiary} />
          <TextInput
            style={styles.input}
            placeholder="Cell phone"
            placeholderTextColor={Colors.inputPlaceholder}
            keyboardType="phone-pad"
            value={form.phone}
            editable={!phoneVerified}
            onChangeText={(value) => {
              updateField('phone', value);
              if (phoneVerified) {
                setPhoneVerified(false);
                setOtpSent(false);
                setOtpCode('');
              }
            }}
            testID={`${testIdPrefix}-phone`}
          />
          {phoneVerified ? <ShieldCheck size={18} color={Colors.success} /> : null}
        </View>
        {!phoneVerified ? (
          <TouchableOpacity
            style={[styles.otpActionButton, (otpCooldown > 0 || otpSending || !validatePhone(form.phone)) && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={otpCooldown > 0 || otpSending || !validatePhone(form.phone)}
            activeOpacity={0.75}
            testID={`${testIdPrefix}-send-otp`}
          >
            {otpSending ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.otpActionText}>{otpCooldown > 0 ? `${otpCooldown}s` : otpSent ? 'Resend' : 'Send OTP'}</Text>}
          </TouchableOpacity>
        ) : null}
      </View>

      {otpSent && !phoneVerified ? (
        <View style={styles.otpVerifyWrap}>
          <View style={[styles.inputWrap, styles.otpInputWrap]}>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor={Colors.inputPlaceholder}
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
              testID={`${testIdPrefix}-otp-code`}
            />
          </View>
          <TouchableOpacity
            style={[styles.verifyButton, (otpCode.length < 6 || otpVerifying) && styles.buttonDisabled]}
            onPress={handleVerifyOtp}
            disabled={otpCode.length < 6 || otpVerifying}
            activeOpacity={0.75}
            testID={`${testIdPrefix}-verify-otp`}
          >
            {otpVerifying ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.verifyButtonText}>Verify</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      {otpError ? (
        <View style={styles.messageRow}>
          <AlertCircle size={14} color={Colors.error} />
          <Text style={styles.messageErrorText}>{otpError}</Text>
        </View>
      ) : null}

      {phoneVerified ? (
        <View style={styles.verifiedBanner}>
          <ShieldCheck size={14} color={Colors.success} />
          <Text style={styles.verifiedBannerText}>Cell phone verified with OTP</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Investor profile</Text>

      <DropdownRow
        icon={DollarSign}
        label={form.investmentRange || 'How much do you want to invest?'}
        isPlaceholder={!form.investmentRange}
        isOpen={activeDropdown === 'investmentRange'}
        onPress={() => toggleDropdown('investmentRange')}
        testID={`${testIdPrefix}-investment-range`}
      />
      {activeDropdown === 'investmentRange' ? (
        <DropdownList
          options={Array.from(INVESTMENT_RANGE_OPTIONS)}
          selectedValue={form.investmentRange}
          onSelect={(value) => selectDropdownValue('investmentRange', value)}
        />
      ) : null}

      <DropdownRow
        icon={TrendingUp}
        label={form.returnExpectation || 'What return profile are you targeting?'}
        isPlaceholder={!form.returnExpectation}
        isOpen={activeDropdown === 'returnExpectation'}
        onPress={() => toggleDropdown('returnExpectation')}
        testID={`${testIdPrefix}-return-expectation`}
      />
      {activeDropdown === 'returnExpectation' ? (
        <DropdownList
          options={Array.from(RETURN_EXPECTATION_OPTIONS)}
          selectedValue={form.returnExpectation}
          onSelect={(value) => selectDropdownValue('returnExpectation', value)}
        />
      ) : null}

      <DropdownRow
        icon={Clock}
        label={form.bestTimeForCall || 'Best time for a call'}
        isPlaceholder={!form.bestTimeForCall}
        isOpen={activeDropdown === 'bestTimeForCall'}
        onPress={() => toggleDropdown('bestTimeForCall')}
        testID={`${testIdPrefix}-best-time-call`}
      />
      {activeDropdown === 'bestTimeForCall' ? (
        <DropdownList
          options={Array.from(CALL_TIME_OPTIONS)}
          selectedValue={form.bestTimeForCall}
          onSelect={(value) => selectDropdownValue('bestTimeForCall', value)}
        />
      ) : null}

      <DropdownRow
        icon={Building2}
        label={ACCREDITED_STATUS_OPTIONS.find((option) => option.id === form.accreditedStatus)?.label || 'Investor status'}
        isPlaceholder={false}
        isOpen={activeDropdown === 'accreditedStatus'}
        onPress={() => toggleDropdown('accreditedStatus')}
        testID={`${testIdPrefix}-accredited-status`}
      />
      {activeDropdown === 'accreditedStatus' ? (
        <DropdownList
          options={ACCREDITED_STATUS_OPTIONS.map((option) => option.label)}
          selectedValue={ACCREDITED_STATUS_OPTIONS.find((option) => option.id === form.accreditedStatus)?.label || ''}
          onSelect={(label) => {
            const next = ACCREDITED_STATUS_OPTIONS.find((option) => option.label === label);
            selectDropdownValue('accreditedStatus', next?.id || 'unsure');
          }}
        />
      ) : null}

      <View style={styles.proofCard}>
        <View style={styles.proofHeader}>
          <View style={styles.proofTitleRow}>
            <FileText size={16} color={Colors.primary} />
            <Text style={styles.proofTitle}>Proof of funds</Text>
          </View>
          <Text style={styles.proofOptional}>Optional</Text>
        </View>
        <Text style={styles.proofDescription}>Upload a PDF or image if you want the team to review source-of-funds evidence before the first call.</Text>
        <TouchableOpacity
          style={styles.proofButton}
          onPress={handlePickProofOfFunds}
          activeOpacity={0.8}
          testID={`${testIdPrefix}-proof-of-funds`}
        >
          <Text style={styles.proofButtonText}>{proofOfFunds?.name || 'Select document'}</Text>
          <ArrowRight size={14} color={Colors.primary} />
        </TouchableOpacity>
        {proofUploadPending ? <ActivityIndicator size="small" color={Colors.primary} style={styles.proofSpinner} /> : null}
      </View>

      <Text style={styles.sectionLabel}>Member access once approved</Text>
      <View style={styles.readinessGrid}>
        {MEMBER_ACCESS_ITEMS.map((item) => (
          <View key={item.id} style={styles.readinessCard}>
            <View style={[styles.readinessIconWrap, { backgroundColor: item.accent + '18' }]}> 
              <item.icon size={18} color={item.accent} />
            </View>
            <Text style={styles.readinessTitle}>{item.title}</Text>
            <Text style={styles.readinessDescription}>{item.description}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Investor timeline</Text>
      <View style={styles.timelineCard}>
        {INVESTOR_TIMELINE_STEPS.map((step, index) => (
          <View key={step.id} style={[styles.timelineRow, index < INVESTOR_TIMELINE_STEPS.length - 1 && styles.timelineRowBorder]}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineCopy}>
              <Text style={styles.timelineLabel}>{step.label}</Text>
              <Text style={styles.timelineDescription}>{step.detail}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Investor member terms</Text>
      <View style={styles.agreementCard}>
        {INVESTOR_MEMBER_AGREEMENT_SECTIONS.map((section) => (
          <View key={section.id} style={styles.agreementRow}>
            <Text style={styles.agreementTitle}>{section.title}</Text>
            <Text style={styles.agreementText}>{section.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.inputWrap}>
        <CheckCircle2 size={18} color={Colors.textTertiary} />
        <TextInput
          style={styles.input}
          placeholder="Type your full legal name as signature"
          placeholderTextColor={Colors.inputPlaceholder}
          value={form.signatureName}
          onChangeText={(value) => updateField('signatureName', value)}
          autoCapitalize="words"
          testID={`${testIdPrefix}-signature-name`}
        />
      </View>

      <TouchableOpacity style={styles.checkboxRow} onPress={() => setContactConsent((prev) => !prev)} activeOpacity={0.75} testID={`${testIdPrefix}-contact-consent`}>
        <View style={[styles.checkbox, contactConsent && styles.checkboxChecked]}>{contactConsent ? <CheckCircle2 size={14} color="#000" /> : null}</View>
        <Text style={styles.checkboxText}>I allow IVX to contact me by email and SMS about waitlist review, member onboarding, wallet setup, and live opportunities.</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.checkboxRow} onPress={() => setAgreementAccepted((prev) => !prev)} activeOpacity={0.75} testID={`${testIdPrefix}-agreement-consent`}>
        <View style={[styles.checkbox, agreementAccepted && styles.checkboxChecked]}>{agreementAccepted ? <CheckCircle2 size={14} color="#000" /> : null}</View>
        <Text style={styles.checkboxText}>I have reviewed the IVX investor member terms and I adopt the typed signature above as my electronic acknowledgement. Version {INVESTOR_MEMBER_AGREEMENT_VERSION}.</Text>
      </TouchableOpacity>

      {formError ? (
        <View style={styles.messageRow}>
          <AlertCircle size={14} color={Colors.error} />
          <Text style={styles.messageErrorText}>{formError}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.primarySubmitButton, (!canSubmit || submitMutation.isPending || proofUploadPending) && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit || submitMutation.isPending || proofUploadPending}
        activeOpacity={0.85}
        testID={`${testIdPrefix}-submit`}
      >
        {submitMutation.isPending || proofUploadPending ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <>
            <Text style={styles.primarySubmitText}>Save Investor Waitlist Profile</Text>
            <ArrowRight size={16} color="#000" />
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryLinkButton} onPress={() => router.push('/signup' as any)} activeOpacity={0.75} testID={`${testIdPrefix}-member-signup-link`}>
        <Text style={styles.secondaryLinkText}>Already approved or invited? Create your member account</Text>
      </TouchableOpacity>
    </View>
  );
}

function DropdownRow({
  icon: Icon,
  label,
  isPlaceholder,
  isOpen,
  onPress,
  testID,
}: {
  icon: typeof DollarSign;
  label: string;
  isPlaceholder: boolean;
  isOpen: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity style={styles.dropdownTrigger} onPress={onPress} activeOpacity={0.75} testID={testID}>
      <Icon size={18} color={Colors.textTertiary} />
      <Text style={[styles.dropdownText, isPlaceholder && styles.dropdownPlaceholder]}>{label}</Text>
      <ChevronDown size={18} color={isOpen ? Colors.primary : Colors.textTertiary} />
    </TouchableOpacity>
  );
}

function DropdownList({
  options,
  selectedValue,
  onSelect,
}: {
  options: string[];
  selectedValue: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.dropdownList}>
      {options.map((option) => {
        const isActive = option === selectedValue;
        return (
          <TouchableOpacity key={option} style={[styles.dropdownOption, isActive && styles.dropdownOptionActive]} onPress={() => onSelect(option)} activeOpacity={0.75}>
            <Text style={[styles.dropdownOptionText, isActive && styles.dropdownOptionTextActive]}>{option}</Text>
            {isActive ? <CheckCircle size={16} color={Colors.primary} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  surfaceLanding: {
    backgroundColor: 'transparent',
  },
  surfaceScreen: {
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfField: {
    flex: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    height: 52,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500' as const,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  otpPhoneWrap: {
    flex: 1,
  },
  otpActionButton: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  otpActionText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  otpVerifyWrap: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  otpInputWrap: {
    flex: 1,
    marginBottom: 0,
  },
  verifyButton: {
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
  },
  verifyButtonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.success + '15',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.success + '25',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  verifiedBannerText: {
    color: Colors.success,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  sectionLabel: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 1.4,
    marginTop: 12,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
    marginBottom: 10,
  },
  dropdownText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500' as const,
  },
  dropdownPlaceholder: {
    color: Colors.inputPlaceholder,
  },
  dropdownList: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    marginTop: -4,
  },
  dropdownOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  dropdownOptionActive: {
    backgroundColor: Colors.primary + '12',
  },
  dropdownOptionText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  dropdownOptionTextActive: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  proofCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
    marginTop: 4,
  },
  proofHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  proofTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proofTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  proofOptional: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  proofDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  proofButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    backgroundColor: Colors.primary + '08',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  proofButtonText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700' as const,
    flex: 1,
    marginRight: 8,
  },
  proofSpinner: {
    marginTop: 10,
  },
  readinessGrid: {
    gap: 10,
  },
  readinessCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
  },
  readinessIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  readinessTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 6,
  },
  readinessDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  timelineCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  timelineRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
    backgroundColor: Colors.primary,
  },
  timelineCopy: {
    flex: 1,
  },
  timelineLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  timelineDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  agreementCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
    gap: 12,
  },
  agreementRow: {
    gap: 6,
  },
  agreementTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  agreementText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 2,
  },
  messageErrorText: {
    flex: 1,
    color: Colors.error,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  primarySubmitButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  primarySubmitText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800' as const,
  },
  secondaryLinkButton: {
    alignSelf: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryLinkText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
    textAlign: 'center',
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successIconWrap: {
    marginBottom: 18,
  },
  successTitle: {
    color: Colors.text,
    fontSize: 25,
    fontWeight: '900' as const,
    textAlign: 'center',
    marginBottom: 10,
  },
  successSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
  },
  successCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  successCardLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  successCardValue: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700' as const,
  },
});
