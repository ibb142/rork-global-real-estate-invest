/**
 * Live end-to-end audit for owner passwordless sign-in + senior-developer
 * preflight. Runs from the repo sandbox and writes proof to
 * backend/verification-proof.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const OWNER_EMAIL = 'iperez4242@gmail.com';
const API_BASE = 'https://api.ivxholding.com';
const PROOF_DIR = 'backend/verification-proof';

async function postJson(path, body, headers = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  return { status: response.status, body: parsed };
}

async function getJson(path, headers = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  return { status: response.status, body: parsed };
}

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  let login = null;
  let authDiagnostic = null;
  let credentialAudit = null;
  let errors = [];

  try {
    login = await postJson('/api/ivx/owner-passwordless-login', { email: OWNER_EMAIL });
    if (!login.body.success) {
      errors.push(`passwordless-login failed: ${login.status} ${JSON.stringify(login.body)}`);
    }
  } catch (e) {
    errors.push(`passwordless-login threw: ${e.message}`);
  }

  let accessToken = login?.body?.accessToken ?? '';
  let tokenSegments = accessToken ? accessToken.split('.').length : 0;
  let tokenPayload = accessToken ? decodeJwt(accessToken) : null;

  if (accessToken) {
    try {
      authDiagnostic = await postJson('/api/ivx/owner-ai/auth-diagnostic', {}, { Authorization: `Bearer ${accessToken}` });
      if (authDiagnostic.status !== 200 || authDiagnostic.body.ok !== true) {
        errors.push(`owner-ai/auth-diagnostic rejected: ${authDiagnostic.status} ${JSON.stringify(authDiagnostic.body)}`);
      }
    } catch (e) {
      errors.push(`owner-ai/auth-diagnostic threw: ${e.message}`);
    }

    try {
      credentialAudit = await getJson('/api/ivx/senior-developer/credential-audit', { Authorization: `Bearer ${accessToken}` });
      if (credentialAudit.status !== 200 || credentialAudit.body.ok !== true) {
        errors.push(`senior-developer/credential-audit rejected: ${credentialAudit.status} ${JSON.stringify(credentialAudit.body)}`);
      }
    } catch (e) {
      errors.push(`senior-developer/credential-audit threw: ${e.message}`);
    }
  }

  const proof = {
    timestamp: startedAt,
    ownerEmail: OWNER_EMAIL,
    apiBase: API_BASE,
    verdict: errors.length === 0 ? 'OWNER_SENIOR_DEV_E2E_OK' : 'OWNER_SENIOR_DEV_E2E_BLOCKED',
    errors,
    passwordlessLogin: {
      status: login?.status ?? null,
      success: login?.body?.success ?? false,
      accessTokenPresent: Boolean(accessToken),
      tokenSegments,
      tokenEmail: tokenPayload?.email ?? null,
      tokenIssuer: tokenPayload?.iss ?? null,
      expiresAt: tokenPayload?.exp ?? null,
      passwordSelfHealed: login?.body?.passwordSelfHealed ?? null,
      authUserCreated: login?.body?.authUserCreated ?? null,
    },
    ownerAuthDiagnostic: authDiagnostic
      ? {
          status: authDiagnostic.status,
          ok: authDiagnostic.body.ok ?? false,
          checks: authDiagnostic.body.checks ?? null,
          rootCause: authDiagnostic.body.rootCause ?? null,
        }
      : null,
    seniorCredentialAudit: credentialAudit
      ? {
          status: credentialAudit.status,
          ok: credentialAudit.body.ok ?? false,
          ownerOnly: credentialAudit.body.ownerOnly ?? null,
          ownerApproval: credentialAudit.body.ownerApproval
            ? {
                ownerSessionDetected: credentialAudit.body.ownerApproval.ownerSessionDetected,
                bearerAccepted: credentialAudit.body.ownerApproval.bearerAccepted,
                ownerVerified: credentialAudit.body.ownerApproval.ownerVerified,
                ownerEmailMatched: credentialAudit.body.ownerApproval.ownerEmailMatched,
                ownerEmailMasked: credentialAudit.body.ownerApproval.ownerEmailMasked,
              }
            : null,
          audit: credentialAudit.body.audit
            ? {
                githubCanPush: credentialAudit.body.audit.github?.canPush ?? null,
                renderCanDeploy: credentialAudit.body.audit.render?.canDeploy ?? null,
              }
            : null,
        }
      : null,
  };

  const proofPath = `${PROOF_DIR}/owner-senior-dev-e2e-${Date.now()}.json`;
  mkdirSync(dirname(proofPath), { recursive: true });
  writeFileSync(proofPath, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
  console.log(`Proof written to ${proofPath}`);
  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
