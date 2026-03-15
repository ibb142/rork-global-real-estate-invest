import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Plus,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  X,
  Check,
  MapPin,
  DollarSign,
  TrendingUp,
  Users,
  Search,
  Globe,
  FileText,
  Shield,
  ArchiveRestore,
  Archive,
  ImagePlus,
  Camera,
  AlertTriangle,
  Sprout,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJVDeals, updateJVDeal, archiveJVDeal, restoreJVDeal, permanentlyDeleteJVDeal, recoverPhotosForDeal, adminRestorePhotos, resetSupabaseCheck, upsertJVDeal } from '@/lib/jv-storage';
import { invalidateAllJVQueries, useJVRealtime } from '@/lib/jv-realtime';
import { formatCurrency } from '@/lib/formatters';
import { syncToLandingPage } from '@/lib/landing-sync';

type JVDealType = 'equity_split' | 'profit_sharing' | 'hybrid' | 'development';

interface JVPartner {
  id: string;
  name: string;
  role: string;
  contribution: number;
  equityShare: number;
  location: string;
  verified: boolean;
}

interface JVDeal {
  id: string;
  title: string;
  projectName: string;
  type: JVDealType;
  status: string;
  published: boolean;
  publishedAt?: string | null;
  totalInvestment: number;
  currency: string;
  expectedROI: number;
  propertyAddress?: string;
  description: string;
  partners: JVPartner[];
  profitSplit: Array<{ partnerId: string; percentage: number }>;
  startDate: string;
  endDate: string;
  distributionFrequency: string;
  exitStrategy: string;
  governingLaw: string;
  disputeResolution: string;
  confidentialityPeriod: number;
  nonCompetePeriod: number;
  managementFee: number;
  performanceFee: number;
  minimumHoldPeriod: number;
  photos?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface JVQueryData {
  deals: JVDeal[];
}

interface EditFormState {
  title: string;
  projectName: string;
  type: JVDealType;
  totalInvestment: string;
  expectedROI: string;
  propertyAddress: string;
  description: string;
  distributionFrequency: string;
  exitStrategy: string;
  governingLaw: string;
  managementFee: string;
  performanceFee: string;
  minimumHoldPeriod: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: '#9A9A9A', bg: '#9A9A9A18' },
  pending_review: { label: 'Pending', color: '#FFB800', bg: '#FFB80018' },
  active: { label: 'Active', color: '#00C48C', bg: '#00C48C18' },
  completed: { label: 'Completed', color: '#4A90D9', bg: '#4A90D918' },
  expired: { label: 'Expired', color: '#FF4D4D', bg: '#FF4D4D18' },
  archived: { label: 'Archived', color: '#A855F7', bg: '#A855F718' },
};

const TYPE_LABELS: Record<string, string> = {
  equity_split: 'Equity Split',
  profit_sharing: 'Profit Sharing',
  hybrid: 'Hybrid',
  development: 'Development',
};

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'unpublished', label: 'Unpublished' },
  { id: 'active', label: 'Active' },
  { id: 'draft', label: 'Draft' },
  { id: 'archived', label: 'Archived' },
] as const;

const DEAL_TYPES: JVDealType[] = ['equity_split', 'profit_sharing', 'hybrid', 'development'];

const DEFAULT_EDIT_FORM: EditFormState = {
  title: '',
  projectName: '',
  type: 'equity_split',
  totalInvestment: '',
  expectedROI: '',
  propertyAddress: '',
  description: '',
  distributionFrequency: 'quarterly',
  exitStrategy: 'Sale of Property',
  governingLaw: 'State of New York, USA',
  managementFee: '',
  performanceFee: '',
  minimumHoldPeriod: '',
};

export default function AdminJVDealsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [selectedDeal, setSelectedDeal] = useState<JVDeal | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<JVDeal | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [photoRestoreTarget, setPhotoRestoreTarget] = useState<JVDeal | null>(null);
  const [photoRestoreModalVisible, setPhotoRestoreModalVisible] = useState<boolean>(false);
  const [photoUrls, setPhotoUrls] = useState<string>('');
  const [editForm, setEditForm] = useState<EditFormState>(DEFAULT_EDIT_FORM);

  const queryClient = useQueryClient();

  useJVRealtime('admin-jv-deals', true);

  const jvQuery = useQuery<JVQueryData>({
    queryKey: ['jvAgreements.list'],
    queryFn: async () => {
      console.log('[Admin JV] Fetching JV deals...');
      const result = await fetchJVDeals({ limit: 100 });
      console.log('[Admin JV] Fetched', result.deals?.length ?? 0, 'deals, total:', result.total);
      return { deals: (result.deals ?? []) as JVDeal[] };
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 1000 * 10,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    gcTime: 1000 * 60 * 5,
  });

  const publishMutation = useMutation({
    mutationFn: async (input: { id: string }) => {
      console.log('[JV-Storage] Publishing JV deal:', input.id);
      const { data, error } = await updateJVDeal(input.id, { published: true, publishedAt: new Date().toISOString() }, { adminOverride: true });
      if (error) throw error;
      return { success: true, ...data };
    },
    onSuccess: () => {
      console.log('[Admin JV] Published successfully — resetting cache + triggering landing sync');
      resetSupabaseCheck();
      invalidateAllJVQueries(queryClient);
      void queryClient.refetchQueries({ queryKey: ['published-jv-deals'] });
      syncToLandingPage().then(result => {
        console.log('[Admin JV] Landing sync after publish:', result.success, 'synced:', result.syncedDeals);
      }).catch(err => {
        console.log('[Admin JV] Landing sync after publish failed (non-critical):', err);
      });
      Alert.alert('Success', 'Deal published and now visible to investors.');
    },
    onError: (err: Error) => {
      console.error('[Admin JV] Publish error:', err);
      Alert.alert('Error', 'Failed to publish deal: ' + err.message);
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async (input: { id: string }) => {
      console.log('[JV-Storage] Unpublishing JV deal:', input.id);
      const { data, error } = await updateJVDeal(input.id, { published: false, publishedAt: null }, { adminOverride: true });
      if (error) throw error;
      return { success: true, ...data };
    },
    onSuccess: () => {
      console.log('[Admin JV] Unpublished successfully — resetting cache + triggering landing sync');
      resetSupabaseCheck();
      invalidateAllJVQueries(queryClient);
      void queryClient.refetchQueries({ queryKey: ['published-jv-deals'] });
      syncToLandingPage().then(result => {
        console.log('[Admin JV] Landing sync after unpublish:', result.success, 'synced:', result.syncedDeals);
      }).catch(err => {
        console.log('[Admin JV] Landing sync after unpublish failed (non-critical):', err);
      });
      Alert.alert('Success', 'Deal unpublished.');
    },
    onError: (err: Error) => {
      console.error('[Admin JV] Unpublish error:', err);
      Alert.alert('Error', 'Failed to unpublish deal: ' + err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; data: Record<string, unknown> }) => {
      console.log('[JV-Storage] Updating JV deal:', input.id);
      const { data, error } = await updateJVDeal(input.id, input.data, { adminOverride: true });
      if (error) throw error;
      return { success: true, ...data };
    },
    onSuccess: () => {
      console.log('[Admin JV] Updated successfully');
      invalidateAllJVQueries(queryClient);
      setEditModalVisible(false);
      setSelectedDeal(null);
      Alert.alert('Success', 'Deal updated successfully.');
    },
    onError: (err: Error) => {
      console.error('[Admin JV] Update error:', err);
      Alert.alert('Error', 'Failed to update deal: ' + err.message);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (input: { id: string }) => {
      console.log('[Admin JV] Archiving deal:', input.id);
      const { data, error } = await archiveJVDeal(input.id, { adminOverride: true });
      if (error) throw error;
      return { success: true, ...data };
    },
    onSuccess: () => {
      console.log('[Admin JV] Archived successfully');
      invalidateAllJVQueries(queryClient);
      Alert.alert('Archived', 'Deal has been archived. You can restore it anytime.');
    },
    onError: (err: Error) => {
      console.error('[Admin JV] Archive error:', err);
      Alert.alert('Error', 'Failed to archive deal: ' + err.message);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (input: { id: string }) => {
      console.log('[Admin JV] Restoring deal:', input.id);
      const { data, error } = await restoreJVDeal(input.id, { adminOverride: true });
      if (error) throw error;
      return { success: true, ...data };
    },
    onSuccess: () => {
      console.log('[Admin JV] Restored successfully');
      invalidateAllJVQueries(queryClient);
      Alert.alert('Restored', 'Deal has been restored and is now active.');
    },
    onError: (err: Error) => {
      console.error('[Admin JV] Restore error:', err);
      Alert.alert('Error', 'Failed to restore deal: ' + err.message);
    },
  });

  const photoRecoverMutation = useMutation({
    mutationFn: async (input: { id: string }) => {
      console.log('[Admin JV] Attempting photo recovery for:', input.id);
      return await recoverPhotosForDeal(input.id);
    },
    onSuccess: (result) => {
      if (result.recovered) {
        Alert.alert('Photos Recovered', `Found and restored ${result.photoCount} photo(s) from ${result.source}.`);
        invalidateAllJVQueries(queryClient);
      } else {
        Alert.alert('No Photos Found', 'No backup photos were found. You can manually add photo URLs using the "Add Photos" option.');
      }
    },
    onError: (err: Error) => {
      Alert.alert('Error', 'Photo recovery failed: ' + err.message);
    },
  });

  const photoRestoreMutation = useMutation({
    mutationFn: async (input: { id: string; photos: string[] }) => {
      console.log('[Admin JV] Manual photo restore for:', input.id, 'photos:', input.photos.length);
      return await adminRestorePhotos(input.id, input.photos);
    },
    onSuccess: (result) => {
      if (result.success) {
        Alert.alert('Photos Restored', 'Photos have been successfully added to the deal.');
        setPhotoRestoreModalVisible(false);
        setPhotoRestoreTarget(null);
        setPhotoUrls('');
        invalidateAllJVQueries(queryClient);
      } else {
        Alert.alert('Error', result.error || 'Failed to restore photos.');
      }
    },
    onError: (err: Error) => {
      Alert.alert('Error', 'Photo restore failed: ' + err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (input: { id: string }) => {
      console.log('[Admin JV] PERMANENT DELETE deal:', input.id);
      const { error } = await permanentlyDeleteJVDeal(input.id, { adminOverride: true });
      if (error) throw error;
      return { success: true };
    },
    onSuccess: async () => {
      console.log('[Admin JV] Permanently deleted — forcing full cache reset + refetch');
      setDeleteConfirmVisible(false);
      setDeleteTarget(null);
      setDeleteConfirmText('');
      resetSupabaseCheck();
      await queryClient.resetQueries({ queryKey: ['jvAgreements.list'] });
      invalidateAllJVQueries(queryClient);
      Alert.alert('Permanently Deleted', 'Deal has been permanently removed. This cannot be undone.');
    },
    onError: (err: Error) => {
      console.error('[Admin JV] Delete error:', err);
      setDeleteConfirmVisible(false);
      setDeleteTarget(null);
      setDeleteConfirmText('');
      Alert.alert('Delete Failed', err.message);
    },
  });

  const deals = useMemo((): JVDeal[] => {
    const raw: JVDeal[] = jvQuery.data?.deals ?? [];
    let filtered = raw;
    if (filterStatus !== 'all') {
      if (filterStatus === 'published') {
        filtered = filtered.filter(d => d.published);
      } else if (filterStatus === 'unpublished') {
        filtered = filtered.filter(d => !d.published);
      } else {
        filtered = filtered.filter(d => d.status === filterStatus);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.projectName.toLowerCase().includes(q) ||
        (d.propertyAddress || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [jvQuery.data, filterStatus, searchQuery]);

  const stats = useMemo(() => {
    const all: JVDeal[] = jvQuery.data?.deals ?? [];
    return {
      total: all.length,
      published: all.filter(d => d.published).length,
      active: all.filter(d => d.status === 'active').length,
      totalInvestment: all.reduce((sum, d) => sum + (d.totalInvestment || 0), 0),
    };
  }, [jvQuery.data]);

  const seedMutation = useMutation({
    mutationFn: async () => {
      console.log('[Admin JV] Auto-seeding Casa Rosario deal to Supabase...');
      const now = new Date().toISOString();
      const seedPayload: Record<string, unknown> = {
        id: 'casa-rosario-001',
        title: 'CASA ROSARIO',
        projectName: 'ONE STOP DEVELOPMENT TWO LLC',
        type: 'development',
        status: 'active',
        published: true,
        publishedAt: now,
        totalInvestment: 1400000,
        currency: 'USD',
        expectedROI: 30,
        propertyAddress: '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
        description: 'Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for investment with 30% expected ROI. Located in the highly desirable Pembroke Pines area of South Florida.',
        distributionFrequency: 'quarterly',
        exitStrategy: 'Sale upon completion',
        governingLaw: 'State of Florida, USA',
        disputeResolution: 'Arbitration in Miami-Dade County',
        confidentialityPeriod: 24,
        nonCompetePeriod: 12,
        managementFee: 2,
        performanceFee: 20,
        minimumHoldPeriod: 12,
        partners: [{ id: 'dev-001', name: 'ONE STOP DEVELOPMENT TWO LLC', role: 'Developer', contribution: 980000, equityShare: 70, location: 'Pembroke Pines, FL', verified: true }],
        profitSplit: [{ partnerId: 'dev-001', percentage: 70 }],
        photos: [],
        startDate: '2025-01-15',
        endDate: '2027-01-15',
        createdAt: now,
        updatedAt: now,
        createdBy: 'admin-seed',
      };
      const { data, error } = await upsertJVDeal(seedPayload, { adminOverride: true });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      console.log('[Admin JV] Seed successful — refreshing all queries');
      resetSupabaseCheck();
      invalidateAllJVQueries(queryClient);
      syncToLandingPage().then(r => console.log('[Admin JV] Landing sync after seed:', r.success)).catch(() => {});
      Alert.alert('Seeded!', 'Casa Rosario deal has been inserted and published. It will appear on the landing page in real-time.');
    },
    onError: (err: Error) => {
      console.error('[Admin JV] Seed error:', err);
      Alert.alert('Seed Failed', err.message);
    },
  });

  const isAnyMutating = publishMutation.isPending || unpublishMutation.isPending || archiveMutation.isPending || restoreMutation.isPending || seedMutation.isPending;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void jvQuery.refetch().finally(() => setRefreshing(false));
  }, [jvQuery]);

  const openEditModal = useCallback((deal: JVDeal) => {
    setSelectedDeal(deal);
    setEditForm({
      title: deal.title,
      projectName: deal.projectName,
      type: deal.type,
      totalInvestment: String(deal.totalInvestment),
      expectedROI: String(deal.expectedROI),
      propertyAddress: deal.propertyAddress || '',
      description: deal.description || '',
      distributionFrequency: deal.distributionFrequency || 'quarterly',
      exitStrategy: deal.exitStrategy || 'Sale of Property',
      governingLaw: deal.governingLaw || 'State of New York, USA',
      managementFee: String(deal.managementFee || 2),
      performanceFee: String(deal.performanceFee || 20),
      minimumHoldPeriod: String(deal.minimumHoldPeriod || 12),
    });
    setEditModalVisible(true);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!selectedDeal) return;
    if (!editForm.title.trim() || !editForm.projectName.trim()) {
      Alert.alert('Validation', 'Title and Project Name are required.');
      return;
    }
    console.log('[Admin JV] Saving edit for:', selectedDeal.id);
    updateMutation.mutate({
      id: selectedDeal.id,
      data: {
        title: editForm.title.trim(),
        projectName: editForm.projectName.trim(),
        type: editForm.type,
        totalInvestment: Number(editForm.totalInvestment) || 0,
        expectedROI: Number(editForm.expectedROI) || 15,
        propertyAddress: editForm.propertyAddress.trim() || undefined,
        description: editForm.description.trim(),
        distributionFrequency: editForm.distributionFrequency,
        exitStrategy: editForm.exitStrategy,
        governingLaw: editForm.governingLaw,
        managementFee: Number(editForm.managementFee) || 2,
        performanceFee: Number(editForm.performanceFee) || 20,
        minimumHoldPeriod: Number(editForm.minimumHoldPeriod) || 12,
      },
    });
  }, [selectedDeal, editForm, updateMutation]);

  const handleTogglePublish = useCallback((deal: JVDeal) => {
    if (deal.published) {
      Alert.alert('Unpublish Deal', `Remove "${deal.projectName}" from public view?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unpublish', style: 'destructive', onPress: () => unpublishMutation.mutate({ id: deal.id }) },
      ]);
    } else {
      Alert.alert('Publish Deal', `Make "${deal.projectName}" visible to all investors?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish', onPress: () => publishMutation.mutate({ id: deal.id }) },
      ]);
    }
  }, [publishMutation, unpublishMutation]);

  const handleArchive = useCallback((deal: JVDeal) => {
    Alert.alert(
      'Archive Deal',
      `Archive "${deal.projectName}"? It will be hidden but can be restored later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => archiveMutation.mutate({ id: deal.id }) },
      ]
    );
  }, [archiveMutation]);

  const handleRestore = useCallback((deal: JVDeal) => {
    Alert.alert(
      'Restore Deal',
      `Restore "${deal.projectName}" from archive?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => restoreMutation.mutate({ id: deal.id }) },
      ]
    );
  }, [restoreMutation]);

  const handlePermanentDelete = useCallback((deal: JVDeal) => {
    setDeleteTarget(deal);
    setDeleteConfirmText('');
    setDeleteConfirmVisible(true);
  }, []);

  const confirmPermanentDelete = useCallback(() => {
    if (!deleteTarget) return;
    const requiredText = deleteTarget.projectName.trim().toUpperCase();
    if (deleteConfirmText.trim().toUpperCase() !== requiredText) {
      Alert.alert('Confirmation Failed', `You must type "${deleteTarget.projectName}" exactly to confirm deletion.`);
      return;
    }
    deleteMutation.mutate({ id: deleteTarget.id });
  }, [deleteTarget, deleteConfirmText, deleteMutation]);

  const handlePhotoAction = useCallback((deal: JVDeal) => {
    const photoCount = Array.isArray(deal.photos) ? deal.photos.length : 0;
    if (photoCount === 0) {
      Alert.alert(
        'Photos Missing',
        `"${deal.projectName}" has no photos. What would you like to do?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Auto-Recover', onPress: () => photoRecoverMutation.mutate({ id: deal.id }) },
          { text: 'Add URLs', onPress: () => { setPhotoRestoreTarget(deal); setPhotoUrls(''); setPhotoRestoreModalVisible(true); } },
        ]
      );
    } else {
      Alert.alert('Photos', `"${deal.projectName}" has ${photoCount} photo(s).`, [
        { text: 'OK' },
        { text: 'Add More', onPress: () => { setPhotoRestoreTarget(deal); setPhotoUrls(''); setPhotoRestoreModalVisible(true); } },
      ]);
    }
  }, [photoRecoverMutation]);

  const handleSubmitPhotoUrls = useCallback(() => {
    if (!photoRestoreTarget) return;
    const urls = photoUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.startsWith('http') && u.length > 10 && (u.includes('.jpg') || u.includes('.jpeg') || u.includes('.png') || u.includes('.webp') || u.includes('.gif') || u.includes('image') || u.includes('photo')));
    if (urls.length === 0) {
      Alert.alert('Invalid', 'Please enter at least one valid photo URL (http/https, must be an image link).');
      return;
    }
    const existingPhotos = Array.isArray(photoRestoreTarget.photos) ? photoRestoreTarget.photos : [];
    const allPhotos = [...existingPhotos, ...urls];
    photoRestoreMutation.mutate({ id: photoRestoreTarget.id, photos: allPhotos });
  }, [photoRestoreTarget, photoUrls, photoRestoreMutation]);

  const deleteConfirmMatch = deleteConfirmText.trim().toUpperCase() === (deleteTarget?.projectName || '').trim().toUpperCase();

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="jv-deals-back" accessibilityLabel="Go back">
            <ArrowLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>JV Deal Management</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.seedBtn}
              onPress={() => {
                Alert.alert(
                  'Auto-Seed Deals',
                  'This will insert the Casa Rosario deal into your Supabase database and publish it to the landing page. Continue?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Seed Now', onPress: () => seedMutation.mutate() },
                  ]
                );
              }}
              disabled={seedMutation.isPending}
              testID="jv-seed-deals"
              accessibilityLabel="Auto-seed deals"
            >
              {seedMutation.isPending ? (
                <ActivityIndicator size="small" color="#00C48C" />
              ) : (
                <Sprout size={18} color="#00C48C" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => router.push('/jv-agreement')}
              testID="jv-create-deal"
              accessibilityLabel="Create new deal"
            >
              <Plus size={18} color="#000" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
        >
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, styles.statValueGreen]}>{stats.published}</Text>
              <Text style={styles.statLabel}>Published</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, styles.statValuePrimary]}>{stats.active}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, styles.statValueYellow]}>{formatCurrency(stats.totalInvestment)}</Text>
              <Text style={styles.statLabel}>Total Value</Text>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Search size={16} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search deals..."
              placeholderTextColor={Colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              testID="jv-search"
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
            {FILTER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.filterChip, filterStatus === opt.id && styles.filterChipActive]}
                onPress={() => setFilterStatus(opt.id)}
              >
                <Text style={[styles.filterChipText, filterStatus === opt.id && styles.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {jvQuery.isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading deals...</Text>
            </View>
          ) : jvQuery.isError ? (
            <View style={styles.errorWrap}>
              <AlertTriangle size={40} color="#FF4D4D" />
              <Text style={styles.errorTitle}>Failed to load deals</Text>
              <Text style={styles.errorSubtitle}>{jvQuery.error?.message || 'Unknown error occurred'}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} testID="jv-retry">
                <Text style={styles.retryBtnText}>Tap to Retry</Text>
              </TouchableOpacity>
            </View>
          ) : deals.length === 0 ? (
            <View style={styles.emptyWrap}>
              <FileText size={40} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No JV deals found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery ? 'Try a different search term' : 'Create your first JV deal to get started'}
              </Text>
            </View>
          ) : (
            deals.map(deal => {
              const status = STATUS_CONFIG[deal.status] ?? STATUS_CONFIG.draft;
              const photoCount = Array.isArray(deal.photos) ? deal.photos.length : 0;
              return (
                <View key={deal.id} style={styles.dealCard} testID={`admin-jv-${deal.id}`}>
                  <View style={styles.dealHeader}>
                    <View style={styles.dealTitleWrap}>
                      <Text style={styles.dealProjectName} numberOfLines={1}>{deal.projectName}</Text>
                      <Text style={styles.dealTitle} numberOfLines={1}>{deal.title}</Text>
                    </View>
                    <View style={styles.dealBadges}>
                      <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                        <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                        <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                      </View>
                      {deal.published ? (
                        <View style={[styles.pubBadge, styles.pubBadgeLive]}>
                          <Eye size={10} color="#00C48C" />
                          <Text style={[styles.pubBadgeText, styles.pubBadgeTextLive]}>Live</Text>
                        </View>
                      ) : (
                        <View style={[styles.pubBadge, styles.pubBadgeHidden]}>
                          <EyeOff size={10} color="#9A9A9A" />
                          <Text style={[styles.pubBadgeText, styles.pubBadgeTextHidden]}>Hidden</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {deal.propertyAddress ? (
                    <View style={styles.addressRow}>
                      <MapPin size={11} color={Colors.textTertiary} />
                      <Text style={styles.addressText} numberOfLines={1}>{deal.propertyAddress}</Text>
                    </View>
                  ) : null}

                  <View style={styles.dealMetrics}>
                    <View style={styles.dealMetric}>
                      <DollarSign size={12} color={Colors.primary} />
                      <Text style={styles.dealMetricValue}>{formatCurrency(deal.totalInvestment)}</Text>
                    </View>
                    <View style={styles.dealMetric}>
                      <TrendingUp size={12} color="#00C48C" />
                      <Text style={styles.dealMetricValue}>{deal.expectedROI}% ROI</Text>
                    </View>
                    <View style={styles.dealMetric}>
                      <Users size={12} color="#4A90D9" />
                      <Text style={styles.dealMetricValue}>{deal.partners?.length || 0} Partners</Text>
                    </View>
                    <View style={styles.dealMetric}>
                      <Globe size={12} color="#E879F9" />
                      <Text style={styles.dealMetricValue}>{TYPE_LABELS[deal.type] || deal.type}</Text>
                    </View>
                  </View>

                  <View style={styles.dealActions}>
                    {deal.status === 'archived' ? (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.restoreBtn]}
                          onPress={() => handleRestore(deal)}
                          disabled={isAnyMutating}
                          testID={`admin-jv-restore-${deal.id}`}
                          accessibilityLabel={`Restore ${deal.projectName}`}
                        >
                          <ArchiveRestore size={14} color="#00C48C" />
                          <Text style={[styles.actionBtnText, styles.actionBtnTextGreen]}>Restore</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.permDeleteBtn]}
                          onPress={() => handlePermanentDelete(deal)}
                          disabled={isAnyMutating}
                          testID={`admin-jv-permdelete-${deal.id}`}
                          accessibilityLabel={`Permanently delete ${deal.projectName}`}
                        >
                          <Trash2 size={14} color="#FF4D4D" />
                          <Text style={[styles.actionBtnText, styles.actionBtnTextRed]}>Delete Forever</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.editBtn]}
                          onPress={() => openEditModal(deal)}
                          disabled={isAnyMutating}
                          testID={`admin-jv-edit-${deal.id}`}
                          accessibilityLabel={`Edit ${deal.projectName}`}
                        >
                          <Edit3 size={14} color={Colors.primary} />
                          <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, deal.published ? styles.unpublishBtn : styles.publishBtn]}
                          onPress={() => handleTogglePublish(deal)}
                          disabled={isAnyMutating}
                          testID={`admin-jv-toggle-${deal.id}`}
                          accessibilityLabel={deal.published ? `Unpublish ${deal.projectName}` : `Publish ${deal.projectName}`}
                        >
                          {deal.published ? <EyeOff size={14} color="#FF6B6B" /> : <Eye size={14} color="#00C48C" />}
                          <Text style={[styles.actionBtnText, deal.published ? styles.actionBtnTextDanger : styles.actionBtnTextGreen]}>
                            {deal.published ? 'Unpublish' : 'Publish'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.photoBtn]}
                          onPress={() => handlePhotoAction(deal)}
                          disabled={isAnyMutating}
                          testID={`admin-jv-photos-${deal.id}`}
                          accessibilityLabel={`Photos for ${deal.projectName}`}
                        >
                          <Camera size={14} color="#4A90D9" />
                          <Text style={[styles.actionBtnText, styles.actionBtnTextBlue]}>{photoCount}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.archiveBtn]}
                          onPress={() => handleArchive(deal)}
                          disabled={isAnyMutating}
                          testID={`admin-jv-archive-${deal.id}`}
                          accessibilityLabel={`Archive ${deal.projectName}`}
                        >
                          <Archive size={14} color="#FFB800" />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              );
            })
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>

      <Modal visible={deleteConfirmVisible} animationType="fade" transparent>
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteModal}>
            <View style={styles.deleteIconWrap}>
              <Shield size={32} color="#FF4D4D" />
            </View>
            <Text style={styles.deleteModalTitle}>Admin Authorization Required</Text>
            <Text style={styles.deleteModalSubtitle}>
              To permanently delete this deal, type the project name below:
            </Text>
            <Text style={styles.deleteModalDealName}>
              {deleteTarget?.projectName || ''}
            </Text>
            <TextInput
              style={styles.deleteConfirmInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={`Type "${deleteTarget?.projectName || ''}" to confirm`}
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="sentences"
              testID="delete-confirm-input"
            />
            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteModalCancel}
                onPress={() => {
                  setDeleteConfirmVisible(false);
                  setDeleteTarget(null);
                  setDeleteConfirmText('');
                }}
                testID="delete-cancel-btn"
              >
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteModalConfirm,
                  !deleteConfirmMatch && styles.deleteModalConfirmDisabled,
                ]}
                onPress={confirmPermanentDelete}
                disabled={deleteMutation.isPending || !deleteConfirmMatch}
                testID="delete-confirm-btn"
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.deleteModalConfirmText}>Delete Forever</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={photoRestoreModalVisible} animationType="fade" transparent>
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteModal}>
            <View style={[styles.deleteIconWrap, styles.photoIconWrap]}>
              <ImagePlus size={32} color="#4A90D9" />
            </View>
            <Text style={styles.deleteModalTitle}>Restore / Add Photos</Text>
            <Text style={styles.deleteModalSubtitle}>
              Paste photo URLs below (one per line) to add to "{photoRestoreTarget?.projectName}".
            </Text>
            <TextInput
              style={[styles.deleteConfirmInput, styles.photoUrlsInput]}
              value={photoUrls}
              onChangeText={setPhotoUrls}
              placeholder={"https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg"}
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              testID="photo-urls-input"
            />
            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteModalCancel}
                onPress={() => {
                  setPhotoRestoreModalVisible(false);
                  setPhotoRestoreTarget(null);
                  setPhotoUrls('');
                }}
                testID="photo-cancel-btn"
              >
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteModalConfirm, styles.photoConfirmBtn]}
                onPress={handleSubmitPhotoUrls}
                disabled={photoRestoreMutation.isPending}
                testID="photo-restore-btn"
              >
                {photoRestoreMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.deleteModalConfirmText}>Restore Photos</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setEditModalVisible(false); setSelectedDeal(null); }} testID="edit-close-btn" accessibilityLabel="Close edit modal">
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Deal</Text>
            <TouchableOpacity
              onPress={handleSaveEdit}
              disabled={updateMutation.isPending}
              style={styles.modalSaveBtn}
              testID="edit-save-btn"
              accessibilityLabel="Save deal changes"
            >
              {updateMutation.isPending ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Check size={16} color="#000" />
                  <Text style={styles.modalSaveBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={styles.keyboardAvoid}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Project Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={editForm.projectName}
                onChangeText={(v) => setEditForm(f => ({ ...f, projectName: v }))}
                placeholder="e.g. Casa Rosario"
                placeholderTextColor={Colors.textTertiary}
                testID="edit-project-name"
              />

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.fieldInput}
                value={editForm.title}
                onChangeText={(v) => setEditForm(f => ({ ...f, title: v }))}
                placeholder="e.g. Casa Rosario — Luxury Villa Development"
                placeholderTextColor={Colors.textTertiary}
                testID="edit-title"
              />

              <Text style={styles.fieldLabel}>Deal Type</Text>
              <View style={styles.typeRow}>
                {DEAL_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, editForm.type === t && styles.typeChipActive]}
                    onPress={() => setEditForm(f => ({ ...f, type: t }))}
                  >
                    <Text style={[styles.typeChipText, editForm.type === t && styles.typeChipTextActive]}>
                      {TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Total Investment ($)</Text>
              <TextInput
                style={styles.fieldInput}
                value={editForm.totalInvestment}
                onChangeText={(v) => setEditForm(f => ({ ...f, totalInvestment: v }))}
                keyboardType="numeric"
                placeholder="2500000"
                placeholderTextColor={Colors.textTertiary}
                testID="edit-investment"
              />

              <Text style={styles.fieldLabel}>Expected ROI (%)</Text>
              <TextInput
                style={styles.fieldInput}
                value={editForm.expectedROI}
                onChangeText={(v) => setEditForm(f => ({ ...f, expectedROI: v }))}
                keyboardType="numeric"
                placeholder="22"
                placeholderTextColor={Colors.textTertiary}
                testID="edit-roi"
              />

              <Text style={styles.fieldLabel}>Property Address</Text>
              <TextInput
                style={styles.fieldInput}
                value={editForm.propertyAddress}
                onChangeText={(v) => setEditForm(f => ({ ...f, propertyAddress: v }))}
                placeholder="Punta Cana, Dominican Republic"
                placeholderTextColor={Colors.textTertiary}
                testID="edit-address"
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextarea]}
                value={editForm.description}
                onChangeText={(v) => setEditForm(f => ({ ...f, description: v }))}
                placeholder="Deal description..."
                placeholderTextColor={Colors.textTertiary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                testID="edit-description"
              />

              <Text style={styles.fieldLabel}>Exit Strategy</Text>
              <TextInput
                style={styles.fieldInput}
                value={editForm.exitStrategy}
                onChangeText={(v) => setEditForm(f => ({ ...f, exitStrategy: v }))}
                placeholder="Sale of Property"
                placeholderTextColor={Colors.textTertiary}
                testID="edit-exit-strategy"
              />

              <Text style={styles.fieldLabel}>Governing Law</Text>
              <TextInput
                style={styles.fieldInput}
                value={editForm.governingLaw}
                onChangeText={(v) => setEditForm(f => ({ ...f, governingLaw: v }))}
                placeholder="State of New York, USA"
                placeholderTextColor={Colors.textTertiary}
                testID="edit-governing-law"
              />

              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Mgmt Fee (%)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editForm.managementFee}
                    onChangeText={(v) => setEditForm(f => ({ ...f, managementFee: v }))}
                    keyboardType="numeric"
                    placeholder="2"
                    placeholderTextColor={Colors.textTertiary}
                    testID="edit-mgmt-fee"
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Perf Fee (%)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editForm.performanceFee}
                    onChangeText={(v) => setEditForm(f => ({ ...f, performanceFee: v }))}
                    keyboardType="numeric"
                    placeholder="20"
                    placeholderTextColor={Colors.textTertiary}
                    testID="edit-perf-fee"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Min Hold Period (months)</Text>
              <TextInput
                style={styles.fieldInput}
                value={editForm.minimumHoldPeriod}
                onChangeText={(v) => setEditForm(f => ({ ...f, minimumHoldPeriod: v }))}
                keyboardType="numeric"
                placeholder="12"
                placeholderTextColor={Colors.textTertiary}
                testID="edit-hold-period"
              />

              <View style={styles.modalBottomSpacer} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  seedBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#00C48C18',
    borderWidth: 1,
    borderColor: '#00C48C40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statValue: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800' as const,
  },
  statValueGreen: {
    color: '#00C48C',
  },
  statValuePrimary: {
    color: Colors.primary,
  },
  statValueYellow: {
    color: '#FFB800',
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '600' as const,
    marginTop: 2,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    paddingVertical: 12,
  },
  filtersRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  filterChipActive: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  filterChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  errorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  errorTitle: {
    color: '#FF4D4D',
    fontSize: 16,
    fontWeight: '700' as const,
    marginTop: 8,
  },
  errorSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  retryBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
    marginTop: 8,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  dealCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  dealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  dealTitleWrap: {
    flex: 1,
    marginRight: 8,
  },
  dealProjectName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  dealTitle: {
    color: Colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  dealBadges: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  pubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pubBadgeLive: {
    backgroundColor: '#00C48C18',
  },
  pubBadgeHidden: {
    backgroundColor: '#9A9A9A18',
  },
  pubBadgeText: {
    fontSize: 9,
    fontWeight: '700' as const,
  },
  pubBadgeTextLive: {
    color: '#00C48C',
  },
  pubBadgeTextHidden: {
    color: '#9A9A9A',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  addressText: {
    color: Colors.textTertiary,
    fontSize: 11,
    flex: 1,
  },
  dealMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
    padding: 10,
  },
  dealMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dealMetricValue: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  dealActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  actionBtnTextPrimary: {
    color: Colors.primary,
  },
  actionBtnTextGreen: {
    color: '#00C48C',
  },
  actionBtnTextRed: {
    color: '#FF4D4D',
  },
  actionBtnTextDanger: {
    color: '#FF6B6B',
  },
  actionBtnTextBlue: {
    color: '#4A90D9',
  },
  editBtn: {
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '10',
    flex: 1,
    justifyContent: 'center',
  },
  publishBtn: {
    borderColor: '#00C48C40',
    backgroundColor: '#00C48C10',
    flex: 1,
    justifyContent: 'center',
  },
  unpublishBtn: {
    borderColor: '#FF6B6B40',
    backgroundColor: '#FF6B6B10',
    flex: 1,
    justifyContent: 'center',
  },
  archiveBtn: {
    borderColor: '#FFB80040',
    backgroundColor: '#FFB80010',
    paddingHorizontal: 10,
  },
  photoBtn: {
    borderColor: '#4A90D940',
    backgroundColor: '#4A90D910',
    paddingHorizontal: 8,
  },
  restoreBtn: {
    borderColor: '#00C48C40',
    backgroundColor: '#00C48C10',
    flex: 1,
    justifyContent: 'center' as const,
  },
  permDeleteBtn: {
    borderColor: '#FF4D4D40',
    backgroundColor: '#FF4D4D10',
    flex: 1,
    justifyContent: 'center' as const,
  },
  bottomSpacer: {
    height: 100,
  },
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 24,
  },
  deleteModal: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%' as const,
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#FF4D4D30',
  },
  deleteIconWrap: {
    alignSelf: 'center' as const,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF4D4D15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  photoIconWrap: {
    backgroundColor: '#4A90D915',
  },
  deleteModalTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginBottom: 8,
  },
  deleteModalSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center' as const,
    lineHeight: 18,
    marginBottom: 12,
  },
  deleteModalDealName: {
    color: '#FF4D4D',
    fontSize: 16,
    fontWeight: '800' as const,
    textAlign: 'center' as const,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  deleteConfirmInput: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#FF4D4D40',
    textAlign: 'center' as const,
    marginBottom: 20,
  },
  photoUrlsInput: {
    textAlign: 'left' as const,
    minHeight: 120,
    borderColor: '#4A90D940',
  },
  deleteModalActions: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  deleteModalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center' as const,
  },
  deleteModalCancelText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  deleteModalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF4D4D',
    alignItems: 'center' as const,
  },
  deleteModalConfirmDisabled: {
    opacity: 0.4,
  },
  deleteModalConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  photoConfirmBtn: {
    backgroundColor: '#4A90D9',
  },
  modalSafe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
  },
  modalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalSaveBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  keyboardAvoid: {
    flex: 1,
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 6,
    marginTop: 14,
  },
  fieldInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  fieldTextarea: {
    minHeight: 100,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldHalf: {
    flex: 1,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  typeChipActive: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  typeChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  typeChipTextActive: {
    color: Colors.primary,
  },
  modalBottomSpacer: {
    height: 60,
  },
});
