/**
 * IVX 3D generation — owner-controlled only. NO Rork toolkit proxy.
 *
 * Routes through the owner's own 3D provider keys:
 *   - MESHY_API_KEY  -> Meshy direct API (https://api.meshy.ai)
 *   - TRIPO_API_KEY  -> Tripo direct API (https://api.tripo3d.ai)
 * When neither key is present it falls back to a deterministic PROCEDURAL
 * Three.js preview scene spec (a real, in-process artifact) and reports the
 * exact missing provider key so the owner can enable real generation.
 *
 * The provider submit call is INJECTABLE (`Model3DSubmitter`) so the request
 * shaping, provider selection, labeling, and procedural fallback are unit-
 * testable without the network. The default submitter lazy-imports nothing
 * heavy and talks to the chosen provider over plain fetch.
 */

import { MEDIA_EVIDENCE_LABELS, resolveMediaProvenance, type MediaEvidenceLabel, type MediaProvenance } from './ivx-media-labels';
import { selectModel3DProvider, hasMeshyKey, hasTripoKey, type MediaProviderSelection } from './ivx-media-providers';

export type Model3DSubmission = {
  /** Provider task id the owner can poll for the finished asset URL. */
  taskId: string;
  /** Optional immediate model URL when the provider returns one synchronously. */
  modelUrl?: string | null;
};

export type Model3DSubmitter = (input: {
  prompt: string;
  sourceImages: string[];
  apiKey: string;
  provider: 'meshy' | 'tripo';
  endpoint: string;
}) => Promise<Model3DSubmission>;

export type Model3DRequest = {
  prompt: string;
  /** Source image URLs for image-to-3D / reference-based generation. */
  sourceImages?: string[];
};

/** A deterministic, in-process procedural Three.js scene spec (real fallback artifact). */
export type ProceduralPreview = {
  format: 'three-js-scene-spec';
  background: string;
  objects: {
    geometry: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus';
    position: [number, number, number];
    scale: number;
    color: string;
  }[];
  note: string;
};

export type Model3DResult = {
  ok: boolean;
  /** Evidence label: GENERATED_3D | PROCEDURAL_PREVIEW | BLOCKED_MISSING_PROVIDER_KEY. */
  label: MediaEvidenceLabel;
  provider: MediaProviderSelection;
  provenance: MediaProvenance;
  submission: Model3DSubmission | null;
  proceduralPreview: ProceduralPreview | null;
  /** Exact missing owner key when no real 3D provider is configured. */
  blocker: { reason: string; dependency: string; ownerAction: string } | null;
  error: string | null;
  generatedAt: string;
};

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Deterministic hash so the procedural preview is stable for a given prompt. */
function hashPrompt(prompt: string): number {
  let hash = 2166136261;
  for (let i = 0; i < prompt.length; i += 1) {
    hash ^= prompt.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const GEOMETRIES: ProceduralPreview['objects'][number]['geometry'][] = ['box', 'sphere', 'cylinder', 'cone', 'torus'];
const PALETTE = ['#1f6feb', '#d29922', '#3fb950', '#a371f7', '#f85149', '#39c5cf'];

/**
 * Build a deterministic procedural Three.js scene spec from the prompt. This is
 * a REAL artifact the app can render with three.js — never a fake 3D model URL.
 */
export function buildProceduralPreview(prompt: string): ProceduralPreview {
  const seed = hashPrompt(prompt || 'ivx');
  const count = 3 + (seed % 4); // 3..6 primitives
  const objects: ProceduralPreview['objects'] = [];
  for (let i = 0; i < count; i += 1) {
    const local = (seed >> (i * 3)) ^ (seed * (i + 1));
    objects.push({
      geometry: GEOMETRIES[local % GEOMETRIES.length],
      position: [((local % 5) - 2) * 1.2, (((local >> 3) % 4) - 1) * 1.0, (((local >> 6) % 5) - 2) * 1.2],
      scale: 0.6 + ((local >> 9) % 5) * 0.18,
      color: PALETTE[(local >> 4) % PALETTE.length],
    });
  }
  return {
    format: 'three-js-scene-spec',
    background: '#0d1117',
    objects,
    note: 'Procedural placeholder scene (deterministic from the prompt). Set MESHY_API_KEY or TRIPO_API_KEY for real model generation.',
  };
}

/** Default submitter: owner-direct Meshy / Tripo over fetch. */
export const defaultModel3DSubmitter: Model3DSubmitter = async (input) => {
  if (input.provider === 'meshy') {
    const body = input.sourceImages.length > 0
      ? { image_url: input.sourceImages[0], mode: 'preview' }
      : { mode: 'preview', prompt: input.prompt, art_style: 'realistic' };
    const url = input.sourceImages.length > 0
      ? 'https://api.meshy.ai/openapi/v1/image-to-3d'
      : input.endpoint;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Meshy returned HTTP ${response.status}`);
    }
    const json = (await response.json().catch(() => ({}))) as { result?: string; id?: string };
    const taskId = readTrimmed(json.result) || readTrimmed(json.id);
    if (!taskId) throw new Error('Meshy did not return a task id.');
    return { taskId, modelUrl: null };
  }

  // Tripo direct
  const response = await fetch(input.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(
      input.sourceImages.length > 0
        ? { type: 'image_to_model', file: { url: input.sourceImages[0] } }
        : { type: 'text_to_model', prompt: input.prompt },
    ),
  });
  if (!response.ok) {
    throw new Error(`Tripo returned HTTP ${response.status}`);
  }
  const json = (await response.json().catch(() => ({}))) as { data?: { task_id?: string } };
  const taskId = readTrimmed(json.data?.task_id);
  if (!taskId) throw new Error('Tripo did not return a task id.');
  return { taskId, modelUrl: null };
};

/**
 * Generate a 3D model through the owner's provider, or a procedural preview when
 * no owner 3D key is configured. Never throws — failures return ok:false + the
 * exact reason. Output is labeled GENERATED_3D / PROCEDURAL_PREVIEW /
 * BLOCKED_MISSING_PROVIDER_KEY.
 */
export async function generateIVX3DModel(
  request: Model3DRequest,
  submitter: Model3DSubmitter = defaultModel3DSubmitter,
): Promise<Model3DResult> {
  const generatedAt = new Date().toISOString();
  const prompt = readTrimmed(request.prompt);
  const sources = (request.sourceImages ?? []).map(readTrimmed).filter((s) => s.length > 0);
  const provider = selectModel3DProvider();
  const provenance = resolveMediaProvenance({ kind: 'model3d', sourceImageCount: sources.length });

  if (!prompt && sources.length === 0) {
    return {
      ok: false,
      label: MEDIA_EVIDENCE_LABELS.BLOCKED_MISSING_PROVIDER_KEY,
      provider,
      provenance,
      submission: null,
      proceduralPreview: null,
      blocker: null,
      error: 'A non-empty prompt or at least one source image is required for 3D generation.',
      generatedAt,
    };
  }

  const hasOwnerKey = hasMeshyKey() || hasTripoKey();
  if (!hasOwnerKey) {
    // No owner 3D provider key — return a real procedural preview, but report the
    // missing key honestly so real generation can be enabled.
    return {
      ok: true,
      label: MEDIA_EVIDENCE_LABELS.PROCEDURAL_PREVIEW,
      provider,
      provenance,
      submission: null,
      proceduralPreview: buildProceduralPreview(prompt || sources[0]),
      blocker: {
        reason: 'No owner-controlled 3D provider key is configured; returned a deterministic procedural Three.js preview.',
        dependency: 'MESHY_API_KEY (Meshy direct) or TRIPO_API_KEY (Tripo direct).',
        ownerAction: 'Set MESHY_API_KEY or TRIPO_API_KEY on the backend to enable real GENERATED_3D output.',
      },
      error: null,
      generatedAt,
    };
  }

  const apiKey = hasMeshyKey() ? readTrimmed(process.env.MESHY_API_KEY) : readTrimmed(process.env.TRIPO_API_KEY);
  const providerName: 'meshy' | 'tripo' = hasMeshyKey() ? 'meshy' : 'tripo';
  try {
    const submission = await submitter({
      prompt,
      sourceImages: sources,
      apiKey,
      provider: providerName,
      endpoint: provider.endpoint,
    });
    return {
      ok: true,
      label: MEDIA_EVIDENCE_LABELS.GENERATED_3D,
      provider,
      provenance,
      submission,
      proceduralPreview: null,
      blocker: null,
      error: null,
      generatedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '3D generation failed.';
    return {
      ok: false,
      label: MEDIA_EVIDENCE_LABELS.BLOCKED_MISSING_PROVIDER_KEY,
      provider,
      provenance,
      submission: null,
      proceduralPreview: buildProceduralPreview(prompt || sources[0]),
      blocker: {
        reason: `${providerName} direct API call failed; returned a procedural preview as fallback.`,
        dependency: providerName === 'meshy' ? 'MESHY_API_KEY (valid, funded)' : 'TRIPO_API_KEY (valid, funded)',
        ownerAction: `Verify the ${providerName} key/credits, then retry for GENERATED_3D output.`,
      },
      error: message.slice(0, 400),
      generatedAt,
    };
  }
}
