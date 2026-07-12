import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncToLandingPage, type LandingSyncResult } from '@/lib/landing-sync';

const AUTO_DEPLOY_ENABLED_KEY = 'ivx_auto_deploy_enabled';
const AUTO_DEPLOY_LOG_KEY = 'ivx_auto_deploy_log';
const MAX_LOG_ENTRIES = 50;

export interface AutoDeployConfig {
  enabled: boolean;
  deployOnSave: boolean;
  deployOnDealPublish: boolean;
  deployOnContentChange: boolean;
}

export interface AutoDeployLogEntry {
  id: string;
  timestamp: string;
  trigger: 'save' | 'deal_publish' | 'deal_unpublish' | 'content_change' | 'manual' | 'scheduled';
  status: 'success' | 'failed' | 'skipped';
  syncedDeals: number;
  filesUploaded: string[];
  errors: string[];
  durationMs: number;
}

export interface AutoDeployStatus {
  config: AutoDeployConfig;
  lastDeploy: AutoDeployLogEntry | null;
  recentLogs: AutoDeployLogEntry[];
  isDeploying: boolean;
}

const DEFAULT_CONFIG: AutoDeployConfig = {
  enabled: true,
  deployOnSave: true,
  deployOnDealPublish: true,
  deployOnContentChange: true,
};

interface QueuedDeploy {
  trigger: AutoDeployLogEntry['trigger'];
  resolvers: Array<(entry: AutoDeployLogEntry) => void>;
}

let _isDeploying = false;
let _deployQueue: QueuedDeploy[] = [];
let _currentConfig: AutoDeployConfig | null = null;

export function isAutoDeploying(): boolean {
  return _isDeploying;
}

export async function getAutoDeployConfig(): Promise<AutoDeployConfig> {
  if (_currentConfig) return _currentConfig;
  try {
    const stored = await AsyncStorage.getItem(AUTO_DEPLOY_ENABLED_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      _currentConfig = { ...DEFAULT_CONFIG, ...parsed };
      return _currentConfig!;
    }
  } catch (err) {
    console.log('[AutoDeploy] Failed to load config:', (err as Error)?.message);
  }
  _currentConfig = DEFAULT_CONFIG;
  return DEFAULT_CONFIG;
}

export async function setAutoDeployConfig(config: Partial<AutoDeployConfig>): Promise<AutoDeployConfig> {
  const current = await getAutoDeployConfig();
  const updated = { ...current, ...config };
  _currentConfig = updated;
  try {
    await AsyncStorage.setItem(AUTO_DEPLOY_ENABLED_KEY, JSON.stringify(updated));
    console.log('[AutoDeploy] Config saved:', JSON.stringify(updated));
  } catch (err) {
    console.log('[AutoDeploy] Failed to save config:', (err as Error)?.message);
  }
  return updated;
}

export async function getAutoDeployLogs(): Promise<AutoDeployLogEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(AUTO_DEPLOY_LOG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.log('[AutoDeploy] Failed to load logs:', (err as Error)?.message);
  }
  return [];
}

async function appendDeployLog(entry: AutoDeployLogEntry): Promise<void> {
  try {
    const logs = await getAutoDeployLogs();
    logs.unshift(entry);
    const trimmed = logs.slice(0, MAX_LOG_ENTRIES);
    await AsyncStorage.setItem(AUTO_DEPLOY_LOG_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.log('[AutoDeploy] Failed to save log:', (err as Error)?.message);
  }
}

export async function clearAutoDeployLogs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTO_DEPLOY_LOG_KEY);
    console.log('[AutoDeploy] Logs cleared');
  } catch (err) {
    console.log('[AutoDeploy] Failed to clear logs:', (err as Error)?.message);
  }
}

async function executeDeploy(trigger: AutoDeployLogEntry['trigger']): Promise<AutoDeployLogEntry> {
  const startTime = Date.now();
  const entry: AutoDeployLogEntry = {
    id: `deploy-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    timestamp: new Date().toISOString(),
    trigger,
    status: 'success',
    syncedDeals: 0,
    filesUploaded: [],
    errors: [],
    durationMs: 0,
  };

  try {
    console.log(`[AutoDeploy] Starting deploy (trigger: ${trigger})...`);

    let syncResult: LandingSyncResult | null = null;
    try {
      syncResult = await syncToLandingPage();
      entry.syncedDeals = syncResult.syncedDeals;
      entry.filesUploaded = syncResult.filesUploaded;
      if (syncResult.errors.length > 0) {
        entry.errors.push(...syncResult.errors);
      }
      entry.status = syncResult.success ? 'success' : 'failed';
      console.log(`[AutoDeploy] Sync + deploy complete: ${syncResult.syncedDeals} deals, ${syncResult.filesUploaded.length} files, deployTriggered=${syncResult.deployTriggered}`);
    } catch (syncErr) {
      const msg = (syncErr as Error)?.message || 'Sync failed';
      console.log('[AutoDeploy] Sync/deploy error:', msg);
      entry.status = 'failed';
      entry.errors.push(msg);
    }
  } catch (err) {
    entry.status = 'failed';
    entry.errors.push((err as Error)?.message || 'Unknown error');
    console.log('[AutoDeploy] Fatal error:', (err as Error)?.message);
  }

  entry.durationMs = Date.now() - startTime;
  if (entry.status === 'failed' && entry.syncedDeals === 0 && entry.filesUploaded.length === 0) {
    console.log(`[AutoDeploy] Skipping log for empty failed deploy (trigger: ${trigger}, errors: ${entry.errors.join('; ')})`);
  } else {
    await appendDeployLog(entry);
  }
  console.log(`[AutoDeploy] Deploy finished in ${entry.durationMs}ms — status: ${entry.status}`);
  return entry;
}

async function processQueue(): Promise<void> {
  if (_isDeploying) return;
  if (_deployQueue.length === 0) return;

  _isDeploying = true;
  const item = _deployQueue.shift()!;

  try {
    const result = await executeDeploy(item.trigger);
    item.resolvers.forEach((resolve) => resolve(result));
  } catch (err) {
    const errorEntry: AutoDeployLogEntry = {
      id: `deploy-err-${Date.now()}`,
      timestamp: new Date().toISOString(),
      trigger: item.trigger,
      status: 'failed',
      syncedDeals: 0,
      filesUploaded: [],
      errors: [(err as Error)?.message || 'Queue processing error'],
      durationMs: 0,
    };
    item.resolvers.forEach((resolve) => resolve(errorEntry));
  } finally {
    _isDeploying = false;
    if (_deployQueue.length > 0) {
      void processQueue();
    }
  }
}

export function queueDeploy(trigger: AutoDeployLogEntry['trigger']): Promise<AutoDeployLogEntry> {
  return new Promise((resolve) => {
    const existing = _deployQueue.find((queued) => queued.trigger === trigger);
    if (existing) {
      console.log(`[AutoDeploy] Deduplicating ${trigger} trigger — attaching listener to existing queued deploy`);
      existing.resolvers.push(resolve);
      return;
    }

    _deployQueue.push({ trigger, resolvers: [resolve] });
    console.log(`[AutoDeploy] Queued deploy (trigger: ${trigger}, queue size: ${_deployQueue.length})`);
    void processQueue();
  });
}

export async function triggerAutoDeploy(
  trigger: AutoDeployLogEntry['trigger'],
  forceEvenIfDisabled?: boolean
): Promise<AutoDeployLogEntry | null> {
  const config = await getAutoDeployConfig();

  if (!forceEvenIfDisabled && !config.enabled) {
    console.log('[AutoDeploy] Auto-deploy is disabled — skipping');
    return null;
  }

  if (!forceEvenIfDisabled) {
    if (trigger === 'save' && !config.deployOnSave) {
      console.log('[AutoDeploy] deployOnSave is off — skipping');
      return null;
    }
    if ((trigger === 'deal_publish' || trigger === 'deal_unpublish') && !config.deployOnDealPublish) {
      console.log('[AutoDeploy] deployOnDealPublish is off — skipping');
      return null;
    }
    if (trigger === 'content_change' && !config.deployOnContentChange) {
      console.log('[AutoDeploy] deployOnContentChange is off — skipping');
      return null;
    }
  }

  return queueDeploy(trigger);
}

export async function manualDeploy(): Promise<AutoDeployLogEntry> {
  return queueDeploy('manual');
}

export async function getAutoDeployStatus(): Promise<AutoDeployStatus> {
  const config = await getAutoDeployConfig();
  const logs = await getAutoDeployLogs();
  return {
    config,
    lastDeploy: logs.length > 0 ? logs[0]! : null,
    recentLogs: logs.slice(0, 10),
    isDeploying: _isDeploying,
  };
}
