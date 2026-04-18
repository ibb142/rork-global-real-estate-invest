# IVX access-control audit and remediation

**Control flow**
- [x] Trace client session bootstrap, IVX token resolution, API auth, backend owner guard, role lookup, and room startup gate.
- [x] Identify every auth decision point affecting IVX room open/send flows.
- [x] Verify table resolution paths for `ivx_*`, generic schema fallback, and local-only fallback.

**Root-cause fixes**
- [x] Centralize IVX auth/session/role resolution in one shared access-control module.
- [x] Make test/open-access bypass explicit and environment-aware instead of implicit/hardcoded per file.
- [x] Preserve strict production behavior by defaulting bypass flags off in production unless explicitly enabled.
- [x] Keep privileged role normalization as a single source of truth.
- [x] Ensure client token propagation and server bearer-token verification use the same contract.

**Observability**
- [x] Add structured auth audit logs for token, session, role, and allow/bypass decisions.
- [x] Return clearer auth failure messages that identify the failed guard layer.
- [x] Surface guard mode and role audit details in IVX owner API request logs.

**Validation**
- [x] Typecheck passes.
- [x] Lint passes.
- [x] Confirm the next likely failure, if any, is downstream of auth bootstrap rather than the owner guard.
- [x] Record current sandbox limitations for live Supabase role/table verification.

**Proof**
- [x] List exact files changed.
- [x] List exact guard points audited.
- [x] Document before/after behavior for test/open-access mode and strict mode.
- [x] Report validation output and remaining follow-ups.

**Android IVX owner room remediation**
- [x] Switch Android soft-input handling to resize for the chat composer.
- [x] Keep the bottom composer above the Android gesture/nav area with safe-area-aware padding.
- [x] Avoid Android KeyboardAvoidingView double-shift while preserving iOS keyboard padding.
- [x] Ensure owner-room message list and realtime query paths handle generic room schemas consistently.
- [x] Propagate dev test mode through the shared Owner AI request path for concise action-first responses.
- [x] Collect validation artifacts for typecheck, lint, backend request flow, and available screenshot proof.
