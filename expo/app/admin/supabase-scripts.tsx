import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Database,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Shield,
  Wrench,
  Table2,
  Rocket,
  CheckCircle,
  FileCode,
  CopyCheck,
  AlertTriangle,
  Zap,
  Play,
  RefreshCw,
  Clock,
  BarChart3,
  Lock,
  HardDrive,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { SQL_SCRIPTS, SQL_CATEGORIES, SCRIPTS_VERSION } from '@/mocks/supabase-scripts';
import type { SqlScript } from '@/mocks/supabase-scripts';
import { supabase } from '@/lib/supabase';

console.log('[Supabase Scripts] Loaded version:', SCRIPTS_VERSION, '— Scripts count:', SQL_SCRIPTS.length);

const API_BASE = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');

type DeployStatus = 'idle' | 'deploying' | 'success' | 'error' | 'bootstrap_required';

interface DeployState {
  [scriptId: string]: { status: DeployStatus; message?: string };
}

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  'Bootstrap': { icon: Lock, color: '#FF6D00' },
  'Analytics': { icon: BarChart3, color: '#00BCD4' },
  'Setup': { icon: Rocket, color: '#00E676' },
  'Fix & Patch': { icon: Wrench, color: '#FF9800' },
  'Tables & Data': { icon: Table2, color: '#42A5F5' },
  'Security': { icon: Shield, color: '#EF5350' },
  'Verify': { icon: CheckCircle, color: '#AB47BC' },
  'Emergency': { icon: AlertTriangle, color: '#FF1744' },
  'Storage': { icon: HardDrive, color: '#FF9800' },
  'Other': { icon: FileCode, color: Colors.primary },
};

async function getAuthToken(): Promise<string | null> {
  try {
    const session = await supabase.auth.getSession();
    return session?.data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function deploySqlToBackend(script: SqlScript, token: string): Promise<{ success: boolean; error?: string; method?: string }> {
  if (!API_BASE) {
    return { success: false, error: 'API base URL not configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    console.log(`[Deploy] Sending script: ${script.fileName} (${script.content.length} chars)`);
    const response = await fetch(`${API_BASE}/deploy-sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        sql: script.content,
        scriptId: script.id,
        scriptName: script.title,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    console.log(`[Deploy] Response for ${script.fileName}:`, response.status, JSON.stringify(data).substring(0, 200));

    if (data.success) {
      return { success: true, method: data.method };
    }

    if (data.error === 'BOOTSTRAP_REQUIRED') {
      return { success: false, error: 'BOOTSTRAP_REQUIRED' };
    }

    return { success: false, error: data.error || data.message || `HTTP ${response.status}` };
  } catch (err) {
    clearTimeout(timeout);
    const msg = (err as Error)?.message || 'Unknown error';
    if (msg.includes('abort')) {
      return { success: false, error: 'Request timed out (30s)' };
    }
    return { success: false, error: msg };
  }
}

async function checkDeployReady(token: string): Promise<{ ready: boolean; reason: string }> {
  if (!API_BASE) return { ready: false, reason: 'no_api_url' };
  try {
    const response = await fetch(`${API_BASE}/deploy-sql-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    return await response.json();
  } catch {
    return { ready: false, reason: 'fetch_error' };
  }
}

export default function SupabaseScriptsPage() {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [deployState, setDeployState] = useState<DeployState>({});
  const [deployAllRunning, setDeployAllRunning] = useState(false);
  const [deployAllProgress, setDeployAllProgress] = useState<{ done: number; total: number; errors: number }>({ done: 0, total: 0, errors: 0 });
  const [isBootstrapReady, setIsBootstrapReady] = useState<boolean | null>(null);
  const [checkingBootstrap, setCheckingBootstrap] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const checkBootstrapStatus = useCallback(async () => {
    setCheckingBootstrap(true);
    const token = await getAuthToken();
    if (!token) {
      setIsBootstrapReady(false);
      setCheckingBootstrap(false);
      return;
    }
    const result = await checkDeployReady(token);
    console.log('[Bootstrap Check]', result);
    setIsBootstrapReady(result.ready);
    setCheckingBootstrap(false);
  }, []);

  useEffect(() => {
    void checkBootstrapStatus();
  }, [checkBootstrapStatus]);

  useEffect(() => {
    if (deployAllRunning) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [deployAllRunning, pulseAnim]);

  const filteredScripts = useMemo(() => {
    if (!selectedCategory) return SQL_SCRIPTS;
    return SQL_SCRIPTS.filter(s => s.category === selectedCategory);
  }, [selectedCategory]);

  const groupedScripts = useMemo(() => {
    const groups: Record<string, SqlScript[]> = {};
    filteredScripts.forEach(s => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category]!.push(s);
    });
    return groups;
  }, [filteredScripts]);

  const handleCopy = useCallback(async (script: SqlScript) => {
    try {
      await Clipboard.setStringAsync(script.content);
      setCopiedId(script.id);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      console.log('[SQL Scripts] Copied:', script.fileName, '—', script.lineCount, 'lines');
      setTimeout(() => setCopiedId(null), 2500);
    } catch (err) {
      console.log('[SQL Scripts] Copy error:', err);
      Alert.alert('Copy Failed', 'Could not copy to clipboard.');
    }
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const handleCopyAll = useCallback(async () => {
    try {
      const allContent = SQL_SCRIPTS.map(s =>
        `-- ============================================================\n-- ${s.title}\n-- File: ${s.fileName} (${s.lineCount} lines)\n-- ============================================================\n\n${s.content}`
      ).join('\n\n\n');
      await Clipboard.setStringAsync(allContent);
      setCopiedAll(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      console.log('[SQL Scripts] Copied ALL', SQL_SCRIPTS.length, 'scripts');
      setTimeout(() => setCopiedAll(false), 3000);
    } catch (err) {
      console.log('[SQL Scripts] Copy All error:', err);
      Alert.alert('Copy Failed', 'Could not copy all scripts.');
    }
  }, []);

  const handleDeploy = useCallback(async (script: SqlScript) => {
    const token = await getAuthToken();
    if (!token) {
      Alert.alert('Auth Required', 'Please log in to deploy scripts.');
      return;
    }

    setDeployState(prev => ({ ...prev, [script.id]: { status: 'deploying' } }));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await deploySqlToBackend(script, token);

    if (result.success) {
      setDeployState(prev => ({ ...prev, [script.id]: { status: 'success', message: `Deployed via ${result.method}` } }));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log(`[Deploy] SUCCESS: ${script.fileName}`);

      if (script.id === 'sql_bootstrap_exec') {
        setIsBootstrapReady(true);
      }

      setTimeout(() => {
        setDeployState(prev => ({ ...prev, [script.id]: { status: 'idle' } }));
      }, 4000);
    } else {
      if (result.error === 'BOOTSTRAP_REQUIRED') {
        setDeployState(prev => ({ ...prev, [script.id]: { status: 'bootstrap_required', message: 'Run Bootstrap first' } }));
        setIsBootstrapReady(false);
      } else {
        setDeployState(prev => ({ ...prev, [script.id]: { status: 'error', message: result.error } }));
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.log(`[Deploy] FAILED: ${script.fileName} — ${result.error}`);
    }
  }, []);

  const handleDeployAll = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      Alert.alert('Auth Required', 'Please log in to deploy scripts.');
      return;
    }

    if (!isBootstrapReady) {
      Alert.alert(
        'Bootstrap Required',
        'The ivx_exec_sql function is not deployed yet. Please copy the Bootstrap script, paste it in Supabase SQL Editor, and run it first.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Deploy All Scripts',
      `This will deploy ${SQL_SCRIPTS.length} scripts to your Supabase database. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deploy All',
          style: 'default',
          onPress: async () => {
            setDeployAllRunning(true);
            setDeployAllProgress({ done: 0, total: SQL_SCRIPTS.length, errors: 0 });
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

            let errors = 0;
            for (let i = 0; i < SQL_SCRIPTS.length; i++) {
              const script = SQL_SCRIPTS[i]!;
              if (script.id === 'sql_bootstrap_exec') {
                setDeployAllProgress(prev => ({ ...prev, done: prev.done + 1 }));
                setDeployState(prev => ({ ...prev, [script.id]: { status: 'success', message: 'Already active' } }));
                continue;
              }

              setDeployState(prev => ({ ...prev, [script.id]: { status: 'deploying' } }));
              const result = await deploySqlToBackend(script, token);

              if (result.success) {
                setDeployState(prev => ({ ...prev, [script.id]: { status: 'success' } }));
              } else {
                errors++;
                setDeployState(prev => ({ ...prev, [script.id]: { status: 'error', message: result.error } }));
              }
              setDeployAllProgress(prev => ({ ...prev, done: prev.done + 1, errors }));
            }

            setDeployAllRunning(false);
            if (errors === 0) {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Deploy Complete', `All ${SQL_SCRIPTS.length} scripts deployed successfully!`);
            } else {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              Alert.alert('Deploy Finished', `${SQL_SCRIPTS.length - errors} succeeded, ${errors} failed. Check individual scripts for details.`);
            }

            setTimeout(() => {
              setDeployState({});
            }, 6000);
          },
        },
      ]
    );
  }, [isBootstrapReady]);

  const deployedCount = useMemo(() => {
    return Object.values(deployState).filter(s => s.status === 'success').length;
  }, [deployState]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Database size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Supabase SQL</Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{SQL_SCRIPTS.length}</Text>
        </View>
      </View>

      {isBootstrapReady === false && !checkingBootstrap && (
        <View style={styles.bootstrapBanner}>
          <AlertTriangle size={16} color="#FF6D00" />
          <View style={styles.bootstrapBannerContent}>
            <Text style={styles.bootstrapBannerTitle}>Bootstrap Required</Text>
            <Text style={styles.bootstrapBannerText}>
              Copy the Bootstrap script below, paste in Supabase SQL Editor, and run it once. After that, all scripts auto-deploy.
            </Text>
          </View>
        </View>
      )}

      {isBootstrapReady === true && (
        <View style={styles.readyBanner}>
          <Zap size={16} color="#00E676" />
          <Text style={styles.readyBannerText}>Auto-Deploy Ready</Text>
          <TouchableOpacity onPress={checkBootstrapStatus} style={styles.refreshBtn}>
            <RefreshCw size={14} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.copyAllBtnStyle, copiedAll && styles.actionBtnDone]}
          onPress={handleCopyAll}
          activeOpacity={0.7}
          testID="copy-all-scripts"
        >
          {copiedAll ? <CopyCheck size={16} color="#062218" /> : <Copy size={16} color="#062218" />}
          <Text style={styles.actionBtnText}>{copiedAll ? 'Copied!' : 'Copy All'}</Text>
        </TouchableOpacity>

        <Animated.View style={{ flex: 1, opacity: pulseAnim }}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.deployAllBtnStyle,
              deployAllRunning && styles.deployAllRunning,
              !isBootstrapReady && styles.actionBtnDisabled,
            ]}
            onPress={handleDeployAll}
            activeOpacity={0.7}
            disabled={deployAllRunning || !isBootstrapReady}
            testID="deploy-all-scripts"
          >
            {deployAllRunning ? (
              <>
                <ActivityIndicator size="small" color="#062218" />
                <Text style={styles.actionBtnText}>
                  {deployAllProgress.done}/{deployAllProgress.total}
                </Text>
              </>
            ) : (
              <>
                <Rocket size={16} color={!isBootstrapReady ? Colors.textTertiary : '#062218'} />
                <Text style={[styles.actionBtnText, !isBootstrapReady && { color: Colors.textTertiary }]}>
                  Deploy All
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>

      {deployAllRunning && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${deployAllProgress.total > 0 ? (deployAllProgress.done / deployAllProgress.total) * 100 : 0}%` },
              deployAllProgress.errors > 0 && styles.progressFillError,
            ]}
          />
        </View>
      )}

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          <TouchableOpacity
            style={[styles.filterChip, !selectedCategory && styles.filterChipActive]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[styles.filterChipText, !selectedCategory && styles.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {SQL_CATEGORIES.map(cat => {
            const config = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG['Other']!;
            const isActive = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.filterChip, isActive && { backgroundColor: config.color + '25', borderColor: config.color }]}
                onPress={() => setSelectedCategory(isActive ? null : cat)}
              >
                <Text style={[styles.filterChipText, isActive && { color: config.color }]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {Object.entries(groupedScripts).map(([category, scripts]) => {
          const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG['Other']!;
          const CatIcon = config.icon;
          return (
            <View key={category} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <View style={[styles.categoryIconWrap, { backgroundColor: config.color + '20' }]}>
                  <CatIcon size={16} color={config.color} />
                </View>
                <Text style={styles.categoryTitle}>{category}</Text>
                <View style={styles.categoryCount}>
                  <Text style={styles.categoryCountText}>{scripts.length}</Text>
                </View>
              </View>

              {scripts.map(script => {
                const isCopied = copiedId === script.id;
                const isExpanded = expandedId === script.id;
                const scriptDeploy = deployState[script.id];
                const deployStatus = scriptDeploy?.status ?? 'idle';
                const isBootstrap = script.id === 'sql_bootstrap_exec';

                return (
                  <View
                    key={script.id}
                    style={[
                      styles.scriptCard,
                      deployStatus === 'success' && styles.scriptCardSuccess,
                      deployStatus === 'error' && styles.scriptCardError,
                      isBootstrap && styles.scriptCardBootstrap,
                    ]}
                  >
                    <View style={styles.scriptTop}>
                      <View style={styles.scriptInfo}>
                        <Text style={styles.scriptTitle} numberOfLines={2}>{script.title}</Text>
                        <Text style={styles.scriptFileName}>{script.fileName}</Text>
                        <View style={styles.scriptMeta}>
                          <Text style={styles.scriptLines}>{script.lineCount} lines</Text>
                          {script.version && (
                            <View style={styles.versionBadge}>
                              <Text style={styles.versionText}>{script.version}</Text>
                            </View>
                          )}
                          {script.updatedAt && (
                            <View style={styles.dateBadge}>
                              <Clock size={10} color={Colors.textTertiary} />
                              <Text style={styles.dateText}>{script.updatedAt}</Text>
                            </View>
                          )}
                        </View>
                        {deployStatus === 'error' && scriptDeploy?.message && (
                          <Text style={styles.deployErrorText} numberOfLines={2}>{scriptDeploy.message}</Text>
                        )}
                        {deployStatus === 'success' && (
                          <Text style={styles.deploySuccessText}>Deployed successfully</Text>
                        )}
                      </View>
                      <View style={styles.btnColumn}>
                        <TouchableOpacity
                          style={[styles.smallBtn, styles.copySmallBtn, isCopied && styles.copySmallBtnDone]}
                          onPress={() => handleCopy(script)}
                          activeOpacity={0.7}
                          testID={`copy-${script.id}`}
                        >
                          {isCopied ? <Check size={14} color="#062218" /> : <Copy size={14} color="#062218" />}
                          <Text style={styles.smallBtnText}>{isCopied ? 'Copied' : 'Copy'}</Text>
                        </TouchableOpacity>

                        {isBootstrap ? (
                          <TouchableOpacity
                            style={[
                              styles.smallBtn,
                              styles.deploySmallBtn,
                              deployStatus === 'deploying' && styles.deploySmallBtnActive,
                              deployStatus === 'success' && styles.deploySmallBtnSuccess,
                            ]}
                            onPress={() => handleCopy(script)}
                            activeOpacity={0.7}
                          >
                            <Copy size={14} color={Colors.text} />
                            <Text style={[styles.smallBtnText, { color: Colors.text }]}>Manual</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[
                              styles.smallBtn,
                              styles.deploySmallBtn,
                              deployStatus === 'deploying' && styles.deploySmallBtnActive,
                              deployStatus === 'success' && styles.deploySmallBtnSuccess,
                              deployStatus === 'error' && styles.deploySmallBtnError,
                              !isBootstrapReady && styles.deploySmallBtnDisabled,
                            ]}
                            onPress={() => handleDeploy(script)}
                            activeOpacity={0.7}
                            disabled={deployStatus === 'deploying' || !isBootstrapReady}
                            testID={`deploy-${script.id}`}
                          >
                            {deployStatus === 'deploying' ? (
                              <ActivityIndicator size="small" color="#00E676" />
                            ) : deployStatus === 'success' ? (
                              <>
                                <CheckCircle size={14} color="#00E676" />
                                <Text style={[styles.smallBtnText, { color: '#00E676' }]}>Done</Text>
                              </>
                            ) : deployStatus === 'error' ? (
                              <>
                                <AlertTriangle size={14} color="#FF5252" />
                                <Text style={[styles.smallBtnText, { color: '#FF5252' }]}>Retry</Text>
                              </>
                            ) : (
                              <>
                                <Play size={14} color={!isBootstrapReady ? Colors.textTertiary : '#00E676'} />
                                <Text style={[styles.smallBtnText, { color: !isBootstrapReady ? Colors.textTertiary : '#00E676' }]}>Deploy</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.expandBtn}
                      onPress={() => toggleExpand(script.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.expandBtnText}>{isExpanded ? 'Hide SQL' : 'Preview SQL'}</Text>
                      {isExpanded ? (
                        <ChevronUp size={14} color={Colors.textSecondary} />
                      ) : (
                        <ChevronDown size={14} color={Colors.textSecondary} />
                      )}
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.previewWrap}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.previewScroll}>
                          <Text style={styles.previewText} selectable>
                            {script.content}
                          </Text>
                        </ScrollView>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={styles.versionFooter}>
          <Text style={styles.versionFooterText}>Scripts {SCRIPTS_VERSION}</Text>
          {deployedCount > 0 && (
            <Text style={styles.versionFooterDeployed}>{deployedCount} deployed this session</Text>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  headerBadge: {
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  headerBadgeText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  bootstrapBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: '#1A0E00',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF6D00' + '40',
  },
  bootstrapBannerContent: {
    flex: 1,
  },
  bootstrapBannerTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#FF6D00',
    marginBottom: 4,
  },
  bootstrapBannerText: {
    fontSize: 12,
    color: '#B87A3D',
    lineHeight: 18,
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#0D2818',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00E676' + '30',
  },
  readyBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#00E676',
  },
  refreshBtn: {
    padding: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
  },
  copyAllBtnStyle: {
    backgroundColor: Colors.primary,
  },
  deployAllBtnStyle: {
    backgroundColor: '#00E676',
  },
  deployAllRunning: {
    backgroundColor: '#00E676' + '80',
  },
  actionBtnDone: {
    backgroundColor: '#00E676',
  },
  actionBtnDisabled: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#062218',
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00E676',
    borderRadius: 2,
  },
  progressFillError: {
    backgroundColor: '#FF9800',
  },
  filterRow: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary + '25',
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  content: {
    flex: 1,
  },
  categorySection: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  categoryIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  categoryCount: {
    backgroundColor: Colors.card,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  categoryCountText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  scriptCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  scriptCardSuccess: {
    borderColor: '#00E676' + '60',
  },
  scriptCardError: {
    borderColor: '#FF5252' + '60',
  },
  scriptCardBootstrap: {
    borderColor: '#FF6D00' + '60',
    borderWidth: 2,
  },
  scriptTop: {
    flexDirection: 'row',
    padding: 14,
    gap: 10,
  },
  scriptInfo: {
    flex: 1,
    gap: 4,
  },
  scriptTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    lineHeight: 20,
  },
  scriptFileName: {
    fontSize: 11,
    color: Colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scriptLines: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  scriptMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  versionBadge: {
    backgroundColor: '#00E676' + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  versionText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#00E676',
  },
  dateBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
  },
  dateText: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  deployErrorText: {
    fontSize: 11,
    color: '#FF5252',
    marginTop: 4,
  },
  deploySuccessText: {
    fontSize: 11,
    color: '#00E676',
    marginTop: 4,
  },
  btnColumn: {
    gap: 6,
    alignItems: 'stretch',
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    justifyContent: 'center',
  },
  copySmallBtn: {
    backgroundColor: Colors.primary,
  },
  copySmallBtnDone: {
    backgroundColor: '#00E676',
  },
  deploySmallBtn: {
    backgroundColor: '#0D2818',
    borderWidth: 1,
    borderColor: '#00E676' + '40',
  },
  deploySmallBtnActive: {
    backgroundColor: '#0D2818',
    borderColor: '#00E676',
  },
  deploySmallBtnSuccess: {
    backgroundColor: '#0D2818',
    borderColor: '#00E676',
  },
  deploySmallBtnError: {
    backgroundColor: '#1A0808',
    borderColor: '#FF5252' + '40',
  },
  deploySmallBtnDisabled: {
    backgroundColor: Colors.card,
    borderColor: Colors.border,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#062218',
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  expandBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  previewWrap: {
    backgroundColor: '#0D0D0D',
    maxHeight: 300,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  previewScroll: {
    padding: 12,
  },
  previewText: {
    fontSize: 11,
    color: '#8BC34A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  versionFooter: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  versionFooterText: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  versionFooterDeployed: {
    fontSize: 11,
    color: '#00E676',
    fontWeight: '600' as const,
  },
});
