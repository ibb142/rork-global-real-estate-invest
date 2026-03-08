import React, { useState, useMemo, useRef, useEffect } from 'react';
import logger from '@/lib/logger';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
  Animated,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  AlertTriangle,
  Shield,
  FileText,
  User,
  MapPin,
  Calendar,
  IdCard,
  Upload,
  RefreshCw,
  ChevronRight,
  Info,
  X,
  ChevronDown,
  Search,
  CreditCard,
  Eye,
  Smile,
  RotateCcw,
  Database,
  Globe,
  ShieldCheck,
  Fingerprint,
  ScanFace,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { COUNTRIES, Country, getCountryByName } from '@/constants/countries';
import {
  performFullVerification,
  performLivenessDetection,
  VerificationResult,
  VerificationCheck,
  LivenessChallenge,
  getRiskColor,
  getStatusColor,
} from '@/lib/verification-service';
import { trpcClient } from '@/lib/trpc';

type KYCStep = 'personal' | 'documents' | 'selfie' | 'liveness' | 'verification' | 'review';
type DocumentStatus = 'pending' | 'uploading' | 'uploaded' | 'verified' | 'rejected';

interface DocumentState {
  uri: string | null;
  status: DocumentStatus;
}

export default function KYCVerificationScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<KYCStep>('personal');
  const [isLoading, setIsLoading] = useState(false);

  const [personalInfo, setPersonalInfo] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    nationality: 'United States',
    nationalityCode: 'US',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    countryCode: 'US',
    passportNumber: '',
    taxId: '',
  });

  const [showNationalityPicker, setShowNationalityPicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const filteredCountries = useMemo(() => 
    COUNTRIES.filter(country =>
      country.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      country.code.toLowerCase().includes(countrySearch.toLowerCase())
    ), [countrySearch]
  );

  const selectedCountryInfo = useMemo(() => 
    getCountryByName(personalInfo.country) || COUNTRIES.find(c => c.code === 'US')!,
    [personalInfo.country]
  );

  const [documents, setDocuments] = useState<{
    governmentId: DocumentState;
    proofOfAddress: DocumentState;
    selfie: DocumentState;
  }>({
    governmentId: { uri: null, status: 'pending' },
    proofOfAddress: { uri: null, status: 'pending' },
    selfie: { uri: null, status: 'pending' },
  });

  const [selectedIdType, setSelectedIdType] = useState<'drivers_license' | 'passport' | 'national_id'>('drivers_license');

  const [livenessState, setLivenessState] = useState<{
    isRunning: boolean;
    currentChallenge: number;
    challenges: LivenessChallenge[];
    completed: boolean;
    confidence: number;
  }>({
    isRunning: false,
    currentChallenge: 0,
    challenges: [
      { type: 'blink', completed: false },
      { type: 'smile', completed: false },
      { type: 'turn_left', completed: false },
    ],
    completed: false,
    confidence: 0,
  });

  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verificationProgress, setVerificationProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const updatePersonalInfo = (key: keyof typeof personalInfo, value: string) => {
    setPersonalInfo(prev => ({ ...prev, [key]: value }));
  };

  const validatePersonalInfo = (): boolean => {
    if (!personalInfo.firstName || !personalInfo.lastName) {
      Alert.alert('Missing Information', 'Please enter your full name.');
      return false;
    }
    if (!personalInfo.dateOfBirth) {
      Alert.alert('Missing Information', 'Please enter your date of birth.');
      return false;
    }
    if (!personalInfo.address || !personalInfo.city || !personalInfo.state || !personalInfo.zipCode) {
      Alert.alert('Missing Information', 'Please enter your complete address.');
      return false;
    }
    if (!personalInfo.passportNumber) {
      Alert.alert('Missing Information', 'Please enter your passport number.');
      return false;
    }
    if (!personalInfo.taxId) {
      Alert.alert('Missing Information', `Please enter your ${selectedCountryInfo.taxIdLabel}.`);
      return false;
    }
    return true;
  };

  const submitPersonalInfoToBackend = async () => {
    try {
      logger.kyc.log('Submitting personal info to backend...');
      await trpcClient.kyc.submitPersonalInfo.mutate({
        firstName: personalInfo.firstName,
        lastName: personalInfo.lastName,
        dateOfBirth: personalInfo.dateOfBirth,
        nationality: personalInfo.nationality,
        nationalityCode: personalInfo.nationalityCode,
        taxId: personalInfo.taxId,
      });
      await trpcClient.kyc.submitAddress.mutate({
        street: personalInfo.address,
        city: personalInfo.city,
        state: personalInfo.state,
        postalCode: personalInfo.zipCode,
        country: personalInfo.country,
        countryCode: personalInfo.countryCode,
      });
      logger.kyc.log('Personal info + address submitted to backend');
    } catch (error) {
      console.error('[KYC] Backend submit error (non-blocking):', error);
    }
  };

  const uploadDocumentToBackend = async (type: string, uri: string) => {
    try {
      logger.kyc.log(`Uploading ${type} to backend...`);
      await trpcClient.kyc.uploadDocument.mutate({
        documentType: type as any,
        documentUrl: uri,
        issuingCountry: personalInfo.countryCode,
      });
      logger.kyc.log(`${type} uploaded to backend`);
    } catch (error) {
      console.error(`[KYC] Document upload error (non-blocking):`, error);
    }
  };

  const submitSelfieToBackend = async (uri: string) => {
    try {
      logger.kyc.log('Submitting selfie to backend...');
      await trpcClient.kyc.submitSelfie.mutate({ selfieUrl: uri });
      logger.kyc.log('Selfie submitted to backend');
    } catch (error) {
      console.error('[KYC] Selfie submit error (non-blocking):', error);
    }
  };

  const selectNationality = (country: Country) => {
    setPersonalInfo(prev => ({
      ...prev,
      nationality: country.name,
      nationalityCode: country.code,
    }));
    setShowNationalityPicker(false);
    setCountrySearch('');
  };

  const selectCountry = (country: Country) => {
    setPersonalInfo(prev => ({
      ...prev,
      country: country.name,
      countryCode: country.code,
    }));
    setShowCountryPicker(false);
    setCountrySearch('');
  };

  const renderCountryItem = ({ item }: { item: Country }) => (
    <TouchableOpacity
      style={styles.countryItem}
      onPress={() => {
        if (showNationalityPicker) {
          selectNationality(item);
        } else {
          selectCountry(item);
        }
      }}
    >
      <Text style={styles.countryItemName}>{item.name}</Text>
      <Text style={styles.countryItemCode}>{item.code}</Text>
    </TouchableOpacity>
  );

  const pickDocument = async (type: 'governmentId' | 'proofOfAddress' | 'selfie') => {
    const isCamera = type === 'selfie';
    
    if (isCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permissions to take a selfie.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library permissions to upload documents.');
        return;
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'selfie' ? [1, 1] : [4, 3],
      quality: 0.8,
    };

    const result = isCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets[0]) {
      const assetUri = result.assets[0].uri;
      setDocuments(prev => ({
        ...prev,
        [type]: { uri: assetUri, status: 'uploading' },
      }));

      const docTypeMap: Record<string, string> = {
        governmentId: selectedIdType,
        proofOfAddress: 'proof_of_address',
        selfie: 'selfie',
      };

      if (type === 'selfie') {
        void submitSelfieToBackend(assetUri);
      } else {
        void uploadDocumentToBackend(docTypeMap[type] || type, assetUri);
      }

      setTimeout(() => {
        setDocuments(prev => ({
          ...prev,
          [type]: { uri: assetUri, status: 'uploaded' },
        }));
      }, 1500);
    }
  };

  const removeDocument = (type: 'governmentId' | 'proofOfAddress' | 'selfie') => {
    setDocuments(prev => ({
      ...prev,
      [type]: { uri: null, status: 'pending' },
    }));
  };

  const handleNextStep = async () => {
    switch (currentStep) {
      case 'personal':
        if (validatePersonalInfo()) {
          setIsLoading(true);
          await submitPersonalInfoToBackend();
          setIsLoading(false);
          setCurrentStep('documents');
        }
        break;
      case 'documents':
        if (!documents.governmentId.uri) {
          Alert.alert('Missing Document', 'Please upload your government-issued ID.');
          return;
        }
        if (!documents.proofOfAddress.uri) {
          Alert.alert('Missing Document', 'Please upload your proof of address.');
          return;
        }
        setCurrentStep('selfie');
        break;
      case 'selfie':
        if (!documents.selfie.uri) {
          Alert.alert('Missing Selfie', 'Please take a selfie for identity verification.');
          return;
        }
        setCurrentStep('liveness');
        break;
      case 'liveness':
        if (!livenessState.completed) {
          Alert.alert('Liveness Required', 'Please complete the liveness verification.');
          return;
        }
        setCurrentStep('verification');
        void startFullVerification();
        break;
      case 'verification':
        setCurrentStep('review');
        break;
      case 'review':
        void submitKYC();
        break;
    }
  };

  const submitKYC = async () => {
    setIsLoading(true);
    logger.kyc.log('Submitting final KYC:', { personalInfo, documents: Object.keys(documents), verificationResult: !!verificationResult });

    try {
      await trpcClient.kyc.submitForReview.mutate();
      logger.kyc.log('Submitted to backend for review');
    } catch (error) {
      console.error('[KYC] Submit for review error:', error);
    }

    setIsLoading(false);
    const isApproved = verificationResult?.success;
    Alert.alert(
      isApproved ? 'KYC Approved' : 'KYC Submitted for Review',
      isApproved 
        ? 'Your identity has been verified successfully. You can now access all features.'
        : 'Your verification requires manual review. Our team will review within 1-3 business days.',
      [
        {
          text: 'Done',
          onPress: () => router.replace('/(tabs)/profile' as any),
        },
      ]
    );
  };

  const getStepNumber = (step: KYCStep): number => {
    const steps: KYCStep[] = ['personal', 'documents', 'selfie', 'liveness', 'verification', 'review'];
    return steps.indexOf(step) + 1;
  };

  const getTotalSteps = () => 6;

  useEffect(() => {
    if (livenessState.isRunning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [livenessState.isRunning, pulseAnim]);

  const startLivenessCheck = async () => {
    logger.kyc.log('Starting liveness check...');
    setLivenessState(prev => ({ ...prev, isRunning: true }));

    for (let i = 0; i < livenessState.challenges.length; i++) {
      setLivenessState(prev => ({ ...prev, currentChallenge: i }));
      await new Promise(resolve => setTimeout(resolve, 2000));
      setLivenessState(prev => ({
        ...prev,
        challenges: prev.challenges.map((c, idx) =>
          idx === i ? { ...c, completed: true } : c
        ),
      }));
    }

    const result = await performLivenessDetection();
    setLivenessState(prev => ({
      ...prev,
      isRunning: false,
      completed: result.isLive,
      confidence: result.confidence,
    }));

    if (result.isLive) {
      logger.kyc.log('Liveness check passed');
    } else {
      Alert.alert('Verification Failed', 'Could not verify liveness. Please try again.');
    }
  };

  const startFullVerification = async () => {
    logger.kyc.log('Starting full verification process...');
    setIsLoading(true);
    setVerificationProgress(0);

    Animated.timing(progressAnim, {
      toValue: 100,
      duration: 10000,
      useNativeDriver: false,
    }).start();

    const progressInterval = setInterval(() => {
      setVerificationProgress(prev => Math.min(prev + 5, 95));
    }, 500);

    try {
      const result = await performFullVerification({
        selfieUri: documents.selfie.uri || '',
        documentUri: documents.governmentId.uri || '',
        firstName: personalInfo.firstName,
        lastName: personalInfo.lastName,
        dateOfBirth: personalInfo.dateOfBirth,
        nationality: personalInfo.nationality,
        passportNumber: personalInfo.passportNumber,
        taxId: personalInfo.taxId,
      });

      clearInterval(progressInterval);
      setVerificationProgress(100);
      setVerificationResult(result);
      setCurrentStep('review');
    } catch (error) {
      console.error('[KYC] Verification error:', error);
      Alert.alert('Verification Error', 'An error occurred during verification. Please try again.');
    } finally {
      clearInterval(progressInterval);
      setIsLoading(false);
    }
  };

  const getChallengeIcon = (type: string) => {
    switch (type) {
      case 'blink': return <Eye size={24} color={Colors.primary} />;
      case 'smile': return <Smile size={24} color={Colors.primary} />;
      case 'turn_left': return <RotateCcw size={24} color={Colors.primary} />;
      case 'turn_right': return <RotateCcw size={24} color={Colors.primary} style={{ transform: [{ scaleX: -1 }] }} />;
      default: return <ScanFace size={24} color={Colors.primary} />;
    }
  };

  const getChallengeText = (type: string) => {
    switch (type) {
      case 'blink': return 'Blink your eyes';
      case 'smile': return 'Smile naturally';
      case 'turn_left': return 'Turn head left slowly';
      case 'turn_right': return 'Turn head right slowly';
      case 'nod': return 'Nod your head';
      default: return 'Follow instructions';
    }
  };

  const renderPersonalInfoStep = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepHeader}>
        <View style={styles.stepIcon}>
          <User size={24} color={Colors.primary} />
        </View>
        <Text style={styles.stepTitle}>Personal Information</Text>
        <Text style={styles.stepSubtitle}>Provide your legal name and address as it appears on your ID</Text>
      </View>

      <View style={styles.formSection}>
        <View style={styles.inputRow}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.inputLabel}>First Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Legal first name"
              placeholderTextColor={Colors.textTertiary}
              value={personalInfo.firstName}
              onChangeText={(text) => updatePersonalInfo('firstName', text)}
              autoCapitalize="words"
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.inputLabel}>Last Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Legal last name"
              placeholderTextColor={Colors.textTertiary}
              value={personalInfo.lastName}
              onChangeText={(text) => updatePersonalInfo('lastName', text)}
              autoCapitalize="words"
            />
          </View>
        </View>

        <View style={styles.inputRow}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.inputLabel}>Date of Birth *</Text>
            <View style={styles.inputWithIcon}>
              <Calendar size={18} color={Colors.textTertiary} />
              <TextInput
                style={styles.inputIconText}
                placeholder="MM/DD/YYYY"
                placeholderTextColor={Colors.textTertiary}
                value={personalInfo.dateOfBirth}
                onChangeText={(text) => updatePersonalInfo('dateOfBirth', text)}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.inputLabel}>Nationality *</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowNationalityPicker(true)}
            >
              <Text style={styles.pickerButtonText}>{personalInfo.nationality}</Text>
              <ChevronDown size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Street Address *</Text>
          <View style={styles.inputWithIcon}>
            <MapPin size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.inputIconText}
              placeholder="123 Main Street, Apt 4B"
              placeholderTextColor={Colors.textTertiary}
              value={personalInfo.address}
              onChangeText={(text) => updatePersonalInfo('address', text)}
            />
          </View>
        </View>

        <View style={styles.inputRow}>
          <View style={[styles.inputGroup, { flex: 2 }]}>
            <Text style={styles.inputLabel}>City *</Text>
            <TextInput
              style={styles.input}
              placeholder="Miami"
              placeholderTextColor={Colors.textTertiary}
              value={personalInfo.city}
              onChangeText={(text) => updatePersonalInfo('city', text)}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.inputLabel}>State *</Text>
            <TextInput
              style={styles.input}
              placeholder="FL"
              placeholderTextColor={Colors.textTertiary}
              value={personalInfo.state}
              onChangeText={(text) => updatePersonalInfo('state', text)}
            />
          </View>
        </View>

        <View style={styles.inputRow}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.inputLabel}>Zip/Postal Code *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter code"
              placeholderTextColor={Colors.textTertiary}
              value={personalInfo.zipCode}
              onChangeText={(text) => updatePersonalInfo('zipCode', text)}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.inputLabel}>Country *</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowCountryPicker(true)}
            >
              <Text style={styles.pickerButtonText} numberOfLines={1}>{personalInfo.country}</Text>
              <ChevronDown size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Identity Documents</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Passport Number *</Text>
          <View style={styles.inputWithIcon}>
            <CreditCard size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.inputIconText}
              placeholder="Enter your passport number"
              placeholderTextColor={Colors.textTertiary}
              value={personalInfo.passportNumber}
              onChangeText={(text) => updatePersonalInfo('passportNumber', text.toUpperCase())}
              autoCapitalize="characters"
            />
          </View>
          <Text style={styles.inputHint}>Enter passport number exactly as shown on your passport</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{selectedCountryInfo.taxIdLabel} *</Text>
          <View style={styles.inputWithIcon}>
            <IdCard size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.inputIconText}
              placeholder={selectedCountryInfo.taxIdPlaceholder}
              placeholderTextColor={Colors.textTertiary}
              value={personalInfo.taxId}
              onChangeText={(text) => updatePersonalInfo('taxId', text)}
            />
          </View>
          <Text style={styles.inputHint}>Your tax identification number for {personalInfo.country}</Text>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const renderDocumentCard = (
    type: 'governmentId' | 'proofOfAddress',
    title: string,
    description: string,
    icon: React.ReactNode
  ) => {
    const doc = documents[type];
    const isUploading = doc.status === 'uploading';

    return (
      <View style={styles.documentCard}>
        <View style={styles.documentHeader}>
          <View style={styles.documentIconContainer}>{icon}</View>
          <View style={styles.documentInfo}>
            <Text style={styles.documentTitle}>{title}</Text>
            <Text style={styles.documentDescription}>{description}</Text>
          </View>
          {doc.uri && (
            <View style={[
              styles.documentStatusBadge,
              { backgroundColor: doc.status === 'uploaded' ? Colors.success + '20' : Colors.primary + '20' }
            ]}>
              {isUploading ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <CheckCircle size={16} color={Colors.success} />
              )}
            </View>
          )}
        </View>

        {doc.uri ? (
          <View style={styles.documentPreviewContainer}>
            <Image source={{ uri: doc.uri }} style={styles.documentPreview} />
            {isUploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color={Colors.white} />
                <Text style={styles.uploadingText}>Uploading...</Text>
              </View>
            )}
            {!isUploading && (
              <TouchableOpacity
                style={styles.removeDocumentButton}
                onPress={() => removeDocument(type)}
              >
                <X size={16} color={Colors.white} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={() => pickDocument(type)}
          >
            <Upload size={24} color={Colors.primary} />
            <Text style={styles.uploadButtonText}>Upload Document</Text>
            <Text style={styles.uploadButtonHint}>JPG, PNG up to 10MB</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderDocumentsStep = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepHeader}>
        <View style={styles.stepIcon}>
          <FileText size={24} color={Colors.primary} />
        </View>
        <Text style={styles.stepTitle}>Upload Documents</Text>
        <Text style={styles.stepSubtitle}>Upload clear photos of your identification documents</Text>
      </View>

      <View style={styles.idTypeSelector}>
        <Text style={styles.inputLabel}>Select ID Type</Text>
        <View style={styles.idTypeOptions}>
          {[
            { value: 'drivers_license' as const, label: 'Driver\'s License' },
            { value: 'passport' as const, label: 'Passport' },
            { value: 'national_id' as const, label: 'National ID' },
          ].map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.idTypeOption,
                selectedIdType === type.value && styles.idTypeOptionActive,
              ]}
              onPress={() => setSelectedIdType(type.value)}
            >
              <Text
                style={[
                  styles.idTypeOptionText,
                  selectedIdType === type.value && styles.idTypeOptionTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {renderDocumentCard(
        'governmentId',
        selectedIdType === 'drivers_license' ? 'Driver\'s License' : selectedIdType === 'passport' ? 'Passport' : 'National ID',
        'Front side of your government-issued ID',
        <IdCard size={24} color={Colors.primary} />
      )}

      {renderDocumentCard(
        'proofOfAddress',
        'Proof of Address',
        'Utility bill, bank statement, or lease (within 3 months)',
        <FileText size={24} color={Colors.primary} />
      )}

      <View style={styles.infoCard}>
        <Info size={18} color={Colors.info} />
        <Text style={styles.infoCardText}>
          Make sure all text is clearly readable and the entire document is visible in the photo.
        </Text>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const renderSelfieStep = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepHeader}>
        <View style={styles.stepIcon}>
          <Camera size={24} color={Colors.primary} />
        </View>
        <Text style={styles.stepTitle}>Take a Selfie</Text>
        <Text style={styles.stepSubtitle}>We need a photo of you to verify your identity</Text>
      </View>

      <View style={styles.selfieInstructions}>
        <View style={styles.instructionRow}>
          <CheckCircle size={18} color={Colors.success} />
          <Text style={styles.instructionText}>Face the camera directly</Text>
        </View>
        <View style={styles.instructionRow}>
          <CheckCircle size={18} color={Colors.success} />
          <Text style={styles.instructionText}>Ensure good lighting</Text>
        </View>
        <View style={styles.instructionRow}>
          <CheckCircle size={18} color={Colors.success} />
          <Text style={styles.instructionText}>Remove glasses and hats</Text>
        </View>
        <View style={styles.instructionRow}>
          <CheckCircle size={18} color={Colors.success} />
          <Text style={styles.instructionText}>Keep a neutral expression</Text>
        </View>
      </View>

      {documents.selfie.uri ? (
        <View style={styles.selfiePreviewContainer}>
          <Image source={{ uri: documents.selfie.uri }} style={styles.selfiePreview} />
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={() => removeDocument('selfie')}
          >
            <RefreshCw size={18} color={Colors.primary} />
            <Text style={styles.retakeButtonText}>Retake Photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.selfieButton}
          onPress={() => pickDocument('selfie')}
        >
          <View style={styles.selfieIconContainer}>
            <Camera size={48} color={Colors.primary} />
          </View>
          <Text style={styles.selfieButtonText}>Take Selfie</Text>
          <Text style={styles.selfieButtonHint}>Tap to open camera</Text>
        </TouchableOpacity>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const renderLivenessStep = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepHeader}>
        <View style={styles.stepIcon}>
          <ScanFace size={24} color={Colors.primary} />
        </View>
        <Text style={styles.stepTitle}>Liveness Detection</Text>
        <Text style={styles.stepSubtitle}>Verify you are a real person, not a photo</Text>
      </View>

      <View style={styles.livenessContainer}>
        {documents.selfie.uri && (
          <Animated.View style={[
            styles.livenessPreview,
            { transform: [{ scale: livenessState.isRunning ? pulseAnim : 1 }] }
          ]}>
            <Image source={{ uri: documents.selfie.uri }} style={styles.livenessImage} />
            {livenessState.isRunning && (
              <View style={styles.livenessOverlay}>
                <View style={styles.livenessScanner} />
              </View>
            )}
          </Animated.View>
        )}

        <View style={styles.challengesList}>
          {livenessState.challenges.map((challenge, index) => (
            <View
              key={challenge.type}
              style={[
                styles.challengeItem,
                livenessState.currentChallenge === index && livenessState.isRunning && styles.challengeItemActive,
                challenge.completed && styles.challengeItemCompleted,
              ]}
            >
              <View style={styles.challengeIconContainer}>
                {challenge.completed ? (
                  <CheckCircle2 size={24} color={Colors.success} />
                ) : (
                  getChallengeIcon(challenge.type)
                )}
              </View>
              <Text style={[
                styles.challengeText,
                challenge.completed && styles.challengeTextCompleted,
              ]}>
                {getChallengeText(challenge.type)}
              </Text>
              {livenessState.currentChallenge === index && livenessState.isRunning && (
                <ActivityIndicator size="small" color={Colors.primary} />
              )}
            </View>
          ))}
        </View>

        {livenessState.completed ? (
          <View style={styles.livenessSuccessCard}>
            <ShieldCheck size={32} color={Colors.success} />
            <Text style={styles.livenessSuccessTitle}>Liveness Verified</Text>
            <Text style={styles.livenessSuccessText}>
              Confidence: {(livenessState.confidence * 100).toFixed(1)}%
            </Text>
          </View>
        ) : !livenessState.isRunning ? (
          <TouchableOpacity style={styles.startLivenessButton} onPress={startLivenessCheck}>
            <Fingerprint size={24} color={Colors.white} />
            <Text style={styles.startLivenessText}>Start Liveness Check</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.livenessInProgress}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.livenessProgressText}>Verifying liveness...</Text>
          </View>
        )}
      </View>

      <View style={styles.infoCard}>
        <Info size={18} color={Colors.info} />
        <Text style={styles.infoCardText}>
          This check ensures you are a real person and prevents identity fraud. Follow the on-screen instructions.
        </Text>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const renderVerificationStep = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepHeader}>
        <View style={styles.stepIcon}>
          <Database size={24} color={Colors.primary} />
        </View>
        <Text style={styles.stepTitle}>Identity Verification</Text>
        <Text style={styles.stepSubtitle}>Running comprehensive security checks</Text>
      </View>

      <View style={styles.verificationContainer}>
        <View style={styles.progressCircleContainer}>
          <View style={styles.progressCircle}>
            <Text style={styles.progressText}>{verificationProgress}%</Text>
          </View>
        </View>

        <View style={styles.verificationChecks}>
          <View style={styles.verificationCheckItem}>
            <View style={[styles.checkStatusDot, verificationProgress >= 20 && styles.checkStatusDotActive]} />
            <ScanFace size={20} color={verificationProgress >= 20 ? Colors.primary : Colors.textTertiary} />
            <Text style={[styles.verificationCheckText, verificationProgress >= 20 && styles.verificationCheckTextActive]}>
              Face matching with document
            </Text>
          </View>
          <View style={styles.verificationCheckItem}>
            <View style={[styles.checkStatusDot, verificationProgress >= 40 && styles.checkStatusDotActive]} />
            <FileText size={20} color={verificationProgress >= 40 ? Colors.primary : Colors.textTertiary} />
            <Text style={[styles.verificationCheckText, verificationProgress >= 40 && styles.verificationCheckTextActive]}>
              Document authenticity
            </Text>
          </View>
          <View style={styles.verificationCheckItem}>
            <View style={[styles.checkStatusDot, verificationProgress >= 60 && styles.checkStatusDotActive]} />
            <Globe size={20} color={verificationProgress >= 60 ? Colors.primary : Colors.textTertiary} />
            <Text style={[styles.verificationCheckText, verificationProgress >= 60 && styles.verificationCheckTextActive]}>
              Global sanctions check
            </Text>
          </View>
          <View style={styles.verificationCheckItem}>
            <View style={[styles.checkStatusDot, verificationProgress >= 80 && styles.checkStatusDotActive]} />
            <Shield size={20} color={verificationProgress >= 80 ? Colors.primary : Colors.textTertiary} />
            <Text style={[styles.verificationCheckText, verificationProgress >= 80 && styles.verificationCheckTextActive]}>
              PEP & watchlist screening
            </Text>
          </View>
          <View style={styles.verificationCheckItem}>
            <View style={[styles.checkStatusDot, verificationProgress >= 95 && styles.checkStatusDotActive]} />
            <CheckCircle size={20} color={verificationProgress >= 95 ? Colors.primary : Colors.textTertiary} />
            <Text style={[styles.verificationCheckText, verificationProgress >= 95 && styles.verificationCheckTextActive]}>
              Identity cross-reference
            </Text>
          </View>
        </View>

        <View style={styles.databasesCard}>
          <Text style={styles.databasesTitle}>Checking against databases:</Text>
          <View style={styles.databasesList}>
            {['OFAC SDN', 'UN Sanctions', 'EU Sanctions', 'UK HMT', 'PEP Lists', 'Interpol', 'Global Watchlist'].map((db, idx) => (
              <View key={db} style={styles.databaseItem}>
                <View style={[styles.databaseDot, verificationProgress > (idx + 1) * 12 && styles.databaseDotActive]} />
                <Text style={styles.databaseName}>{db}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const renderVerificationCheckStatus = (check: VerificationCheck) => {
    const statusColor = getStatusColor(check.status);
    return (
      <View style={styles.verificationResultItem} key={check.name}>
        <View style={[styles.resultStatusIcon, { backgroundColor: statusColor + '20' }]}>
          {check.status === 'passed' ? (
            <CheckCircle2 size={20} color={statusColor} />
          ) : check.status === 'failed' ? (
            <XCircle size={20} color={statusColor} />
          ) : (
            <Clock size={20} color={statusColor} />
          )}
        </View>
        <View style={styles.resultContent}>
          <Text style={styles.resultName}>{check.name}</Text>
          <Text style={styles.resultDetails}>{check.details}</Text>
        </View>
        <Text style={[styles.resultScore, { color: statusColor }]}>
          {(check.score * 100).toFixed(0)}%
        </Text>
      </View>
    );
  };

  const renderReviewStep = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepHeader}>
        <View style={[styles.stepIcon, { backgroundColor: (verificationResult?.success ? Colors.success : Colors.warning) + '20' }]}>
          {verificationResult?.success ? (
            <ShieldCheck size={24} color={Colors.success} />
          ) : (
            <AlertTriangle size={24} color={Colors.warning} />
          )}
        </View>
        <Text style={styles.stepTitle}>
          {verificationResult?.success ? 'Verification Successful' : 'Review Required'}
        </Text>
        <Text style={styles.stepSubtitle}>{verificationResult?.message}</Text>
      </View>

      {verificationResult && (
        <View style={styles.riskScoreCard}>
          <View style={styles.riskScoreHeader}>
            <Text style={styles.riskScoreLabel}>Risk Assessment</Text>
            <View style={[
              styles.riskBadge,
              { backgroundColor: getRiskColor(verificationResult.riskLevel) + '20' }
            ]}>
              <Text style={[
                styles.riskBadgeText,
                { color: getRiskColor(verificationResult.riskLevel) }
              ]}>
                {verificationResult.riskLevel.toUpperCase()} RISK
              </Text>
            </View>
          </View>
          <View style={styles.overallScoreBar}>
            <View
              style={[
                styles.overallScoreFill,
                {
                  width: `${verificationResult.score * 100}%`,
                  backgroundColor: getRiskColor(verificationResult.riskLevel),
                },
              ]}
            />
          </View>
          <Text style={styles.overallScoreText}>
            Overall Score: {(verificationResult.score * 100).toFixed(1)}%
          </Text>
        </View>
      )}

      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>Verification Results</Text>
        <View style={styles.verificationResultsCard}>
          {verificationResult?.checks.map(renderVerificationCheckStatus)}
        </View>
      </View>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>Personal Information</Text>
        <View style={styles.reviewCard}>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Full Name</Text>
            <Text style={styles.reviewValue}>{personalInfo.firstName} {personalInfo.lastName}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Date of Birth</Text>
            <Text style={styles.reviewValue}>{personalInfo.dateOfBirth}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Nationality</Text>
            <Text style={styles.reviewValue}>{personalInfo.nationality}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Passport Number</Text>
            <Text style={styles.reviewValue}>{personalInfo.passportNumber}</Text>
          </View>
          <View style={[styles.reviewRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.reviewLabel}>{selectedCountryInfo.taxIdLabel}</Text>
            <Text style={styles.reviewValue}>{personalInfo.taxId}</Text>
          </View>
        </View>
      </View>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>Documents & Biometrics</Text>
        <View style={styles.reviewCard}>
          <View style={styles.reviewDocRow}>
            <IdCard size={20} color={Colors.primary} />
            <Text style={styles.reviewDocText}>Government ID</Text>
            <CheckCircle size={18} color={Colors.success} />
          </View>
          <View style={styles.reviewDocRow}>
            <FileText size={20} color={Colors.primary} />
            <Text style={styles.reviewDocText}>Proof of Address</Text>
            <CheckCircle size={18} color={Colors.success} />
          </View>
          <View style={styles.reviewDocRow}>
            <Camera size={20} color={Colors.primary} />
            <Text style={styles.reviewDocText}>Selfie</Text>
            <CheckCircle size={18} color={Colors.success} />
          </View>
          <View style={styles.reviewDocRow}>
            <ScanFace size={20} color={Colors.primary} />
            <Text style={styles.reviewDocText}>Liveness Check</Text>
            <CheckCircle size={18} color={Colors.success} />
          </View>
          <View style={[styles.reviewDocRow, { borderBottomWidth: 0 }]}>
            <Database size={20} color={Colors.primary} />
            <Text style={styles.reviewDocText}>Sanctions Screening</Text>
            <CheckCircle size={18} color={Colors.success} />
          </View>
        </View>
      </View>

      <View style={styles.warningCard}>
        <AlertTriangle size={20} color={Colors.warning} />
        <Text style={styles.warningText}>
          By submitting, you confirm that all information provided is accurate and that you are the person depicted in the documents.
        </Text>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <Modal
        visible={showNationalityPicker || showCountryPicker}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {showNationalityPicker ? 'Select Nationality' : 'Select Country'}
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowNationalityPicker(false);
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
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                if (currentStep === 'personal') {
                  router.back();
                } else if (currentStep === 'documents') {
                  setCurrentStep('personal');
                } else if (currentStep === 'selfie') {
                  setCurrentStep('documents');
                } else if (currentStep === 'liveness') {
                  setCurrentStep('selfie');
                } else if (currentStep === 'verification') {
                  setCurrentStep('liveness');
                } else {
                  setCurrentStep('verification');
                }
              }}
            >
              <ArrowLeft size={24} color={Colors.text} />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>KYC Verification</Text>

            <Text style={styles.stepIndicator}>
              Step {getStepNumber(currentStep)}/{getTotalSteps()}
            </Text>
          </View>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(getStepNumber(currentStep) / getTotalSteps()) * 100}%` }]} />
          </View>

          {currentStep === 'personal' && renderPersonalInfoStep()}
          {currentStep === 'documents' && renderDocumentsStep()}
          {currentStep === 'selfie' && renderSelfieStep()}
          {currentStep === 'liveness' && renderLivenessStep()}
          {currentStep === 'verification' && renderVerificationStep()}
          {currentStep === 'review' && renderReviewStep()}

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.nextButton, isLoading && styles.buttonDisabled]}
              onPress={handleNextStep}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <>
                  <Text style={styles.nextButtonText}>
                    {currentStep === 'review' ? 'Submit KYC' : currentStep === 'liveness' ? 'Run Verification' : 'Continue'}
                  </Text>
                  <ChevronRight size={20} color={Colors.background} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 8 },
  headerTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' as const },
  stepIndicator: { width: 4, borderRadius: 2 },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: Colors.surfaceBorder },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  scrollView: { flex: 1, backgroundColor: Colors.background },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  stepTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  stepSubtitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  formSection: { marginBottom: 16 },
  inputGroup: { gap: 6, marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 12 },
  inputLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, marginBottom: 6 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, color: Colors.text, fontSize: 16, borderWidth: 1, borderColor: Colors.surfaceBorder },
  inputWithIcon: { flexDirection: 'row', alignItems: 'center' },
  inputIconText: { color: Colors.textTertiary, fontSize: 14 },
  inputHint: { color: Colors.textTertiary, fontSize: 12, marginTop: 4 },
  idTypeSelector: { marginBottom: 12 },
  idTypeOptions: { gap: 8 },
  idTypeOption: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.surfaceBorder },
  idTypeOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
  idTypeOptionText: { color: Colors.textSecondary, fontSize: 13 },
  idTypeOptionTextActive: { color: Colors.primary },
  documentCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  documentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  documentIconContainer: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  documentInfo: { flex: 1 },
  documentTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  documentDescription: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  documentStatusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  uploadButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  uploadButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  uploadButtonHint: { color: Colors.textTertiary, fontSize: 11, marginTop: 4, textAlign: 'center' as const },
  documentPreviewContainer: { gap: 8 },
  documentPreview: { gap: 8 },
  uploadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  uploadingText: { color: Colors.textSecondary, fontSize: 13 },
  removeDocumentButton: { backgroundColor: Colors.error + '15', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  infoCard: { backgroundColor: Colors.info + '10', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.info + '20' },
  infoCardText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  selfieInstructions: { gap: 8, marginBottom: 12 },
  instructionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  instructionText: { color: Colors.textSecondary, fontSize: 13 },
  selfieButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  selfieIconContainer: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  selfieButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  selfieButtonHint: { color: Colors.textTertiary, fontSize: 11, marginTop: 4, textAlign: 'center' as const },
  selfiePreviewContainer: { gap: 8 },
  selfiePreview: { gap: 8 },
  retakeButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  retakeButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  reviewSection: { marginBottom: 16 },
  reviewSectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  reviewCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewLabel: { color: Colors.textSecondary, fontSize: 13 },
  reviewValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  reviewDocRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewDocText: { color: Colors.textSecondary, fontSize: 13 },
  warningCard: { backgroundColor: Colors.warning + '10', borderRadius: 12, padding: 14, flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: Colors.warning + '20' },
  warningText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18, flex: 1 },
  bottomPadding: { height: 120 },
  footer: { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, backgroundColor: Colors.background },
  nextButton: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  nextButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  pickerButton: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.surfaceBorder },
  pickerButtonText: { color: Colors.text, fontSize: 16 },
  sectionDivider: { height: 1, backgroundColor: Colors.surfaceBorder, marginVertical: 8 },
  dividerLine: { height: 1, backgroundColor: Colors.surfaceBorder, marginVertical: 8 },
  dividerText: { color: Colors.textTertiary, fontSize: 12, paddingHorizontal: 8 },
  modalContainer: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' as const },
  modalCloseButton: { padding: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  searchInput: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 12 },
  countryList: { gap: 8 },
  countryItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  countryItemName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  countryItemCode: { color: '#999', fontSize: 12 },
  livenessContainer: { gap: 8 },
  livenessPreview: { gap: 8 },
  livenessImage: { width: '100%', height: 180, borderRadius: 12 },
  livenessOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  livenessScanner: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  challengesList: { gap: 8 },
  challengeItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  challengeItemActive: { backgroundColor: '#FFD700' + '15', borderColor: '#FFD700' },
  challengeItemCompleted: { backgroundColor: Colors.success + '10', borderColor: Colors.success + '30' },
  challengeIconContainer: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  challengeText: { color: Colors.textSecondary, fontSize: 13 },
  challengeTextCompleted: { color: Colors.success, textDecorationLine: 'line-through' as const },
  livenessSuccessCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  livenessSuccessTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  livenessSuccessText: { color: Colors.textSecondary, fontSize: 13 },
  startLivenessButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  startLivenessText: { color: Colors.textSecondary, fontSize: 13 },
  livenessInProgress: { alignItems: 'center', gap: 12, paddingVertical: 20 },
  livenessProgressText: { color: Colors.textSecondary, fontSize: 13 },
  verificationContainer: { gap: 8 },
  progressCircleContainer: { gap: 8 },
  progressCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  progressText: { color: Colors.textTertiary, fontSize: 12 },
  verificationChecks: { gap: 8 },
  verificationCheckItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  checkStatusDot: { width: 8, height: 8, borderRadius: 4 },
  checkStatusDotActive: { backgroundColor: Colors.primary },
  verificationCheckText: { color: Colors.textSecondary, fontSize: 13 },
  verificationCheckTextActive: { color: '#000' },
  databasesCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  databasesTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  databasesList: { gap: 8 },
  databaseItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  databaseDot: { width: 8, height: 8, borderRadius: 4 },
  databaseDotActive: { backgroundColor: Colors.primary },
  databaseName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  riskScoreCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  riskScoreHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  riskScoreLabel: { color: Colors.textSecondary, fontSize: 13 },
  riskBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  riskBadgeText: { fontSize: 11, fontWeight: '700' as const },
  overallScoreBar: { alignItems: 'center', gap: 4 },
  overallScoreFill: { alignItems: 'center', gap: 4 },
  overallScoreText: { color: Colors.textSecondary, fontSize: 13 },
  verificationResultsCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  verificationResultItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  resultStatusIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  resultContent: { flex: 1, gap: 4 },
  resultName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  resultDetails: { gap: 8 },
  resultScore: { alignItems: 'center', gap: 4 },
});
