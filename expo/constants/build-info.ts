import Constants from 'expo-constants';

/**
 * Build/bundle identity surfaced on the IVX Diagnostics screen so the owner can
 * confirm — on the live device — which frontend bundle is actually running and
 * that it is NOT a stale cached bundle.
 *
 * Values are sourced from `app.config.ts` `extra` (baked into the JS bundle at
 * build time), so they change only when a NEW bundle is built and shipped. If
 * the device shows an OLD marker after reload, the bundle is stale.
 */
export interface IVXBuildInfo {
  /** Human build marker, e.g. IVX_BUNDLE_2026_06_06_WATCHDOG_BANNER_FIELDS. */
  buildMarker: string;
  /** ISO timestamp the bundle marker was set. */
  buildTimestamp: string;
  /** Watchdog patch identifier (bumped whenever the watchdog banner logic changes). */
  watchdogPatchVersion: string;
  /** Frontend deploy marker, distinct from the backend /health marker. */
  frontendDeployMarker: string;
  /** App version from app.config.ts. */
  appVersion: string;
  /** Short commit hash if injected at build time, else 'local'. */
  commitShort: string;
  /** Epoch ms when this JS bundle first executed (proves a fresh reload). */
  bundleBootEpochMs: number;
}

type ExtraShape = {
  buildMarker?: unknown;
  buildTimestamp?: unknown;
  watchdogPatchVersion?: unknown;
  frontendDeployMarker?: unknown;
};

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Epoch ms captured once when the bundle is first evaluated on the device. */
const BUNDLE_BOOT_EPOCH_MS: number = Date.now();

function resolveCommitShort(): string {
  const env = (process.env.EXPO_PUBLIC_COMMIT_SHA ?? process.env.EXPO_PUBLIC_GIT_COMMIT) as string | undefined;
  if (typeof env === 'string' && env.length > 0) {
    return env.slice(0, 8);
  }
  return 'local';
}

export function getIVXBuildInfo(): IVXBuildInfo {
  const extra = (Constants.expoConfig?.extra ?? {}) as ExtraShape;
  return {
    buildMarker: readString(extra.buildMarker, 'unknown-build-marker'),
    buildTimestamp: readString(extra.buildTimestamp, 'unknown'),
    watchdogPatchVersion: readString(extra.watchdogPatchVersion, 'unknown'),
    frontendDeployMarker: readString(extra.frontendDeployMarker, 'unknown'),
    appVersion: readString(Constants.expoConfig?.version, '0.0.0'),
    commitShort: resolveCommitShort(),
    bundleBootEpochMs: BUNDLE_BOOT_EPOCH_MS,
  };
}
