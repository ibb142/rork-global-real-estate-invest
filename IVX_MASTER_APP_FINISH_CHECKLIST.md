# IVX Master App Finish Checklist

## Shortest execution plan first

1. Keep Expo Go and web stable before building any clones or new apps.
2. Finish local development readiness: package cleanup, startup checks, TypeScript, lint, and Metro bundle checks.
3. Confirm Supabase and GitHub are ready for development with minimum access only.
4. Activate the live backend only after local app stability is proven.
5. Verify production health and owner-control tools from the live backend.
6. Finish app feature QA, investor/member flows, owner AI flows, and polish.
7. Only after this app is stable, start clone/new-app work.

## Current stability status

- [x] Expo SDK 54 app config is present in `expo/app.config.ts`.
- [x] Expo remote updates are disabled for Expo Go/local development.
- [x] Root route startup is guarded to land on the public landing/startup flow instead of protected tabs.
- [x] Direct frontend import of Vercel `ai` SDK was removed from the Expo runtime path.
- [x] Unused/risky Expo workspace dependencies were removed from the app bundle surface: `ai`, `buffer`, `@stardazed/streams-text-encoding`, `@ungap/structured-clone`, and unused `expo-location`.
- [x] `expo install --check` reports Expo package versions are aligned.
- [x] Expo TypeScript passes.
- [x] Expo lint passes.
- [x] Root backend TypeScript passes.
- [x] Android/Expo Go Metro export passes.
- [x] Web static export passes after dependency cleanup.
- [ ] Real-device Expo Go must be manually opened from the QR code after `bun run start-clear`.

## Daily development stability checklist

Run these from the repository root:

```bash
bun install
bunx tsc --noEmit --pretty false
bun --cwd expo install
bun --cwd expo run lint
bun --cwd expo run start-clear
```

Run these from `expo/` when focusing only on the mobile app:

```bash
bun install
bunx expo install --check
bunx tsc --noEmit --pretty false
bun run lint
bun run start-clear
```

Expected:

- TypeScript exits 0.
- Lint exits 0.
- Expo install check says dependencies are up to date.
- Metro starts and waits on localhost.
- Expo Go opens without red-screen startup crashes.
- Web emulator opens without startup crashes.

## GitHub development readiness

- [x] Repo URL is configured through `GITHUB_REPO_URL`.
- [x] Owner-control GitHub tooling is read-only by default.
- [x] GitHub tooling supports fine-grained read-only token preference through `IVX_GITHUB_READONLY_TOKEN`.
- [ ] Confirm the active GitHub repo default branch is `main` from the live/backend environment.
- [ ] Confirm latest local code changes are pushed before any Render production verification.
- [ ] Replace broad `GITHUB_TOKEN` with least-privilege read-only token for routine checks where possible.

## Supabase development readiness

- [x] Frontend uses only public Supabase values: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- [x] Backend/service-role paths are separated from frontend runtime code.
- [x] Supabase readiness tooling checks anon/public readiness first.
- [x] Owner-approved Supabase writes require explicit confirmation.
- [ ] Confirm public Supabase REST readiness from the live backend.
- [ ] Confirm required tables/policies for auth, profiles, chat, owner AI, waitlist, JV deals, and analytics.
- [ ] Add `SUPABASE_READONLY_DATABASE_URL` only if direct schema inspection is required.

## Backend activation checklist

- [ ] Activate Render Docker Web Service.
- [ ] Verify Render service is no longer `404 x-render-routing: no-server`.
- [ ] Verify `https://api.ivxholding.com/health` returns HTTP 200.
- [ ] Verify `https://chat.ivxholding.com` resolves with valid TLS.
- [ ] Verify `https://ivxholding.com` resolves with valid TLS.
- [ ] Configure minimum backend environment variables only.
- [ ] Run production owner-control readiness tools from the live backend.

## App completion checklist before cloning/new apps

- [ ] Finish Expo Go real-device smoke test.
- [ ] Finish web emulator smoke test.
- [ ] Test sign in, owner access, reset password, and protected route redirects.
- [ ] Test investor intake/waitlist submission.
- [ ] Test member profile, wallet, portfolio, market, invest, and JV deal flows.
- [ ] Test IVX Owner AI room with local fallback and live backend mode.
- [ ] Test Supabase chat persistence/realtime readiness.
- [ ] Test admin dashboards for loading without startup crashes.
- [ ] Remove or defer nonessential experimental screens that slow QA.
- [ ] Finalize first-production environment variable list.
- [ ] Run final `deployment_readiness_matrix` and `final_completion_report` from production.

## Current completion estimate

- Development readiness: 98%.
- Production readiness: 62%.
- Main blocker: live Render service/DNS/TLS health verification.
- Do not start design clones or new apps until Expo Go, web, GitHub, Supabase, and backend health are all verified.
