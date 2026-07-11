import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AlertTriangle, ArrowLeft, Check, Copy, QrCode, RefreshCw, Share2, X } from 'lucide-react-native';
import QRCodeView from '@/components/QRCodeView';
import {
  containsSensitivePayload,
  extractQrDestinationUrl,
  isProbablyHttpUrl,
  logQrDiagnostics,
  newQrTraceId,
  safeUrlHost,
  validateDestinationUrl,
  validateQrImageUrl,
} from '@/lib/qr-url';

const GOLD = '#FFD700';
const SURFACE = '#141414';

export type QRViewerModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Link encoded inside the QR — preferred; rendered locally, never opened automatically. */
  destinationUrl?: string | null;
  /** Remote QR PNG fallback — fetched as an image only, never navigated to. */
  imageUrl?: string | null;
  title?: string;
  explanation?: string;
  route?: string;
};

type RemoteImageState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * In-app QR viewer. Renders the QR code locally from the destination URL whenever
 * possible; a remote QR image URL is only ever used as a validated image fallback.
 * Nothing here navigates the browser — closing returns to the previous IVX screen.
 */
export default function QRViewerModal({
  visible,
  onClose,
  destinationUrl,
  imageUrl,
  title = 'QR Code',
  explanation = 'Scan this QR code with a phone camera to open the link below.',
  route = 'unknown',
}: QRViewerModalProps) {
  const [remoteState, setRemoteState] = useState<RemoteImageState>('idle');
  const [remoteError, setRemoteError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const traceId = useMemo(() => newQrTraceId(), []);

  const resolvedDestination = useMemo<string | null>(() => {
    const candidate = isProbablyHttpUrl(destinationUrl)
      ? (destinationUrl ?? '').trim()
      : extractQrDestinationUrl(imageUrl);
    if (!candidate) return null;
    if (containsSensitivePayload(candidate)) return null;
    return validateDestinationUrl(candidate).ok ? candidate : null;
  }, [destinationUrl, imageUrl]);

  const canRenderLocally = !!resolvedDestination;
  const needsRemoteImage = !canRenderLocally && isProbablyHttpUrl(imageUrl);
  const hasNothingToShow = !canRenderLocally && !needsRemoteImage;

  useEffect(() => {
    if (!visible) {
      setCopied(false);
      return;
    }

    logQrDiagnostics({
      traceId,
      route,
      component: 'QRViewerModal',
      action: 'open',
      destinationValid: canRenderLocally,
      navigationTarget: 'in-app-modal',
    });

    if (!needsRemoteImage || !imageUrl) {
      setRemoteState('idle');
      return;
    }

    let cancelled = false;
    setRemoteState('loading');
    setRemoteError('');
    void validateQrImageUrl(imageUrl).then((result) => {
      if (cancelled) return;
      logQrDiagnostics({
        traceId,
        route,
        component: 'QRViewerModal',
        action: 'image-probe',
        imageRequestStatus: `${result.reason}:${result.status ?? 'n/a'}:${result.contentType ?? 'n/a'} host=${safeUrlHost(imageUrl)}`,
        navigationTarget: 'none',
      });
      if (result.ok) {
        setRemoteState('ready');
      } else {
        setRemoteState('error');
        setRemoteError(
          result.reason === 'timeout'
            ? 'The QR image took too long to load. Check your connection and retry.'
            : result.reason === 'not-image'
              ? 'The QR source did not return a valid image.'
              : 'The QR image could not be loaded right now.',
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visible, needsRemoteImage, imageUrl, retryNonce, canRenderLocally, route, traceId]);

  const handleCopy = useCallback(async () => {
    const link = resolvedDestination ?? imageUrl ?? '';
    if (!link) return;
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(link);
      } else {
        const Clipboard = await import('expo-clipboard');
        await Clipboard.setStringAsync(link);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      logQrDiagnostics({ traceId, route, component: 'QRViewerModal', action: 'copy-destination', navigationTarget: 'none' });
    } catch (error) {
      console.log('[QRViewerModal] Copy failed:', error instanceof Error ? error.message : 'unknown');
    }
  }, [resolvedDestination, imageUrl, route, traceId]);

  const handleShare = useCallback(async () => {
    const link = resolvedDestination ?? imageUrl ?? '';
    if (!link) return;
    try {
      await Share.share({ title, message: link, url: link });
      logQrDiagnostics({ traceId, route, component: 'QRViewerModal', action: 'share-destination', navigationTarget: 'none' });
    } catch (error) {
      console.log('[QRViewerModal] Share failed:', error instanceof Error ? error.message : 'unknown');
    }
  }, [resolvedDestination, imageUrl, title, route, traceId]);

  const handleRetry = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  const handleClose = useCallback(() => {
    logQrDiagnostics({ traceId, route, component: 'QRViewerModal', action: 'close', navigationTarget: 'in-app-modal' });
    onClose();
  }, [onClose, route, traceId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card} testID="qr-viewer-modal">
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={handleClose} testID="qr-viewer-back">
              <ArrowLeft size={20} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <QrCode size={16} color={GOLD} />
              <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
            </View>
            <TouchableOpacity style={styles.headerBtn} onPress={handleClose} testID="qr-viewer-close">
              <X size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.explanation}>{explanation}</Text>

          <View style={styles.qrZone}>
            {canRenderLocally && resolvedDestination ? (
              <View style={styles.qrFrame}>
                <QRCodeView value={resolvedDestination} size={220} color="#000" backgroundColor="#fff" quietZone={3} />
              </View>
            ) : needsRemoteImage && remoteState === 'loading' ? (
              <View style={styles.stateBox}>
                <ActivityIndicator size="large" color={GOLD} />
                <Text style={styles.stateText}>Loading QR image…</Text>
              </View>
            ) : needsRemoteImage && remoteState === 'ready' && imageUrl ? (
              <View style={styles.qrFrame}>
                <Image source={{ uri: imageUrl }} style={styles.remoteImage} resizeMode="contain" testID="qr-viewer-remote-image" />
              </View>
            ) : needsRemoteImage && remoteState === 'error' ? (
              <View style={styles.stateBox}>
                <AlertTriangle size={28} color="#F59E0B" />
                <Text style={styles.stateText}>{remoteError}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} testID="qr-viewer-retry">
                  <RefreshCw size={15} color="#000" />
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : hasNothingToShow ? (
              <View style={styles.stateBox}>
                <AlertTriangle size={28} color="#F59E0B" />
                <Text style={styles.stateText}>This QR code data is invalid or empty. Nothing to display.</Text>
              </View>
            ) : null}
          </View>

          {resolvedDestination ? (
            <Text style={styles.destination} numberOfLines={2} testID="qr-viewer-destination">
              {resolvedDestination}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, !resolvedDestination && !imageUrl ? styles.actionBtnDisabled : null]}
              onPress={handleShare}
              disabled={!resolvedDestination && !imageUrl}
              testID="qr-viewer-share"
            >
              <Share2 size={16} color={GOLD} />
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, !resolvedDestination && !imageUrl ? styles.actionBtnDisabled : null]}
              onPress={handleCopy}
              disabled={!resolvedDestination && !imageUrl}
              testID="qr-viewer-copy"
            >
              {copied ? <Check size={16} color="#25D366" /> : <Copy size={16} color={GOLD} />}
              <Text style={[styles.actionText, copied ? styles.actionTextOk : null]}>{copied ? 'Copied!' : 'Copy Link'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.closeFull} onPress={handleClose} testID="qr-viewer-return">
            <Text style={styles.closeFullText}>Back to IVX</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.22)',
    padding: 18,
    gap: 14,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingHorizontal: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  explanation: {
    color: '#A6A6A6',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center' as const,
  },
  qrZone: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 252,
  },
  qrFrame: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
  },
  remoteImage: {
    width: 220,
    height: 220,
  },
  stateBox: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 12,
    paddingHorizontal: 16,
  },
  stateText: {
    color: '#C9C9C9',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center' as const,
  },
  retryBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800' as const,
  },
  destination: {
    color: 'rgba(255,215,0,0.75)',
    fontSize: 12,
    textAlign: 'center' as const,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  actionTextOk: {
    color: '#25D366',
  },
  closeFull: {
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: GOLD,
  },
  closeFullText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900' as const,
  },
});
