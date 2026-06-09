export type ProjectEnvLoadResult = {
  scriptDir: string;
  loadedEnvFiles: string[];
  loadedEnvFilesRelative: string[];
  localSupabaseOverride: {
    enabled: boolean;
    applied: string[];
  };
};

export type AwsCredentialDiagnostics = {
  region: string;
  credentialSource: string;
  hasAccessKeyId: boolean;
  hasSecretAccessKey: boolean;
  hasSessionToken: boolean;
  accessKeyIdPreview: string | null;
  missingEnvNames: string[];
  loadedEnvFiles: string[];
};

export function readTrimmedEnv(name: string): string;
export function loadProjectEnv(importMetaUrl: string): ProjectEnvLoadResult;
export function getAwsCredentialDiagnostics(envLoadResult?: ProjectEnvLoadResult, regionOverride?: string): AwsCredentialDiagnostics;
export function createAwsRuntime(importMetaUrl: string, regionOverride?: string): {
  envLoadResult: ProjectEnvLoadResult;
  diagnostics: AwsCredentialDiagnostics;
  clientConfig: Record<string, unknown>;
};
export function formatAwsCredentialError(error: unknown, diagnostics: AwsCredentialDiagnostics): string;
