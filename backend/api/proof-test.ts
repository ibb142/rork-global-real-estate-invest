/**
 * owner-ai-proof-test module — backend endpoint.
 *
 * Public, unauthenticated proof endpoint used to demonstrate full-stack
 * execution (backend route + frontend page + Supabase table) in one feature.
 *
 * GET /api/proof-test → { "status": "success", "source": "owner-ai" }
 */

const PROOF_TEST_MODULE = 'owner-ai-proof-test';

function corsHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

export function proofTestOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/** Returns the proof-test payload exactly as specified by the feature contract. */
export function handleProofTestRequest(request: Request): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(
      JSON.stringify({ status: 'error', source: 'owner-ai', error: 'Method not allowed.' }),
      { status: 405, headers: corsHeaders() },
    );
  }

  return new Response(
    JSON.stringify({
      status: 'success',
      source: 'owner-ai',
      module: PROOF_TEST_MODULE,
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers: corsHeaders() },
  );
}
