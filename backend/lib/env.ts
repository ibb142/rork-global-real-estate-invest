interface EnvVar {
  name: string;
  required: boolean;
  category: string;
  description: string;
  isPublic?: boolean;
}

const ENV_SCHEMA: EnvVar[] = [
  { name: "JWT_SECRET", required: true, category: "auth", description: "JWT signing secret (min 32 chars)" },
  { name: "STRIPE_SECRET_KEY", required: false, category: "payments", description: "Stripe secret key (sk_live_... or sk_test_...)" },
  { name: "STRIPE_WEBHOOK_SECRET", required: false, category: "payments", description: "Stripe webhook signing secret" },
  { name: "STRIPE_PUBLISHABLE_KEY", required: false, category: "payments", description: "Stripe publishable key", isPublic: true },
  { name: "PLAID_CLIENT_ID", required: false, category: "payments", description: "Plaid client ID" },
  { name: "PLAID_SECRET", required: false, category: "payments", description: "Plaid secret key" },
  { name: "PLAID_ENV", required: false, category: "payments", description: "Plaid environment (sandbox/development/production)" },
  { name: "PAYPAL_CLIENT_ID", required: false, category: "payments", description: "PayPal client ID" },
  { name: "PAYPAL_CLIENT_SECRET", required: false, category: "payments", description: "PayPal client secret" },
  { name: "PAYPAL_ENV", required: false, category: "payments", description: "PayPal environment (sandbox/production)" },
  { name: "COINBASE_COMMERCE_API_KEY", required: false, category: "payments", description: "Coinbase Commerce API key" },
  { name: "CIRCLE_API_KEY", required: false, category: "payments", description: "Circle USDC API key" },

  { name: "SENDGRID_API_KEY", required: false, category: "communications", description: "SendGrid API key" },
  { name: "SENDGRID_FROM_EMAIL", required: false, category: "communications", description: "SendGrid sender email" },
  { name: "MAILGUN_API_KEY", required: false, category: "communications", description: "Mailgun API key" },
  { name: "MAILGUN_DOMAIN", required: false, category: "communications", description: "Mailgun domain" },
  { name: "APPLE_PAY_MERCHANT_ID", required: false, category: "payments", description: "Apple Pay merchant ID" },
  { name: "GOOGLE_PAY_MERCHANT_ID", required: false, category: "payments", description: "Google Pay merchant ID" },
  { name: "STORAGE_PROVIDER", required: false, category: "storage", description: "File storage provider (r2/s3/local) — auto-detected if AWS keys present" },
  { name: "CLOUDFLARE_R2_ENDPOINT", required: false, category: "storage", description: "Cloudflare R2 endpoint URL" },
  { name: "CLOUDFLARE_R2_ACCESS_KEY", required: false, category: "storage", description: "Cloudflare R2 access key" },
  { name: "CLOUDFLARE_R2_SECRET_KEY", required: false, category: "storage", description: "Cloudflare R2 secret key" },
  { name: "AWS_ACCESS_KEY_ID", required: false, category: "storage", description: "AWS access key ID" },
  { name: "AWS_SECRET_ACCESS_KEY", required: false, category: "storage", description: "AWS secret access key" },
  { name: "AWS_REGION", required: false, category: "storage", description: "AWS region (e.g. us-east-1)" },
  { name: "AWS_S3_BUCKET", required: false, category: "storage", description: "AWS S3 bucket name" },
  { name: "ONFIDO_API_KEY", required: false, category: "kyc", description: "Onfido KYC API key" },
  { name: "JUMIO_API_KEY", required: false, category: "kyc", description: "Jumio KYC API key" },
  { name: "GOOGLE_MAPS_API_KEY", required: false, category: "external", description: "Google Maps API key" },
  { name: "ATTOM_API_KEY", required: false, category: "external", description: "ATTOM property data API key" },
  { name: "ALPHA_VANTAGE_API_KEY", required: false, category: "external", description: "Alpha Vantage market data API key" },
  { name: "OPENEXCHANGE_APP_ID", required: false, category: "external", description: "Open Exchange Rates app ID" },
  { name: "SENTRY_DSN", required: false, category: "monitoring", description: "Sentry DSN for error tracking" },
  { name: "NODE_ENV", required: false, category: "system", description: "Node environment (development/production)" },
];

interface EnvValidationResult {
  isValid: boolean;
  configured: string[];
  missing: string[];
  warnings: string[];
  byCategory: Record<string, { configured: number; total: number; vars: string[] }>;
  readinessScore: number;
}

export function validateEnv(): EnvValidationResult {
  const configured: string[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];
  const byCategory: Record<string, { configured: number; total: number; vars: string[] }> = {};

  for (const envVar of ENV_SCHEMA) {
    if (!byCategory[envVar.category]) {
      byCategory[envVar.category] = { configured: 0, total: 0, vars: [] };
    }
    byCategory[envVar.category].total++;

    const value = process.env[envVar.name];
    if (value && value.length > 0) {
      configured.push(envVar.name);
      byCategory[envVar.category].configured++;
      byCategory[envVar.category].vars.push(envVar.name);
    } else if (envVar.required) {
      missing.push(envVar.name);
      warnings.push(`REQUIRED: ${envVar.name} — ${envVar.description}`);
    }
  }

  if (!process.env.JWT_SECRET) {
    warnings.push("CRITICAL: JWT_SECRET not set — using insecure default");
  } else if (process.env.JWT_SECRET.length < 32) {
    warnings.push("WARNING: JWT_SECRET is too short (min 32 characters)");
  }

  if (!process.env.STRIPE_SECRET_KEY && !process.env.PLAID_CLIENT_ID) {
    warnings.push("WARNING: No payment providers configured — payments will use mock mode");
  }

  if (!process.env.SENDGRID_API_KEY && !process.env.MAILGUN_API_KEY) {
    warnings.push("WARNING: No email provider configured — emails will be logged only");
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    warnings.push("WARNING: AWS SNS not configured — SMS will be logged only");
  }

  const totalVars = ENV_SCHEMA.length;
  const readinessScore = Math.round((configured.length / totalVars) * 100);
  const isValid = missing.length === 0;

  return { isValid, configured, missing, warnings, byCategory, readinessScore };
}

export function getEnvSummary(): string {
  const result = validateEnv();
  const lines: string[] = [
    "=== IVX HOLDINGS Environment Summary ===",
    `Readiness: ${result.readinessScore}% (${result.configured.length}/${result.configured.length + result.missing.length} vars)`,
    `Status: ${result.isValid ? "VALID" : "MISSING REQUIRED VARS"}`,
    "",
  ];

  for (const [category, data] of Object.entries(result.byCategory)) {
    lines.push(`[${category}] ${data.configured}/${data.total} configured`);
  }

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:");
    result.warnings.forEach(w => lines.push(`  - ${w}`));
  }

  return lines.join("\n");
}

export function logEnvStatus(): void {
  console.log(getEnvSummary());
}
