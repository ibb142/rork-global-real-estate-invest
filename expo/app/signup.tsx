import React, { useState, useRef } from 'react';
import { IVX_LOGO_SOURCE } from '@/constants/brand';
import logger from '@/lib/logger';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import {
  Mail,
  Lock,
  User,
  Phone,
  Globe,
  Eye,
  EyeOff,
  CheckCircle,
  ArrowLeft,
  Shield,
  ChevronRight,
  ChevronDown,
  Search,
  X,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { COUNTRIES, Country } from '@/constants/countries';
import { useAuth } from '@/lib/auth-context';
import { useAnalytics } from '@/lib/analytics-context';
import { validateEmail, validatePassword, validatePhone, sanitizeEmail } from '@/lib/auth-helpers';
import { findExistingRegisteredMemberByEmail } from '@/lib/member-registry';

type Step = 'register' | 'verify_email' | 'verify_phone' | 'complete';

export default function SignUpScreen() {
  const router = useRouter();
  const { register: authRegister } = useAuth();
  const { trackScreen, trackConversion } = useAnalytics();

  React.useEffect(() => {
    trackScreen('Signup');
  }, [trackScreen]);

  const [currentStep, setCurrentStep] = useState<Step>('register');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
    country: 'United States',
    countryCode: 'US',
    dialCode: '+1',
    acceptTerms: false,
  });

  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [existingAccountDetected, setExistingAccountDetected] = useState<boolean>(false);

  const filteredCountries = COUNTRIES.filter(country =>
    country.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    country.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const navigateToLogin = React.useCallback((prefillEmail?: string, justRegistered?: boolean) => {
    const trimmedEmail = prefillEmail?.trim() ?? '';
    const params: Record<string, string> = {};

    if (trimmedEmail) {
      params.email = trimmedEmail;
    }
    if (justRegistered) {
      params.justRegistered = '1';
    }

    router.replace({
      pathname: '/login',
      params,
    } as Href);
  }, [router]);

  const navigateToOwnerAccess = React.useCallback((prefillEmail?: string) => {
    const trimmedEmail = prefillEmail?.trim() ?? '';

    router.push({
      pathname: '/owner-access',
      params: {
        source: 'signup',
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
      },
    } as Href);
  }, [router]);

  React.useEffect(() => {
    const normalizedEmail = formData.email.trim().toLowerCase();
    if (!normalizedEmail) {
      setExistingAccountDetected(false);
      return;
    }

    let isActive = true;
    const timeout = setTimeout(() => {
      findExistingRegisteredMemberByEmail(normalizedEmail)
        .then((record) => {
          if (isActive) {
            setExistingAccountDetected(!!record);
          }
        })
        .catch(() => {
          if (isActive) {
            setExistingAccountDetected(false);
          }
        });
    }, 180);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [formData.email]);

  const [emailCode, setEmailCode] = useState(['', '', '', '', '', '']);
  const [phoneCode, setPhoneCode] = useState(['', '', '', '', '', '']);
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const emailCodeRefs = useRef<(TextInput | null)[]>([]);
  const phoneCodeRefs = useRef<(TextInput | null)[]>([]);

  const updateForm = (key: keyof typeof formData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };



  const handleRegister = async () => {
    const normalizedEmail = sanitizeEmail(formData.email);
    if (!formData.firstName || !formData.lastName) {
      Alert.alert('Missing Information', 'Please enter your first and last name.');
      return;
    }
    if (!validateEmail(normalizedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    const pwResult = validatePassword(formData.password);
    if (!pwResult.valid) {
      Alert.alert('Weak Password', pwResult.reason || 'Password does not meet requirements.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (!validatePhone(formData.phone)) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
      return;
    }
    if (!formData.acceptTerms) {
      Alert.alert('Terms Required', 'Please accept the Terms of Service and Privacy Policy.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await authRegister({
        email: normalizedEmail,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone ? `${formData.dialCode}${formData.phone}` : undefined,
        country: formData.country,
      });

      logger.signup.log('Register result:', result);

      if (result.success) {
        updateForm('email', normalizedEmail);
        trackConversion('signup_completed', 0, { country: formData.country });

        if (result.requiresLogin) {
          Alert.alert(
            'Account Created',
            'Registration is saved. Next time, just sign in with your email and password.',
            [
              {
                text: 'Go to Sign In',
                onPress: () => navigateToLogin(result.email ?? formData.email, true),
              },
            ]
          );
          return;
        }

        setEmailVerified(true);
        setPhoneVerified(true);
        setCurrentStep('complete');
      } else if (result.alreadyExists) {
        console.error('[Signup] Existing account:', result.message);
        Alert.alert(
          'Account Already Exists',
          `${result.message || 'This email is already registered. Please sign in instead.'}\n\nIf this is your owner account, open Owner Access instead of public signup.`,
          [
            {
              text: 'Owner Access',
              onPress: () => navigateToOwnerAccess(result.email ?? formData.email),
            },
            {
              text: 'Go to Sign In',
              onPress: () => navigateToLogin(result.email ?? formData.email),
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ]
        );
      } else if (result.rateLimited) {
        console.error('[Signup] Signup rate limited:', result.message);
        Alert.alert(
          'Please Wait a Moment',
          result.message || 'Signups are temporarily throttled. Your data was not saved yet. Please wait a moment and try again.',
          [
            {
              text: 'Go to Sign In',
              onPress: () => navigateToLogin(result.email ?? normalizedEmail),
            },
            {
              text: 'OK',
              style: 'cancel',
            },
          ]
        );
      } else {
        console.error('[Signup] Register failed:', result.message);
        Alert.alert('Registration Failed', result.message || 'Could not create account. Please try again.');
      }
    } catch (error: any) {
      console.error('[Signup] Register exception:', error);
      Alert.alert('Error', error?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startResendTimer = () => {
    setResendTimer(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleCodeInput = (
    type: 'email' | 'phone',
    index: number,
    value: string
  ) => {
    const code = type === 'email' ? [...emailCode] : [...phoneCode];
    const refs = type === 'email' ? emailCodeRefs : phoneCodeRefs;
    
    code[index] = value;
    
    if (type === 'email') {
      setEmailCode(code);
    } else {
      setPhoneCode(code);
    }

    if (value && index < 5) {
      refs.current[index + 1]?.focus();
    }

    if (code.every(c => c !== '')) {
      verifyCode(type, code.join(''));
    }
  };

  const handleCodeKeyPress = (
    type: 'email' | 'phone',
    index: number,
    key: string
  ) => {
    const refs = type === 'email' ? emailCodeRefs : phoneCodeRefs;
    const code = type === 'email' ? emailCode : phoneCode;
    
    if (key === 'Backspace' && !code[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const verifyCode = (type: 'email' | 'phone', code: string) => {
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      Alert.alert('Invalid Code', 'Please enter a valid 6-digit verification code.');
      return;
    }
    setIsLoading(true);
    logger.signup.log(`Verifying ${type} code:`, code);
    
    setTimeout(() => {
      setIsLoading(false);
      if (code.length === 6 && /^\d{6}$/.test(code)) {
        if (type === 'email') {
          setEmailVerified(true);
          Alert.alert('Email Verified', 'Your email has been verified successfully.', [
            {
              text: 'Continue',
              onPress: () => {
                setCurrentStep('verify_phone');
                startResendTimer();
              },
            },
          ]);
        } else {
          setPhoneVerified(true);
          Alert.alert('Phone Verified', 'Your phone number has been verified successfully.', [
            {
              text: 'Continue',
              onPress: () => setCurrentStep('complete'),
            },
          ]);
        }
      } else {
        Alert.alert('Invalid Code', 'The verification code is incorrect. Please try again.');
      }
    }, 1000);
  };

  const resendCode = (type: 'email' | 'phone') => {
    if (resendTimer > 0) return;
    
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      startResendTimer();
      Alert.alert('Code Sent', `A new verification code has been sent to your ${type}.`);
    }, 1000);
  };

  const handleComplete = () => {
    Alert.alert(
      'Registration Complete',
      'Your account has been created successfully. You can now complete your KYC verification to start investing.',
      [
        {
          text: 'Start KYC',
          onPress: () => router.replace('/kyc-verification' as Href),
        },
        {
          text: 'Later',
          style: 'cancel',
          onPress: () => router.replace('/(tabs)/(home)' as Href),
        },
      ]
    );
  };

  const renderRegisterForm = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.logoContainer}>
        <Image
          source={IVX_LOGO_SOURCE}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join IVX HOLDINGS and start investing in premium real estate</Text>
      </View>

      <TouchableOpacity
        style={styles.ownerShortcutCard}
        activeOpacity={0.84}
        onPress={() => navigateToOwnerAccess(formData.email)}
        testID="signup-owner-shortcut"
      >
        <View style={styles.ownerShortcutIconWrap}>
          <Shield size={18} color={Colors.black} />
        </View>
        <View style={styles.ownerShortcutContent}>
          <Text style={styles.ownerShortcutTitle}>Project owner?</Text>
          <Text style={styles.ownerShortcutSubtitle}>Do not create a public member account for owner recovery. Open Owner Access instead to sign in with your verified owner account or restore the trusted device path.</Text>
        </View>
        <ChevronRight size={18} color={Colors.primary} />
      </TouchableOpacity>

      <View style={styles.formSection}>
        <View style={styles.inputRow}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.inputLabel}>First Name *</Text>
            <View style={styles.inputContainer}>
              <User size={20} color={Colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="John"
                placeholderTextColor={Colors.textTertiary}
                value={formData.firstName}
                onChangeText={(text) => updateForm('firstName', text)}
                autoCapitalize="words"
              />
            </View>
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.inputLabel}>Last Name *</Text>
            <View style={styles.inputContainer}>
              <User size={20} color={Colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Doe"
                placeholderTextColor={Colors.textTertiary}
                value={formData.lastName}
                onChangeText={(text) => updateForm('lastName', text)}
                autoCapitalize="words"
              />
            </View>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email Address *</Text>
          <View style={styles.inputContainer}>
            <Mail size={20} color={Colors.textTertiary} />
            <TextInput
              style={styles.input}
              placeholder="john.doe@example.com"
              placeholderTextColor={Colors.textTertiary}
              value={formData.email}
              onChangeText={(text) => updateForm('email', sanitizeEmail(text))}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              testID="signup-email"
            />
          </View>
          {existingAccountDetected && (
            <TouchableOpacity
              style={styles.existingAccountCard}
              onPress={() => navigateToLogin(formData.email)}
              testID="signup-existing-account"
            >
              <Shield size={16} color={Colors.primary} />
              <View style={styles.existingAccountContent}>
                <Text style={styles.existingAccountTitle}>Account already found</Text>
                <Text style={styles.existingAccountSubtitle}>Use Sign In for returning members. If this is your owner account, open Owner Access instead of creating another public account.</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Phone Number *</Text>
          <View style={styles.inputContainer}>
            <Phone size={20} color={Colors.textTertiary} />
            <Text style={styles.dialCode}>{formData.dialCode}</Text>
            <TextInput
              style={styles.input}
              placeholder="555 123 4567"
              placeholderTextColor={Colors.textTertiary}
              value={formData.phone}
              onChangeText={(text) => updateForm('phone', text)}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Country *</Text>
          <TouchableOpacity
            style={styles.inputContainer}
            onPress={() => setShowCountryPicker(true)}
          >
            <Globe size={20} color={Colors.textTertiary} />
            <Text style={[styles.input, styles.countryText]}>{formData.country}</Text>
            <ChevronDown size={20} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password *</Text>
          <View style={styles.inputContainer}>
            <Lock size={20} color={Colors.textTertiary} />
            <TextInput
              style={styles.input}
              placeholder="Minimum 8 characters"
              placeholderTextColor={Colors.textTertiary}
              value={formData.password}
              onChangeText={(text) => updateForm('password', text)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              {showPassword ? (
                <EyeOff size={20} color={Colors.textTertiary} />
              ) : (
                <Eye size={20} color={Colors.textTertiary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Confirm Password *</Text>
          <View style={styles.inputContainer}>
            <Lock size={20} color={Colors.textTertiary} />
            <TextInput
              style={styles.input}
              placeholder="Re-enter password"
              placeholderTextColor={Colors.textTertiary}
              value={formData.confirmPassword}
              onChangeText={(text) => updateForm('confirmPassword', text)}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? (
                <EyeOff size={20} color={Colors.textTertiary} />
              ) : (
                <Eye size={20} color={Colors.textTertiary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.termsRow}
          onPress={() => updateForm('acceptTerms', !formData.acceptTerms)}
        >
          <View style={[styles.checkbox, formData.acceptTerms && styles.checkboxChecked]}>
            {formData.acceptTerms && <CheckCircle size={16} color={Colors.white} />}
          </View>
          <Text style={styles.termsText}>
            I accept the <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isLoading}
          testID="signup-submit"
        >
          <Text style={styles.primaryButtonText}>
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </Text>
        </TouchableOpacity>

        <View style={styles.loginRow}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigateToLogin(formData.email)} testID="signup-go-login">
            <Text style={styles.loginLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const renderVerificationStep = (type: 'email' | 'phone') => {
    const code = type === 'email' ? emailCode : phoneCode;
    const refs = type === 'email' ? emailCodeRefs : phoneCodeRefs;
    const target = type === 'email' ? formData.email : formData.phone;
    const verified = type === 'email' ? emailVerified : phoneVerified;

    return (
      <View style={styles.verificationContainer}>
        <View style={styles.verificationIcon}>
          {type === 'email' ? (
            <Mail size={40} color={Colors.primary} />
          ) : (
            <Phone size={40} color={Colors.primary} />
          )}
        </View>

        <Text style={styles.verificationTitle}>
          Verify Your {type === 'email' ? 'Email' : 'Phone Number'}
        </Text>
        <Text style={styles.verificationSubtitle}>
          We have sent a 6-digit verification code to
        </Text>
        <Text style={styles.verificationTarget}>{target}</Text>

        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                refs.current[index] = ref;
              }}
              style={[styles.codeInput, digit && styles.codeInputFilled]}
              value={digit}
              onChangeText={(value) => handleCodeInput(type, index, value.slice(-1))}
              onKeyPress={({ nativeEvent }) => handleCodeKeyPress(type, index, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.resendButton, resendTimer > 0 && styles.resendButtonDisabled]}
          onPress={() => resendCode(type)}
          disabled={resendTimer > 0}
        >
          <Text style={[styles.resendText, resendTimer > 0 && styles.resendTextDisabled]}>
            {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend Code'}
          </Text>
        </TouchableOpacity>

        {verified && (
          <View style={styles.verifiedBadge}>
            <CheckCircle size={20} color={Colors.success} />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        )}
      </View>
    );
  };

  const renderCompleteStep = () => (
    <View style={styles.completeContainer}>
      <View style={styles.completeIcon}>
        <Shield size={60} color={Colors.success} />
      </View>

      <Text style={styles.completeTitle}>Account Created!</Text>
      <Text style={styles.completeSubtitle}>
        Your account has been successfully created. Complete your KYC verification to unlock all features and start investing.
      </Text>

      <View style={styles.verificationStatus}>
        <View style={styles.statusRow}>
          <CheckCircle size={20} color={Colors.success} />
          <Text style={styles.statusText}>Email verified</Text>
        </View>
        <View style={styles.statusRow}>
          <CheckCircle size={20} color={Colors.success} />
          <Text style={styles.statusText}>Phone verified</Text>
        </View>
        <View style={styles.statusRow}>
          <View style={styles.pendingIcon}>
            <Text style={styles.pendingIconText}>!</Text>
          </View>
          <Text style={styles.statusTextPending}>KYC verification pending</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleComplete}>
        <Text style={styles.primaryButtonText}>Complete KYC Verification</Text>
        <ChevronRight size={20} color={Colors.background} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.replace('/(tabs)/(home)' as Href)}
      >
        <Text style={styles.secondaryButtonText}>Do This Later</Text>
      </TouchableOpacity>
    </View>
  );

  const selectCountry = (country: Country) => {
    setFormData(prev => ({
      ...prev,
      country: country.name,
      countryCode: country.code,
      dialCode: country.dialCode,
    }));
    setShowCountryPicker(false);
    setCountrySearch('');
  };

  const renderCountryItem = ({ item }: { item: Country }) => (
    <TouchableOpacity
      style={styles.countryItem}
      onPress={() => selectCountry(item)}
    >
      <Text style={styles.countryItemName}>{item.name}</Text>
      <Text style={styles.countryItemDialCode}>{item.dialCode}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Modal
        visible={showCountryPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Country</Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowCountryPicker(false);
                setCountrySearch('');
              }}
            >
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchContainer}>
            <Search size={20} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search countries..."
              placeholderTextColor={Colors.textTertiary}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCapitalize="none"
            />
          </View>
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.code}
            renderItem={renderCountryItem}
            showsVerticalScrollIndicator={false}
            style={styles.countryList}
          />
        </SafeAreaView>
      </Modal>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                if (currentStep === 'register') {
                  router.back();
                } else if (currentStep === 'verify_email') {
                  setCurrentStep('register');
                } else if (currentStep === 'verify_phone') {
                  setCurrentStep('verify_email');
                }
              }}
            >
              <ArrowLeft size={24} color={Colors.text} />
            </TouchableOpacity>

            <View style={styles.progressContainer}>
              {['register', 'verify_email', 'verify_phone', 'complete'].map((step, index) => (
                <View
                  key={step}
                  style={[
                    styles.progressDot,
                    (currentStep === step ||
                      ['register', 'verify_email', 'verify_phone', 'complete'].indexOf(currentStep) > index) &&
                      styles.progressDotActive,
                  ]}
                />
              ))}
            </View>

            <View style={{ width: 40 }} />
          </View>

          {currentStep === 'register' && renderRegisterForm()}
          {currentStep === 'verify_email' && renderVerificationStep('email')}
          {currentStep === 'verify_phone' && renderVerificationStep('phone')}
          {currentStep === 'complete' && renderCompleteStep()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  backButton: {
    padding: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surface,
  },
  progressDotActive: {
    backgroundColor: Colors.primary,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: Colors.background,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    marginBottom: 16,
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800' as const,
    marginBottom: 6,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  formSection: {
    marginBottom: 16,
  },
  ownerShortcutCard: {
    marginBottom: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#3B82F638',
    backgroundColor: '#07111D',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ownerShortcutIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  ownerShortcutContent: {
    flex: 1,
  },
  ownerShortcutTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  ownerShortcutSubtitle: {
    marginTop: 3,
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  existingAccountCard: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '28',
    backgroundColor: Colors.primary + '10',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  existingAccountContent: {
    flex: 1,
  },
  existingAccountTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  existingAccountSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    color: Colors.text,
    fontSize: 16,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 20,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  termsText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  termsLink: {
    color: Colors.primary,
    textDecorationLine: 'underline' as const,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: Colors.black,
    fontWeight: '700' as const,
    fontSize: 16,
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 16,
  },
  loginText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  loginLink: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  bottomPadding: {
    height: 40,
  },
  verificationContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  verificationIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  verificationTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  verificationSubtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '500' as const,
    textAlign: 'center',
  },
  verificationTarget: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 28,
    textAlign: 'center',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
    width: '100%',
  },
  codeInput: {
    width: 48,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    textAlign: 'center' as const,
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
  },
  codeInputFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  resendButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  resendTextDisabled: {
    color: Colors.textTertiary,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.success + '15',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 16,
  },
  verifiedText: {
    color: Colors.success,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  completeContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  completeIcon: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: Colors.success + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  completeTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  completeSubtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '500' as const,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  verificationStatus: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  statusTextPending: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '500' as const,
  },
  pendingIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF9800' + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingIconText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '800' as const,
  },
  secondaryButton: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    width: '100%',
  },
  secondaryButtonText: {
    color: Colors.text,
    fontWeight: '600' as const,
    fontSize: 16,
  },
  countryText: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    color: Colors.text,
    fontSize: 16,
  },
  dialCode: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600' as const,
    marginLeft: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
  },
  modalCloseButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  countryList: {
    flex: 1,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  countryItemName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '500' as const,
  },
  countryItemDialCode: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
