import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BIOMETRIC_ENABLED_KEY = '@ivx_biometric_enabled';

interface BiometricResult {
  success: boolean;
  error?: string;
}

interface LocalAuthModule {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  supportedAuthenticationTypesAsync: () => Promise<number[]>;
  authenticateAsync: (options: { promptMessage: string; cancelLabel: string; disableDeviceFallback: boolean; fallbackLabel: string }) => Promise<{ success: boolean }>;
  AuthenticationType: { FACIAL_RECOGNITION: number; FINGERPRINT: number; IRIS: number };
}

let LocalAuthentication: LocalAuthModule | null = null;

async function loadModule(): Promise<LocalAuthModule | null> {
  if (Platform.OS === 'web') return null;
  try {
    const mod = require('expo-local-authentication') as LocalAuthModule;
    LocalAuthentication = mod;
    return LocalAuthentication;
  } catch {
    console.log('[Biometric] expo-local-authentication not available');
    return null;
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const mod = await loadModule();
  if (!mod) return false;
  try {
    const compatible = await mod.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await mod.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function getBiometricType(): Promise<string> {
  if (Platform.OS === 'web') return 'none';
  const mod = await loadModule();
  if (!mod) return 'none';
  try {
    const types = await mod.supportedAuthenticationTypesAsync();
    if (types.includes(mod.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(mod.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    if (types.includes(mod.AuthenticationType.IRIS)) return 'iris';
    return 'none';
  } catch {
    return 'none';
  }
}

export async function authenticateWithBiometric(reason: string = 'Verify your identity'): Promise<BiometricResult> {
  if (Platform.OS === 'web') return { success: false, error: 'Not available on web' };
  const mod = await loadModule();
  if (!mod) return { success: false, error: 'Biometric module not available' };

  try {
    const result = await mod.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      fallbackLabel: 'Use Passcode',
    });

    console.log('[Biometric] Auth result:', result.success);
    return { success: result.success, error: result.success ? undefined : 'Authentication cancelled or failed' };
  } catch (error) {
    console.log('[Biometric] Auth error:', (error as Error)?.message);
    return { success: false, error: (error as Error)?.message };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
    console.log('[Biometric] Enabled:', enabled);
  } catch {
    console.log('[Biometric] Failed to save preference');
  }
}

export async function biometricLogin(): Promise<BiometricResult> {
  const available = await isBiometricAvailable();
  if (!available) return { success: false, error: 'Biometric not available' };

  const enabled = await isBiometricEnabled();
  if (!enabled) return { success: false, error: 'Biometric login not enabled' };

  return authenticateWithBiometric('Sign in to IVX Holdings');
}
