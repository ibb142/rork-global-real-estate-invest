import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Code2,
  ChevronDown,
  ChevronRight,
  Copy,
  CheckCircle,
  MessageCircle,
  Mail,
  Share2,
  Printer,
  Download,
  Database,
  Lock,
  CreditCard,
  ShieldCheck,
  Bell,
  Brain,
  Building2,
  BarChart3,
  FileCheck,
  Plug,
  Clock,
  AlertTriangle,
  Zap,
  Filter,
  ExternalLink,
  FileText,
  Hash,
  ArrowLeft,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import {
  DEVELOPER_HANDOFF_CATEGORIES,
  getAllIntegrations,
  getAllEnvVariables,
  getTotalEstimatedHours,
  getCriticalCount,
  getReadyCount,
  getMockOnlyCount,
  generateHandoffTextReport,
  generateHandoffHtmlReport,
} from '@/mocks/developer-handoff';
import type { IntegrationPriority, IntegrationStatus } from '@/mocks/developer-handoff';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Database: <Database size={20} color="#3B82F6" />,
  Lock: <Lock size={20} color="#6366F1" />,
  CreditCard: <CreditCard size={20} color="#10B981" />,
  ShieldCheck: <ShieldCheck size={20} color="#F59E0B" />,
  Bell: <Bell size={20} color="#EC4899" />,
  Brain: <Brain size={20} color="#A855F7" />,
  Building2: <Building2 size={20} color="#F97316" />,
  BarChart3: <BarChart3 size={20} color="#0EA5E9" />,
  FileCheck: <FileCheck size={20} color="#78716C" />,
  Plug: <Plug size={20} color="#22C55E" />,
};

const PRIORITY_CONFIG: Record<IntegrationPriority, { color: string; label: string }> = {
  critical: { color: '#DC2626', label: 'CRITICAL' },
  high: { color: '#F59E0B', label: 'HIGH' },
  medium: { color: '#3B82F6', label: 'MEDIUM' },
  low: { color: '#6B7280', label: 'LOW' },
};

const STATUS_CONFIG: Record<IntegrationStatus, { color: string; label: string }> = {
  ready: { color: '#10B981', label: 'Ready' },
  mock_only: { color: '#F59E0B', label: 'Mock Only' },
  in_progress: { color: '#3B82F6', label: 'In Progress' },
  not_started: { color: '#6B7280', label: 'Not Started' },
};

export default function DeveloperHandoffScreen() {
  const router = useRouter();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [filterPriority, setFilterPriority] = useState<'all' | IntegrationPriority>('all');
  const [showEnvVars, setShowEnvVars] = useState(false);

  const allItems = useMemo(() => getAllIntegrations(), []);
  const allEnvVars = useMemo(() => getAllEnvVariables(), []);
  const totalHours = useMemo(() => getTotalEstimatedHours(), []);
  const criticalCount = useMemo(() => getCriticalCount(), []);
  const readyCount = useMemo(() => getReadyCount(), []);
  const mockCount = useMemo(() => getMockOnlyCount(), []);

  const filteredCategories = useMemo(() => {
    if (filterPriority === 'all') return DEVELOPER_HANDOFF_CATEGORIES;
    return DEVELOPER_HANDOFF_CATEGORIES.map(cat => ({
      ...cat,
      items: cat.items.filter(item => item.priority === filterPriority),
    })).filter(cat => cat.items.length > 0);
  }, [filterPriority]);

  const toggleCategory = useCallback((id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleItem = useCallback((id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const expandAllCategories = useCallback(() => {
    setExpandedCategories(new Set(DEVELOPER_HANDOFF_CATEGORIES.map(c => c.id)));
  }, []);

  const collapseAllCategories = useCallback(() => {
    setExpandedCategories(new Set());
    setExpandedItems(new Set());
  }, []);

  const handleCopyToClipboard = useCallback(async () => {
    try {
      const content = generateHandoffTextReport();
      await Clipboard.setStringAsync(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      Alert.alert('Copied!', 'Full developer integration guide copied to clipboard.');
    } catch (error) {
      console.log('Copy error:', error);
      Alert.alert('Error', 'Failed to copy. Please try again.');
    }
  }, []);

  const handleGeneratePDF = useCallback(async () => {
    setIsGeneratingPDF(true);
    try {
      const html = generateHandoffHtmlReport();
      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          setTimeout(() => printWindow.print(), 500);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        console.log('PDF generated at:', uri);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'IVXHOLDINGS Developer Integration Guide',
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('PDF Ready', 'PDF has been generated successfully.');
        }
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      Alert.alert('Error', 'Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  }, []);

  const handleShareWhatsApp = useCallback(async () => {
    const content = generateHandoffTextReport();
    const summary = `*IVXHOLDINGS Developer Integration Guide*\n\n` +
      `Total Integrations: ${allItems.length}\n` +
      `Critical: ${criticalCount}\n` +
      `Est. Hours: ${totalHours}h (~${Math.ceil(totalHours / 40)} weeks)\n` +
      `Env Variables: ${allEnvVars.length}\n\n` +
      `_Full integration list below:_\n\n`;

    try {
      if (Platform.OS === 'web') {
        const message = encodeURIComponent(summary + content.substring(0, 3000) + '\n\n...(truncated for WhatsApp)');
        window.open(`https://wa.me/?text=${message}`, '_blank');
      } else {
        const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(summary + content)}`;
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);
        } else {
          await Share.share({ message: summary + content });
        }
      }
    } catch (error) {
      console.log('WhatsApp share error:', error);
      await Share.share({ message: summary + content });
    }
  }, [allItems.length, criticalCount, totalHours, allEnvVars.length]);

  const handleShareEmail = useCallback(async () => {
    const content = generateHandoffTextReport();
    const subject = 'IVXHOLDINGS Luxury Holdings - Developer Integration Guide';

    try {
      if (Platform.OS === 'web') {
        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(content)}`;
        window.open(mailtoUrl, '_blank');
      } else {
        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(content)}`;
        const canOpen = await Linking.canOpenURL(mailtoUrl);
        if (canOpen) {
          await Linking.openURL(mailtoUrl);
        } else {
          await Share.share({ title: subject, message: content });
        }
      }
    } catch (error) {
      console.log('Email share error:', error);
      await Share.share({ message: content });
    }
  }, []);

  const handleShareGeneral = useCallback(async () => {
    try {
      const content = generateHandoffTextReport();
      await Share.share({
        title: 'IVXHOLDINGS Developer Integration Guide',
        message: content,
      });
    } catch (error) {
      console.log('Share error:', error);
    }
  }, []);

  const handleDownloadText = useCallback(() => {
    const content = generateHandoffTextReport();
    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IVXHOLDINGS-Developer-Guide-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      Share.share({
        title: 'IVXHOLDINGS Developer Integration Guide',
        message: content,
      });
    }
  }, []);

  const handleOpenDocs = useCallback((url: string) => {
    if (url) Linking.openURL(url);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <ArrowLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Developer Handoff</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Code2 size={36} color={Colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Integration Guide</Text>
          <Text style={styles.heroSubtitle}>
            Everything your developer needs to connect this app to production services
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{allItems.length}</Text>
            <Text style={styles.statLabel}>APIs</Text>
          </View>
          <View style={[styles.statBox, { borderColor: '#DC262640' }]}>
            <Text style={[styles.statNum, { color: '#DC2626' }]}>{criticalCount}</Text>
            <Text style={styles.statLabel}>Critical</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#F59E0B' }]}>{mockCount}</Text>
            <Text style={styles.statLabel}>Mocked</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#10B981' }]}>{readyCount}</Text>
            <Text style={styles.statLabel}>Ready</Text>
          </View>
        </View>

        <View style={styles.timeEstimate}>
          <Clock size={16} color={Colors.primary} />
          <Text style={styles.timeText}>
            Estimated: <Text style={styles.timeBold}>{totalHours} hours</Text> (~{Math.ceil(totalHours / 40)} developer-weeks)
          </Text>
        </View>

        <View style={styles.envVarsHeader}>
          <Hash size={16} color={Colors.primary} />
          <Text style={styles.timeText}>
            <Text style={styles.timeBold}>{allEnvVars.length}</Text> environment variables needed
          </Text>
        </View>

        <View style={styles.shareSection}>
          <Text style={styles.sectionTitle}>Share with Developer</Text>
          <View style={styles.shareRow}>
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: '#DC2626' }]}
              onPress={handleGeneratePDF}
              disabled={isGeneratingPDF}
              activeOpacity={0.8}
            >
              {isGeneratingPDF ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Printer size={16} color="#fff" />
              )}
              <Text style={styles.shareBtnText}>{isGeneratingPDF ? 'Creating...' : 'PDF'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: '#25D366' }]}
              onPress={handleShareWhatsApp}
              activeOpacity={0.8}
            >
              <MessageCircle size={16} color="#fff" />
              <Text style={styles.shareBtnText}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: '#EA4335' }]}
              onPress={handleShareEmail}
              activeOpacity={0.8}
            >
              <Mail size={16} color="#fff" />
              <Text style={styles.shareBtnText}>Email</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.shareRow}>
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: Colors.primary }]}
              onPress={handleCopyToClipboard}
              activeOpacity={0.8}
            >
              {copied ? <CheckCircle size={16} color={Colors.background} /> : <Copy size={16} color={Colors.background} />}
              <Text style={[styles.shareBtnText, { color: Colors.background }]}>{copied ? 'Copied!' : 'Copy All'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: '#3B82F6' }]}
              onPress={handleDownloadText}
              activeOpacity={0.8}
            >
              <Download size={16} color="#fff" />
              <Text style={styles.shareBtnText}>Text File</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: '#8B5CF6' }]}
              onPress={handleShareGeneral}
              activeOpacity={0.8}
            >
              <Share2 size={16} color="#fff" />
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.filterSection}>
          <View style={styles.filterRow}>
            <Filter size={14} color={Colors.textSecondary} />
            <Text style={styles.filterLabel}>Priority:</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterChips}>
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.chip,
                    filterPriority === p && styles.chipActive,
                    filterPriority === p && p === 'critical' && { backgroundColor: '#DC2626' },
                    filterPriority === p && p === 'high' && { backgroundColor: '#F59E0B' },
                    filterPriority === p && p === 'medium' && { backgroundColor: '#3B82F6' },
                    filterPriority === p && p === 'low' && { backgroundColor: '#6B7280' },
                  ]}
                  onPress={() => setFilterPriority(p)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.chipText,
                    filterPriority === p && styles.chipTextActive,
                  ]}>
                    {p === 'all' ? `All (${allItems.length})` : `${p.charAt(0).toUpperCase() + p.slice(1)} (${allItems.filter(i => i.priority === p).length})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.listSection}>
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>
              Integrations ({filteredCategories.reduce((s, c) => s + c.items.length, 0)})
            </Text>
            <View style={styles.expandBtns}>
              <TouchableOpacity onPress={expandAllCategories} style={styles.expandBtn}>
                <Text style={styles.expandBtnText}>Expand</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={collapseAllCategories} style={styles.collapseBtn}>
                <Text style={styles.collapseBtnText}>Collapse</Text>
              </TouchableOpacity>
            </View>
          </View>

          {filteredCategories.map(cat => {
            const isExpanded = expandedCategories.has(cat.id);
            const catHours = cat.items.reduce((s, i) => s + i.estimatedHours, 0);
            return (
              <View key={cat.id} style={styles.catCard}>
                <TouchableOpacity
                  style={styles.catHeader}
                  onPress={() => toggleCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.catLeft}>
                    <View style={[styles.catIconWrap, { backgroundColor: `${cat.color}18` }]}>
                      {CATEGORY_ICONS[cat.icon] || <Code2 size={20} color={cat.color} />}
                    </View>
                    <View style={styles.catInfo}>
                      <Text style={styles.catTitle}>{cat.title}</Text>
                      <Text style={styles.catMeta}>
                        {cat.items.length} items · {catHours}h est.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.catRight}>
                    <View style={styles.catBadge}>
                      <Text style={styles.catBadgeText}>{cat.items.length}</Text>
                    </View>
                    {isExpanded ? (
                      <ChevronDown size={18} color={Colors.textSecondary} />
                    ) : (
                      <ChevronRight size={18} color={Colors.textSecondary} />
                    )}
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.catBody}>
                    {cat.items.map(item => {
                      const isItemExpanded = expandedItems.has(item.id);
                      const pConfig = PRIORITY_CONFIG[item.priority];
                      const sConfig = STATUS_CONFIG[item.status];
                      return (
                        <View key={item.id} style={styles.itemCard}>
                          <TouchableOpacity
                            style={styles.itemHeader}
                            onPress={() => toggleItem(item.id)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.itemLeft}>
                              <Text style={styles.itemName}>{item.name}</Text>
                              <Text style={styles.itemProvider}>{item.provider}</Text>
                            </View>
                            <View style={styles.itemBadges}>
                              <View style={[styles.badge, { backgroundColor: `${pConfig.color}20` }]}>
                                <Text style={[styles.badgeText, { color: pConfig.color }]}>{pConfig.label}</Text>
                              </View>
                              <View style={[styles.badge, { backgroundColor: `${sConfig.color}20` }]}>
                                <Text style={[styles.badgeText, { color: sConfig.color }]}>{sConfig.label}</Text>
                              </View>
                            </View>
                          </TouchableOpacity>

                          {isItemExpanded && (
                            <View style={styles.itemBody}>
                              <Text style={styles.itemDesc}>{item.description}</Text>

                              <View style={styles.itemMeta}>
                                <Clock size={13} color={Colors.textSecondary} />
                                <Text style={styles.itemMetaText}>Est. {item.estimatedHours} hours</Text>
                              </View>

                              {item.envVariables.length > 0 && (
                                <View style={styles.envBlock}>
                                  <Text style={styles.envBlockTitle}>Environment Variables ({item.envVariables.length})</Text>
                                  {item.envVariables.map(env => (
                                    <View key={env.name} style={styles.envRow}>
                                      <Text style={styles.envName}>
                                        {env.name}
                                        {env.required && <Text style={styles.envRequired}> *</Text>}
                                      </Text>
                                      <Text style={styles.envDesc}>{env.description}</Text>
                                      <Text style={styles.envExample}>{env.example}</Text>
                                    </View>
                                  ))}
                                </View>
                              )}

                              {item.endpoints.length > 0 && (
                                <View style={styles.endpointBlock}>
                                  <Text style={styles.envBlockTitle}>Endpoints / Screens</Text>
                                  {item.endpoints.map((ep, idx) => (
                                    <Text key={idx} style={styles.endpointText}>· {ep}</Text>
                                  ))}
                                </View>
                              )}

                              {item.notes ? (
                                <View style={styles.notesBlock}>
                                  <AlertTriangle size={13} color="#F59E0B" />
                                  <Text style={styles.notesText}>{item.notes}</Text>
                                </View>
                              ) : null}

                              {item.docsUrl ? (
                                <TouchableOpacity
                                  style={styles.docsLink}
                                  onPress={() => handleOpenDocs(item.docsUrl)}
                                  activeOpacity={0.7}
                                >
                                  <ExternalLink size={13} color={Colors.primary} />
                                  <Text style={styles.docsLinkText}>Open Documentation</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.envVarsToggle}
          onPress={() => setShowEnvVars(!showEnvVars)}
          activeOpacity={0.7}
        >
          <View style={styles.envVarsToggleLeft}>
            <FileText size={18} color={Colors.primary} />
            <Text style={styles.envVarsToggleText}>
              All Environment Variables ({allEnvVars.length})
            </Text>
          </View>
          {showEnvVars ? (
            <ChevronDown size={18} color={Colors.textSecondary} />
          ) : (
            <ChevronRight size={18} color={Colors.textSecondary} />
          )}
        </TouchableOpacity>

        {showEnvVars && (
          <View style={styles.envVarsList}>
            {allEnvVars.map(env => (
              <View key={env.name} style={styles.envVarItem}>
                <View style={styles.envVarHeader}>
                  <Text style={styles.envVarName}>{env.name}</Text>
                  {env.required && (
                    <View style={[styles.badge, { backgroundColor: '#DC262620' }]}>
                      <Text style={[styles.badgeText, { color: '#DC2626' }]}>REQUIRED</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.envVarDesc}>{env.description}</Text>
                <Text style={styles.envVarExample}>{env.example}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.prioritySummary}>
          <Text style={styles.sectionTitle}>Priority Roadmap</Text>

          <View style={styles.roadmapCard}>
            <View style={styles.roadmapPhase}>
              <View style={[styles.phaseIndicator, { backgroundColor: '#DC2626' }]} />
              <View style={styles.phaseContent}>
                <Text style={styles.phaseTitle}>Phase 1 - Launch Critical</Text>
                <Text style={styles.phaseDesc}>
                  {allItems.filter(i => i.priority === 'critical').map(i => i.name).join(', ')}
                </Text>
                <Text style={styles.phaseHours}>
                  {allItems.filter(i => i.priority === 'critical').reduce((s, i) => s + i.estimatedHours, 0)}h estimated
                </Text>
              </View>
            </View>

            <View style={styles.roadmapDivider} />

            <View style={styles.roadmapPhase}>
              <View style={[styles.phaseIndicator, { backgroundColor: '#F59E0B' }]} />
              <View style={styles.phaseContent}>
                <Text style={styles.phaseTitle}>Phase 2 - Post-Launch</Text>
                <Text style={styles.phaseDesc}>
                  {allItems.filter(i => i.priority === 'high').map(i => i.name).join(', ')}
                </Text>
                <Text style={styles.phaseHours}>
                  {allItems.filter(i => i.priority === 'high').reduce((s, i) => s + i.estimatedHours, 0)}h estimated
                </Text>
              </View>
            </View>

            <View style={styles.roadmapDivider} />

            <View style={styles.roadmapPhase}>
              <View style={[styles.phaseIndicator, { backgroundColor: '#3B82F6' }]} />
              <View style={styles.phaseContent}>
                <Text style={styles.phaseTitle}>Phase 3 - Growth</Text>
                <Text style={styles.phaseDesc}>
                  {allItems.filter(i => i.priority === 'medium').map(i => i.name).join(', ')}
                </Text>
                <Text style={styles.phaseHours}>
                  {allItems.filter(i => i.priority === 'medium').reduce((s, i) => s + i.estimatedHours, 0)}h estimated
                </Text>
              </View>
            </View>

            <View style={styles.roadmapDivider} />

            <View style={styles.roadmapPhase}>
              <View style={[styles.phaseIndicator, { backgroundColor: '#6B7280' }]} />
              <View style={styles.phaseContent}>
                <Text style={styles.phaseTitle}>Phase 4 - Optional</Text>
                <Text style={styles.phaseDesc}>
                  {allItems.filter(i => i.priority === 'low').map(i => i.name).join(', ')}
                </Text>
                <Text style={styles.phaseHours}>
                  {allItems.filter(i => i.priority === 'low').reduce((s, i) => s + i.estimatedHours, 0)}h estimated
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Zap size={18} color={Colors.primary} />
          <View style={styles.infoBoxContent}>
            <Text style={styles.infoBoxTitle}>Quick Start for Developers</Text>
            <Text style={styles.infoBoxText}>
              1. Set up PostgreSQL database and run migrations{'\n'}
              2. Configure Stripe + Plaid for payments{'\n'}
              3. Set up Firebase Auth or Auth0{'\n'}
              4. Connect KYC provider (Persona/Jumio){'\n'}
              5. Configure push notifications (Expo Push){'\n'}
              6. Set up Sentry for error tracking{'\n'}
              7. Deploy backend to Vercel/Railway
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>IVXHOLDINGS Luxury Holdings</Text>
          <Text style={styles.footerText}>Developer Integration Guide</Text>
          <Text style={styles.footerDate}>Last Updated: {new Date().toLocaleDateString()}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backButton: { padding: 8 },
  topBarTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  hero: { gap: 4 },
  heroIconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heroTitle: { color: Colors.text, fontSize: 22, fontWeight: '800' as const, textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { color: Colors.text, fontSize: 22, fontWeight: '800' as const, textAlign: 'center', marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.surfaceBorder },
  statNum: { color: Colors.text, fontSize: 18, fontWeight: '800' as const },
  statLabel: { color: Colors.textTertiary, fontSize: 11 },
  timeEstimate: { gap: 4 },
  envVarsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  timeText: { color: Colors.textSecondary, fontSize: 13 },
  timeBold: { gap: 4 },
  shareSection: { marginBottom: 16 },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const, marginBottom: 12 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareBtn: { padding: 8 },
  shareBtnText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  filterSection: { marginBottom: 12 },
  filterRow: { marginBottom: 12 },
  filterLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, marginBottom: 8 },
  filterChips: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: Colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.surfaceBorder },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: Colors.black },
  listSection: { marginBottom: 16 },
  listHeader: { color: Colors.text, fontSize: 16, fontWeight: '700' as const, marginBottom: 12 },
  expandBtns: { gap: 4 },
  expandBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  expandBtnText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  collapseBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  collapseBtnText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  catCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  catIconWrap: { gap: 4 },
  catInfo: { flex: 1 },
  catTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  catMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catRight: { alignItems: 'flex-end' },
  catBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  catBadgeText: { fontSize: 11, fontWeight: '700' as const },
  catBody: { gap: 8 },
  itemCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  itemName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  itemProvider: { gap: 4 },
  itemBadges: { gap: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' as const },
  itemBody: { gap: 8 },
  itemDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemMetaText: { color: Colors.textSecondary, fontSize: 13 },
  envBlock: { gap: 4 },
  envBlockTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  envRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  envName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  envRequired: { gap: 4 },
  envDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  envExample: { gap: 4 },
  endpointBlock: { gap: 4 },
  endpointText: { color: Colors.textSecondary, fontSize: 13 },
  notesBlock: { gap: 4 },
  notesText: { color: Colors.textSecondary, fontSize: 13 },
  docsLink: { gap: 4 },
  docsLinkText: { color: Colors.textSecondary, fontSize: 13 },
  envVarsToggle: { gap: 4 },
  envVarsToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  envVarsToggleText: { color: Colors.textSecondary, fontSize: 13 },
  envVarsList: { gap: 8 },
  envVarItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  envVarHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  envVarName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  envVarDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  envVarExample: { gap: 4 },
  prioritySummary: { gap: 4 },
  roadmapCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  roadmapPhase: { gap: 4 },
  phaseIndicator: { width: 4, borderRadius: 2 },
  phaseContent: { flex: 1, gap: 4 },
  phaseTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  phaseDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  phaseHours: { gap: 4 },
  roadmapDivider: { width: 1, height: 24, backgroundColor: Colors.surfaceBorder },
  infoBox: { backgroundColor: Colors.info + '10', borderRadius: 12, padding: 14 },
  infoBoxContent: { flex: 1, gap: 4 },
  infoBoxTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  infoBoxText: { color: Colors.textSecondary, fontSize: 13 },
  footer: { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, backgroundColor: Colors.background },
  footerTitle: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, textAlign: 'center', marginBottom: 4 },
  footerText: { color: Colors.textTertiary, fontSize: 12, textAlign: 'center' },
  footerDate: { color: Colors.textTertiary, fontSize: 11, textAlign: 'center', marginTop: 4 },
});
