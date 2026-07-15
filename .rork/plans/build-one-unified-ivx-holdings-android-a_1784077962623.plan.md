---
name: "Build one unified IVX Holdings Android app with every member and owner module"
overview: "We will build a single Android release APK from the complete IVX Holdings application source, so the public real estate experience, member features, and owner/admin tools all ship in one install. The Vercel Exit Command Center will stay an owner-only module reachable from the owner console, not the default entry point."
createdAt: 2026-07-15T01:12:42.623Z
---
# Build one unified IVX Holdings Android app with every member and owner module

We will build a single Android release APK from the complete IVX Holdings application source, so the public real estate experience, member features, and owner/admin tools all ship in one install. The Vercel Exit Command Center will stay an owner-only module reachable from the owner console, not the default entry point.

## Features

- Open the app to the normal IVX Home screen for members, not to the Vercel Exit module.
- Member registration, login, password recovery, and profile management.
- Browse a feed, property listings, deals, and reels.
- Real-time chat, media uploads, and notifications.
- Owner passwordless login and owner-only console.
- Owner dashboards for members, investors, buyers, properties, deals, revenue, transactions, and analytics.
- AI Engineering Command Center and IVX Owner AI.
- Vercel Exit Command Center as an owner/admin module under IVX Engineering.
- Security, settings, logs, and deployment controls.
- Current production backend connections, timeout fixes, and API configuration.

## Pages / Screens

- **Public / Member app:** Home, Feed, Properties, Deals, Reels, Search, Messages, Notifications, Profile, Registration, Login.
- **Owner / Admin:** Owner Dashboard, Members, Investors, Buyers, Properties, Deals, Revenue, Transactions, Analytics, Variables, Deployments, AI Engineering Command Center, Vercel Exit Command Center, Security, Settings, Logs.

## Build and delivery

- Use the complete application source as the single build entry point.
- Remove any dashboard-only entry point or redirect that would open the Vercel module first.
- Bump the Android version to 1.4.3 build 12 (versionCode 12).
- Produce the release APK through EAS cloud build using the configured project ID.
- Inspect the built APK to confirm the correct package name, app name, icon, version, embedded SHA, and navigation root.
- Verify the bundle contains all routes and modules for both public and owner experiences.

## Production synchronization

- Align the embedded release SHA with the current GitHub HEAD and the live Render deployment.
- Confirm Render /version and /health return the same SHA.
- Ensure the APK, GitHub, and Render versions are consistent.

## QA

- App opens to the public home/login experience.
- Member login and owner login both work.
- Feed, properties, deals, and reels load.
- Chat and media upload work.
- Owner AI responds.
- Owner Dashboard, AI Engineering Command Center, and Vercel Exit Command Center open.
- Back navigation and logout return to the public app.
- Restart preserves session and no route redirects every user to the Vercel dashboard.

## Final acceptance

- The APK opens the full IVX Holdings real estate app.
- Vercel Exit Command Center is only one owner/admin module.
- All existing IVX modules are included.
- The APK is built from the correct full-app source.
- All routes are verified.
- GitHub, Render, /version, and APK SHA match.
- A direct APK download link is provided.