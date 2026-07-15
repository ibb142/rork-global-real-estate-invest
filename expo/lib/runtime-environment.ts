import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Safe runtime-environment detection for the IVX owner-proof flow.
 *
 * This NEVER weakens the production admin guard. It only reports *where* the app
 * is currently running so the Code Developer Workspace can surface the owner
 * build-marker proof flow inside Expo Go / a dev client, while leaving every
 * server-side authorization gate exactly as-is.
 */

export type IVXRuntimeKind = 'expo-go' | 'dev-client' | 'standalone' | 'web' | 'unknown';

export interface IVXRuntimeInfo {
  kind: IVXRuntimeKind;
  /** True when running inside the Expo Go sandbox app. */
  isExpoGo: boolean;
  /** True for any development runtime (Expo Go, dev client, or __DEV__ bundle). */
  isDevRuntime: boolean;
  /** True when this is a shipped production build (App Store / TestFlight / store). */
  isStandalone: boolean;
  isWeb: boolean;
}

/**
 * Resolves the current runtime without throwing. Uses expo-constants
 * `executionEnvironment` / `appOwnership`, falling back to `__DEV__` and the
 * Platform so it is always safe to call from any screen.
 */
export function getIVXRuntimeInfo(): IVXRuntimeInfo {
  const isWeb = Platform.OS === 'web';

  // executionEnvironment: 'storeClient' (Expo Go), 'standalone' (EAS store build),
  // 'bare' (prebuilt / bare workflow). A bare workflow release APK is a real
  // production build, not a dev client; only flag it as a dev runtime when
  // React Native's __DEV__ flag is true.
  const executionEnvironment = String(Constants.executionEnvironment ?? '');
  // appOwnership: 'expo' (Expo Go), 'standalone', 'guest' (dev client / bare).
  const appOwnership = String(Constants.appOwnership ?? '');

  const isExpoGo =
    executionEnvironment === 'storeClient' || appOwnership === 'expo';
  const isBare = executionEnvironment === 'bare' || appOwnership === 'guest';
  const devFlag = typeof __DEV__ !== 'undefined' && __DEV__ === true;
  // A bare workflow build is standalone/production when it is a release bundle.
  const isStandalone =
    executionEnvironment === 'standalone' || appOwnership === 'standalone' || (isBare && !devFlag);
  const isDevClient = isBare && devFlag;

  let kind: IVXRuntimeKind = 'unknown';
  if (isWeb) {
    kind = 'web';
  } else if (isExpoGo) {
    kind = 'expo-go';
  } else if (isStandalone) {
    kind = 'standalone';
  } else if (isDevClient) {
    kind = 'dev-client';
  }

  return {
    kind,
    isExpoGo,
    isDevRuntime: isExpoGo || isDevClient || devFlag,
    isStandalone,
    isWeb,
  };
}

/** Convenience: true when the owner-proof flow may be surfaced in this runtime. */
export function isOwnerProofRuntimeAllowed(): boolean {
  const info = getIVXRuntimeInfo();
  // Allow in Expo Go, dev clients, and any dev runtime. Standalone production
  // builds still reach the flow only through the unchanged admin guard.
  return info.isDevRuntime || info.isStandalone || info.isWeb;
}
