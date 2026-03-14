import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { translations, TranslationKeys } from '@/constants/translations';
import { extendedTranslations } from '@/constants/translations-extended';
import { scopedKey } from '@/lib/project-storage';

export type LanguageCode = 
  | 'en' | 'zh' | 'hi' | 'es' | 'fr' | 'ar' | 'bn' | 'pt' | 'ru' | 'ja'
  | 'de' | 'jv' | 'ko' | 'vi' | 'tr' | 'it' | 'th' | 'ta' | 'mr' | 'ur'
  | 'pl' | 'uk' | 'nl' | 'id' | 'el' | 'cs' | 'ro' | 'hu' | 'sv' | 'ms';

export interface Language {
  code: LanguageCode;
  name: string;
  nativeName: string;
  rtl?: boolean;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
];

const STORAGE_KEY = scopedKey('language');

export const [I18nProvider, useI18n] = createContextHook(() => {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored)) {
          setLanguageState(stored as LanguageCode);
        }
      } catch (error) {
        console.log('Error loading language:', error);
      } finally {
        setIsLoading(false);
      }
    };
    void loadLanguage();
  }, []);

  const setLanguage = useCallback(async (code: LanguageCode) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, code);
      setLanguageState(code);
      console.log('Language changed to:', code);
    } catch (error) {
      console.log('Error saving language:', error);
    }
  }, []);

  const t = useCallback((key: TranslationKeys): string => {
    const langTranslations = translations[language];
    if (langTranslations) {
      const val = langTranslations[key];
      if (val) return val;
    }
    const extLang = extendedTranslations[language];
    if (extLang) {
      const extVal = extLang[key];
      if (extVal) return extVal;
    }
    return translations.en?.[key] || key;
  }, [language]);

  const currentLanguage = useMemo(() => {
    return SUPPORTED_LANGUAGES.find(l => l.code === language) || SUPPORTED_LANGUAGES[0];
  }, [language]);

  const isRTL = currentLanguage.rtl || false;

  return useMemo(() => ({
    language,
    setLanguage,
    t,
    currentLanguage,
    isRTL,
    isLoading,
    languages: SUPPORTED_LANGUAGES,
  }), [language, setLanguage, t, currentLanguage, isRTL, isLoading]);
});

const fallbackT = (key: string) => key;

export function useTranslation() {
  try {
    const context = useI18n();
    if (!context) {
      return { t: fallbackT as (key: TranslationKeys) => string, language: 'en' as LanguageCode, isRTL: false };
    }
    const { t, language, isRTL } = context;
    return { t, language, isRTL };
  } catch {
    return { t: fallbackT as (key: TranslationKeys) => string, language: 'en' as LanguageCode, isRTL: false };
  }
}
