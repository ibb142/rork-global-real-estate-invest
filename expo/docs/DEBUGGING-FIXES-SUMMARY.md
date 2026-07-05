# Debugging Fixes Summary

This document summarizes the root causes and fixes applied for the three reported issues.

---

## 1. JV Module – Photos and Deals Not Saving

### Root causes
- **Server accepting requests before store was ready**: The HTTP server started immediately while `store.init()` ran asynchronously. Early requests could see an empty `store.jvAgreements` (seed sets it to `[]`) before DynamoDB had been loaded, so new deals appeared not to save or persist.
- **No cache invalidation after draft save**: After saving a draft via "Save" (not "Publish"), the app refetched the list but did not invalidate `jvAgreements.list` or `jvAgreements.listPublished`, so the main module and admin list did not always show the new deal until a manual refresh.

### Fixes implemented
- **`server.ts`**: The server now **awaits `store.init()`** before calling `serve()`. No requests are accepted until the store (and DynamoDB) has finished loading, so JV deals and other data are available from the first request.
- **`app/jv-agreement.tsx`**: After a successful **draft save**, the app now invalidates `utils.jvAgreements.list` and `utils.jvAgreements.listPublished` so the deals list and landing page see new/updated deals in real time.
- **`backend/trpc/routes/jv-agreements.ts`**: Improved logging around persist (success count, non-fatal persist failures) to make DB write issues easier to diagnose.

### Verification
- Create a new JV deal with photos and save/publish → deal and photos should persist and appear in the list and on the landing page.
- Save as draft → deal should appear in the JV list and admin JV deals without a full page refresh.
- Restart the server → previously saved deals should still be there (DynamoDB loaded before serve).

---

## 2. Analytics Report Not Working

### Root cause
- **Same readiness issue**: Analytics data lives in `store.analyticsEvents` and related store state, which is loaded from DynamoDB inside `store.init()`. If the server served requests before `init()` completed, the analytics report could see empty or stale data and appear "not connected" or show no data.

### Fixes implemented
- **`server.ts`**: Awaiting `store.init()` before `serve()` ensures analytics data (and all other store data) is loaded before any request, so the analytics report gets the correct dataset.
- **`backend/trpc/routes/analytics.ts`**: Added logging of `storeReady` on each `getLandingAnalytics` request so you can confirm in logs that the store was ready when analytics was requested.

### Verification
- Open the analytics report page after server start → it should show data (or a clear "no data" state if there are no events yet).
- Ensure the landing/tracking endpoints are being called so events are recorded; the report shows real data only (no mock data).

---

## 3. SMS Messages Not Delivered

### Root causes
- **Missing or incorrect AWS credentials**: SMS is sent via **AWS SNS** using `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. If these are not set, the app runs in "simulated" mode: it logs the message and returns success but does not send real SMS.
- **Unclear configuration**: It was not obvious that SMS depends on the same AWS credentials as DynamoDB/S3 and that IAM must allow `sns:Publish`.

### Fixes implemented
- **`backend/lib/sms-service.ts`**:
  - **Startup log**: On load, the module logs either `[SMS] Mode: AWS SNS configured — messages will be delivered to recipients` or `[SMS] Mode: Simulated — set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for real SMS delivery` so you can see at a glance whether real SMS is enabled.
  - **Error logging**: On send failure, the code now logs the AWS error name/code (e.g. `InvalidParameterException`, `AuthorizationErrorException`) in addition to the message, making it easier to fix IAM or phone-number issues.
- **`.env.example`**: Documented that SMS uses AWS SNS with the same AWS credentials and that IAM must allow `sns:Publish` for delivery.

### Verification
- Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (and optionally `AWS_REGION`) in your environment.
- Ensure the IAM user/role has `sns:Publish` (and any other SNS permissions your setup needs).
- Restart the server and check logs for `[SMS] Mode: AWS SNS configured`.
- Send a test SMS (e.g. from SMS Reports or hourly report); on failure, check logs for the AWS error code and fix credentials or IAM accordingly.

---

## Configuration checklist

| Feature        | Required env / config |
|----------------|------------------------|
| JV deals + DB  | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_DYNAMODB_TABLE` (optional, default: `ivx-holdings`) |
| JV photos (S3) | Same AWS keys; optional `AWS_S3_BUCKET` (default: `ivx-holdings-prod`) |
| Analytics      | Same as JV (store loads from DynamoDB); no extra env |
| SMS delivery   | Same AWS keys; IAM must allow `sns:Publish` |

---

## Files changed

- `server.ts` – Await `store.init()` and start hourly reporting before `serve()`.
- `backend/hono.ts` – Removed duplicate `store.init()`; export `startHourlyReporting` for server.
- `app/jv-agreement.tsx` – Invalidate `list` and `listPublished` after draft save; already had `refetchOnWindowFocus` for list.
- `backend/trpc/routes/jv-agreements.ts` – Persist success/failure logging.
- `backend/trpc/routes/analytics.ts` – Log `storeReady` on landing analytics request.
- `backend/lib/sms-service.ts` – SMS mode startup log; detailed error logging with AWS error code.
- `.env.example` – Document SMS via AWS SNS and required credentials.
- `docs/DEBUGGING-FIXES-SUMMARY.md` – This summary.
