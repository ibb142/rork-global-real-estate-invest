import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  User,
  Mail,
  Phone,
  Clock,
  DollarSign,
  TrendingUp,
  ChevronDown,
  CheckCircle,
  ArrowLeft,
  Sparkles,
} from 'lucide-react-native';
import { useMutation } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';

const WAITLIST_STORAGE_KEY = 'ivx_waitlist_submissions';

const INVESTMENT_RANGES = [
  '$1,000 – $5,000',
  '$5,000 – $10,000',
  '$10,000 – $25,000',
  '$25,000 – $50,000',
  '$50,000 – $100,000',
  '$100,000 – $250,000',
  '$250,000+',
];

const RETURN_EXPECTATIONS = [
  '8% – 12% annually',
  '12% – 18% annually',
  '18% – 25% annually',
  '25%+ annually',
  'Capital preservation + steady income',
  'Aggressive growth',
];

const CONTACT_HOURS = [
  '8:00 AM – 10:00 AM',
  '10:00 AM – 12:00 PM',
  '12:00 PM – 2:00 PM',
  '2:00 PM – 4:00 PM',
  '4:00 PM – 6:00 PM',
  '6:00 PM – 8:00 PM',
];

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  investmentRange: string;
  returnExpectation: string;
  contactHour: string;
}

type DropdownField = 'investmentRange' | 'returnExpectation' | 'contactHour';

export default function WaitlistScreen() {
  const router = useRouter();
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;

  const [form, setForm] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    investmentRange: '',
    returnExpectation: '',
    contactHour: '',
  });

  const [activeDropdown, setActiveDropdown] = useState<DropdownField | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeIn, slideUp]);

  const submitMutation = useMutation({
    mutationFn: async (data: FormData) => {
      console.log('[Waitlist] Submitting form:', JSON.stringify(data));

      const submission = {
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        investment_range: data.investmentRange,
        return_expectation: data.returnExpectation,
        preferred_contact_hour: data.contactHour,
        created_at: new Date().toISOString(),
      };

      let savedToSupabase = false;

      try {
        const { error } = await supabase.from('waitlist').insert(submission);
        if (error) {
          console.log('[Waitlist] Supabase error:', error.message, error.code);
          if (error.code !== '42P01') {
            console.log('[Waitlist] Non-table error, will save locally as backup');
          }
        } else {
          savedToSupabase = true;
          console.log('[Waitlist] Saved to Supabase successfully');
        }
      } catch (supaErr) {
        console.log('[Waitlist] Supabase exception:', (supaErr as Error)?.message);
      }

      try {
        const existing = await AsyncStorage.getItem(WAITLIST_STORAGE_KEY);
        const list = existing ? JSON.parse(existing) : [];
        list.push({ ...submission, savedToSupabase, submittedAt: new Date().toISOString() });
        await AsyncStorage.setItem(WAITLIST_STORAGE_KEY, JSON.stringify(list));
        console.log('[Waitlist] Saved to local storage as backup (' + list.length + ' total)');
      } catch (storageErr) {
        console.log('[Waitlist] Local storage backup failed:', (storageErr as Error)?.message);
      }

      console.log('[Waitlist] Submission complete (supabase:', savedToSupabase, ')');
      return data;
    },
    onSuccess: () => {
      setSubmitted(true);
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    },
    onError: (err: Error) => {
      console.log('[Waitlist] Mutation error:', err.message);
      Alert.alert(
        'Submission Error',
        'We couldn\'t submit your information right now. Please try again.',
        [{ text: 'OK' }]
      );
    },
  });

  const validateForm = (): string | null => {
    if (!form.firstName.trim()) return 'Please enter your first name';
    if (!form.lastName.trim()) return 'Please enter your last name';
    if (!form.email.trim()) return 'Please enter your email';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) return 'Please enter a valid email address';
    if (!form.phone.trim()) return 'Please enter your phone number';
    if (!form.investmentRange) return 'Please select your investment amount';
    if (!form.returnExpectation) return 'Please select your expected returns';
    if (!form.contactHour) return 'Please select your preferred contact hour';
    return null;
  };

  const handleSubmit = () => {
    const error = validateForm();
    if (error) {
      Alert.alert('Missing Information', error);
      return;
    }
    submitMutation.mutate(form);
  };

  const toggleDropdown = (field: DropdownField) => {
    setActiveDropdown(prev => prev === field ? null : field);
  };

  const selectOption = (field: DropdownField, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setActiveDropdown(null);
  };

  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  if (submitted) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.successContainer} edges={['top', 'bottom']}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={22} color={Colors.text} />
          </TouchableOpacity>

          <Animated.View style={[styles.successContent, {
            opacity: successOpacity,
            transform: [{ scale: successScale }],
          }]}>
            <View style={styles.successIconWrap}>
              <CheckCircle size={64} color={Colors.success} />
            </View>
            <Text style={styles.successTitle}>You're on the List!</Text>
            <Text style={styles.successSubtitle}>
              Thank you, {form.firstName}. Our investment team will reach out to you
              during your preferred hours to discuss your investment goals.
            </Text>
            <View style={styles.successDetail}>
              <Text style={styles.successDetailLabel}>Investment Interest</Text>
              <Text style={styles.successDetailValue}>{form.investmentRange}</Text>
            </View>
            <View style={styles.successDetail}>
              <Text style={styles.successDetailLabel}>Expected Returns</Text>
              <Text style={styles.successDetailValue}>{form.returnExpectation}</Text>
            </View>
            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <Text style={styles.successBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SafeAreaView edges={['top']}>
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.back()}
                activeOpacity={0.7}
                testID="waitlist-back"
              >
                <ArrowLeft size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          <Animated.View style={[styles.heroBlock, {
            opacity: fadeIn,
            transform: [{ translateY: slideUp }],
          }]}>
            <View style={styles.heroIconWrap}>
              <Sparkles size={28} color={Colors.primary} />
            </View>
            <Text style={styles.heroTitle}>Join the Waitlist</Text>
            <Text style={styles.heroSubtitle}>
              Full payment transactions launching soon. Reserve your spot and tell us about your investment goals.
            </Text>
          </Animated.View>

          <View style={styles.formSection}>
            <Text style={styles.sectionLabel}>PERSONAL INFORMATION</Text>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <View style={styles.inputWrap}>
                  <User size={18} color={Colors.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="First Name"
                    placeholderTextColor={Colors.inputPlaceholder}
                    value={form.firstName}
                    onChangeText={(v) => updateField('firstName', v)}
                    autoCapitalize="words"
                    testID="waitlist-first-name"
                  />
                </View>
              </View>
              <View style={styles.halfField}>
                <View style={styles.inputWrap}>
                  <User size={18} color={Colors.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Last Name"
                    placeholderTextColor={Colors.inputPlaceholder}
                    value={form.lastName}
                    onChangeText={(v) => updateField('lastName', v)}
                    autoCapitalize="words"
                    testID="waitlist-last-name"
                  />
                </View>
              </View>
            </View>

            <View style={styles.inputWrap}>
              <Mail size={18} color={Colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor={Colors.inputPlaceholder}
                value={form.email}
                onChangeText={(v) => updateField('email', v)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                testID="waitlist-email"
              />
            </View>

            <View style={styles.inputWrap}>
              <Phone size={18} color={Colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Cell Phone"
                placeholderTextColor={Colors.inputPlaceholder}
                value={form.phone}
                onChangeText={(v) => updateField('phone', v)}
                keyboardType="phone-pad"
                testID="waitlist-phone"
              />
            </View>

            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>INVESTMENT DETAILS</Text>

            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => toggleDropdown('investmentRange')}
              activeOpacity={0.7}
              testID="waitlist-investment-range"
            >
              <DollarSign size={18} color={Colors.textTertiary} />
              <Text style={[
                styles.dropdownTriggerText,
                !form.investmentRange && styles.dropdownPlaceholder,
              ]}>
                {form.investmentRange || 'How much do you want to invest?'}
              </Text>
              <ChevronDown size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
            {activeDropdown === 'investmentRange' && (
              <View style={styles.dropdownList}>
                {INVESTMENT_RANGES.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.dropdownOption,
                      form.investmentRange === option && styles.dropdownOptionActive,
                    ]}
                    onPress={() => selectOption('investmentRange', option)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.dropdownOptionText,
                      form.investmentRange === option && styles.dropdownOptionTextActive,
                    ]}>{option}</Text>
                    {form.investmentRange === option && (
                      <CheckCircle size={16} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => toggleDropdown('returnExpectation')}
              activeOpacity={0.7}
              testID="waitlist-return-expectation"
            >
              <TrendingUp size={18} color={Colors.textTertiary} />
              <Text style={[
                styles.dropdownTriggerText,
                !form.returnExpectation && styles.dropdownPlaceholder,
              ]}>
                {form.returnExpectation || 'What returns do you expect?'}
              </Text>
              <ChevronDown size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
            {activeDropdown === 'returnExpectation' && (
              <View style={styles.dropdownList}>
                {RETURN_EXPECTATIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.dropdownOption,
                      form.returnExpectation === option && styles.dropdownOptionActive,
                    ]}
                    onPress={() => selectOption('returnExpectation', option)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.dropdownOptionText,
                      form.returnExpectation === option && styles.dropdownOptionTextActive,
                    ]}>{option}</Text>
                    {form.returnExpectation === option && (
                      <CheckCircle size={16} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>BEST TIME TO REACH YOU</Text>

            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => toggleDropdown('contactHour')}
              activeOpacity={0.7}
              testID="waitlist-contact-hour"
            >
              <Clock size={18} color={Colors.textTertiary} />
              <Text style={[
                styles.dropdownTriggerText,
                !form.contactHour && styles.dropdownPlaceholder,
              ]}>
                {form.contactHour || 'Preferred contact hour'}
              </Text>
              <ChevronDown size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
            {activeDropdown === 'contactHour' && (
              <View style={styles.dropdownList}>
                {CONTACT_HOURS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.dropdownOption,
                      form.contactHour === option && styles.dropdownOptionActive,
                    ]}
                    onPress={() => selectOption('contactHour', option)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.dropdownOptionText,
                      form.contactHour === option && styles.dropdownOptionTextActive,
                    ]}>{option}</Text>
                    {form.contactHour === option && (
                      <CheckCircle size={16} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.submitSection}>
            <TouchableOpacity
              style={[styles.submitBtn, submitMutation.isPending && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitMutation.isPending}
              activeOpacity={0.85}
              testID="waitlist-submit"
            >
              {submitMutation.isPending ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Reserve My Spot</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.privacyText}>
              Your information is encrypted and will only be used to contact you about investment opportunities.
            </Text>
          </View>

          <SafeAreaView edges={['bottom']} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBlock: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
  },
  heroIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900' as const,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  formSection: {
    paddingHorizontal: 20,
  },
  sectionLabel: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  sectionLabelSpaced: {
    marginTop: 24,
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
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500' as const,
    height: 52,
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
  dropdownTriggerText: {
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 10,
    marginTop: -4,
    overflow: 'hidden',
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  dropdownOptionActive: {
    backgroundColor: Colors.primary + '10',
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
  submitSection: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  privacyText: {
    color: Colors.textTertiary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  successContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  successContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  successIconWrap: {
    marginBottom: 24,
  },
  successTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900' as const,
    textAlign: 'center',
    marginBottom: 12,
  },
  successSubtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  successDetail: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successDetailLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  successDetailValue: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  successBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 20,
  },
  successBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800' as const,
  },
});
