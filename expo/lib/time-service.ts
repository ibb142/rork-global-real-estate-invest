/**
 * =============================================================================
 * IVX ENTERPRISE TIME SERVICE — EXPO/REACT NATIVE
 * =============================================================================
 *
 * Single source of truth for all timestamp operations in the mobile app.
 * Shared across Expo (iOS/Android/Web) — all platforms use the same service.
 *
 * PRINCIPLES:
 *  - Store ALL timestamps in UTC (ISO 8601 with 'Z' suffix)
 *  - Never store local device times in the database
 *  - Convert UTC → local timezone only when displaying data
 *  - Automatically support Daylight Saving Time via IANA timezone database
 *
 * Used by: chat, transactions, reports, audit logs, notifications,
 * messages, analytics, landing page tracking.
 * =============================================================================
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** IANA timezone identifier (e.g., "America/New_York") */
export type IanaTimezone = string;

/** UTC offset in minutes (e.g., -300 for UTC-5, +330 for UTC+5:30) */
export type UtcOffsetMinutes = number;

/** Display preference for time */
export type TimeDisplayMode = 'utc' | 'local' | 'server' | 'owner' | 'user' | 'property' | 'custom';

/** 12/24 hour clock preference */
export type HourPreference = '12h' | '24h';

/**
 * Full timezone profile stored on the user's profile record.
 */
export interface TimezoneProfile {
  timezone: IanaTimezone;
  utc_offset: UtcOffsetMinutes;
  country: string | null;
  region: string | null;
  locale: string;
  hour_preference: HourPreference;
  last_timezone_update: string;
}

/**
 * Result of timezone detection from the device.
 */
export interface DetectedTimezone {
  timezone: IanaTimezone;
  utc_offset: UtcOffsetMinutes;
  country: string | null;
  region: string | null;
  locale: string;
  hour_preference: HourPreference;
  source: 'device' | 'header' | 'geo' | 'default';
  detected_at: string;
}

/**
 * A timestamp rendered for display in a specific timezone.
 */
export interface FormattedTimestamp {
  utc: string;
  local: string;
  timezone: IanaTimezone;
  offset: string;
  offset_minutes: UtcOffsetMinutes;
  is_dst: boolean;
  device: string | null;
  formatted_date: string;
  formatted_time: string;
  formatted_full: string;
}

/** AsyncStorage keys */
const TZ_PROFILE_KEY = '@ivx_timezone_profile';
const TZ_DISPLAY_MODE_KEY = '@ivx_timezone_display_mode';
const TZ_CUSTOM_TZ_KEY = '@ivx_timezone_custom';

/** Default timezone when detection fails. */
export const DEFAULT_TIMEZONE: IanaTimezone = 'UTC';

/** Default locale. */
export const DEFAULT_LOCALE = 'en-US';

/**
 * Returns the current UTC timestamp as an ISO 8601 string.
 * This is the ONLY function that should be used when storing timestamps.
 */
export function nowUtc(): string {
  return new Date().toISOString();
}

/**
 * Validates that a timestamp string is in UTC (ends with 'Z' or '+00:00').
 */
export function assertUtc(timestamp: string): void {
  if (!timestamp.endsWith('Z') && !timestamp.endsWith('+00:00')) {
    throw new Error(`Timestamp is not UTC: ${timestamp}`);
  }
}

/**
 * Converts any ISO 8601 timestamp to UTC.
 */
export function toUtc(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }
  return date.toISOString();
}

/**
 * Returns the UTC offset in minutes for a given IANA timezone at a specific date.
 */
export function getUtcOffsetMinutes(timezone: IanaTimezone, date: Date = new Date()): UtcOffsetMinutes {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = dtf.formatToParts(date);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    if (offsetPart) {
      const match = offsetPart.value.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
      if (match) {
        const sign = match[1] === '+' ? 1 : -1;
        const hours = parseInt(match[2], 10);
        const minutes = parseInt(match[3] || '0', 10);
        return sign * (hours * 60 + minutes);
      }
      if (offsetPart.value === 'GMT' || offsetPart.value === 'UTC') {
        return 0;
      }
    }
  } catch {
    // Fall through
  }

  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const parts = dtf.formatToParts(date);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    if (offsetPart) {
      const match = offsetPart.value.match(/UTC([+-])(\d{1,2}):?(\d{2})?/);
      if (match) {
        const sign = match[1] === '+' ? 1 : -1;
        const hours = parseInt(match[2], 10);
        const minutes = parseInt(match[3] || '0', 10);
        return sign * (hours * 60 + minutes);
      }
    }
  } catch {
    // Fall through
  }

  return 0;
}

/**
 * Returns a human-readable offset string like "+05:30" or "-04:00".
 */
export function getOffsetString(offsetMinutes: UtcOffsetMinutes): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Checks if Daylight Saving Time is in effect for a given timezone at a specific date.
 */
export function isDst(timezone: IanaTimezone, date: Date = new Date()): boolean {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const janOffset = getUtcOffsetMinutes(timezone, jan);
  const julOffset = getUtcOffsetMinutes(timezone, jul);
  const currentOffset = getUtcOffsetMinutes(timezone, date);
  if (janOffset === julOffset) return false;
  return currentOffset !== Math.min(janOffset, julOffset) || (currentOffset === Math.max(janOffset, julOffset) && currentOffset !== janOffset);
}

/**
 * Formats a UTC timestamp into a specific timezone for display.
 */
export function formatTimestamp(
  utcTimestamp: string,
  timezone: IanaTimezone = DEFAULT_TIMEZONE,
  locale: string = DEFAULT_LOCALE,
  hourPreference: HourPreference = '12h',
  device: string | null = null,
): FormattedTimestamp {
  const date = new Date(utcTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid UTC timestamp: ${utcTimestamp}`);
  }

  const offsetMinutes = getUtcOffsetMinutes(timezone, date);
  const offsetStr = getOffsetString(offsetMinutes);
  const dst = isDst(timezone, date);
  const hour12 = hourPreference === '12h';

  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  });
  const fullFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12,
    timeZoneName: 'short',
  });

  return {
    utc: date.toISOString(),
    local: fullFmt.format(date),
    timezone,
    offset: offsetStr,
    offset_minutes: offsetMinutes,
    is_dst: dst,
    device,
    formatted_date: dateFmt.format(date),
    formatted_time: timeFmt.format(date),
    formatted_full: fullFmt.format(date),
  };
}

/**
 * Formats a timestamp for chat display (short time only, e.g., "9:00 AM").
 */
export function formatChatTimestamp(
  utcTimestamp: string,
  timezone: IanaTimezone = DEFAULT_TIMEZONE,
  hourPreference: HourPreference = '12h',
): string {
  const result = formatTimestamp(utcTimestamp, timezone, DEFAULT_LOCALE, hourPreference);
  return result.formatted_time;
}

/**
 * Formats a timestamp for audit log display with full timezone metadata.
 */
export function formatAuditTimestamp(
  utcTimestamp: string,
  timezone: IanaTimezone = DEFAULT_TIMEZONE,
  device: string | null = null,
): { utc: string; local_time: string; timezone: IanaTimezone; offset: string; device: string | null } {
  const result = formatTimestamp(utcTimestamp, timezone);
  return {
    utc: result.utc,
    local_time: result.formatted_full,
    timezone: result.timezone,
    offset: result.offset,
    device,
  };
}

/**
 * Validates that a string is a valid IANA timezone.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-detects the device's timezone using native APIs.
 * Works on iOS, Android, and Web.
 */
export function detectDeviceTimezone(): DetectedTimezone {
  let timezone: IanaTimezone = DEFAULT_TIMEZONE;
  let source: 'device' | 'default' = 'default';

  // Platform-specific timezone detection
  try {
    if (Platform.OS === 'web') {
      // Web: use Intl API
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && isValidTimezone(detected)) {
        timezone = detected;
        source = 'device';
      }
    } else {
      // iOS/Android: Intl is available in React Native
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && isValidTimezone(detected)) {
        timezone = detected;
        source = 'device';
      }
    }
  } catch {
    // Fall through to default
  }

  const utcOffset = getUtcOffsetMinutes(timezone);

  // Detect locale
  let locale = DEFAULT_LOCALE;
  try {
    const detectedLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (detectedLocale) {
      locale = detectedLocale;
    }
  } catch {
    // Keep default
  }

  // Detect hour preference (most regions use 12h, but many use 24h)
  const hourPreference: HourPreference = detectHourPreference(locale);

  // Country and region from timezone
  const { country, region } = extractCountryFromTimezone(timezone);

  return {
    timezone,
    utc_offset: utcOffset,
    country,
    region,
    locale,
    hour_preference: hourPreference,
    source,
    detected_at: nowUtc(),
  };
}

/**
 * Detects 12h/24h preference from locale.
 */
function detectHourPreference(locale: string): HourPreference {
  // Regions that typically use 24h format
  const twentyFourHourLocales = [
    'de', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi',
    'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'lt', 'lv', 'et',
    'ru', 'uk', 'tr', 'el', 'ja', 'ko', 'zh', 'th', 'vi',
  ];
  const lang = locale.split('-')[0].toLowerCase();
  return twentyFourHourLocales.includes(lang) ? '24h' : '12h';
}

/**
 * Extracts country and region from IANA timezone identifier.
 */
function extractCountryFromTimezone(timezone: IanaTimezone): { country: string | null; region: string | null } {
  const parts = timezone.split('/');
  if (parts.length < 2) {
    return { country: null, region: null };
  }

  const region = parts[0];
  const cityPart = parts[parts.length - 1].replace(/_/g, ' ');

  // Map regions to countries (simplified)
  const countryMap: Record<string, string> = {
    'America': 'US',
    'Europe': 'GB',
    'Asia': 'JP',
    'Africa': 'ZA',
    'Australia': 'AU',
    'Pacific': 'US',
  };

  // More specific city → country mapping
  const cityCountryMap: Record<string, string> = {
    'New York': 'US', 'Los Angeles': 'US', 'Chicago': 'US', 'Denver': 'US',
    'Toronto': 'CA', 'Vancouver': 'CA', 'Mexico City': 'MX',
    'Sao Paulo': 'BR', 'Buenos Aires': 'AR', 'Bogota': 'CO', 'Lima': 'PE',
    'London': 'GB', 'Paris': 'FR', 'Madrid': 'ES', 'Berlin': 'DE',
    'Moscow': 'RU', 'Athens': 'GR', 'Amsterdam': 'NL', 'Rome': 'IT',
    'Dubai': 'AE', 'Jerusalem': 'IL', 'Tehran': 'IR', 'Riyadh': 'SA',
    'Kolkata': 'IN', 'Karachi': 'PK', 'Dhaka': 'BD', 'Colombo': 'LK',
    'Shanghai': 'CN', 'Hong Kong': 'HK', 'Taipei': 'TW', 'Singapore': 'SG',
    'Tokyo': 'JP', 'Seoul': 'KR', 'Bangkok': 'TH', 'Jakarta': 'ID',
    'Manila': 'PH', 'Kuala Lumpur': 'MY', 'Ho Chi Minh': 'VN',
    'Sydney': 'AU', 'Melbourne': 'AU', 'Brisbane': 'AU', 'Perth': 'AU',
    'Auckland': 'NZ', 'Honolulu': 'US', 'Fiji': 'FJ',
    'Cairo': 'EG', 'Lagos': 'NG', 'Nairobi': 'KE', 'Johannesburg': 'ZA',
    'Casablanca': 'MA', 'Accra': 'GH',
  };

  const country = cityCountryMap[cityPart] || countryMap[region] || null;
  return { country, region };
}

/**
 * Converts a UTC timestamp to a specific display mode.
 */
export function convertForDisplay(
  utcTimestamp: string,
  mode: TimeDisplayMode,
  userTimezone: IanaTimezone = DEFAULT_TIMEZONE,
  ownerTimezone: IanaTimezone = DEFAULT_TIMEZONE,
  propertyTimezone: IanaTimezone | null = null,
  customTimezone: IanaTimezone | null = null,
  locale: string = DEFAULT_LOCALE,
  hourPreference: HourPreference = '12h',
): FormattedTimestamp {
  let targetTimezone: IanaTimezone;
  switch (mode) {
    case 'utc':
    case 'server':
      targetTimezone = 'UTC';
      break;
    case 'local':
    case 'user':
      targetTimezone = userTimezone;
      break;
    case 'owner':
      targetTimezone = ownerTimezone;
      break;
    case 'property':
      targetTimezone = propertyTimezone || DEFAULT_TIMEZONE;
      break;
    case 'custom':
      targetTimezone = customTimezone || DEFAULT_TIMEZONE;
      break;
    default:
      targetTimezone = userTimezone;
  }
  return formatTimestamp(utcTimestamp, targetTimezone, locale, hourPreference);
}

/**
 * Returns a list of common timezones grouped by region for UI selectors.
 */
export function getTimezonesByRegion(): Record<string, IanaTimezone[]> {
  return {
    'Universal': ['UTC'],
    'North America': [
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Anchorage', 'America/Toronto', 'America/Mexico_City',
    ],
    'South America': [
      'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Lima',
    ],
    'Europe': [
      'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'Europe/Berlin',
      'Europe/Moscow', 'Europe/Athens', 'Europe/Amsterdam',
    ],
    'Middle East & Africa': [
      'Asia/Dubai', 'Asia/Jerusalem', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
    ],
    'Asia': [
      'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore',
      'Asia/Hong_Kong', 'Asia/Seoul', 'Asia/Bangkok',
    ],
    'Oceania': [
      'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'Pacific/Honolulu',
    ],
  };
}

/**
 * Saves the timezone profile to AsyncStorage.
 */
export async function saveTimezoneProfile(profile: TimezoneProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(TZ_PROFILE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.error('[TimeService] Failed to save timezone profile:', error);
  }
}

/**
 * Loads the timezone profile from AsyncStorage.
 */
export async function loadTimezoneProfile(): Promise<TimezoneProfile | null> {
  try {
    const stored = await AsyncStorage.getItem(TZ_PROFILE_KEY);
    if (stored) {
      return JSON.parse(stored) as TimezoneProfile;
    }
  } catch (error) {
    console.error('[TimeService] Failed to load timezone profile:', error);
  }
  return null;
}

/**
 * Saves the display mode preference to AsyncStorage.
 */
export async function saveDisplayMode(mode: TimeDisplayMode): Promise<void> {
  try {
    await AsyncStorage.setItem(TZ_DISPLAY_MODE_KEY, mode);
  } catch (error) {
    console.error('[TimeService] Failed to save display mode:', error);
  }
}

/**
 * Loads the display mode preference from AsyncStorage.
 */
export async function loadDisplayMode(): Promise<TimeDisplayMode> {
  try {
    const stored = await AsyncStorage.getItem(TZ_DISPLAY_MODE_KEY);
    if (stored) {
      return stored as TimeDisplayMode;
    }
  } catch {
    // Keep default
  }
  return 'local';
}

/**
 * Saves a custom timezone to AsyncStorage.
 */
export async function saveCustomTimezone(timezone: IanaTimezone): Promise<void> {
  try {
    await AsyncStorage.setItem(TZ_CUSTOM_TZ_KEY, timezone);
  } catch (error) {
    console.error('[TimeService] Failed to save custom timezone:', error);
  }
}

/**
 * Loads the custom timezone from AsyncStorage.
 */
export async function loadCustomTimezone(): Promise<IanaTimezone | null> {
  try {
    return await AsyncStorage.getItem(TZ_CUSTOM_TZ_KEY);
  } catch {
    return null;
  }
}

/**
 * Auto-detects, saves, and returns the timezone profile.
 * Called on login and registration.
 */
export async function autoDetectAndSaveTimezone(): Promise<TimezoneProfile> {
  const detected = detectDeviceTimezone();
  const profile: TimezoneProfile = {
    timezone: detected.timezone,
    utc_offset: detected.utc_offset,
    country: detected.country,
    region: detected.region,
    locale: detected.locale,
    hour_preference: detected.hour_preference,
    last_timezone_update: nowUtc(),
  };
  await saveTimezoneProfile(profile);
  return profile;
}

/**
 * Gets the current device identifier for audit logs.
 */
export function getDeviceIdentifier(): string {
  return `${Platform.OS}-${Platform.Version || 'unknown'}`;
}

/**
 * Supported test cities for validation.
 */
export const SUPPORTED_TEST_CITIES: ReadonlyArray<{ city: string; timezone: IanaTimezone; country: string }> = [
  { city: 'New York',   timezone: 'America/New_York',    country: 'US' },
  { city: 'Miami',      timezone: 'America/New_York',    country: 'US' },
  { city: 'California', timezone: 'America/Los_Angeles', country: 'US' },
  { city: 'London',     timezone: 'Europe/London',       country: 'GB' },
  { city: 'Madrid',     timezone: 'Europe/Madrid',       country: 'ES' },
  { city: 'Dubai',      timezone: 'Asia/Dubai',           country: 'AE' },
  { city: 'Tokyo',      timezone: 'Asia/Tokyo',           country: 'JP' },
  { city: 'Sydney',     timezone: 'Australia/Sydney',     country: 'AU' },
];
