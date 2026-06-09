import React from 'react';
import { HelpCircle } from 'lucide-react-native';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { errorTracker } from '@/lib/error-tracking';

/**
 * Safe component/icon resolvers used by the IVX Crash Shield.
 *
 * A missing icon or component must NEVER crash render. When the requested
 * value is `undefined`/`null` (e.g. an icon that was used but never imported,
 * which is exactly what caused the `Property 'Mail' doesn't exist` crash in
 * IVXOwnerChatRoute), we render a safe fallback instead of throwing, and log a
 * watchdog incident so the missing reference can be repaired.
 */

const reportedMissing = new Set<string>();

function reportMissing(kind: 'icon' | 'component', name: string): void {
  const key = `${kind}:${name}`;
  if (reportedMissing.has(key)) {
    return;
  }
  reportedMissing.add(key);
  try {
    errorTracker.captureMessage(
      `Missing ${kind} resolved to fallback: ${name}`,
      'warning',
      { source: 'safeComponent', kind, name }
    );
  } catch {
    console.log(`[safe-icon] Failed to report missing ${kind}: ${name}`);
  }
}

/**
 * Returns the icon component if it exists, otherwise a safe fallback icon.
 * Use when an icon reference may be undefined to avoid "element type is invalid".
 */
export function safeIcon(
  icon: LucideIcon | undefined | null,
  name: string,
  fallback: LucideIcon = HelpCircle
): LucideIcon {
  if (icon) {
    return icon;
  }
  reportMissing('icon', name);
  return fallback;
}

/**
 * Returns the component if it is a valid React component, otherwise a fallback.
 */
export function safeComponent<P extends object>(
  component: React.ComponentType<P> | undefined | null,
  name: string,
  fallback: React.ComponentType<P>
): React.ComponentType<P> {
  if (typeof component === 'function' || (component && typeof component === 'object')) {
    return component as React.ComponentType<P>;
  }
  reportMissing('component', name);
  return fallback;
}

/**
 * Crash-safe icon element. Renders the given icon, or a fallback icon when the
 * icon is missing — never throwing during render.
 */
export function SafeIcon({
  icon,
  name,
  fallback,
  ...props
}: LucideProps & {
  icon: LucideIcon | undefined | null;
  name: string;
  fallback?: LucideIcon;
}): React.ReactElement {
  const Resolved = safeIcon(icon, name, fallback ?? HelpCircle);
  return <Resolved {...props} />;
}
