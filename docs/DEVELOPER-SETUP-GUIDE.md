# IPX Holding — Developer Setup Guide

## Prerequisites

Before building for production, your developer needs to:

1. Install EAS CLI: `npm install -g eas-cli`
2. Log in to Expo: `eas login`
3. Create an EAS project: `eas init`

---

## app.json — Changes Required

Your developer must update these fields in `app.json` before submission:

```json
{
  "expo": {
    "name": "IPX Holding",
    "slug": "global-real-estate-invest",
    "scheme": "ipxholding",
    "splash": {
      "backgroundColor": "#0A0E1A"
    },
    "ios": {
      "bundleIdentifier": "com.ipxholding.app",
      "buildNumber": "1"
    },
    "android": {
      "package": "com.ipxholding.app",
      "versionCode": 1,
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      ["expo-notifications", {
        "icon": "./assets/images/icon.png",
        "color": "#C5FF3C"
      }]
    ],
    "extra": {
      "eas": {
        "projectId": "YOUR_EAS_PROJECT_ID"
      }
    },
    "updates": {
      "url": "https://u.expo.dev/YOUR_EAS_PROJECT_ID"
    }
  }
}
```

---

## eas.json — Full Configuration

Create this file at the project root:

```json
{
  "cli": {
    "version": ">= 10.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_APP_ENV": "development",
        "EXPO_PUBLIC_RORK_API_BASE_URL": "http://localhost:3000"
      },
      "ios": { "simulator": true },
      "android": { "buildType": "apk" }
    },
    "staging": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_APP_ENV": "staging",
        "EXPO_PUBLIC_STAGING_API_URL": "https://staging-api.ipxholding.com"
      },
      "ios": {
        "buildConfiguration": "Release",
        "bundleIdentifier": "com.ipxholding.app.staging"
      },
      "android": {
        "buildType": "apk",
        "applicationId": "com.ipxholding.app.staging"
      }
    },
    "production": {
      "distribution": "store",
      "env": {
        "EXPO_PUBLIC_APP_ENV": "production",
        "EXPO_PUBLIC_PRODUCTION_API_URL": "https://api.ipxholding.com"
      },
      "ios": {
        "buildConfiguration": "Release",
        "bundleIdentifier": "com.ipxholding.app"
      },
      "android": {
        "buildType": "app-bundle",
        "applicationId": "com.ipxholding.app"
      },
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "YOUR_APPLE_ID@email.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_APPLE_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "production"
      }
    }
  }
}
```

---

## Environment Variables (.env)

Create a `.env` file at the project root (never commit this to Git):

```env
# App Environment
EXPO_PUBLIC_APP_ENV=production

# API
EXPO_PUBLIC_PRODUCTION_API_URL=https://api.ipxholding.com
EXPO_PUBLIC_STAGING_API_URL=https://staging-api.ipxholding.com
EXPO_PUBLIC_RORK_API_BASE_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_live_...
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Plaid
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=production

# Twilio (SMS)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# SendGrid (Email)
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@ipxholding.com

# KYC Provider (Jumio or Onfido)
KYC_API_KEY=...
KYC_API_SECRET=...

# JWT
JWT_SECRET=...
JWT_REFRESH_SECRET=...

# Database
DATABASE_URL=postgresql://...

# AWS S3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=ipxholding-documents

# Sentry (Error Monitoring)
SENTRY_DSN=https://...@sentry.io/...
EXPO_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
```

---

## Build Commands

```bash
# Development build (local testing)
eas build --platform all --profile development

# Staging build (internal testers)
eas build --platform all --profile staging

# Production build (App Store + Google Play)
eas build --platform all --profile production

# Submit to App Store
eas submit --platform ios --profile production

# Submit to Google Play
eas submit --platform android --profile production

# OTA Update (no new build needed)
eas update --channel production --message "Bug fix release"
```

---

## iOS App Store Requirements

Before submitting to the App Store:

1. Apple Developer Account: `developer.apple.com`
2. Create App ID with bundle: `com.ipxholding.app`
3. Create certificates (Distribution) and provisioning profiles
4. Create app in App Store Connect
5. Prepare screenshots for iPhone 6.7", 6.5", 5.5"
6. App Store listing description (see below)

**App Store Description:**
```
IPX Holding — Real Estate Investment Platform

Invest in premium real estate properties starting from $1. 
IPX Holding gives everyday investors access to institutional-grade 
real estate opportunities across the United States and globally.

KEY FEATURES:
• Fractional real estate ownership starting at $1
• Earn quarterly dividends from rental income
• Secondary marketplace to trade shares
• AI-powered investment insights
• Full KYC/AML compliance
• SEC-regulated offerings
• Portfolio analytics & performance tracking
• VIP investor tiers
• Gift shares to family & friends

INVESTMENT TYPES:
• Residential properties
• Commercial real estate  
• Industrial & logistics
• International properties

SECURITY:
• Bank-level 256-bit encryption
• Biometric authentication
• Two-factor authentication (2FA)
• SOC 2 Type II certified infrastructure

IPX Holding LLC — Miami, FL
Investments involve risk. Past performance does not guarantee future results.
```

**Keywords:** real estate, investment, fractional, REIT, property, dividends, portfolio, Miami, passive income, IPX

**Age Rating:** 17+ (Financial)

**Privacy Policy URL:** https://ipxholding.com/privacy

---

## Google Play Requirements

1. Google Play Developer Account
2. Create app with package: `com.ipxholding.app`
3. Upload `google-services.json` to project root
4. Create service account for automated submissions
5. Prepare screenshots for phone and tablet

**Data Safety Section (required):**
- Financial info: Collected (payment history, investment data)
- Personal info: Collected (name, email, SSN/TIN for KYC)
- Identity: Collected (government ID for KYC verification)
- Location: Not collected
- Data is encrypted in transit and at rest
- Data cannot be deleted (regulatory retention requirements)

---

## Third-Party Accounts to Create

| Service | Purpose | URL |
|---------|---------|-----|
| Stripe | Payment processing | stripe.com |
| Plaid | Bank account linking | plaid.com |
| Twilio | SMS verification | twilio.com |
| SendGrid | Email delivery | sendgrid.com |
| Jumio or Onfido | KYC/Identity verification | jumio.com or onfido.com |
| Sentry | Error monitoring | sentry.io |
| AWS S3 | Document storage | aws.amazon.com |
| Firebase | Push notifications (Android) | firebase.google.com |
| Mixpanel or Amplitude | Analytics | mixpanel.com |

---

## WhatsApp Notification (561-644-3503)

The AI Automation Report screen is configured to send reports to:
- **Phone:** +1 (561) 644-3503
- **Method:** WhatsApp deep link

No additional setup required — the button opens WhatsApp automatically.

---

## Estimated Developer Time After This Guide

| Task | Hours |
|------|-------|
| Create third-party accounts | 4 hrs |
| Configure environment variables | 1 hr |
| Update app.json + create eas.json | 0.5 hr |
| EAS build (development) | 1 hr |
| EAS build (production) | 1 hr |
| App Store submission | 2 hrs |
| Google Play submission | 2 hrs |
| **TOTAL** | **~11.5 hrs** |
