import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Animated,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  FileText,
  Users,
  DollarSign,
  Shield,
  Scale,
  CheckCircle,
  TrendingUp,
  Briefcase,
  PieChart,
  Handshake,
  Eye,
  Download,
  MessageCircle,
  Sparkles,
  MapPin,
  UserCheck,
  FileCheck,
  Gavel,
} from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import Colors from '@/constants/colors';
import {
  JVAgreement,
  JVPartner,
  JV_AGREEMENT_TYPES,
  EXIT_STRATEGIES,
  DISTRIBUTION_FREQUENCIES,
  SAMPLE_JV_AGREEMENTS,
  JV_CLAUSES,
} from '@/mocks/jv-agreements';

type ScreenMode = 'list' | 'create' | 'detail' | 'preview';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: '#9A9A9A', bg: '#9A9A9A20' },
  pending_review: { label: 'Pending Review', color: '#FFB800', bg: '#FFB80020' },
  active: { label: 'Active', color: '#00C48C', bg: '#00C48C20' },
  completed: { label: 'Completed', color: '#4A90D9', bg: '#4A90D920' },
  expired: { label: 'Expired', color: '#FF4D4D', bg: '#FF4D4D20' },
};

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  lead: { label: 'Lead Partner', color: '#FFD700' },
  'co-investor': { label: 'Co-Investor', color: '#4A90D9' },
  silent: { label: 'Silent Partner', color: '#9A9A9A' },
  managing: { label: 'Managing Partner', color: '#00C48C' },
};

function generateJVNumber(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `JV-${y}${m}-${rand}`;
}

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function generateJVContractHTML(agreement: JVAgreement): string {
  const partnersHTML = agreement.partners.map((p, i) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #2a2a2a;color:#fff;">${i + 1}. ${p.name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #2a2a2a;color:#FFD700;font-weight:700;">${ROLE_CONFIG[p.role]?.label || p.role}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #2a2a2a;color:#00C48C;font-weight:700;">${formatCurrency(p.contribution, agreement.currency)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #2a2a2a;color:#4A90D9;font-weight:700;">${p.equityShare}%</td>
      <td style="padding:10px 14px;border-bottom:1px solid #2a2a2a;color:#9a9a9a;">${p.location}</td>
    </tr>
  `).join('');

  const clausesHTML = Object.values(JV_CLAUSES).map(c => `
    <div style="margin-bottom:12px;padding:14px;background:#141414;border-radius:10px;border:1px solid #2a2a2a;">
      <h4 style="color:#FFD700;margin:0 0 6px 0;font-size:14px;">${c.title}</h4>
      <p style="color:#9a9a9a;margin:0;font-size:13px;line-height:1.5;">${c.description}</p>
    </div>
  `).join('');

  const profitSplitHTML = agreement.profitSplit.map(ps => {
    const partner = agreement.partners.find(p => p.id === ps.partnerId);
    return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1a1a1a;">
      <span style="color:#fff;">${partner?.name || 'Unknown'}</span>
      <span style="color:#00C48C;font-weight:700;">${ps.percentage}%</span>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JV Agreement — ${agreement.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0A0A0A; color: #fff; padding: 40px; }
    .header { text-align: center; margin-bottom: 40px; padding-bottom: 30px; border-bottom: 2px solid #FFD700; }
    .logo { font-size: 28px; font-weight: 900; color: #FFD700; letter-spacing: 3px; }
    .subtitle { color: #9a9a9a; font-size: 14px; margin-top: 8px; }
    .agreement-title { font-size: 24px; font-weight: 800; margin-top: 16px; }
    .badge { display: inline-block; background: #FFD70020; color: #FFD700; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 1px; margin-top: 12px; }
    .section { margin-bottom: 30px; }
    .section-title { color: #FFD700; font-size: 18px; font-weight: 700; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #2a2a2a; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .info-item { background: #141414; border-radius: 10px; padding: 14px; border: 1px solid #2a2a2a; }
    .info-label { color: #6a6a6a; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .info-value { color: #fff; font-size: 16px; font-weight: 700; }
    .info-value.gold { color: #FFD700; }
    .info-value.green { color: #00C48C; }
    table { width: 100%; border-collapse: collapse; background: #141414; border-radius: 10px; overflow: hidden; }
    th { background: #1a1a1a; color: #FFD700; padding: 12px 14px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .signature-section { margin-top: 40px; padding-top: 30px; border-top: 2px solid #2a2a2a; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 20px; }
    .sig-box { border: 1px dashed #2a2a2a; border-radius: 10px; padding: 20px; text-align: center; }
    .sig-line { border-bottom: 1px solid #6a6a6a; margin: 30px 0 10px; }
    .sig-name { color: #9a9a9a; font-size: 13px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #2a2a2a; color: #6a6a6a; font-size: 11px; }
    @media print { body { background: #fff; color: #000; } .section-title { color: #1a3a5c; } th { background: #f0f0f0; color: #1a3a5c; } .info-item { background: #f8f8f8; border-color: #e0e0e0; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">IVXHOLDINGS</div>
    <div class="subtitle">Joint Venture Agreement</div>
    <div class="agreement-title">${agreement.title}</div>
    <div class="badge">JV-${agreement.id.toUpperCase()} | ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  </div>

  <div class="section">
    <div class="section-title">Agreement Overview</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Project</div><div class="info-value">${agreement.projectName}</div></div>
      <div class="info-item"><div class="info-label">Type</div><div class="info-value gold">${JV_AGREEMENT_TYPES.find(t => t.id === agreement.type)?.label || agreement.type}</div></div>
      <div class="info-item"><div class="info-label">Total Investment</div><div class="info-value green">${formatCurrency(agreement.totalInvestment, agreement.currency)}</div></div>
      <div class="info-item"><div class="info-label">Expected ROI</div><div class="info-value green">${agreement.expectedROI}%</div></div>
      <div class="info-item"><div class="info-label">Start Date</div><div class="info-value">${agreement.startDate}</div></div>
      <div class="info-item"><div class="info-label">End Date</div><div class="info-value">${agreement.endDate}</div></div>
      <div class="info-item"><div class="info-label">Distribution</div><div class="info-value">${agreement.distributionFrequency}</div></div>
      <div class="info-item"><div class="info-label">Exit Strategy</div><div class="info-value">${agreement.exitStrategy}</div></div>
    </div>
  </div>

  ${agreement.propertyAddress ? `<div class="section"><div class="section-title">Property</div><div class="info-item"><div class="info-label">Address</div><div class="info-value">${agreement.propertyAddress}</div></div><p style="color:#9a9a9a;margin-top:12px;line-height:1.6;">${agreement.description}</p></div>` : ''}

  <div class="section">
    <div class="section-title">Partners & Capital Structure</div>
    <table>
      <thead><tr><th>Partner</th><th>Role</th><th>Contribution</th><th>Equity</th><th>Location</th></tr></thead>
      <tbody>${partnersHTML}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Profit Distribution</div>
    ${profitSplitHTML}
  </div>

  <div class="section">
    <div class="section-title">Fee Structure</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Management Fee</div><div class="info-value">${agreement.managementFee}% p.a.</div></div>
      <div class="info-item"><div class="info-label">Performance Fee</div><div class="info-value">${agreement.performanceFee}% above hurdle</div></div>
      <div class="info-item"><div class="info-label">Min Hold Period</div><div class="info-value">${agreement.minimumHoldPeriod} months</div></div>
      <div class="info-item"><div class="info-label">Non-Compete</div><div class="info-value">${agreement.nonCompetePeriod} months</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Legal Provisions</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Governing Law</div><div class="info-value">${agreement.governingLaw}</div></div>
      <div class="info-item"><div class="info-label">Dispute Resolution</div><div class="info-value">${agreement.disputeResolution}</div></div>
      <div class="info-item"><div class="info-label">Confidentiality</div><div class="info-value">${agreement.confidentialityPeriod} months</div></div>
      <div class="info-item"><div class="info-label">Non-Compete</div><div class="info-value">${agreement.nonCompetePeriod} months</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Key Clauses</div>
    ${clausesHTML}
  </div>

  <div class="signature-section">
    <div class="section-title">Signatures</div>
    <div class="sig-grid">
      ${agreement.partners.map(p => `
        <div class="sig-box">
          <div style="color:#FFD700;font-weight:700;margin-bottom:4px;">${ROLE_CONFIG[p.role]?.label || p.role}</div>
          <div class="sig-line"></div>
          <div class="sig-name">${p.name}</div>
          <div style="color:#6a6a6a;font-size:11px;margin-top:4px;">Date: _______________</div>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="footer">
    <p>This Joint Venture Agreement is confidential and proprietary to the parties named herein.</p>
    <p style="margin-top:8px;">IVXHOLDINGS Global Investments — JV Agreement System</p>
    <p style="margin-top:4px;">Generated: ${new Date().toISOString()}</p>
  </div>
</body>
</html>`;
}

export default function JVAgreementScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [mode, setMode] = useState<ScreenMode>('list');
  const [agreements, setAgreements] = useState<JVAgreement[]>(SAMPLE_JV_AGREEMENTS);
  const [selectedAgreement, setSelectedAgreement] = useState<JVAgreement | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    partners: false,
    terms: false,
    fees: false,
    legal: false,
    clauses: false,
  });

  const [formTitle, setFormTitle] = useState<string>('');
  const [formProjectName, setFormProjectName] = useState<string>('');
  const [formType, setFormType] = useState<string>('equity_split');
  const [formTotalInvestment, setFormTotalInvestment] = useState<string>('');
  const [formCurrency, setFormCurrency] = useState<string>('USD');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formPropertyAddress, setFormPropertyAddress] = useState<string>('');
  const [formExpectedROI, setFormExpectedROI] = useState<string>('');
  const [formDistribution, setFormDistribution] = useState<string>('quarterly');
  const [formExitStrategy, setFormExitStrategy] = useState<string>(EXIT_STRATEGIES[0]);
  const [formGoverningLaw, setFormGoverningLaw] = useState<string>('State of New York, USA');
  const [formDisputeResolution, setFormDisputeResolution] = useState<string>('Arbitration — JAMS');
  const [formConfidentiality, setFormConfidentiality] = useState<string>('60');
  const [formNonCompete, setFormNonCompete] = useState<string>('24');
  const [formManagementFee, setFormManagementFee] = useState<string>('2.0');
  const [formPerformanceFee, setFormPerformanceFee] = useState<string>('20.0');
  const [formMinHold, setFormMinHold] = useState<string>('12');
  const [formStartDate, setFormStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formEndDate, setFormEndDate] = useState<string>('');

  const [partners, setPartners] = useState<JVPartner[]>([
    { id: 'new-p1', name: 'IVX Holdings LLC', role: 'lead', contribution: 0, equityShare: 50, location: 'New York, USA', verified: true },
  ]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [mode, fadeAnim, slideAnim]);

  const filteredAgreements = useMemo(() => {
    if (activeFilter === 'all') return agreements;
    return agreements.filter(a => a.status === activeFilter);
  }, [agreements, activeFilter]);

  const totalPortfolioValue = useMemo(() => {
    return agreements.reduce((sum, a) => sum + a.totalInvestment, 0);
  }, [agreements]);

  const activeDeals = useMemo(() => {
    return agreements.filter(a => a.status === 'active').length;
  }, [agreements]);

  const avgROI = useMemo(() => {
    if (agreements.length === 0) return 0;
    return agreements.reduce((sum, a) => sum + a.expectedROI, 0) / agreements.length;
  }, [agreements]);

  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const addPartner = useCallback(() => {
    const newId = `new-p${partners.length + 1}-${Date.now()}`;
    setPartners(prev => [...prev, {
      id: newId,
      name: '',
      role: 'co-investor',
      contribution: 0,
      equityShare: 0,
      location: '',
      verified: false,
    }]);
  }, [partners.length]);

  const removePartner = useCallback((index: number) => {
    if (partners.length <= 1) {
      Alert.alert('Required', 'At least one partner is required.');
      return;
    }
    setPartners(prev => prev.filter((_, i) => i !== index));
  }, [partners.length]);

  const updatePartner = useCallback((index: number, field: keyof JVPartner, value: string | number) => {
    setPartners(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }, []);

  const resetForm = useCallback(() => {
    setFormTitle('');
    setFormProjectName('');
    setFormType('equity_split');
    setFormTotalInvestment('');
    setFormCurrency('USD');
    setFormDescription('');
    setFormPropertyAddress('');
    setFormExpectedROI('');
    setFormDistribution('quarterly');
    setFormExitStrategy(EXIT_STRATEGIES[0]);
    setFormGoverningLaw('State of New York, USA');
    setFormDisputeResolution('Arbitration — JAMS');
    setFormConfidentiality('60');
    setFormNonCompete('24');
    setFormManagementFee('2.0');
    setFormPerformanceFee('20.0');
    setFormMinHold('12');
    setFormStartDate(new Date().toISOString().split('T')[0]);
    setFormEndDate('');
    setPartners([{
      id: 'new-p1',
      name: 'IVX Holdings LLC',
      role: 'lead',
      contribution: 0,
      equityShare: 50,
      location: 'New York, USA',
      verified: true,
    }]);
  }, []);

  const handleCreateAgreement = useCallback(() => {
    if (!formTitle.trim() || !formProjectName.trim() || !formTotalInvestment.trim()) {
      Alert.alert('Required Fields', 'Please fill in the agreement title, project name, and total investment.');
      return;
    }

    const totalEquity = partners.reduce((sum, p) => sum + p.equityShare, 0);
    if (totalEquity !== 100) {
      Alert.alert('Equity Error', `Total equity must equal 100%. Currently: ${totalEquity}%`);
      return;
    }

    const newAgreement: JVAgreement = {
      id: generateJVNumber(),
      title: formTitle.trim(),
      projectName: formProjectName.trim(),
      status: 'draft',
      type: formType as JVAgreement['type'],
      totalInvestment: parseFloat(formTotalInvestment) || 0,
      currency: formCurrency,
      partners: partners.map(p => ({ ...p })),
      profitSplit: partners.map(p => ({ partnerId: p.id, percentage: p.equityShare })),
      startDate: formStartDate,
      endDate: formEndDate || new Date(new Date(formStartDate).getTime() + 365 * 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString().split('T')[0],
      propertyAddress: formPropertyAddress.trim() || undefined,
      expectedROI: parseFloat(formExpectedROI) || 15,
      distributionFrequency: formDistribution as JVAgreement['distributionFrequency'],
      exitStrategy: formExitStrategy,
      governingLaw: formGoverningLaw,
      disputeResolution: formDisputeResolution,
      confidentialityPeriod: parseInt(formConfidentiality) || 60,
      nonCompetePeriod: parseInt(formNonCompete) || 24,
      managementFee: parseFloat(formManagementFee) || 2,
      performanceFee: parseFloat(formPerformanceFee) || 20,
      minimumHoldPeriod: parseInt(formMinHold) || 12,
      description: formDescription.trim(),
    };

    setAgreements(prev => [newAgreement, ...prev]);
    resetForm();
    setMode('list');
    Alert.alert('JV Agreement Created', `"${newAgreement.title}" has been created as a draft.`);
  }, [formTitle, formProjectName, formTotalInvestment, formCurrency, formType, formDescription, formPropertyAddress, formExpectedROI, formDistribution, formExitStrategy, formGoverningLaw, formDisputeResolution, formConfidentiality, formNonCompete, formManagementFee, formPerformanceFee, formMinHold, formStartDate, formEndDate, partners, resetForm]);

  const handleExportPDF = useCallback(async (agreement: JVAgreement) => {
    setIsGenerating(true);
    try {
      const html = generateJVContractHTML(agreement);
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        console.log('[JV Agreement] PDF created:', uri);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `JV Agreement — ${agreement.title}` });
        } else {
          Alert.alert('PDF Generated', `File: ${uri}`);
        }
      }
    } catch (error) {
      console.log('[JV Agreement] Export error:', error);
      Alert.alert('Error', 'Failed to generate PDF.');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handlePreview = useCallback(async (agreement: JVAgreement) => {
    try {
      const html = generateJVContractHTML(agreement);
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); }
      } else {
        await Print.printAsync({ html });
      }
    } catch (error) {
      console.log('[JV Agreement] Preview error:', error);
    }
  }, []);

  const handleShareWhatsApp = useCallback(async (agreement: JVAgreement) => {
    const msg = `IVXHOLDINGS — Joint Venture Agreement\n\n` +
      `Project: ${agreement.title}\n` +
      `Total Investment: ${formatCurrency(agreement.totalInvestment, agreement.currency)}\n` +
      `Expected ROI: ${agreement.expectedROI}%\n` +
      `Partners: ${agreement.partners.length}\n` +
      `Type: ${JV_AGREEMENT_TYPES.find(t => t.id === agreement.type)?.label}\n\n` +
      `Partners:\n${agreement.partners.map(p => `- ${p.name} (${p.equityShare}% equity)`).join('\n')}\n\n` +
      `Status: ${STATUS_CONFIG[agreement.status]?.label || agreement.status}\n` +
      `Distribution: ${agreement.distributionFrequency}\n` +
      `Exit Strategy: ${agreement.exitStrategy}`;

    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        const supported = await Linking.canOpenURL(url);
        if (supported) await Linking.openURL(url);
      }
    } catch (error) {
      console.log('[JV Agreement] WhatsApp error:', error);
    }
  }, []);

  const renderInput = useCallback((label: string, value: string, onChangeText: (t: string) => void, opts?: { multiline?: boolean; keyboardType?: 'default' | 'numeric' | 'email-address'; placeholder?: string }) => (
    <View style={st.inputGroup}>
      <Text style={st.inputLabel}>{label}</Text>
      <TextInput
        style={[st.input, opts?.multiline && st.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={Colors.inputPlaceholder}
        placeholder={opts?.placeholder || label}
        multiline={opts?.multiline}
        keyboardType={opts?.keyboardType || 'default'}
        numberOfLines={opts?.multiline ? 4 : 1}
        textAlignVertical={opts?.multiline ? 'top' : 'center'}
      />
    </View>
  ), []);

  const renderSectionHeader = useCallback((key: string, title: string, icon: React.ReactNode) => (
    <TouchableOpacity style={st.sectionHeader} onPress={() => toggleSection(key)} activeOpacity={0.7}>
      <View style={st.sectionHeaderLeft}>
        <View style={st.sectionIcon}>{icon}</View>
        <Text style={st.sectionHeaderTitle}>{title}</Text>
      </View>
      {expandedSections[key] ? <ChevronUp size={20} color={Colors.textSecondary} /> : <ChevronDown size={20} color={Colors.textSecondary} />}
    </TouchableOpacity>
  ), [expandedSections, toggleSection]);

  const renderPortfolioStats = () => (
    <View style={st.statsRow}>
      <View style={st.statCard}>
        <View style={[st.statIconWrap, { backgroundColor: '#FFD70015' }]}>
          <DollarSign size={18} color="#FFD700" />
        </View>
        <Text style={st.statValue}>${(totalPortfolioValue / 1000000).toFixed(1)}M</Text>
        <Text style={st.statLabel}>Portfolio Value</Text>
      </View>
      <View style={st.statCard}>
        <View style={[st.statIconWrap, { backgroundColor: '#00C48C15' }]}>
          <Handshake size={18} color="#00C48C" />
        </View>
        <Text style={st.statValue}>{activeDeals}</Text>
        <Text style={st.statLabel}>Active Deals</Text>
      </View>
      <View style={st.statCard}>
        <View style={[st.statIconWrap, { backgroundColor: '#4A90D915' }]}>
          <TrendingUp size={18} color="#4A90D9" />
        </View>
        <Text style={st.statValue}>{avgROI.toFixed(1)}%</Text>
        <Text style={st.statLabel}>Avg ROI</Text>
      </View>
    </View>
  );

  const renderFilters = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filtersRow}>
      {[
        { id: 'all', label: 'All' },
        { id: 'active', label: 'Active' },
        { id: 'draft', label: 'Drafts' },
        { id: 'pending_review', label: 'Pending' },
        { id: 'completed', label: 'Completed' },
      ].map(f => (
        <TouchableOpacity
          key={f.id}
          style={[st.filterChip, activeFilter === f.id && st.filterChipActive]}
          onPress={() => setActiveFilter(f.id)}
          activeOpacity={0.7}
        >
          <Text style={[st.filterChipText, activeFilter === f.id && st.filterChipTextActive]}>{f.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderAgreementCard = (agreement: JVAgreement) => {
    const statusCfg = STATUS_CONFIG[agreement.status] || STATUS_CONFIG.draft;
    const typeCfg = JV_AGREEMENT_TYPES.find(t => t.id === agreement.type);

    return (
      <TouchableOpacity
        key={agreement.id}
        style={st.agreementCard}
        onPress={() => { setSelectedAgreement(agreement); setMode('detail'); }}
        activeOpacity={0.8}
        testID={`jv-card-${agreement.id}`}
      >
        <View style={st.cardTopRow}>
          <View style={[st.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <View style={[st.statusDot, { backgroundColor: statusCfg.color }]} />
            <Text style={[st.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
          <Text style={st.cardType}>{typeCfg?.icon} {typeCfg?.label}</Text>
        </View>

        <Text style={st.cardTitle}>{agreement.title}</Text>
        <Text style={st.cardProject}>{agreement.projectName}</Text>

        {agreement.propertyAddress && (
          <View style={st.cardLocationRow}>
            <MapPin size={12} color={Colors.textTertiary} />
            <Text style={st.cardLocation} numberOfLines={1}>{agreement.propertyAddress}</Text>
          </View>
        )}

        <View style={st.cardMetricsRow}>
          <View style={st.cardMetric}>
            <Text style={st.cardMetricValue}>{formatCurrency(agreement.totalInvestment, agreement.currency)}</Text>
            <Text style={st.cardMetricLabel}>Investment</Text>
          </View>
          <View style={st.cardMetricDivider} />
          <View style={st.cardMetric}>
            <Text style={[st.cardMetricValue, { color: '#00C48C' }]}>{agreement.expectedROI}%</Text>
            <Text style={st.cardMetricLabel}>Expected ROI</Text>
          </View>
          <View style={st.cardMetricDivider} />
          <View style={st.cardMetric}>
            <Text style={st.cardMetricValue}>{agreement.partners.length}</Text>
            <Text style={st.cardMetricLabel}>Partners</Text>
          </View>
        </View>

        <View style={st.cardPartnersRow}>
          {agreement.partners.slice(0, 3).map((p, i) => (
            <View key={p.id} style={[st.partnerAvatarSmall, { backgroundColor: ROLE_CONFIG[p.role]?.color || '#666', marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }]}>
              <Text style={st.partnerAvatarText}>{p.name.charAt(0)}</Text>
            </View>
          ))}
          {agreement.partners.length > 3 && (
            <Text style={st.morePartners}>+{agreement.partners.length - 3}</Text>
          )}
          <View style={{ flex: 1 }} />
          <ChevronRight size={16} color={Colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderListMode = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={st.heroCard}>
        <View style={st.heroIconRow}>
          <Handshake size={28} color="#FFD700" />
          <Shield size={22} color="#00C48C" />
          <Scale size={22} color="#4A90D9" />
        </View>
        <Text style={st.heroTitle}>Joint Venture Agreements</Text>
        <Text style={st.heroSubtitle}>Smart, secure partnerships for global real estate investment. Create, manage, and track JV deals with institutional-grade legal protection.</Text>
      </View>

      {renderPortfolioStats()}
      {renderFilters()}

      <TouchableOpacity
        style={st.createBtn}
        onPress={() => { resetForm(); setMode('create'); }}
        activeOpacity={0.85}
        testID="jv-create-new"
      >
        <Plus size={20} color="#000" />
        <Text style={st.createBtnText}>Create New JV Agreement</Text>
      </TouchableOpacity>

      {filteredAgreements.length === 0 ? (
        <View style={st.emptyState}>
          <Briefcase size={48} color={Colors.textTertiary} />
          <Text style={st.emptyTitle}>No Agreements Found</Text>
          <Text style={st.emptySubtitle}>Create your first JV agreement to get started</Text>
        </View>
      ) : (
        filteredAgreements.map(renderAgreementCard)
      )}
    </Animated.View>
  );

  const renderDetailMode = () => {
    if (!selectedAgreement) return null;
    const ag = selectedAgreement;
    const statusCfg = STATUS_CONFIG[ag.status] || STATUS_CONFIG.draft;
    const typeCfg = JV_AGREEMENT_TYPES.find(t => t.id === ag.type);

    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={st.detailHero}>
          <View style={st.detailHeroTop}>
            <View style={[st.statusBadge, { backgroundColor: statusCfg.bg }]}>
              <View style={[st.statusDot, { backgroundColor: statusCfg.color }]} />
              <Text style={[st.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </View>
            <Text style={st.detailType}>{typeCfg?.icon} {typeCfg?.label}</Text>
          </View>
          <Text style={st.detailTitle}>{ag.title}</Text>
          <Text style={st.detailProject}>{ag.projectName}</Text>

          <View style={st.detailMetrics}>
            <View style={st.detailMetricItem}>
              <DollarSign size={16} color="#FFD700" />
              <Text style={st.detailMetricValue}>{formatCurrency(ag.totalInvestment, ag.currency)}</Text>
              <Text style={st.detailMetricLabel}>Total Investment</Text>
            </View>
            <View style={st.detailMetricItem}>
              <TrendingUp size={16} color="#00C48C" />
              <Text style={[st.detailMetricValue, { color: '#00C48C' }]}>{ag.expectedROI}%</Text>
              <Text style={st.detailMetricLabel}>Expected ROI</Text>
            </View>
            <View style={st.detailMetricItem}>
              <Users size={16} color="#4A90D9" />
              <Text style={st.detailMetricValue}>{ag.partners.length}</Text>
              <Text style={st.detailMetricLabel}>Partners</Text>
            </View>
          </View>
        </View>

        <View style={st.detailActions}>
          <TouchableOpacity style={st.actionBtn} onPress={() => handlePreview(ag)} activeOpacity={0.7}>
            <Eye size={16} color={Colors.primary} />
            <Text style={st.actionBtnText}>Preview</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.actionBtn} onPress={() => handleExportPDF(ag)} activeOpacity={0.7} disabled={isGenerating}>
            <Download size={16} color="#00C48C" />
            <Text style={[st.actionBtnText, { color: '#00C48C' }]}>{isGenerating ? 'Generating...' : 'Export PDF'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.actionBtn} onPress={() => handleShareWhatsApp(ag)} activeOpacity={0.7}>
            <MessageCircle size={16} color="#25D366" />
            <Text style={[st.actionBtnText, { color: '#25D366' }]}>WhatsApp</Text>
          </TouchableOpacity>
        </View>

        <View style={st.formCard}>
          {renderSectionHeader('overview', 'Agreement Overview', <FileText size={18} color={Colors.primary} />)}
          {expandedSections.overview && (
            <View style={st.sectionContent}>
              {ag.propertyAddress && (
                <View style={st.detailInfoRow}>
                  <MapPin size={14} color={Colors.textTertiary} />
                  <Text style={st.detailInfoText}>{ag.propertyAddress}</Text>
                </View>
              )}
              <Text style={st.detailDescription}>{ag.description}</Text>

              <View style={st.infoGrid}>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>Start Date</Text>
                  <Text style={st.infoValue}>{ag.startDate}</Text>
                </View>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>End Date</Text>
                  <Text style={st.infoValue}>{ag.endDate}</Text>
                </View>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>Distribution</Text>
                  <Text style={st.infoValue}>{ag.distributionFrequency}</Text>
                </View>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>Exit Strategy</Text>
                  <Text style={st.infoValue}>{ag.exitStrategy}</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={st.formCard}>
          {renderSectionHeader('partners', 'Partners & Capital Structure', <Users size={18} color="#4A90D9" />)}
          {expandedSections.partners && (
            <View style={st.sectionContent}>
              {ag.partners.map((p) => {
                const roleCfg = ROLE_CONFIG[p.role] || ROLE_CONFIG.silent;
                return (
                  <View key={p.id} style={st.partnerCard}>
                    <View style={st.partnerCardTop}>
                      <View style={[st.partnerAvatar, { backgroundColor: roleCfg.color }]}>
                        <Text style={st.partnerAvatarLetter}>{p.name.charAt(0)}</Text>
                      </View>
                      <View style={st.partnerInfo}>
                        <Text style={st.partnerName}>{p.name}</Text>
                        <View style={st.partnerRoleBadge}>
                          <Text style={[st.partnerRoleText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
                        </View>
                      </View>
                      {p.verified && <UserCheck size={16} color="#00C48C" />}
                    </View>
                    <View style={st.partnerMetrics}>
                      <View style={st.partnerMetricItem}>
                        <Text style={st.partnerMetricLabel}>Contribution</Text>
                        <Text style={[st.partnerMetricValue, { color: '#00C48C' }]}>{formatCurrency(p.contribution, ag.currency)}</Text>
                      </View>
                      <View style={st.partnerMetricItem}>
                        <Text style={st.partnerMetricLabel}>Equity Share</Text>
                        <Text style={[st.partnerMetricValue, { color: '#FFD700' }]}>{p.equityShare}%</Text>
                      </View>
                      <View style={st.partnerMetricItem}>
                        <Text style={st.partnerMetricLabel}>Location</Text>
                        <Text style={st.partnerMetricValue}>{p.location}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              <View style={st.profitSplitCard}>
                <Text style={st.profitSplitTitle}>Profit Distribution</Text>
                {ag.profitSplit.map(ps => {
                  const partner = ag.partners.find(p => p.id === ps.partnerId);
                  return (
                    <View key={ps.partnerId} style={st.profitSplitRow}>
                      <Text style={st.profitSplitName}>{partner?.name || 'Unknown'}</Text>
                      <View style={st.profitBarWrap}>
                        <View style={[st.profitBar, { width: `${ps.percentage}%` as any }]} />
                      </View>
                      <Text style={st.profitSplitPct}>{ps.percentage}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        <View style={st.formCard}>
          {renderSectionHeader('fees', 'Fee Structure', <PieChart size={18} color="#E879F9" />)}
          {expandedSections.fees && (
            <View style={st.sectionContent}>
              <View style={st.infoGrid}>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>Management Fee</Text>
                  <Text style={st.infoValue}>{ag.managementFee}% p.a.</Text>
                </View>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>Performance Fee</Text>
                  <Text style={st.infoValue}>{ag.performanceFee}%</Text>
                </View>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>Min Hold Period</Text>
                  <Text style={st.infoValue}>{ag.minimumHoldPeriod} months</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={st.formCard}>
          {renderSectionHeader('legal', 'Legal Provisions', <Gavel size={18} color="#FF6B6B" />)}
          {expandedSections.legal && (
            <View style={st.sectionContent}>
              <View style={st.infoGrid}>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>Governing Law</Text>
                  <Text style={st.infoValue}>{ag.governingLaw}</Text>
                </View>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>Dispute Resolution</Text>
                  <Text style={st.infoValue}>{ag.disputeResolution}</Text>
                </View>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>Confidentiality</Text>
                  <Text style={st.infoValue}>{ag.confidentialityPeriod} months</Text>
                </View>
                <View style={st.infoItem}>
                  <Text style={st.infoLabel}>Non-Compete</Text>
                  <Text style={st.infoValue}>{ag.nonCompetePeriod} months</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={st.formCard}>
          {renderSectionHeader('clauses', 'Key Clauses & Protections', <Shield size={18} color="#FFD700" />)}
          {expandedSections.clauses && (
            <View style={st.sectionContent}>
              {Object.entries(JV_CLAUSES).map(([key, clause]) => (
                <View key={key} style={st.clauseCard}>
                  <Text style={st.clauseTitle}>{clause.title}</Text>
                  <Text style={st.clauseDesc}>{clause.description}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  const renderCreateMode = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={st.createHero}>
        <Sparkles size={28} color="#FFD700" />
        <Text style={st.createHeroTitle}>New JV Agreement</Text>
        <Text style={st.createHeroSubtitle}>Create a professionally structured joint venture agreement with full legal protection.</Text>
      </View>

      <View style={st.formCard}>
        {renderSectionHeader('overview', 'Agreement Details', <FileText size={18} color={Colors.primary} />)}
        {expandedSections.overview && (
          <View style={st.sectionContent}>
            {renderInput('Agreement Title', formTitle, setFormTitle, { placeholder: 'e.g. Manhattan Luxury Development JV' })}
            {renderInput('Project Name', formProjectName, setFormProjectName, { placeholder: 'e.g. The Pinnacle @ 5th Ave' })}
            {renderInput('Property Address', formPropertyAddress, setFormPropertyAddress, { placeholder: 'e.g. 432 5th Avenue, New York' })}
            {renderInput('Description', formDescription, setFormDescription, { multiline: true, placeholder: 'Describe the joint venture project...' })}

            <Text style={st.inputLabel}>Agreement Type</Text>
            <View style={st.typeGrid}>
              {JV_AGREEMENT_TYPES.map(type => (
                <TouchableOpacity
                  key={type.id}
                  style={[st.typeCard, formType === type.id && { borderColor: type.color, backgroundColor: type.color + '12' }]}
                  onPress={() => setFormType(type.id)}
                  activeOpacity={0.8}
                >
                  <Text style={st.typeEmoji}>{type.icon}</Text>
                  <Text style={st.typeLabel}>{type.label}</Text>
                  <Text style={st.typeDesc}>{type.desc}</Text>
                  {formType === type.id && (
                    <View style={[st.typeCheck, { backgroundColor: type.color }]}>
                      <CheckCircle size={12} color="#000" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={st.rowInputs}>
              <View style={{ flex: 1 }}>
                {renderInput('Total Investment', formTotalInvestment, setFormTotalInvestment, { keyboardType: 'numeric', placeholder: '5,000,000' })}
              </View>
              <View style={{ width: 100 }}>
                {renderInput('Currency', formCurrency, setFormCurrency)}
              </View>
            </View>

            {renderInput('Expected ROI (%)', formExpectedROI, setFormExpectedROI, { keyboardType: 'numeric', placeholder: '22.5' })}

            <Text style={st.inputLabel}>Distribution Frequency</Text>
            <View style={st.chipRow}>
              {DISTRIBUTION_FREQUENCIES.map(df => (
                <TouchableOpacity
                  key={df.id}
                  style={[st.chip, formDistribution === df.id && st.chipActive]}
                  onPress={() => setFormDistribution(df.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[st.chipText, formDistribution === df.id && st.chipTextActive]}>{df.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={st.inputLabel}>Exit Strategy</Text>
            <View style={st.chipRow}>
              {EXIT_STRATEGIES.map(es => (
                <TouchableOpacity
                  key={es}
                  style={[st.chip, formExitStrategy === es && st.chipActive]}
                  onPress={() => setFormExitStrategy(es)}
                  activeOpacity={0.7}
                >
                  <Text style={[st.chipText, formExitStrategy === es && st.chipTextActive]}>{es}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={st.rowInputs}>
              <View style={{ flex: 1 }}>
                {renderInput('Start Date', formStartDate, setFormStartDate, { placeholder: 'YYYY-MM-DD' })}
              </View>
              <View style={{ flex: 1 }}>
                {renderInput('End Date', formEndDate, setFormEndDate, { placeholder: 'YYYY-MM-DD' })}
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={st.formCard}>
        {renderSectionHeader('partners', 'Partners', <Users size={18} color="#4A90D9" />)}
        {expandedSections.partners && (
          <View style={st.sectionContent}>
            {partners.map((partner, index) => (
              <View key={partner.id} style={st.partnerFormCard}>
                <View style={st.partnerFormHeader}>
                  <Text style={st.partnerFormTitle}>Partner {index + 1}</Text>
                  {partners.length > 1 && (
                    <TouchableOpacity onPress={() => removePartner(index)} activeOpacity={0.7}>
                      <Trash2 size={18} color={Colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
                {renderInput('Name', partner.name, (v) => updatePartner(index, 'name', v), { placeholder: 'Partner name' })}
                
                <Text style={st.inputLabel}>Role</Text>
                <View style={st.chipRow}>
                  {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                    <TouchableOpacity
                      key={key}
                      style={[st.chip, partner.role === key && { borderColor: cfg.color, backgroundColor: cfg.color + '20' }]}
                      onPress={() => updatePartner(index, 'role', key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[st.chipText, partner.role === key && { color: cfg.color }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={st.rowInputs}>
                  <View style={{ flex: 1 }}>
                    {renderInput('Contribution', String(partner.contribution || ''), (v) => updatePartner(index, 'contribution', parseFloat(v) || 0), { keyboardType: 'numeric' })}
                  </View>
                  <View style={{ width: 100 }}>
                    {renderInput('Equity %', String(partner.equityShare || ''), (v) => updatePartner(index, 'equityShare', parseFloat(v) || 0), { keyboardType: 'numeric' })}
                  </View>
                </View>
                {renderInput('Location', partner.location, (v) => updatePartner(index, 'location', v), { placeholder: 'City, Country' })}
              </View>
            ))}

            <TouchableOpacity style={st.addPartnerBtn} onPress={addPartner} activeOpacity={0.7}>
              <Plus size={18} color={Colors.primary} />
              <Text style={st.addPartnerText}>Add Partner</Text>
            </TouchableOpacity>

            <View style={st.equitySummary}>
              <Text style={st.equitySummaryLabel}>Total Equity Allocated</Text>
              <Text style={[st.equitySummaryValue, { color: partners.reduce((s, p) => s + p.equityShare, 0) === 100 ? '#00C48C' : '#FF4D4D' }]}>
                {partners.reduce((s, p) => s + p.equityShare, 0)}%
              </Text>
              {partners.reduce((s, p) => s + p.equityShare, 0) !== 100 && (
                <Text style={st.equityWarning}>Must equal 100%</Text>
              )}
            </View>
          </View>
        )}
      </View>

      <View style={st.formCard}>
        {renderSectionHeader('fees', 'Fees & Hold Period', <PieChart size={18} color="#E879F9" />)}
        {expandedSections.fees && (
          <View style={st.sectionContent}>
            <View style={st.rowInputs}>
              <View style={{ flex: 1 }}>
                {renderInput('Management Fee (%)', formManagementFee, setFormManagementFee, { keyboardType: 'numeric' })}
              </View>
              <View style={{ flex: 1 }}>
                {renderInput('Performance Fee (%)', formPerformanceFee, setFormPerformanceFee, { keyboardType: 'numeric' })}
              </View>
            </View>
            {renderInput('Minimum Hold (months)', formMinHold, setFormMinHold, { keyboardType: 'numeric' })}
          </View>
        )}
      </View>

      <View style={st.formCard}>
        {renderSectionHeader('legal', 'Legal Terms', <Gavel size={18} color="#FF6B6B" />)}
        {expandedSections.legal && (
          <View style={st.sectionContent}>
            {renderInput('Governing Law', formGoverningLaw, setFormGoverningLaw)}
            {renderInput('Dispute Resolution', formDisputeResolution, setFormDisputeResolution)}
            <View style={st.rowInputs}>
              <View style={{ flex: 1 }}>
                {renderInput('Confidentiality (months)', formConfidentiality, setFormConfidentiality, { keyboardType: 'numeric' })}
              </View>
              <View style={{ flex: 1 }}>
                {renderInput('Non-Compete (months)', formNonCompete, setFormNonCompete, { keyboardType: 'numeric' })}
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={st.formCard}>
        {renderSectionHeader('clauses', 'Included Clauses', <Shield size={18} color="#FFD700" />)}
        {expandedSections.clauses && (
          <View style={st.sectionContent}>
            {Object.entries(JV_CLAUSES).map(([key, clause]) => (
              <View key={key} style={st.clauseCard}>
                <View style={st.clauseHeader}>
                  <CheckCircle size={14} color="#00C48C" />
                  <Text style={st.clauseTitle}>{clause.title}</Text>
                </View>
                <Text style={st.clauseDesc}>{clause.description}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={st.submitBtn}
        onPress={handleCreateAgreement}
        activeOpacity={0.85}
        testID="jv-submit"
      >
        <FileCheck size={20} color="#000" />
        <Text style={st.submitBtnText}>Create JV Agreement</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const getBackHandler = () => {
    if (mode === 'detail' || mode === 'create') {
      return () => setMode('list');
    }
    return () => router.back();
  };

  const getHeaderTitle = () => {
    if (mode === 'create') return 'New JV Agreement';
    if (mode === 'detail' && selectedAgreement) return selectedAgreement.title;
    return 'JV Agreements';
  };

  return (
    <View style={st.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={st.safeArea}>
        <View style={st.header}>
          <TouchableOpacity style={st.backBtn} onPress={getBackHandler()} activeOpacity={0.7}>
            <ChevronLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <View style={st.headerCenter}>
            <Text style={st.headerTitle} numberOfLines={1}>{getHeaderTitle()}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={scrollRef}
            style={st.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={st.scrollContent}
          >
            {mode === 'list' && renderListMode()}
            {mode === 'detail' && renderDetailMode()}
            {mode === 'create' && renderCreateMode()}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.surface },
  headerCenter: { flex: 1, marginHorizontal: 12 },
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' as const },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },

  heroCard: { marginTop: 20, backgroundColor: Colors.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: Colors.surfaceBorder, alignItems: 'center' },
  heroIconRow: { flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'center' },
  heroTitle: { color: Colors.text, fontSize: 22, fontWeight: '900' as const, textAlign: 'center' as const, marginBottom: 8 },
  heroSubtitle: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' as const, lineHeight: 20 },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  statIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { color: Colors.text, fontSize: 18, fontWeight: '800' as const },
  statLabel: { color: Colors.textTertiary, fontSize: 10, fontWeight: '600' as const, marginTop: 4 },

  filtersRow: { paddingVertical: 16, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  filterChipActive: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
  filterChipText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
  filterChipTextActive: { color: Colors.primary },

  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, marginBottom: 20 },
  createBtnText: { color: '#000', fontSize: 15, fontWeight: '800' as const },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' as const },
  emptySubtitle: { color: Colors.textTertiary, fontSize: 13 },

  agreementCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' as const },
  cardType: { color: Colors.textTertiary, fontSize: 12, fontWeight: '600' as const },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '800' as const, marginBottom: 4 },
  cardProject: { color: Colors.textSecondary, fontSize: 13, marginBottom: 8 },
  cardLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  cardLocation: { color: Colors.textTertiary, fontSize: 12, flex: 1 },
  cardMetricsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundSecondary, borderRadius: 12, padding: 12, marginBottom: 12 },
  cardMetric: { flex: 1, alignItems: 'center' },
  cardMetricValue: { color: Colors.text, fontSize: 14, fontWeight: '800' as const },
  cardMetricLabel: { color: Colors.textTertiary, fontSize: 10, marginTop: 3 },
  cardMetricDivider: { width: 1, height: 30, backgroundColor: Colors.surfaceBorder },
  cardPartnersRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partnerAvatarSmall: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.surface },
  partnerAvatarText: { color: '#000', fontSize: 11, fontWeight: '800' as const },
  morePartners: { color: Colors.textTertiary, fontSize: 12, fontWeight: '600' as const, marginLeft: 4 },

  detailHero: { marginTop: 20, backgroundColor: Colors.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: Colors.surfaceBorder },
  detailHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailType: { color: Colors.textTertiary, fontSize: 12, fontWeight: '600' as const },
  detailTitle: { color: Colors.text, fontSize: 22, fontWeight: '900' as const, marginBottom: 4 },
  detailProject: { color: Colors.textSecondary, fontSize: 14, marginBottom: 16 },
  detailMetrics: { flexDirection: 'row', gap: 12 },
  detailMetricItem: { flex: 1, backgroundColor: Colors.backgroundSecondary, borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 },
  detailMetricValue: { color: Colors.text, fontSize: 16, fontWeight: '800' as const },
  detailMetricLabel: { color: Colors.textTertiary, fontSize: 10 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  actionBtnText: { color: Colors.primary, fontSize: 12, fontWeight: '700' as const },
  detailInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  detailInfoText: { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  detailDescription: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 16 },

  formCard: { marginTop: 14, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  sectionContent: { paddingHorizontal: 16, paddingBottom: 16 },

  inputGroup: { marginBottom: 14 },
  inputLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' as const, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  input: { backgroundColor: Colors.backgroundSecondary, borderRadius: 12, padding: 14, color: Colors.text, fontSize: 14, borderWidth: 1, borderColor: Colors.inputBorder },
  inputMultiline: { minHeight: 100, paddingTop: 14 },
  rowInputs: { flexDirection: 'row', gap: 10 },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  typeCard: { width: '47%' as any, backgroundColor: Colors.backgroundSecondary, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: Colors.surfaceBorder, position: 'relative' },
  typeEmoji: { fontSize: 24, marginBottom: 8 },
  typeLabel: { color: Colors.text, fontSize: 13, fontWeight: '700' as const, marginBottom: 4 },
  typeDesc: { color: Colors.textTertiary, fontSize: 10, lineHeight: 14 },
  typeCheck: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.backgroundSecondary, borderWidth: 1, borderColor: Colors.surfaceBorder },
  chipActive: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' as const },
  chipTextActive: { color: Colors.primary },

  partnerFormCard: { backgroundColor: Colors.backgroundSecondary, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  partnerFormHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  partnerFormTitle: { color: Colors.primary, fontSize: 14, fontWeight: '700' as const },
  addPartnerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.primary + '40', borderStyle: 'dashed' as const },
  addPartnerText: { color: Colors.primary, fontSize: 14, fontWeight: '700' as const },
  equitySummary: { marginTop: 14, backgroundColor: Colors.backgroundSecondary, borderRadius: 12, padding: 14, alignItems: 'center' },
  equitySummaryLabel: { color: Colors.textTertiary, fontSize: 12, marginBottom: 4 },
  equitySummaryValue: { fontSize: 28, fontWeight: '900' as const },
  equityWarning: { color: Colors.error, fontSize: 11, marginTop: 4 },

  partnerCard: { backgroundColor: Colors.backgroundSecondary, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  partnerCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  partnerAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  partnerAvatarLetter: { color: '#000', fontSize: 18, fontWeight: '900' as const },
  partnerInfo: { flex: 1 },
  partnerName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  partnerRoleBadge: { marginTop: 3 },
  partnerRoleText: { fontSize: 11, fontWeight: '700' as const },
  partnerMetrics: { flexDirection: 'row', gap: 8 },
  partnerMetricItem: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 10 },
  partnerMetricLabel: { color: Colors.textTertiary, fontSize: 9, marginBottom: 3 },
  partnerMetricValue: { color: Colors.text, fontSize: 12, fontWeight: '700' as const },

  profitSplitCard: { marginTop: 12, backgroundColor: Colors.backgroundSecondary, borderRadius: 14, padding: 16 },
  profitSplitTitle: { color: Colors.text, fontSize: 14, fontWeight: '700' as const, marginBottom: 12 },
  profitSplitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  profitSplitName: { color: Colors.textSecondary, fontSize: 12, width: 100 },
  profitBarWrap: { flex: 1, height: 8, backgroundColor: Colors.surface, borderRadius: 4, overflow: 'hidden' },
  profitBar: { height: 8, backgroundColor: Colors.primary, borderRadius: 4 },
  profitSplitPct: { color: Colors.primary, fontSize: 13, fontWeight: '800' as const, width: 40, textAlign: 'right' as const },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoItem: { width: '47%' as any, backgroundColor: Colors.backgroundSecondary, borderRadius: 12, padding: 12 },
  infoLabel: { color: Colors.textTertiary, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
  infoValue: { color: Colors.text, fontSize: 13, fontWeight: '700' as const },

  clauseCard: { backgroundColor: Colors.backgroundSecondary, borderRadius: 12, padding: 14, marginBottom: 8 },
  clauseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  clauseTitle: { color: Colors.primary, fontSize: 13, fontWeight: '700' as const },
  clauseDesc: { color: Colors.textTertiary, fontSize: 12, lineHeight: 18, marginTop: 4 },

  createHero: { marginTop: 20, alignItems: 'center', gap: 8, marginBottom: 8 },
  createHeroTitle: { color: Colors.text, fontSize: 22, fontWeight: '900' as const },
  createHeroSubtitle: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' as const, lineHeight: 20, paddingHorizontal: 20 },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 18, marginTop: 20, marginBottom: 40 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: '800' as const },
});
