function normalizeSystemPath(path: string): string {
  const trimmedPath = path.trim();

  if (!trimmedPath) {
    return '/landing';
  }

  let nextPath = trimmedPath;

  try {
    const parsed = new URL(trimmedPath);
    nextPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    nextPath = trimmedPath;
  }

  if (nextPath === '/--') {
    nextPath = '/';
  } else if (nextPath.startsWith('/--/')) {
    nextPath = nextPath.slice(3);
  }

  if (!nextPath.startsWith('/')) {
    nextPath = `/${nextPath}`;
  }

  nextPath = nextPath.replace(/\/+/g, '/');

  if (nextPath === '/' || nextPath === '/index') {
    return '/landing';
  }

  return nextPath;
}

export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  try {
    const normalizedPath = normalizeSystemPath(path);
    console.log('[NativeIntent] Redirect evaluation:', {
      initial,
      incomingPath: path,
      normalizedPath,
    });
    return normalizedPath;
  } catch (error) {
    console.log('[NativeIntent] Redirect fallback triggered:', error instanceof Error ? error.message : 'unknown');
    return '/landing';
  }
}
