# IVX Production Hardening — Real-Device Smoke Checklist

Build tag: `hud-v2` + execution-stream marker `ivx-execution-stream-2026-05-28`
Hardening landed: 2026-05-28

This checklist is owner-executed against a physical iOS/Android device.
Each item maps 1:1 to the production-hardening pass committed to the
repo. Every code-side mitigation is in place; the items below verify the
real-device behavior.

## Pre-flight

- [ ] Latest build installed on iOS device
- [ ] Latest build installed on Android device
- [ ] Owner is signed into IVX Owner AI
- [ ] Watchdog HUD visible (single instance only)

## 1. Stability — duplicate watchdog HUD/banner

| Check | Expected |
|---|---|
| Open IVX chat | Exactly one HUD, one banner, one live-work FAB |
| Navigate IVX chat → home → IVX chat 5× | Console shows `[IVX_HUD] DUPLICATE_MOUNT_SUPPRESSED` if any duplicate attempt, never two visible HUDs |
| Hot-reload (dev) | `HUD_INSTANCE_COUNT` returns to 1 |
| 1 h idle | No HUD/banner duplication |

Code: `expo/components/IVXWatchdogPanel.tsx` (`HUD_INSTANCE_COUNT`, `BANNER_INSTANCE_COUNT`), `expo/components/IVXAdvancedExecutionMode.tsx` (`ADV_EXEC_INSTANCE_COUNT`), `expo/components/IVXLiveWorkVisibility.tsx` (`LIVE_WORK_INSTANCE_COUNT`).

## 2. Latency — execution-stream polling

| Check | Expected |
|---|---|
| Open Advanced Execution panel | Polls `/api/ivx/senior-dev/execution-stream` every 3 s |
| Background the app | Polling stops within one tick (no requests in proxy log) |
| Foreground the app | Polling resumes, single in-flight request |
| Open panel twice (nav spam) | Single primary mount, duplicates render null |

Code: `expo/components/IVXAdvancedExecutionMode.tsx` `AppState` listener; `refetchInterval: pollingEnabled ? 3000 : false`, `refetchIntervalInBackground: false`, `enabled: isPrimary`.

## 3. Mobile performance — evidence panel

| Check | Expected |
|---|---|
| Open Live Work panel | Polls every 20 s while active |
| Background | Polling halts |
| Idle 10 min, foreground | Resumes cleanly, one fetch |
| FPS during scroll | Stable ≥ 55 FPS on mid-tier device |

Code: `expo/components/IVXLiveWorkVisibility.tsx` `AppState` + singleton guard.

## 4. Execution reliability — overlay lifecycle

| Check | Expected |
|---|---|
| Open live-work overlay, switch route | Overlay closes, polling stops |
| Open overlay, background app | Overlay auto-closes |
| Force-quit & reopen | No ghost overlay |
| Owner AI request fails | Overlay state remains consistent |

Code: `expo/app/ivx/chat.tsx` overlay-lifecycle `useEffect` (closes `liveWorkVisible` + `watchdogDrawerVisible` on AppState change ≠ active and on unmount).

## 5. Duplicate overlay / log reduction

| Check | Expected |
|---|---|
| Trigger 5× silent failures rapidly | Only one repair-job bubble per trace |
| Watchdog SILENT_FAILURE × 3 same trace | Backend reports once (REPORTED_TRACE_IDS guard) |
| Chat assistant transient race | `emittedBubbleIds` keeps a single visible bubble |

Code: `expo/lib/ivx-incident-client.ts` (`REPORTED_TRACE_IDS`); `expo/app/ivx/chat.tsx` (`emittedBubbleIds`).

## 6. Memory — execution ring buffer

| Check | Expected |
|---|---|
| Run 1 h session, watch heap | No unbounded growth |
| Inspect `logs/audit/execution-stream.jsonl` | File rotates at 25 MB → `.jsonl.1` |
| In-memory ring | Capped at 400 events |

Code: `backend/services/ivx-execution-stream.ts` (`MAX_EVENTS = 400`, `MAX_LOG_BYTES = 25 MB`, `rotateStreamLogIfNeeded`).

## 7. Rate limiting — senior-dev endpoints

| Endpoint | Burst | Refill |
|---|---|---|
| `POST /senior-dev/proof` | 10 | 0.2/s |
| `POST /senior-dev/repo-search` | 10 | 0.2/s |
| `POST /senior-dev/test-report` | 6 | 0.1/s |
| `POST /senior-dev/e2e/run` | 4 | 0.05/s |
| `GET  /senior-dev/execution-stream` | 60 | 2/s |
| `POST /senior-dev/execution-record` | 60 | 2/s |
| Others | 30 | 1/s |

Verify: hit any limit → `429` JSON with `Retry-After` header.

Code: `backend/middleware/ivx-rate-limit.ts` + `backend/hono.ts` `withRateLimit` wrappers.

## 8. Long-session durability (1 h+)

| Check | Expected |
|---|---|
| Leave IVX chat open 1 h | No memory growth, no remount accumulation |
| Random foreground/background 1 h | Single execution stream, single HUD |
| Network drop + recover | Single reconnect, no spam |
| Inspect `setInterval` count in dev | No leaked timers |

## 9. Real-world smoke checklist (owner-executed)

- [ ] Background / foreground 10×
- [ ] Low network (LTE 1 bar) — Owner AI still responds with degraded UX
- [ ] Airplane mode mid-send — visible error bubble, retry works
- [ ] Reconnect after sleep — single auth refresh
- [ ] Screen rotation 10× — no overlay duplication
- [ ] Navigation spam (back/forward 20×) — single HUD, single FAB
- [ ] Android back button spam — chat stays mounted, overlay closes
- [ ] Low battery mode — polling intervals respected, no extra wake-ups
- [ ] 1 h idle session — no duplicate logs / no growth
- [ ] Offline → online recovery — repair-bubble surfaces, no duplicate banners

## Status

All code-side hardening: **DONE**.
Real-device verification: **WAITING_DEVICE_TEST** — requires owner to run the checklist above and tick each box.
