# Block 28: CTO Operational Dashboard — owner-only IVX IA control surface

## What this adds

Block 28 ships an owner-only operational dashboard that aggregates the
multi-agent framework (Block 25), self-execution (Block 26), and parallel
execution (Block 27) into one live control surface for the CTO.

### Backend

- `backend/api/ivx-cto-dashboard.ts` (new) — owner-only routes:
  - `GET  /api/ivx/cto-dashboard/overview` — aggregated tasks, agents,
    handoffs, audit, parents, blocked tasks, retries, deploy proposals.
    Supports filters: `agentId`, `status`, `risk`, `since`, `until`, `limit`.
  - `GET  /api/ivx/cto-dashboard/audit` — searchable audit (`q`, `agentId`).
  - `GET  /api/ivx/cto-dashboard/parent/:parentId/tree` — full parent
    parallel-execution tree.
  - `POST /api/ivx/cto-dashboard/control` — safe owner controls:
    `retry`, `cancel`, `pause`, `resume`, `approve`, `inspect`.
- `backend/services/agents/multi-agent-framework.ts` — added
  `cancelTask`, `pauseTask`, `resumeTask`, `retryTask`, `approveTask`,
  plus `paused` and `cancelled` execution states. High-risk approval is
  rejected automatically (must use the CLI flow).
- All routes go through `assertIVXOwnerOnly`.

### Frontend

- `expo/src/modules/ivx-owner-ai/services/ivxCTODashboardService.ts`
  (new) — typed client for the dashboard endpoints, reusing the existing
  owner-AI URL discovery and bearer token.
- `expo/app/ivx/cto-dashboard.tsx` (new) — responsive owner-only UI:
  - Live task tree (parent/child) with aggregation summaries
  - Agent health + active task counts
  - Risk badges (low/medium/high)
  - Retry + timeout indicators
  - Filters: agent, status, risk, time range
  - Audit log search + memory namespace inspector
  - Deploy proposals queue (low/medium-risk only)
  - Safe owner controls in a task detail modal:
    retry / cancel / pause / resume / approve (low/medium) / inspect
  - High-risk approvals remain blocked automatically
- `expo/app/ivx/_layout.tsx` — registered the new `cto-dashboard` screen.

### Safety

- Owner-only via `assertIVXOwnerOnly` for every endpoint and every
  control action.
- High-risk approvals are rejected at the API layer with HTTP 403.
- No destructive actions: dashboard never deploys, mutates schemas, or
  bypasses Block 25 risk gates.
- Read-only aggregation otherwise.

### Validation

- `runChecks` for the Expo workspace covers TypeScript + lint.
- Block 27 `runParallelValidation()` continues to be the source of truth
  for multi-agent + parallel execution coverage; the dashboard surfaces
  its records (parent tree, blocked risky child, retry events).

### Deliverable report

- Files changed
- Architecture added
- Commands run
- Validation results
- Blockers (if any)
