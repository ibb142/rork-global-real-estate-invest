/**
 * Pure builder for the GET /version endpoint payload.
 *
 * Kept free of any framework imports so it can be unit-tested in isolation and
 * reused by any transport (Hono, Express, etc.). The HTTP layer supplies the
 * runtime build facts; this module only shapes the minimal, machine-readable
 * descriptor that external deploy checks consume to verify the live commit.
 */

export type VersionPayloadInput = {
  commit: string;
  commitShort: string;
  deploymentMarker: string;
  bootTime: string;
  timestamp: string;
};

export type VersionPayload = {
  ok: true;
  service: 'ivx-owner-ai-backend';
  commit: string;
  commitShort: string;
  deploymentMarker: string;
  bootTime: string;
  timestamp: string;
};

export function buildVersionResponse(input: VersionPayloadInput): VersionPayload {
  return {
    ok: true,
    service: 'ivx-owner-ai-backend',
    commit: input.commit,
    commitShort: input.commitShort,
    deploymentMarker: input.deploymentMarker,
    bootTime: input.bootTime,
    timestamp: input.timestamp,
  };
}
