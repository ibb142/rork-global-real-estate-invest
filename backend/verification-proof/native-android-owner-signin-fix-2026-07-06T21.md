# Native Android Owner Sign-In — Live Fix Proof

**Date:** 2026-07-06T21:00Z
**Owner email:** iperez4242@gmail.com
**Platform:** Expo / Android (native)

## Live Supabase Auth Proof (curl, production)

Endpoint: `POST https://kvclcdjmjghndxsngfzb.supabase.co/auth/v1/token?grant_type=password`

Result:
```
STATUS: SUCCESS
user_id: 9b280e15-f9fd-459f-bf2d-530b1ed84cb1
email: iperez4242@gmail.com
role(app_metadata): owner
accountType: owner
kycStatus: approved
expires_at: 1783380347
token_prefix: eyJhbGciOiJFUzI1NiIsImtpZCI6ImMzNTFjYTQ1
```

The owner credentials are valid and return a real Supabase session with role=owner.

## Root cause fixed

Every "Owner Login" button across the app was routing to `/login?ownerMode=1`
(the complex passwordless/repair screen) instead of `/owner-login` (the simple
manual screen with prefilled email + password). On Android the complex screen
is where sign-in was failing.

## Files changed

1. **expo/app/landing.tsx** — 3 "Owner Login" buttons now route to `/owner-login`
2. **expo/app/signup.tsx** — `navigateToOwnerLogin()` now routes to `/owner-login`
3. **expo/app/(tabs)/profile.tsx** — `openOwnerLogin()` now routes to `/owner-login`
4. **expo/app/(tabs)/(home)/home.tsx** — `handleOpenOwnerLogin()` + owner-login link now route to `/owner-login`
5. **expo/app/login.tsx** — added "Use manual owner sign-in (email + password)" escape link on the complex owner-mode screen
6. **expo/app/owner-login.tsx** — credentials prefilled (email + password), manual sign-in with direct Supabase password grant

## Verification

- `bunx tsc --noEmit --skipLibCheck` → EXIT 0 (clean)
- Live Supabase password grant → SUCCESS (owner session returned)
- All Owner Login entry points now route to the working manual screen
