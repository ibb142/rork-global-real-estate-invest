import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Switch,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit3,
  X,
  Check,
  Clapperboard,
  Eye,
  RefreshCw,
  Film,
} from 'lucide-react-native';
import { Video, ResizeMode } from 'expo-av';
import Colors from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { REELS_API_FALLBACK_BASE, REEL_TYPE_LABELS } from '@/lib/reels-module';

/**
 * OWNER REELS MANAGEMENT — create, categorize, link, order, publish/approve,
 * preview, and delete reels against the canonical jv_deal_reels source.
 * All writes go through owner-only backend endpoints (Supabase owner bearer).
 */

const REEL_TYPES = ['investment', 'jv', 'buyer', 'seller', 'tokenized', 'construction', 'walkthrough', 'opportunity'] as const;

interface AdminReel {
  id: string;
  project_id: string | null;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  sort_order: number | null;
  published: boolean;
  approved?: boolean | null;
  visibility: string | null;
  reel_type?: string | null;
  category_tags?: string[] | null;
  created_at?: string | null;
}

interface AdminDeal {
  id: string;
  title: string;
  location: string;
}

interface AdminListResponse {
  ok: boolean;
  total: number;
  reels: AdminReel[];
  deals: AdminDeal[];
  migration?: { status?: string };
  error?: string;
}

async function ownerToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  if (!token) throw new Error('Owner session required. Sign in as the IVX owner first.');
  return token;
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await ownerToken();
  const bases = [getDirectApiBaseUrl(), REELS_API_FALLBACK_BASE].filter((b, i, a) => b && a.indexOf(b) === i);
  let lastError: Error | null = null;
  for (const base of bases) {
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });
      if (response.status !== 404 && response.status !== 502 && response.status !== 503) return response;
      lastError = new Error(`HTTP ${response.status} from ${base}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('network failure');
    }
  }
  throw lastError ?? new Error('Reels admin API unreachable');
}

async function fetchAdminList(): Promise<AdminListResponse> {
  const response = await adminFetch('/api/reels/admin/list');
  const data = await response.json() as AdminListResponse;
  if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

const QUERY_KEY_ADMIN_REELS = ['admin', 'reels'] as const;

export default function AdminReelsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminReel | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [...QUERY_KEY_ADMIN_REELS],
    queryFn: fetchAdminList,
    retry: 1,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [...QUERY_KEY_ADMIN_REELS] });
  }, [queryClient]);

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const response = await adminFetch(`/api/reels/admin/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const data = await response.json() as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    },
    onSuccess: refresh,
    onError: (error: Error) => Alert.alert('Update failed', error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await adminFetch(`/api/reels/admin/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-ivx-reels-confirm': 'DELETE' },
      });
      const data = await response.json() as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    },
    onSuccess: refresh,
    onError: (error: Error) => Alert.alert('Delete failed', error.message),
  });

  const confirmDelete = useCallback((reel: AdminReel) => {
    const title = reel.caption || reel.video_url.split('/').pop() || reel.id;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm(`Delete reel "${title}"? This also removes its likes, saves and comments.`)) {
        deleteMutation.mutate(reel.id);
      }
      return;
    }
    Alert.alert(
      'Delete reel?',
      `"${title}" will be permanently removed, including its likes, saves and comments.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(reel.id) },
      ],
    );
  }, [deleteMutation]);

  const reels = query.data?.reels ?? [];
  const deals = query.data?.deals ?? [];
  const dealTitle = useMemo(() => {
    const map: Record<string, string> = {};
    for (const deal of deals) map[deal.id] = deal.title;
    return map;
  }, [deals]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="admin-reels-back">
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <View style={styles.headerIcon}>
            <Clapperboard size={15} color={Colors.black} />
          </View>
          <Text style={styles.headerTitle}>Reels Management</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setCreating(true)} testID="admin-reels-add">
          <Plus size={18} color={Colors.black} />
        </TouchableOpacity>
      </View>

      {query.data?.migration?.status ? (
        <View style={styles.statusRow} testID="admin-reels-platform-status">
          <Text style={styles.statusText}>
            Platform: {reels.length} reels · {reels.filter((r) => r.published && r.approved !== false).length} live · schema {query.data.migration.status}
          </Text>
        </View>
      ) : null}

      {query.isPending ? (
        <View style={styles.stateWrap}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : query.isError ? (
        <View style={styles.stateWrap} testID="admin-reels-error">
          <Text style={styles.stateText}>{query.error instanceof Error ? query.error.message : 'Failed to load'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => query.refetch()}>
            <RefreshCw size={14} color={Colors.black} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} testID="admin-reels-list">
          {reels.length === 0 ? (
            <Text style={styles.stateText}>No reels yet. Tap + to add the first one.</Text>
          ) : reels.map((reel) => (
            <View key={reel.id} style={styles.reelRow} testID={`admin-reel-${reel.id}`}>
              <TouchableOpacity style={styles.thumbWrap} onPress={() => setPreviewUrl(reel.video_url)} accessibilityRole="button" accessibilityLabel="Preview video">
                {reel.thumbnail_url ? (
                  <Image source={{ uri: reel.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}><Film size={18} color={Colors.textTertiary} /></View>
                )}
                <View style={styles.previewBadge}><Eye size={10} color="#fff" /></View>
              </TouchableOpacity>
              <View style={styles.reelInfo}>
                <Text style={styles.reelCaption} numberOfLines={1}>{reel.caption || 'Untitled reel'}</Text>
                <Text style={styles.reelMeta} numberOfLines={1}>
                  {(REEL_TYPE_LABELS[String(reel.reel_type)] ?? reel.reel_type ?? 'investment')}
                  {reel.project_id ? ` · ${dealTitle[reel.project_id] ?? reel.project_id}` : ' · Global'}
                  {` · order ${reel.sort_order ?? 0}`}
                </Text>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleItem}>
                    <Text style={styles.toggleLabel}>Published</Text>
                    <Switch
                      value={reel.published}
                      onValueChange={(value) => patchMutation.mutate({ id: reel.id, patch: { published: value } })}
                      trackColor={{ true: Colors.primary, false: Colors.surfaceBorder }}
                      thumbColor="#fff"
                      testID={`admin-reel-publish-${reel.id}`}
                    />
                  </View>
                  <View style={styles.toggleItem}>
                    <Text style={styles.toggleLabel}>Approved</Text>
                    <Switch
                      value={reel.approved !== false}
                      onValueChange={(value) => patchMutation.mutate({ id: reel.id, patch: { approved: value } })}
                      trackColor={{ true: '#22C55E', false: Colors.surfaceBorder }}
                      thumbColor="#fff"
                      testID={`admin-reel-approve-${reel.id}`}
                    />
                  </View>
                </View>
              </View>
              <View style={styles.reelActions}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setEditing(reel)} testID={`admin-reel-edit-${reel.id}`}>
                  <Edit3 size={16} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => confirmDelete(reel)} testID={`admin-reel-delete-${reel.id}`}>
                  <Trash2 size={16} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <ReelFormModal
        visible={creating || editing !== null}
        reel={editing}
        deals={deals}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
      />

      <Modal visible={previewUrl !== null} transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
        <View style={styles.previewBackdrop}>
          <View style={styles.previewCard}>
            {previewUrl ? (
              <Video
                source={{ uri: previewUrl }}
                style={styles.previewVideo}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                useNativeControls
              />
            ) : null}
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewUrl(null)} testID="admin-reel-preview-close">
              <X size={18} color={Colors.text} />
              <Text style={styles.previewCloseText}>Close preview</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ReelFormModal({ visible, reel, deals, onClose, onSaved }: {
  visible: boolean;
  reel: AdminReel | null;
  deals: AdminDeal[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = reel !== null;
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [reelType, setReelType] = useState<string>('investment');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<string>('0');
  const [publishNow, setPublishNow] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  const hydrateKey = reel?.id ?? (visible ? 'new' : null);
  if (visible && hydrateKey && hydratedFor !== hydrateKey) {
    setHydratedFor(hydrateKey);
    setVideoUrl(reel?.video_url ?? '');
    setThumbnailUrl(reel?.thumbnail_url ?? '');
    setCaption(reel?.caption ?? '');
    setReelType(String(reel?.reel_type ?? 'investment'));
    setProjectId(reel?.project_id ?? null);
    setSortOrder(String(reel?.sort_order ?? 0));
    setPublishNow(reel?.published ?? false);
    setFormError(null);
  }
  if (!visible && hydratedFor !== null) {
    setHydratedFor(null);
  }

  const save = useCallback(async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (isEdit && reel) {
        const response = await adminFetch(`/api/reels/admin/${encodeURIComponent(reel.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            caption,
            thumbnail_url: thumbnailUrl.trim() || null,
            reel_type: reelType,
            project_id: projectId,
            sort_order: Number.parseInt(sortOrder, 10) || 0,
            published: publishNow,
          }),
        });
        const data = await response.json() as { ok: boolean; error?: string };
        if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      } else {
        const response = await adminFetch('/api/reels/admin/create', {
          method: 'POST',
          body: JSON.stringify({
            videoUrl: videoUrl.trim(),
            thumbnailUrl: thumbnailUrl.trim() || null,
            caption,
            reelType,
            projectId,
            sortOrder: Number.parseInt(sortOrder, 10) || 0,
            published: publishNow,
            approved: true,
          }),
        });
        const data = await response.json() as { ok: boolean; error?: string };
        if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      }
      onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [isEdit, reel, videoUrl, thumbnailUrl, caption, reelType, projectId, sortOrder, publishNow, onSaved]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.formBackdrop}>
        <View style={styles.formSheet} testID="admin-reel-form">
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{isEdit ? 'Edit reel' : 'Add reel'}</Text>
            <TouchableOpacity onPress={onClose} testID="admin-reel-form-close"><X size={20} color={Colors.text} /></TouchableOpacity>
          </View>
          <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
            {!isEdit ? (
              <>
                <Text style={styles.fieldLabel}>Video URL (https, .mp4/.mov/.m4v/.webm)</Text>
                <TextInput
                  style={styles.input}
                  value={videoUrl}
                  onChangeText={setVideoUrl}
                  placeholder="https://ivxholding.com/videos/original/…/tour.mp4"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="none"
                  testID="admin-reel-video-url"
                />
              </>
            ) : null}
            <Text style={styles.fieldLabel}>Thumbnail URL</Text>
            <TextInput
              style={styles.input}
              value={thumbnailUrl}
              onChangeText={setThumbnailUrl}
              placeholder="https://…/thumb.jpg"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
              testID="admin-reel-thumbnail-url"
            />
            <Text style={styles.fieldLabel}>Caption</Text>
            <TextInput
              style={styles.input}
              value={caption}
              onChangeText={setCaption}
              placeholder="Casa Rosario — Property Tour"
              placeholderTextColor={Colors.textTertiary}
              maxLength={200}
              testID="admin-reel-caption"
            />
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.typeGrid}>
              {REEL_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, reelType === type && styles.typeChipActive]}
                  onPress={() => setReelType(type)}
                  testID={`admin-reel-type-${type}`}
                >
                  <Text style={[styles.typeChipText, reelType === type && styles.typeChipTextActive]}>
                    {REEL_TYPE_LABELS[type] ?? type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Linked project (JV deal)</Text>
            <View style={styles.typeGrid}>
              <TouchableOpacity
                style={[styles.typeChip, projectId === null && styles.typeChipActive]}
                onPress={() => setProjectId(null)}
                testID="admin-reel-project-none"
              >
                <Text style={[styles.typeChipText, projectId === null && styles.typeChipTextActive]}>Global (no project)</Text>
              </TouchableOpacity>
              {deals.map((deal) => (
                <TouchableOpacity
                  key={deal.id}
                  style={[styles.typeChip, projectId === deal.id && styles.typeChipActive]}
                  onPress={() => setProjectId(deal.id)}
                  testID={`admin-reel-project-${deal.id}`}
                >
                  <Text style={[styles.typeChipText, projectId === deal.id && styles.typeChipTextActive]} numberOfLines={1}>
                    {deal.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Display order</Text>
            <TextInput
              style={styles.input}
              value={sortOrder}
              onChangeText={setSortOrder}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={Colors.textTertiary}
              testID="admin-reel-sort-order"
            />
            <View style={styles.publishRow}>
              <Text style={styles.fieldLabel}>Publish immediately</Text>
              <Switch
                value={publishNow}
                onValueChange={setPublishNow}
                trackColor={{ true: Colors.primary, false: Colors.surfaceBorder }}
                thumbColor="#fff"
                testID="admin-reel-publish-now"
              />
            </View>
            {formError ? <Text style={styles.formError} testID="admin-reel-form-error">{formError}</Text> : null}
          </ScrollView>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={() => void save()}
            disabled={saving}
            testID="admin-reel-save"
          >
            {saving ? <ActivityIndicator size="small" color={Colors.black} /> : <Check size={16} color={Colors.black} />}
            <Text style={styles.saveBtnText}>{isEdit ? 'Save changes' : publishNow ? 'Create & publish' : 'Create draft'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: '900' as const },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  statusRow: { marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,215,0,0.07)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)' },
  statusText: { color: Colors.textSecondary, fontSize: 11 },
  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  stateText: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' as const },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: Colors.black, fontSize: 13, fontWeight: '700' as const },
  list: { padding: 16, gap: 12 },
  reelRow: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 10,
  },
  thumbWrap: { width: 64, height: 88, borderRadius: 10, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundTertiary },
  previewBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, padding: 4 },
  reelInfo: { flex: 1, gap: 4 },
  reelCaption: { color: Colors.text, fontSize: 13, fontWeight: '700' as const },
  reelMeta: { color: Colors.textTertiary, fontSize: 11 },
  toggleRow: { flexDirection: 'row', gap: 16, marginTop: 2 },
  toggleItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { color: Colors.textSecondary, fontSize: 11 },
  reelActions: { justifyContent: 'space-around' },
  iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  previewCard: { width: '100%', maxWidth: 420, borderRadius: 16, backgroundColor: Colors.surface, padding: 12, gap: 10 },
  previewVideo: { width: '100%', aspectRatio: 9 / 16, maxHeight: 480, borderRadius: 12, backgroundColor: '#000' },
  previewClose: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.backgroundTertiary },
  previewCloseText: { color: Colors.text, fontSize: 13, fontWeight: '700' as const },
  formBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '88%', gap: 10 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formTitle: { color: Colors.text, fontSize: 16, fontWeight: '900' as const },
  formScroll: { maxHeight: 460 },
  fieldLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const, marginTop: 10, marginBottom: 6 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.backgroundTertiary,
    color: Colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    borderRadius: 100,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  typeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const },
  typeChipTextActive: { color: Colors.black },
  publishRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  formError: { color: '#FF6B6B', fontSize: 12, marginTop: 10 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
  },
  saveBtnText: { color: Colors.black, fontSize: 14, fontWeight: '900' as const },
});
