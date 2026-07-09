/**
 * IVX Canonical Repository constants.
 *
 * Owner directive: every deployment path must point to the official IVX repo.
 * Nothing in this project is allowed to default to a Rork temporary router URL,
 * placeholder repo, or sandbox repo. These values are used as fallbacks when
 * env vars are missing/malformed and as the source of truth for validation.
 */

/** Official owner-controlled GitHub repository HTTPS URL. */
export const CANONICAL_GITHUB_REPO_URL = 'https://github.com/ibb142/rork-global-real-estate-invest';

/** Official owner-controlled GitHub repository slug (owner/repo). */
export const CANONICAL_GITHUB_REPO_SLUG = 'ibb142/rork-global-real-estate-invest';

/** Production backend base URL. */
export const CANONICAL_PRODUCTION_BASE_URL = 'https://api.ivxholding.com';

/** Production Render service ID (if known). Set here only if the owner has published it. */
export const CANONICAL_RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID || '';

const RORK_ROUTER_HOSTS = new Set([
  'rork-git-router.rork-direct.workers.dev',
  'rork-git-router.rork.com',
  'rork-git-router.rork.app',
]);

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /example/i,
  /your-repo/i,
  /todo/i,
  /xxx/i,
  /fake/i,
  /sandbox/i,
  /temp/i,
  /rork-ivxholding/i,
];

function looksLikePlaceholder(value) {
  if (!value || typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

function looksLikeRorkRouter(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return RORK_ROUTER_HOSTS.has(parsed.hostname);
  } catch {
    return /rork-git-router/i.test(value);
  }
}

/**
 * Normalize a GitHub URL or slug into owner/repo form, rejecting Rork router URLs
 * and placeholders. Falls back to the canonical IVX repo when input is unusable.
 */
export function resolveCanonicalRepoSlug(input) {
  const normalized = String(input || '').trim();
  if (looksLikePlaceholder(normalized) || looksLikeRorkRouter(normalized)) {
    return CANONICAL_GITHUB_REPO_SLUG;
  }
  if (/^[^/\s]+\/[^/\s]+$/.test(normalized)) {
    return normalized.replace(/\.git$/i, '');
  }
  const match = normalized.match(/github\.com[/:]([^/\s]+)\/([^/.\s]+)(?:\.git)?/i);
  if (match) return `${match[1]}/${match[2]}`;
  return CANONICAL_GITHUB_REPO_SLUG;
}

/**
 * Resolve the canonical HTTPS GitHub repo URL, rejecting Rork router URLs and
 * placeholders. Returns the canonical IVX repo when input is unusable.
 */
export function resolveCanonicalRepoUrl(input) {
  const slug = resolveCanonicalRepoSlug(input);
  return `https://github.com/${slug}`;
}

/**
 * Validate that the supplied repo URL points to the canonical repo. Returns a
 * diagnostic object with the resolved URL and any mismatch error.
 */
export function validateRepoUrl(input) {
  const resolved = resolveCanonicalRepoUrl(input);
  const inputSlug = resolveCanonicalRepoSlug(input);
  const isCanonical = inputSlug === CANONICAL_GITHUB_REPO_SLUG;
  const wasMalformed = !input || looksLikePlaceholder(input) || looksLikeRorkRouter(input);
  return {
    resolved,
    slug: inputSlug,
    isCanonical,
    wasMalformed,
    error: isCanonical ? null : `Repo URL must point to ${CANONICAL_GITHUB_REPO_SLUG}; got ${inputSlug}`,
  };
}

/** Return true if the SHA looks like a real git SHA (not blank/placeholder). */
export function isRealSha(value) {
  if (!value || typeof value !== 'string') return false;
  const clean = value.trim().toLowerCase();
  if (!clean) return false;
  if (clean.length < 7) return false;
  if (!/^[0-9a-f]+$/.test(clean)) return false;
  if (clean === '0000000' || clean.startsWith('000000')) return false;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(clean)) return false;
  }
  return true;
}

/** Return true if the deploy ID looks like a real Render deploy ID. */
export function isRealDeployId(value) {
  if (!value || typeof value !== 'string') return false;
  const clean = value.trim();
  if (!clean) return false;
  if (clean.length < 6) return false;
  if (/^(deploy|dep|dpl)-?[0-9a-f]{8,}$/i.test(clean)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return true;
  return false;
}
