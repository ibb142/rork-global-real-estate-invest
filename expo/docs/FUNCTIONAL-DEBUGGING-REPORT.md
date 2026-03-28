# Functional Debugging Report — End-to-End Fixes

This report documents the **functional** debugging investigation and fixes for the three main features: JV (photos/deals), Analytics, and SMS. It traces each flow from frontend → API → backend → database/service and confirms fixes with logging and verification steps.

---

## 1. JV Module — Photos and Deals Not Saving

### Flow traced

| Step | Location | What happens |
|------|----------|--------------|
| 1 | `app/jv-agreement.tsx` | User saves/publishes; `buildJVPayload()` builds payload (photos as URLs or `data:` URIs). For new deals with local photos, `skipLocalPhotos=true` so payload has no base64; after create, `uploadAllPhotos()` is called. |
| 2 | `app/jv-agreement.tsx` | `uploadAllPhotos()` calls `uploadDealPhotoMutation.mutateAsync({ dealId, photoData, mimeType })` per photo, then `updateMutation.mutateAsync({ id: backendId, data: { photos: allPhotos } })` to persist URLs. |
| 3 | `backend/trpc/routes/jv-agreements.ts` | `save` / `saveAndPublish` push to `store.jvAgreements` and `await store.persist()`. `update` merges `input.data` (including `photos`) into the deal, then `await store.persist()`. |
| 4 | `backend/store/index.ts` | `store.persist()` writes full store (including `jvAgreements`) to DynamoDB. |
| 5 | Frontend | After photo update, list must refetch so the main module shows the deal with photos. |

### Root causes addressed

1. **No immediate UI update after photo update**  
   After `updateMutation.mutateAsync({ id, data: { photos: allPhotos } })`, the selected agreement in state was not updated with the returned `agreement.photos`, so the UI could still show the old photo list until a refetch completed.

2. **Insufficient logging**  
   Hard to confirm from logs that save → persist and update (photos) → persist completed successfully and with the expected photo count.

### Fixes implemented

- **`backend/trpc/routes/jv-agreements.ts`**
  - **save**: Log after persist: `"Save completed — id: X, total deals: Y"`.
  - **update**: After `Object.assign` and `store.persist()`, log `"Update persisted successfully — deal id: X, photos: Y"`; on persist failure, log a clear warning that DB may be stale.
  - **saveAndPublish**: Log `"saveAndPublish completed — id: X, total deals: Y"`.
  - **uploadDealPhoto**: Log `"Upload complete for deal X — photoUrl length: Y, success: true"` so each upload is visible in logs.

- **`app/jv-agreement.tsx`**
  - After a successful **photo update** (both in the “update existing” and “create new” branches), set local state from the mutation result:  
    `setSelectedAgreement(prev => prev && prev.id === agreement.id ? { ...prev, photos: photoUpdateResult.agreement.photos } : prev)`  
    so the current deal view shows the new photos immediately without waiting for list refetch.

### Verification

- Create a new JV deal, add photos, Save & Publish → backend logs show save completed, then upload complete per photo, then update persisted with photo count; UI shows photos right after publish.
- Edit an existing deal, add more photos, Save & Publish → same logs; selected deal updates with new photos.
- Open the main JV/deals list → deals show correct photo counts and thumbnails (list is refetched/invalidated after save).
- Restart server → deals and photos still load from DynamoDB (store init before serve).

---

## 2. Analytics Reports Not Showing Live Data

### Flow traced

| Step | Location | What happens |
|------|----------|--------------|
| 1 | `app/landing.tsx` | On load and interactions, `trackEventRef.current(event, properties)` runs; it prefers `fetch(apiBaseUrl + '/track/visit', { body: JSON.stringify(trackPayload) })` and falls back to `trackMutation.mutate(...)` (tRPC `trackLanding`) on failure. |
| 2 | `backend/hono.ts` | `POST /track/visit` parses body, creates visitor log entry and analytics event with `userId: 'landing_visitor'`, then calls `store.addVisitorLog(entry)` and `store.addAnalyticsEvent(evt)`. |
| 3 | `backend/store/index.ts` | `addAnalyticsEvent` pushes to `store.analyticsEvents` and, if DynamoDB is available, writes the event via `dynamoDB.put('analyticsEvents', evt.id, evt)`. |
| 4 | `backend/trpc/routes/analytics.ts` | `getLandingAnalytics` filters `store.analyticsEvents` by `userId === 'landing_visitor'` and time window, then aggregates pageViews, sessions, funnel, etc. |
| 5 | `app/analytics-report.tsx` | `trpc.analytics.getLandingAnalytics.useQuery({ period })` with refetch interval; result is displayed. If no data, diagnostic panel explains possible causes. |

### Root causes addressed

1. **Unclear whether events were received**  
   No log when a landing event was written, so it was hard to tell if “no data” was due to no traffic or wrong API URL.

2. **No hint when report is empty**  
   When the report showed zeros, users had no clear guidance (e.g. wrong `EXPO_PUBLIC_*_API_BASE_URL`) to fix tracking.

### Fixes implemented

- **`backend/hono.ts`**  
  After `store.addAnalyticsEvent(evt)`, log:  
  `[Track] Event received: <evt.event> | <ip> | <device> | landing_visitor events now: <count>`  
  so each request that adds an event is visible and total landing events are visible.

- **`backend/store/index.ts`**  
  In `addAnalyticsEvent`, when `evt.userId === 'landing_visitor'`, log:  
  `[Store] addAnalyticsEvent: <event> (id: ..., total landing: N)`  
  to confirm events are appended and to see total landing count.

- **`backend/trpc/routes/analytics.ts`**  
  (Existing log retained) `getLandingAnalytics` already logs store status and “Final REAL output: pageViews=…, sessions=…, events=…”.

- **`app/analytics-report.tsx`**  
  When DB is available but `landingEvents === 0`, the diagnostic panel now says:  
  *“No landing events yet. Ensure the landing page sends events to this backend: set EXPO_PUBLIC_RORK_API_BASE_URL or EXPO_PUBLIC_API_BASE_URL to your API URL (e.g. http://localhost:3000 in dev). Then visit the landing page to generate events.”*

### Verification

- Backend running, then open the **landing page** in the app (with correct API base URL) → server logs show `[Track] Event received: landing_page_view | ...` and `[Store] addAnalyticsEvent: landing_page_view (... total landing: N)`.
- Open **Analytics Report** → after a short delay, page views and sessions increase; “Final REAL output” in logs matches.
- With API URL pointing to the wrong host → no `[Track]` logs; report stays at zero; diagnostic message tells user to set the correct API URL and visit the landing page.

---

## 3. SMS Messages Not Delivered

### Flow traced

| Step | Location | What happens |
|------|----------|--------------|
| 1 | `backend/lib/sms-service.ts` | `sendSMS(message, type)` filters `TEAM_RECIPIENTS` by active and alert type, then calls `sendToPhone(phone, message, type, name)` for each. |
| 2 | `sendToPhone` | If AWS creds are set, builds `PublishCommand` with `PhoneNumber`, `Message`, and SNS attributes, then `snsClient.send(command)`. |
| 3 | AWS SNS | Delivers SMS; returns `MessageId` or throws (e.g. invalid phone, region, or IAM). |

### Root causes addressed

1. **No visibility into request/response**  
   Logs did not show the exact phone used, message length, region, or the SNS response/error, making it hard to confirm delivery or debug failures.

2. **Phone format**  
   SNS expects E.164. If a number was stored with spaces/dashes or without country code, sends could fail without a clear log.

### Fixes implemented

- **`backend/lib/sms-service.ts`**
  - **`normalizePhoneToE164(phone)`**  
    Strips non-digits; if 10 digits and no leading `+`, prefixes `+1`; if 11 digits starting with `1`, prefixes `+`; otherwise `+` + digits. All SNS sends use this normalized value.
  - **Before send**: Log `[SMS] Sending <type> to <name> (<normalizedPhone>) — message length: X, region: Y`.
  - **On success**: Log `[SMS] SNS response: MessageId=<id> — DELIVERED <type> to <name> at <time>`.
  - **On failure**: Log `[SMS] SNS FAILED — <name> (<phone>): <message> [<code>]` and, when available, stack trace.

### Verification

- With **AWS credentials set** and IAM allowing `sns:Publish`: trigger an SMS (e.g. hourly report or manual send) → logs show “Sending…”, then “SNS response: MessageId=… — DELIVERED”; phone receives SMS.
- With **credentials missing**: logs show “SMS-SIM” and “simulating send”; no SNS call.
- With **invalid number or IAM**: logs show “SNS FAILED” with error message and code; fix number format or IAM and retry.

---

## Files modified (this round)

| File | Changes |
|------|--------|
| `backend/trpc/routes/jv-agreements.ts` | Logging: save/saveAndPublish/update persist outcome and photo count; uploadDealPhoto success log. |
| `app/jv-agreement.tsx` | After successful photo-update mutation, set `selectedAgreement` from `photoUpdateResult.agreement` (including `photos`) so UI updates immediately. |
| `backend/hono.ts` | After `addAnalyticsEvent` in `/track/visit`, log event type and total landing_visitor count. |
| `backend/store/index.ts` | In `addAnalyticsEvent`, log when `userId === 'landing_visitor'` (event type and total landing count). |
| `app/analytics-report.tsx` | When DB ok but no landing events, show message to set API base URL and visit landing page. |
| `backend/lib/sms-service.ts` | Add `normalizePhoneToE164`; use it for all sends; log send params, SNS response MessageId, and full error on failure. |
| `docs/FUNCTIONAL-DEBUGGING-REPORT.md` | This report. |

---

## Summary

| Feature | Root cause | Fix | Verification |
|--------|------------|-----|--------------|
| **JV photos/deals** | UI not updated from mutation result after photo update; light logging | Update `selectedAgreement` from `photoUpdateResult.agreement`; add persist and upload success logs | Photos appear in deal view and in list; logs show save/update/upload and photo counts. |
| **Analytics** | Hard to tell if events arrived; no guidance when report empty | Log each track/visit and landing event in store; diagnostic text for missing API URL | Landing visit → logs show event; report shows data; wrong URL → zeros + hint. |
| **SMS** | No request/response or phone-format handling | E.164 normalization; log send params, MessageId, and errors | Real send → “SNS response: MessageId=…”; failures show code and message. |

Infrastructure fixes from the earlier audit (e.g. `store.init()` before serve, DynamoDB JSON parse resilience, S3 body handling) remain in place and are required for these flows to work correctly.
