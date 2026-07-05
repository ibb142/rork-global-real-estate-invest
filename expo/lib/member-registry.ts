import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getDirectApiBaseUrl } from '@/lib/api-base';

const MEMBER_REGISTRY_STORAGE_KEY = '@ivx_member_registry_v2';
const MEMBER_REGISTRY_MAX_ITEMS = 2000;

export interface MemberRegistryRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  role: string;
  status: string;
  kycStatus: string;
  totalInvested: number;
  totalReturns: number;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  source: 'signup' | 'session' | 'supabase' | 'admin_update' | 'fallback' | 'waitlist_shadow' | 'landing_submission_shadow' | 'canonical';
  memberType?: string;
  smsVerified?: boolean;
  emailVerified?: boolean;
  verificationStatus?: string;
  registrationSource?: string;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asIsoString(value: unknown, fallback: string): string {
  const candidate = asString(value).trim();
  if (!candidate) return fallback;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function normalizeSource(value: unknown): MemberRegistryRecord['source'] {
  const source = asString(value).trim();
  if (
    source === 'signup' ||
    source === 'session' ||
    source === 'supabase' ||
    source === 'admin_update' ||
    source === 'fallback' ||
    source === 'waitlist_shadow' ||
    source === 'landing_submission_shadow' ||
    source === 'canonical'
  ) {
    return source;
  }
  return 'fallback';
}

function normalizeEmail(value: unknown): string {
  return asString(value).trim().toLowerCase();
}

function getRecordKey(record: Pick<MemberRegistryRecord, 'id' | 'email'>): string {
  const id = record.id.trim();
  if (id) return `id:${id}`;
  const email = normalizeEmail(record.email);
  return `email:${email}`;
}

function getRecordAliases(record: Pick<MemberRegistryRecord, 'id' | 'email'>): string[] {
  const aliases: string[] = [];
  const id = record.id.trim();
  const email = normalizeEmail(record.email);

  if (id) aliases.push(`id:${id}`);
  if (email) aliases.push(`email:${email}`);
  if (aliases.length === 0) aliases.push(getRecordKey(record));

  return aliases;
}

export function normalizeMemberRegistryRecord(input: Record<string, unknown>): MemberRegistryRecord {
  const now = new Date().toISOString();
  const email = normalizeEmail(input.email);
  const createdAt = asIsoString(input.createdAt ?? input.created_at, now);
  const updatedAt = asIsoString(input.updatedAt ?? input.updated_at, createdAt);
  const lastSeenAt = asIsoString(input.lastSeenAt ?? input.last_seen_at ?? updatedAt, updatedAt);

  return {
    id: asString(input.id).trim(),
    email,
    firstName: asString(input.firstName ?? input.first_name).trim(),
    lastName: asString(input.lastName ?? input.last_name).trim(),
    phone: asString(input.phone).trim(),
    country: asString(input.country).trim(),
    role: asString(input.role).trim() || 'investor',
    status: asString(input.status).trim() || 'active',
    kycStatus: asString(input.kycStatus ?? input.kyc_status).trim() || 'pending',
    totalInvested: asNumber(input.totalInvested ?? input.total_invested),
    totalReturns: asNumber(input.totalReturns ?? input.total_returns),
    createdAt,
    updatedAt,
    lastSeenAt,
    source: normalizeSource(input.source),
    memberType: asString(input.memberType ?? input.member_type).trim() || undefined,
    smsVerified: input.smsVerified === true || input.sms_verified === true,
    emailVerified: input.emailVerified === true || input.email_verified === true,
    verificationStatus: asString(input.verificationStatus ?? input.verification_status).trim() || undefined,
    registrationSource: asString(input.registrationSource ?? input.registration_source ?? input.source_detail).trim() || undefined,
  };
}

function sortMemberRegistryRecords(records: MemberRegistryRecord[]): MemberRegistryRecord[] {
  return [...records].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    if (aTime === bTime) {
      return a.email.localeCompare(b.email);
    }
    return bTime - aTime;
  });
}

function pickCreatedAt(current: string, incoming: string): string {
  const currentTime = new Date(current).getTime();
  const incomingTime = new Date(incoming).getTime();

  if (Number.isNaN(currentTime)) return incoming;
  if (Number.isNaN(incomingTime)) return current;
  return currentTime <= incomingTime ? current : incoming;
}

function mergeTwoMemberRegistryRecords(
  current: MemberRegistryRecord,
  incoming: MemberRegistryRecord
): MemberRegistryRecord {
  const currentUpdated = new Date(current.updatedAt).getTime();
  const incomingUpdated = new Date(incoming.updatedAt).getTime();
  const preferred = incomingUpdated >= currentUpdated ? incoming : current;
  const secondary = incomingUpdated >= currentUpdated ? current : incoming;

  return {
    ...secondary,
    ...preferred,
    id: preferred.id || secondary.id,
    email: normalizeEmail(preferred.email || secondary.email),
    firstName: preferred.firstName || secondary.firstName,
    lastName: preferred.lastName || secondary.lastName,
    phone: preferred.phone || secondary.phone,
    country: preferred.country || secondary.country,
    role: preferred.role || secondary.role || 'investor',
    status: preferred.status || secondary.status || 'active',
    kycStatus: preferred.kycStatus || secondary.kycStatus || 'pending',
    totalInvested: preferred.totalInvested || secondary.totalInvested,
    totalReturns: preferred.totalReturns || secondary.totalReturns,
    createdAt: pickCreatedAt(current.createdAt, incoming.createdAt),
    updatedAt: incomingUpdated >= currentUpdated ? incoming.updatedAt : current.updatedAt,
    lastSeenAt: incomingUpdated >= currentUpdated ? incoming.lastSeenAt : current.lastSeenAt,
    source: incomingUpdated >= currentUpdated ? incoming.source : current.source,
    memberType: preferred.memberType || secondary.memberType,
    smsVerified: preferred.smsVerified === true || secondary.smsVerified === true,
    emailVerified: preferred.emailVerified === true || secondary.emailVerified === true,
    verificationStatus: preferred.verificationStatus || secondary.verificationStatus,
    registrationSource: preferred.registrationSource || secondary.registrationSource,
  };
}

export function mergeMemberRegistryRecords(
  existing: MemberRegistryRecord[],
  incoming: MemberRegistryRecord[]
): MemberRegistryRecord[] {
  const registry = new Map<string, MemberRegistryRecord>();
  const aliasToPrimary = new Map<string, string>();

  const upsertRecord = (record: MemberRegistryRecord) => {
    const aliases = getRecordAliases(record);
    const matchedPrimaryKeys = Array.from(
      new Set(
        aliases
          .map((alias) => aliasToPrimary.get(alias))
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      )
    );

    const primaryKey = matchedPrimaryKeys[0] ?? getRecordKey(record);
    let mergedRecord: MemberRegistryRecord | null = registry.get(primaryKey) ?? null;

    for (const duplicatePrimaryKey of matchedPrimaryKeys.slice(1)) {
      const duplicateRecord = registry.get(duplicatePrimaryKey);
      if (!duplicateRecord) continue;

      mergedRecord = mergedRecord
        ? mergeTwoMemberRegistryRecords(mergedRecord, duplicateRecord)
        : duplicateRecord;

      registry.delete(duplicatePrimaryKey);
      for (const duplicateAlias of getRecordAliases(duplicateRecord)) {
        aliasToPrimary.set(duplicateAlias, primaryKey);
      }
    }

    mergedRecord = mergedRecord
      ? mergeTwoMemberRegistryRecords(mergedRecord, record)
      : record;

    registry.set(primaryKey, mergedRecord);
    for (const alias of getRecordAliases(mergedRecord)) {
      aliasToPrimary.set(alias, primaryKey);
    }
  };

  for (const record of sortMemberRegistryRecords(existing)) {
    upsertRecord(record);
  }

  for (const record of incoming) {
    upsertRecord(record);
  }

  return sortMemberRegistryRecords(Array.from(registry.values())).slice(0, MEMBER_REGISTRY_MAX_ITEMS);
}

export async function loadStoredMemberRegistry(): Promise<MemberRegistryRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(MEMBER_REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortMemberRegistryRecords(
      parsed
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => normalizeMemberRegistryRecord(item))
        .filter((item) => item.id.length > 0 || item.email.length > 0)
    );
  } catch (error) {
    console.log('[MemberRegistry] Failed to load registry:', (error as Error)?.message);
    return [];
  }
}

export async function saveStoredMemberRegistry(records: MemberRegistryRecord[]): Promise<void> {
  try {
    const normalized = sortMemberRegistryRecords(records).slice(0, MEMBER_REGISTRY_MAX_ITEMS);
    await AsyncStorage.setItem(MEMBER_REGISTRY_STORAGE_KEY, JSON.stringify(normalized));
    console.log('[MemberRegistry] Registry saved:', normalized.length);
  } catch (error) {
    console.log('[MemberRegistry] Failed to save registry:', (error as Error)?.message);
  }
}

export async function upsertStoredMemberRegistryRecord(input: Record<string, unknown>): Promise<MemberRegistryRecord[]> {
  const existing = await loadStoredMemberRegistry();
  const merged = mergeMemberRegistryRecords(existing, [normalizeMemberRegistryRecord(input)]);
  await saveStoredMemberRegistry(merged);
  return merged;
}

export async function getStoredMemberRegistryRecord(id: string): Promise<MemberRegistryRecord | null> {
  const existing = await loadStoredMemberRegistry();
  return existing.find((item) => item.id === id) ?? null;
}

export async function getStoredMemberRegistryRecordByEmail(email: string): Promise<MemberRegistryRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const existing = await loadStoredMemberRegistry();
  return existing.find((item) => item.email === normalizedEmail) ?? null;
}

function splitLandingFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const normalized = asString(fullName).trim();
  if (!normalized) {
    return { firstName: '', lastName: '' };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: normalized, lastName: '' };
  }

  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

export interface RegistryFetchStatus {
  url: string;
  httpStatus: number | null;
  ok: boolean;
  count: number;
  error: string | null;
  fetchedAt: string;
}

let lastRegistryFetchStatus: RegistryFetchStatus | null = null;

/** Raw evidence of the most recent canonical registry API request made by this app instance. */
export function getLastRegistryFetchStatus(): RegistryFetchStatus | null {
  return lastRegistryFetchStatus;
}

interface CanonicalMemberApiRow {
  member_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  member_type?: string | null;
  source?: string | null;
  source_detail?: string | null;
  verification_status?: string | null;
  sms_verified?: boolean | null;
  email_verified?: boolean | null;
  investor_interest?: string | null;
  preferred_zipcode?: string | null;
  budget_range?: string | null;
  auth_user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * Canonical members registry — one deduped row per landing registration,
 * served by the backend (service-role) from the Supabase `members` table.
 */
export async function fetchCanonicalMemberRegistry(): Promise<MemberRegistryRecord[]> {
  const base = getDirectApiBaseUrl();
  const url = `${base}/api/ivx/members/registry?limit=1000`;
  const fetchedAt = new Date().toISOString();
  try {
    if (!base) {
      lastRegistryFetchStatus = { url, httpStatus: null, ok: false, count: 0, error: 'API base URL not configured', fetchedAt };
      return [];
    }
    console.log('[MemberRegistry] GET', url);
    const response = await fetch(url);
    if (!response.ok) {
      console.log('[MemberRegistry] Canonical registry fetch HTTP', response.status);
      lastRegistryFetchStatus = { url, httpStatus: response.status, ok: false, count: 0, error: `HTTP ${response.status}`, fetchedAt };
      return [];
    }
    const payload = (await response.json()) as { ok?: boolean; members?: CanonicalMemberApiRow[] };
    if (!payload.ok || !Array.isArray(payload.members)) {
      lastRegistryFetchStatus = { url, httpStatus: response.status, ok: false, count: 0, error: 'Malformed payload (ok flag or members array missing)', fetchedAt };
      return [];
    }
    lastRegistryFetchStatus = { url, httpStatus: response.status, ok: true, count: payload.members.length, error: null, fetchedAt };
    console.log('[MemberRegistry] Registry response: HTTP', response.status, '— rows:', payload.members.length);
    return payload.members
      .map((row) => {
        const splitName = splitLandingFullName(row.full_name);
        return normalizeMemberRegistryRecord({
          id: row.auth_user_id || row.member_id || '',
          email: row.email ?? '',
          first_name: splitName.firstName,
          last_name: splitName.lastName,
          phone: row.phone ?? '',
          country: '',
          role: row.member_type ?? 'member',
          status: 'active',
          kyc_status: 'pending',
          created_at: row.created_at ?? new Date().toISOString(),
          updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
          source: 'canonical',
          member_type: row.member_type ?? '',
          sms_verified: row.sms_verified === true,
          email_verified: row.email_verified === true,
          verification_status: row.verification_status ?? 'unverified',
          source_detail: row.source_detail ?? row.source ?? '',
        });
      })
      .filter((item) => item.email.length > 0 || item.phone.length > 0);
  } catch (error) {
    const message = (error as Error)?.message || 'Network request failed';
    console.log('[MemberRegistry] Canonical registry fetch exception:', message);
    lastRegistryFetchStatus = { url, httpStatus: null, ok: false, count: 0, error: message, fetchedAt };
    return [];
  }
}

/**
 * Remote member registry — canonical API ONLY.
 * The Members module must never perform direct anonymous Supabase table reads;
 * the backend serves one deduped row per registration via service-role access.
 */
export async function fetchRemoteMemberRegistry(): Promise<MemberRegistryRecord[]> {
  return fetchCanonicalMemberRegistry();
}

export async function syncMemberRegistryFromSupabase(): Promise<MemberRegistryRecord[]> {
  const localRecords = await loadStoredMemberRegistry();
  const remoteRecords = await fetchRemoteMemberRegistry();
  const merged = mergeMemberRegistryRecords(localRecords, remoteRecords);
  await saveStoredMemberRegistry(merged);
  console.log('[MemberRegistry] Sync complete. Local:', localRecords.length, 'Remote:', remoteRecords.length, 'Merged:', merged.length);
  return merged;
}

function filterMemberRegistryRecords(records: MemberRegistryRecord[], search?: string): MemberRegistryRecord[] {
  const normalizedSearch = (search || '').trim().toLowerCase();
  if (!normalizedSearch) return records;

  return records.filter((record) => {
    const haystack = [
      record.email,
      record.firstName,
      record.lastName,
      `${record.firstName} ${record.lastName}`,
      record.phone,
      record.country,
    ].join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  });
}

export type AdminMemberRegistrySnapshotMode = 'full' | 'light';

export interface AdminMemberRegistrySnapshot {
  localCount: number;
  remoteCount: number;
  mergedCount: number;
  remoteProfileCount: number;
  remoteWaitlistShadowCount: number;
  remoteLandingSubmissionShadowCount: number;
  staleLocalOnlyCount: number;
  sources: Record<MemberRegistryRecord['source'], number>;
  latestCreatedAt: string | null;
}

function buildMemberRegistrySourceCounts(records: MemberRegistryRecord[]): Record<MemberRegistryRecord['source'], number> {
  const sources: Record<MemberRegistryRecord['source'], number> = {
    signup: 0,
    session: 0,
    supabase: 0,
    admin_update: 0,
    fallback: 0,
    waitlist_shadow: 0,
    landing_submission_shadow: 0,
    canonical: 0,
  };

  for (const record of records) {
    sources[record.source] += 1;
  }

  return sources;
}

export async function getAdminMemberRegistrySnapshot(options: { mode?: AdminMemberRegistrySnapshotMode } = {}): Promise<AdminMemberRegistrySnapshot> {
  const mode = options.mode ?? 'full';
  const localRecords = await loadStoredMemberRegistry();
  const canonicalRecords = await fetchCanonicalMemberRegistry();
  const merged = mergeMemberRegistryRecords(localRecords, canonicalRecords);

  if (mode === 'full' && (merged.length !== localRecords.length || canonicalRecords.length > 0)) {
    await saveStoredMemberRegistry(merged);
  }

  const remoteKeys = new Set(
    canonicalRecords.map((record) => `${record.id.trim()}::${normalizeEmail(record.email)}`)
  );

  return {
    localCount: localRecords.length,
    remoteCount: canonicalRecords.length,
    mergedCount: merged.length,
    remoteProfileCount: 0,
    remoteWaitlistShadowCount: 0,
    remoteLandingSubmissionShadowCount: 0,
    staleLocalOnlyCount: merged.filter((record) => !remoteKeys.has(`${record.id.trim()}::${normalizeEmail(record.email)}`)).length,
    sources: buildMemberRegistrySourceCounts(merged),
    latestCreatedAt: merged[0]?.createdAt ?? null,
  };
}

export async function findExistingRegisteredMemberByEmail(email: string): Promise<MemberRegistryRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const localMatch = await getStoredMemberRegistryRecordByEmail(normalizedEmail);
  if (localMatch && (localMatch.source === 'signup' || localMatch.source === 'session' || localMatch.source === 'supabase' || localMatch.source === 'admin_update')) {
    return localMatch;
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  const profileResult = await supabase
    .from('profiles')
    .select('id,email,first_name,last_name,phone,country,role,status,kyc_status,total_invested,total_returns,created_at,updated_at')
    .eq('email', normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (!profileResult.error && profileResult.data) {
    const record = normalizeMemberRegistryRecord({
      ...profileResult.data,
      source: 'supabase',
    });
    await upsertStoredMemberRegistryRecord(record as unknown as Record<string, unknown>);
    return record;
  }

  return null;
}

export async function findExistingMemberByEmail(email: string): Promise<MemberRegistryRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const registeredMember = await findExistingRegisteredMemberByEmail(normalizedEmail);
  if (registeredMember) {
    return registeredMember;
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  const [waitlistResult, landingResult] = await Promise.all([
    supabase
      .from('waitlist')
      .select('id,email,name,created_at')
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('landing_submissions')
      .select('id,full_name,email,phone,submitted_at,created_at,status,notes,type')
      .eq('email', normalizedEmail)
      .in('type', ['registration', 'waitlist'])
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!waitlistResult.error && waitlistResult.data) {
    const createdAt = waitlistResult.data.created_at ?? new Date().toISOString();
    const waitlistName = splitLandingFullName((waitlistResult.data as { name?: string | null }).name);
    const record = normalizeMemberRegistryRecord({
      ...waitlistResult.data,
      first_name: waitlistName.firstName,
      last_name: waitlistName.lastName,
      role: 'investor',
      status: 'active',
      kyc_status: 'pending',
      total_invested: 0,
      total_returns: 0,
      updated_at: createdAt,
      last_seen_at: createdAt,
      source: 'waitlist_shadow',
    });
    await upsertStoredMemberRegistryRecord(record as unknown as Record<string, unknown>);
    return record;
  }

  if (!landingResult.error && landingResult.data) {
    let parsedNotes: Record<string, unknown> = {};
    try {
      const rawNotes = asString(landingResult.data.notes).trim();
      parsedNotes = rawNotes ? JSON.parse(rawNotes) as Record<string, unknown> : {};
    } catch {
      parsedNotes = {};
    }

    const createdAt = landingResult.data.submitted_at ?? landingResult.data.created_at ?? new Date().toISOString();
    const splitName = splitLandingFullName(landingResult.data.full_name);
    const record = normalizeMemberRegistryRecord({
      id: landingResult.data.id ?? '',
      email: landingResult.data.email ?? normalizedEmail,
      first_name: asString(parsedNotes.first_name).trim() || splitName.firstName,
      last_name: asString(parsedNotes.last_name).trim() || splitName.lastName,
      phone: landingResult.data.phone ?? '',
      country: asString(parsedNotes.tax_residency_country ?? parsedNotes.document_issuing_country).trim(),
      role: 'investor',
      status: landingResult.data.status ?? 'pending',
      kyc_status: 'pending',
      total_invested: 0,
      total_returns: 0,
      created_at: createdAt,
      updated_at: createdAt,
      last_seen_at: createdAt,
      source: 'landing_submission_shadow',
    });
    await upsertStoredMemberRegistryRecord(record as unknown as Record<string, unknown>);
    return record;
  }

  return null;
}

export async function fetchAdminMemberRegistry(search?: string): Promise<MemberRegistryRecord[]> {
  const localRecords = await loadStoredMemberRegistry();
  const remoteRecords = await fetchRemoteMemberRegistry();
  const merged = mergeMemberRegistryRecords(localRecords, remoteRecords);
  if (merged.length !== localRecords.length || remoteRecords.length > 0) {
    await saveStoredMemberRegistry(merged);
  }
  return filterMemberRegistryRecords(merged, search);
}

export async function fetchAdminMemberRegistryRecord(id: string): Promise<MemberRegistryRecord | null> {
  if (!id) return null;

  try {
    const canonicalRecords = await fetchCanonicalMemberRegistry();
    const match = canonicalRecords.find((record) => record.id === id) ?? null;
    if (match) {
      await upsertStoredMemberRegistryRecord(match as unknown as Record<string, unknown>);
      return match;
    }
  } catch (error) {
    console.log('[MemberRegistry] Detail fetch exception:', (error as Error)?.message);
  }

  return getStoredMemberRegistryRecord(id);
}

export async function persistMemberRegistrationShadow(input: {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  country?: string;
  createdAt?: string;
}): Promise<{ success: boolean; error?: string }> {
  const now = asIsoString(input.createdAt, new Date().toISOString());
  const email = normalizeEmail(input.email);

  await upsertStoredMemberRegistryRecord({
    email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone ?? '',
    country: input.country ?? '',
    role: 'investor',
    status: 'active',
    kycStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    source: 'waitlist_shadow',
  });

  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const primaryShadowPayload = {
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      email,
      phone: (input.phone ?? '').trim(),
      goal: ['member_signup', (input.country ?? '').trim()].filter(Boolean).join(' · '),
      created_at: now,
    };

    const { error } = await supabase.from('waitlist').insert(primaryShadowPayload);

    if (error) {
      console.log('[MemberRegistry] Member shadow insert failed:', error.message);
      const lowerMessage = error.message.toLowerCase();
      const hasSchemaMismatch = lowerMessage.includes('column') || lowerMessage.includes('schema cache');
      if (!hasSchemaMismatch) {
        return { success: false, error: error.message };
      }

      console.log('[MemberRegistry] Legacy waitlist schema is older than expected — retrying minimal shadow payload');
      const { error: minimalError } = await supabase.from('waitlist').insert({
        email,
        created_at: now,
      });

      if (minimalError) {
        console.log('[MemberRegistry] Minimal member shadow insert failed:', minimalError.message);
        return { success: false, error: minimalError.message };
      }
    }

    console.log('[MemberRegistry] Member shadow saved:', email);
    return { success: true };
  } catch (error) {
    const message = (error as Error)?.message || 'Member shadow insert failed';
    console.log('[MemberRegistry] Member shadow exception:', message);
    return { success: false, error: message };
  }
}

export async function ensureMemberProfileRecord(input: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  country?: string;
  kycStatus?: string;
  role?: string;
  status?: string;
  avatar?: string;
  source?: MemberRegistryRecord['source'];
}): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();
  const payload = {
    id: input.id,
    email: input.email.trim().toLowerCase(),
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    phone: (input.phone || '').trim(),
    country: (input.country || '').trim(),
    role: (input.role || 'investor').trim() || 'investor',
    status: (input.status || 'active').trim() || 'active',
    avatar: (input.avatar || '').trim(),
    kyc_status: input.kycStatus || 'pending',
    updated_at: now,
  };

  await upsertStoredMemberRegistryRecord({
    id: input.id,
    email: payload.email,
    firstName: payload.first_name,
    lastName: payload.last_name,
    phone: payload.phone,
    country: payload.country,
    role: payload.role,
    status: payload.status,
    kycStatus: payload.kyc_status,
    updatedAt: now,
    lastSeenAt: now,
    source: input.source || 'fallback',
  });

  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({
        ...payload,
        created_at: now,
        total_invested: 0,
        total_returns: 0,
      }, {
        onConflict: 'id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.log('[MemberRegistry] Profile upsert failed:', error.message);
      return { success: false, error: error.message };
    }

    console.log('[MemberRegistry] Profile ensured:', input.id);
    return { success: true };
  } catch (error) {
    const message = (error as Error)?.message || 'Profile upsert failed';
    console.log('[MemberRegistry] Profile upsert exception:', message);
    return { success: false, error: message };
  }
}

export async function ensureMemberWalletRecord(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('wallets')
      .insert({
        user_id: userId,
        available: 0,
        pending: 0,
        invested: 0,
        total: 0,
        currency: 'USD',
      });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('duplicate') || message.includes('already') || message.includes('unique')) {
        console.log('[MemberRegistry] Wallet already exists for:', userId);
        return { success: true };
      }
      console.log('[MemberRegistry] Wallet ensure failed:', error.message);
      return { success: false, error: error.message };
    }

    console.log('[MemberRegistry] Wallet ensured:', userId);
    return { success: true };
  } catch (error) {
    const message = (error as Error)?.message || 'Wallet ensure failed';
    console.log('[MemberRegistry] Wallet ensure exception:', message);
    return { success: false, error: message };
  }
}
