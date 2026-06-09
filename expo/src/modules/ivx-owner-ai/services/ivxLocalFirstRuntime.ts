export type IVXChatRuntimeMode = 'local_first' | 'remote_first';

/**
 * Resolve the IVX Owner chat runtime. Production-safe default is remote-first
 * so ChatGPT traffic uses the IVX-owned backend proxy unless local mode is
 * explicitly requested for offline development.
 */
export function getIVXChatRuntimeMode(): IVXChatRuntimeMode {
  const configuredMode = process.env.EXPO_PUBLIC_IVX_CHAT_BACKEND_MODE?.trim().toLowerCase();
  if (configuredMode === 'local' || configuredMode === 'local_first' || configuredMode === 'offline') {
    return 'local_first';
  }

  return 'remote_first';
}

export function isIVXLocalFirstChatEnabled(): boolean {
  return getIVXChatRuntimeMode() === 'local_first';
}
