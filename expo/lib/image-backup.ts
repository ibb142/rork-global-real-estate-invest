import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAuthUserId } from '@/lib/auth-store';
import { scopedKey } from '@/lib/project-storage';
import { uploadDealPhoto, resetBucketCache } from '@/lib/photo-upload';

const BACKUP_REGISTRY_KEY = scopedKey('image_backup_registry_v1');
const HEALTH_REPORT_KEY = scopedKey('image_health_report_v1');
const LAST_SCAN_KEY = scopedKey('image_last_scan_ts');
const SCAN_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface ImageBackupEntry {
  imageId: string;
  entityType: string;
  entityId: string;
  primaryUrl: string;
  backupUrls: string[];
  localUri: string | null;
  supabaseStoragePath: string | null;
  createdAt: string;
  lastVerifiedAt: string | null;
  lastHealthStatus: 'healthy' | 'degraded' | 'broken' | 'unknown';
  failCount: number;
  recoveredAt: string | null;
  recoverySource: string | null;
}

export interface ImageHealthReport {
  id: string;
  scannedAt: string;
  totalImages: number;
  healthyCount: number;
  degradedCount: number;
  brokenCount: number;
  recoveredCount: number;
  failedRecoveryCount: number;
  scanDurationMs: number;
  details: ImageScanDetail[];
}

export interface ImageScanDetail {
  imageId: string;
  entityId: string;
  url: string;
  status: 'healthy' | 'degraded' | 'broken' | 'recovered' | 'recovery_failed';
  responseTimeMs: number;
  httpStatus: number | null;
  recoverySource?: string;
  newUrl?: string;
  error?: string;
}

async function getBackupRegistry(): Promise<ImageBackupEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(BACKUP_REGISTRY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.log('[ImageBackup] Registry read error:', (err as Error)?.message);
  }
  return [];
}

async function saveBackupRegistry(entries: ImageBackupEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(BACKUP_REGISTRY_KEY, JSON.stringify(entries));
    console.log('[ImageBackup] Registry saved:', entries.length, 'entries');
  } catch (err) {
    console.log('[ImageBackup] Registry save error:', (err as Error)?.message);
  }
}

async function syncEntryToSupabase(entry: ImageBackupEntry): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = getAuthUserId();
  if (!userId) return;

  try {
    await supabase.from('image_backups').upsert({
      id: entry.imageId,
      user_id: userId,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      primary_url: entry.primaryUrl,
      backup_urls: entry.backupUrls,
      local_uri: entry.localUri,
      supabase_storage_path: entry.supabaseStoragePath,
      last_verified_at: entry.lastVerifiedAt,
      last_health_status: entry.lastHealthStatus,
      fail_count: entry.failCount,
      recovered_at: entry.recoveredAt,
      recovery_source: entry.recoverySource,
      created_at: entry.createdAt,
      updated_at: new Date().toISOString(),
    });
    console.log('[ImageBackup] Synced to Supabase:', entry.imageId);
  } catch (err) {
    console.log('[ImageBackup] Supabase sync failed (non-critical):', (err as Error)?.message);
  }
}

export async function registerImageBackup(params: {
  imageId: string;
  entityType: string;
  entityId: string;
  primaryUrl: string;
  localUri?: string;
  supabaseStoragePath?: string;
}): Promise<ImageBackupEntry> {
  const registry = await getBackupRegistry();

  const existing = registry.find(e => e.imageId === params.imageId);
  if (existing) {
    if (!existing.backupUrls.includes(params.primaryUrl) && existing.primaryUrl !== params.primaryUrl) {
      existing.backupUrls.push(params.primaryUrl);
    }
    if (params.localUri && !existing.localUri) {
      existing.localUri = params.localUri;
    }
    if (params.supabaseStoragePath && !existing.supabaseStoragePath) {
      existing.supabaseStoragePath = params.supabaseStoragePath;
    }
    await saveBackupRegistry(registry);
    void syncEntryToSupabase(existing);
    console.log('[ImageBackup] Updated existing entry:', params.imageId);
    return existing;
  }

  const entry: ImageBackupEntry = {
    imageId: params.imageId,
    entityType: params.entityType,
    entityId: params.entityId,
    primaryUrl: params.primaryUrl,
    backupUrls: [],
    localUri: params.localUri || null,
    supabaseStoragePath: params.supabaseStoragePath || null,
    createdAt: new Date().toISOString(),
    lastVerifiedAt: null,
    lastHealthStatus: 'unknown',
    failCount: 0,
    recoveredAt: null,
    recoverySource: null,
  };

  registry.push(entry);
  if (registry.length > 5000) {
    registry.splice(0, registry.length - 5000);
  }
  await saveBackupRegistry(registry);
  void syncEntryToSupabase(entry);
  console.log('[ImageBackup] Registered new backup entry:', params.imageId);
  return entry;
}

async function checkUrlHealth(url: string, timeoutMs: number = 8000): Promise<{ ok: boolean; statusCode: number | null; responseTimeMs: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timer);

    const responseTimeMs = Date.now() - start;
    const ok = response.ok || response.status === 304;
    console.log('[ImageBackup] URL check:', url.substring(0, 80), '→', response.status, `(${responseTimeMs}ms)`);
    return { ok, statusCode: response.status, responseTimeMs };
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    console.log('[ImageBackup] URL check FAILED:', url.substring(0, 80), '→', (err as Error)?.message);
    return { ok: false, statusCode: null, responseTimeMs };
  }
}

async function attemptRecovery(entry: ImageBackupEntry): Promise<{ recovered: boolean; newUrl: string | null; source: string | null }> {
  console.log('[ImageBackup] Attempting recovery for:', entry.imageId);

  for (const backupUrl of entry.backupUrls) {
    const check = await checkUrlHealth(backupUrl);
    if (check.ok) {
      console.log('[ImageBackup] Recovered from backup URL:', backupUrl.substring(0, 80));
      return { recovered: true, newUrl: backupUrl, source: 'backup_url' };
    }
  }

  if (entry.localUri && Platform.OS !== 'web') {
    try {
      const localFile = new File(entry.localUri);
      if (localFile.exists) {
        console.log('[ImageBackup] Local file exists, re-uploading:', entry.localUri);
        const result = await uploadDealPhoto(entry.entityId, entry.localUri, 0);
        if (result.url) {
          console.log('[ImageBackup] Re-uploaded from local cache:', result.url.substring(0, 80));
          return { recovered: true, newUrl: result.url, source: 'local_reupload' };
        }
      }
    } catch (err) {
      console.log('[ImageBackup] Local recovery failed:', (err as Error)?.message);
    }
  }

  if (isSupabaseConfigured() && entry.supabaseStoragePath) {
    try {
      const { data } = supabase.storage
        .from('deal-photos')
        .getPublicUrl(entry.supabaseStoragePath);
      if (data?.publicUrl) {
        const check = await checkUrlHealth(data.publicUrl);
        if (check.ok) {
          console.log('[ImageBackup] Recovered from Supabase storage path:', data.publicUrl.substring(0, 80));
          return { recovered: true, newUrl: data.publicUrl, source: 'supabase_storage' };
        }
      }
    } catch (err) {
      console.log('[ImageBackup] Supabase storage recovery failed:', (err as Error)?.message);
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase
        .from('image_backups')
        .select('primary_url, backup_urls')
        .eq('id', entry.imageId)
        .single();

      if (data) {
        const candidateUrls: string[] = [];
        if (data.primary_url) candidateUrls.push(data.primary_url);
        if (Array.isArray(data.backup_urls)) candidateUrls.push(...data.backup_urls);

        for (const candidateUrl of candidateUrls) {
          if (candidateUrl === entry.primaryUrl || entry.backupUrls.includes(candidateUrl)) continue;
          const check = await checkUrlHealth(candidateUrl);
          if (check.ok) {
            console.log('[ImageBackup] Recovered from Supabase DB record:', candidateUrl.substring(0, 80));
            return { recovered: true, newUrl: candidateUrl, source: 'supabase_db_record' };
          }
        }
      }
    } catch (err) {
      console.log('[ImageBackup] Supabase DB recovery lookup failed:', (err as Error)?.message);
    }
  }

  console.log('[ImageBackup] All recovery attempts failed for:', entry.imageId);
  return { recovered: false, newUrl: null, source: null };
}

export async function runImageHealthScan(options?: {
  forceFullScan?: boolean;
  maxImages?: number;
}): Promise<ImageHealthReport> {
  const scanStart = Date.now();
  const reportId = `health_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  console.log('[ImageBackup] Starting health scan:', reportId);

  const registry = await getBackupRegistry();
  const maxImages = options?.maxImages ?? 100;
  const imagesToScan = registry.slice(0, maxImages);

  const details: ImageScanDetail[] = [];
  let healthyCount = 0;
  let degradedCount = 0;
  let brokenCount = 0;
  let recoveredCount = 0;
  let failedRecoveryCount = 0;

  for (const entry of imagesToScan) {
    const check = await checkUrlHealth(entry.primaryUrl);

    if (check.ok) {
      entry.lastHealthStatus = 'healthy';
      entry.lastVerifiedAt = new Date().toISOString();
      entry.failCount = 0;
      healthyCount++;

      details.push({
        imageId: entry.imageId,
        entityId: entry.entityId,
        url: entry.primaryUrl,
        status: 'healthy',
        responseTimeMs: check.responseTimeMs,
        httpStatus: check.statusCode,
      });
    } else {
      entry.failCount++;
      console.log('[ImageBackup] Broken image detected:', entry.imageId, 'failCount:', entry.failCount);

      if (entry.failCount >= 2) {
        const recovery = await attemptRecovery(entry);

        if (recovery.recovered && recovery.newUrl) {
          if (!entry.backupUrls.includes(entry.primaryUrl)) {
            entry.backupUrls.push(entry.primaryUrl);
          }
          entry.primaryUrl = recovery.newUrl;
          entry.lastHealthStatus = 'healthy';
          entry.lastVerifiedAt = new Date().toISOString();
          entry.recoveredAt = new Date().toISOString();
          entry.recoverySource = recovery.source;
          entry.failCount = 0;
          recoveredCount++;

          details.push({
            imageId: entry.imageId,
            entityId: entry.entityId,
            url: recovery.newUrl,
            status: 'recovered',
            responseTimeMs: check.responseTimeMs,
            httpStatus: check.statusCode,
            recoverySource: recovery.source ?? undefined,
            newUrl: recovery.newUrl,
          });

          await updateImageUrlInSources(entry.imageId, entry.entityId, recovery.newUrl);
        } else {
          entry.lastHealthStatus = 'broken';
          brokenCount++;
          failedRecoveryCount++;

          details.push({
            imageId: entry.imageId,
            entityId: entry.entityId,
            url: entry.primaryUrl,
            status: 'recovery_failed',
            responseTimeMs: check.responseTimeMs,
            httpStatus: check.statusCode,
            error: 'All recovery sources exhausted',
          });
        }
      } else {
        entry.lastHealthStatus = 'degraded';
        degradedCount++;

        details.push({
          imageId: entry.imageId,
          entityId: entry.entityId,
          url: entry.primaryUrl,
          status: 'degraded',
          responseTimeMs: check.responseTimeMs,
          httpStatus: check.statusCode,
          error: `Fail count: ${entry.failCount} (recovery at 2)`,
        });
      }
    }
  }

  await saveBackupRegistry(registry);

  const report: ImageHealthReport = {
    id: reportId,
    scannedAt: new Date().toISOString(),
    totalImages: imagesToScan.length,
    healthyCount,
    degradedCount,
    brokenCount,
    recoveredCount,
    failedRecoveryCount,
    scanDurationMs: Date.now() - scanStart,
    details,
  };

  try {
    await AsyncStorage.setItem(HEALTH_REPORT_KEY, JSON.stringify(report));
    await AsyncStorage.setItem(LAST_SCAN_KEY, Date.now().toString());
  } catch (err) {
    console.log('[ImageBackup] Report save error:', (err as Error)?.message);
  }

  if (isSupabaseConfigured()) {
    try {
      const userId = getAuthUserId();
      await supabase.from('image_health_reports').insert({
        id: report.id,
        user_id: userId,
        scanned_at: report.scannedAt,
        total_images: report.totalImages,
        healthy_count: report.healthyCount,
        degraded_count: report.degradedCount,
        broken_count: report.brokenCount,
        recovered_count: report.recoveredCount,
        failed_recovery_count: report.failedRecoveryCount,
        scan_duration_ms: report.scanDurationMs,
      });
      console.log('[ImageBackup] Health report saved to Supabase:', report.id);
    } catch (err) {
      console.log('[ImageBackup] Supabase report save failed:', (err as Error)?.message);
    }
  }

  console.log('[ImageBackup] Health scan complete:', {
    total: report.totalImages,
    healthy: healthyCount,
    degraded: degradedCount,
    broken: brokenCount,
    recovered: recoveredCount,
    failedRecovery: failedRecoveryCount,
    durationMs: report.scanDurationMs,
  });

  return report;
}

async function updateImageUrlInSources(imageId: string, entityId: string, newUrl: string): Promise<void> {
  console.log('[ImageBackup] Propagating recovered URL to sources:', imageId, '→', newUrl.substring(0, 60));

  try {
    const { default: AsyncStorageModule } = await import('@react-native-async-storage/async-storage');
    const registryKey = scopedKey('image_registry');
    const raw = await AsyncStorageModule.getItem(registryKey);
    if (raw) {
      const registry = JSON.parse(raw);
      let updated = false;
      for (const key of Object.keys(registry)) {
        const images = registry[key];
        if (Array.isArray(images)) {
          for (const img of images) {
            if (img.id === imageId) {
              img.uri = newUrl;
              updated = true;
            }
          }
        }
      }
      if (updated) {
        await AsyncStorageModule.setItem(registryKey, JSON.stringify(registry));
        console.log('[ImageBackup] Updated image_registry with recovered URL');
      }
    }
  } catch (err) {
    console.log('[ImageBackup] image_registry update failed:', (err as Error)?.message);
  }

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('image_registry').update({ url: newUrl }).eq('id', imageId);
      console.log('[ImageBackup] Updated Supabase image_registry');
    } catch (err) {
      console.log('[ImageBackup] Supabase image_registry update failed:', (err as Error)?.message);
    }
  }
}

export async function shouldRunScan(): Promise<boolean> {
  try {
    const lastScanStr = await AsyncStorage.getItem(LAST_SCAN_KEY);
    if (!lastScanStr) return true;
    const lastScan = parseInt(lastScanStr, 10);
    return Date.now() - lastScan > SCAN_INTERVAL_MS;
  } catch {
    return true;
  }
}

export async function getLastHealthReport(): Promise<ImageHealthReport | null> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_REPORT_KEY);
    if (raw) return JSON.parse(raw) as ImageHealthReport;
  } catch (err) {
    console.log('[ImageBackup] Report read error:', (err as Error)?.message);
  }
  return null;
}

export async function getBackupStats(): Promise<{
  totalTracked: number;
  healthyCount: number;
  degradedCount: number;
  brokenCount: number;
  unknownCount: number;
  withLocalBackup: number;
  withSupabasePath: number;
  withBackupUrls: number;
  lastScanAt: string | null;
}> {
  const registry = await getBackupRegistry();
  const lastScanStr = await AsyncStorage.getItem(LAST_SCAN_KEY);

  return {
    totalTracked: registry.length,
    healthyCount: registry.filter(e => e.lastHealthStatus === 'healthy').length,
    degradedCount: registry.filter(e => e.lastHealthStatus === 'degraded').length,
    brokenCount: registry.filter(e => e.lastHealthStatus === 'broken').length,
    unknownCount: registry.filter(e => e.lastHealthStatus === 'unknown').length,
    withLocalBackup: registry.filter(e => !!e.localUri).length,
    withSupabasePath: registry.filter(e => !!e.supabaseStoragePath).length,
    withBackupUrls: registry.filter(e => e.backupUrls.length > 0).length,
    lastScanAt: lastScanStr ? new Date(parseInt(lastScanStr, 10)).toISOString() : null,
  };
}

export async function createFullImageBackup(): Promise<{
  success: boolean;
  backedUpCount: number;
  error?: string;
}> {
  console.log('[ImageBackup] Creating full image backup snapshot...');

  try {
    const registry = await getBackupRegistry();

    if (isSupabaseConfigured()) {
      const userId = getAuthUserId();
      if (userId) {
        let syncCount = 0;
        for (const entry of registry) {
          try {
            await syncEntryToSupabase(entry);
            syncCount++;
          } catch {
            console.log('[ImageBackup] Sync failed for:', entry.imageId);
          }
        }
        console.log('[ImageBackup] Full backup complete:', syncCount, '/', registry.length, 'synced to Supabase');
        return { success: true, backedUpCount: syncCount };
      }
    }

    console.log('[ImageBackup] No Supabase — local registry has', registry.length, 'entries');
    return { success: true, backedUpCount: registry.length };
  } catch (err) {
    console.log('[ImageBackup] Full backup error:', (err as Error)?.message);
    return { success: false, backedUpCount: 0, error: (err as Error)?.message };
  }
}

export async function importExistingImages(): Promise<number> {
  console.log('[ImageBackup] Importing existing images into backup registry...');
  let imported = 0;

  try {
    const registryKey = scopedKey('image_registry');
    const raw = await AsyncStorage.getItem(registryKey);
    if (raw) {
      const imageRegistry = JSON.parse(raw);
      for (const key of Object.keys(imageRegistry)) {
        const images = imageRegistry[key];
        if (Array.isArray(images)) {
          for (const img of images) {
            if (img.uri && img.id) {
              await registerImageBackup({
                imageId: img.id,
                entityType: img.entityType || 'general',
                entityId: img.entityId || '',
                primaryUrl: img.uri,
                localUri: img.originalUri !== img.uri ? img.originalUri : undefined,
              });
              imported++;
            }
          }
        }
      }
    }
  } catch (err) {
    console.log('[ImageBackup] image_registry import error:', (err as Error)?.message);
  }

  if (isSupabaseConfigured()) {
    try {
      const userId = getAuthUserId();
      if (userId) {
        const { data } = await supabase
          .from('image_registry')
          .select('*')
          .eq('user_id', userId);

        if (data && Array.isArray(data)) {
          for (const row of data) {
            await registerImageBackup({
              imageId: row.id,
              entityType: 'general',
              entityId: row.deal_id || '',
              primaryUrl: row.url || '',
              supabaseStoragePath: row.storage_path || undefined,
            });
            imported++;
          }
        }
      }
    } catch (err) {
      console.log('[ImageBackup] Supabase image import error:', (err as Error)?.message);
    }
  }

  console.log('[ImageBackup] Imported', imported, 'images into backup registry');
  return imported;
}

export async function runStartupImageProtection(): Promise<void> {
  console.log('[ImageBackup] Running startup image protection...');

  try {
    const registry = await getBackupRegistry();
    if (registry.length === 0) {
      const count = await importExistingImages();
      console.log('[ImageBackup] Initial import:', count, 'images');
    }

    const needsScan = await shouldRunScan();
    if (needsScan) {
      console.log('[ImageBackup] Scan interval passed — running health scan...');
      const report = await runImageHealthScan({ maxImages: 50 });
      console.log('[ImageBackup] Startup scan result:', report.healthyCount, 'healthy,', report.brokenCount, 'broken,', report.recoveredCount, 'recovered');
    } else {
      console.log('[ImageBackup] Scan not needed yet — skipping');
    }
  } catch (err) {
    console.log('[ImageBackup] Startup protection error (non-critical):', (err as Error)?.message);
  }
}

export async function getBrokenImages(): Promise<ImageBackupEntry[]> {
  const registry = await getBackupRegistry();
  return registry.filter(e => e.lastHealthStatus === 'broken');
}

export async function forceRecoverImage(imageId: string): Promise<{ recovered: boolean; newUrl: string | null; source: string | null }> {
  const registry = await getBackupRegistry();
  const entry = registry.find(e => e.imageId === imageId);
  if (!entry) {
    console.log('[ImageBackup] Entry not found for force recovery:', imageId);
    return { recovered: false, newUrl: null, source: null };
  }

  resetBucketCache();
  const result = await attemptRecovery(entry);

  if (result.recovered && result.newUrl) {
    if (!entry.backupUrls.includes(entry.primaryUrl)) {
      entry.backupUrls.push(entry.primaryUrl);
    }
    entry.primaryUrl = result.newUrl;
    entry.lastHealthStatus = 'healthy';
    entry.lastVerifiedAt = new Date().toISOString();
    entry.recoveredAt = new Date().toISOString();
    entry.recoverySource = result.source;
    entry.failCount = 0;
    await saveBackupRegistry(registry);
    await updateImageUrlInSources(entry.imageId, entry.entityId, result.newUrl);
  }

  return result;
}
