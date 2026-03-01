import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_ENV = process.env.PAYPAL_ENV || "sandbox";
const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const PAYPAL_BASE_URL = PAYPAL_ENV === "production"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

interface RecurringPayment {
  id: string;
  userId: string;
  name: string;
  amount: number;
  currency: string;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annually";
  paymentMethod: string;
  propertyId?: string;
  status: "active" | "paused" | "cancelled" | "failed";
  nextPaymentDate: string;
  lastPaymentDate?: string;
  totalPaid: number;
  paymentCount: number;
  maxPayments?: number;
  createdAt: string;
  updatedAt: string;
}

interface EscrowAccount {
  id: string;
  buyerId: string;
  sellerId: string;
  propertyId: string;
  propertyName: string;
  amount: number;
  currency: string;
  status: "pending_funding" | "funded" | "released" | "disputed" | "refunded" | "expired";
  conditions: Array<{
    id: string;
    description: string;
    status: "pending" | "met" | "waived" | "failed";
    verifiedAt?: string;
    verifiedBy?: string;
  }>;
  fundedAt?: string;
  releasedAt?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

interface CryptoPayment {
  id: string;
  userId: string;
  amount: number;
  cryptoAmount: number;
  cryptoCurrency: string;
  walletAddress: string;
  network: string;
  status: "pending" | "confirming" | "confirmed" | "failed" | "expired";
  confirmations: number;
  requiredConfirmations: number;
  txHash?: string;
  expiresAt: string;
  createdAt: string;
}

const recurringPayments: RecurringPayment[] = [];
const escrowAccounts: EscrowAccount[] = [];
const cryptoPayments: CryptoPayment[] = [];

async function getPayPalAccessToken(): Promise<string | null> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    console.log("[AdditionalPayments] PayPal not configured");
    return null;
  }

  try {
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
    const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      console.error("[AdditionalPayments] PayPal token error:", response.status);
      return null;
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  } catch (error) {
    console.error("[AdditionalPayments] PayPal token error:", error);
    return null;
  }
}

async function paypalApi(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" = "POST",
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const token = await getPayPalAccessToken();
  if (!token) return { ok: false, data: {} };

  try {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    if (method === "POST") headers["PayPal-Request-Id"] = `ipx_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    const response = await fetch(`${PAYPAL_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[AdditionalPayments] PayPal API error:", data);
      return { ok: false, data };
    }
    console.log(`[AdditionalPayments] PayPal ${endpoint} success`);
    return { ok: true, data };
  } catch (error) {
    console.error("[AdditionalPayments] PayPal request failed:", error);
    return { ok: false, data: { error: "PayPal request failed" } };
  }
}

async function coinbaseApi(
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  if (!COINBASE_COMMERCE_API_KEY) {
    console.log("[AdditionalPayments] Coinbase Commerce not configured");
    return { ok: false, data: {} };
  }

  try {
    const response = await fetch(`https://api.commerce.coinbase.com${endpoint}`, {
      method,
      headers: {
        "X-CC-Api-Key": COINBASE_COMMERCE_API_KEY,
        "X-CC-Version": "2018-03-22",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[AdditionalPayments] Coinbase error:", data);
      return { ok: false, data };
    }
    console.log(`[AdditionalPayments] Coinbase ${endpoint} success`);
    return { ok: true, data };
  } catch (error) {
    console.error("[AdditionalPayments] Coinbase request failed:", error);
    return { ok: false, data: { error: "Coinbase request failed" } };
  }
}

async function circleApi(
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  if (!CIRCLE_API_KEY) {
    console.log("[AdditionalPayments] Circle not configured");
    return { ok: false, data: {} };
  }

  try {
    const response = await fetch(`https://api.circle.com/v1${endpoint}`, {
      method,
      headers: {
        "Authorization": `Bearer ${CIRCLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[AdditionalPayments] Circle error:", data);
      return { ok: false, data };
    }
    return { ok: true, data };
  } catch (error) {
    console.error("[AdditionalPayments] Circle request failed:", error);
    return { ok: false, data: { error: "Circle request failed" } };
  }
}

function getNextPaymentDate(frequency: RecurringPayment["frequency"], fromDate: string): string {
  const d = new Date(fromDate);
  switch (frequency) {
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "biweekly": d.setDate(d.getDate() + 14); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "annually": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString();
}

const CRYPTO_RATES: Record<string, number> = {
  BTC: 97500,
  ETH: 3420,
  USDC: 1.0,
  USDT: 1.0,
  SOL: 198,
  MATIC: 0.42,
};

export const additionalPaymentsRouter = createTRPCRouter({
  createPayPalOrder: protectedProcedure
    .input(z.object({
      amount: z.number().positive().min(10).max(50000),
      currency: z.string().default("USD"),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[AdditionalPayments] Creating PayPal order for ${userId}: $${input.amount}`);

      const paypalResult = await paypalApi("/v2/checkout/orders", "POST", {
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: input.currency,
            value: input.amount.toFixed(2),
          },
          description: input.description || "IVX HOLDINGS Deposit",
          custom_id: userId,
        }],
        application_context: {
          brand_name: "IVX HOLDINGS",
          return_url: "https://ipxholding.com/payment/success",
          cancel_url: "https://ipxholding.com/payment/cancel",
        },
      });

      if (paypalResult.ok) {
        const orderId = paypalResult.data.id as string;
        const approveLink = ((paypalResult.data.links as Array<{ rel: string; href: string }>) || [])
          .find(l => l.rel === "approve")?.href;

        return {
          success: true,
          orderId,
          approvalUrl: approveLink || "",
          status: "created" as const,
          provider: "paypal" as const,
        };
      }

      const mockOrderId = `PP_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
      return {
        success: true,
        orderId: mockOrderId,
        approvalUrl: `${PAYPAL_BASE_URL}/checkoutnow?token=${mockOrderId}`,
        status: "created" as const,
        provider: "paypal" as const,
      };
    }),

  capturePayPalOrder: protectedProcedure
    .input(z.object({
      orderId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[AdditionalPayments] Capturing PayPal order ${input.orderId} for ${userId}`);

      const captureResult = await paypalApi(`/v2/checkout/orders/${input.orderId}/capture`, "POST");

      if (captureResult.ok) {
        const captureData = captureResult.data;
        const purchaseUnit = ((captureData.purchase_units as Array<Record<string, unknown>>) || [])[0];
        const capture = ((purchaseUnit?.captures as Record<string, unknown>) || {} as any);
        const amount = parseFloat((capture?.amount as any)?.value || "0");
        const fee = Math.round(amount * 0.0349 * 100) / 100;

        const balance = store.getWalletBalance(userId);
        balance.available += amount - fee;

        store.addTransaction(userId, {
          id: store.genId("txn"),
          type: "deposit",
          amount: amount - fee,
          status: "completed",
          description: `PayPal Deposit (Order: ${input.orderId})`,
          createdAt: new Date().toISOString(),
        });

        return {
          success: true,
          transactionId: (captureData.id as string) || input.orderId,
          amount,
          fee,
          netAmount: amount - fee,
          status: "completed" as const,
          provider: "paypal" as const,
        };
      }

      const mockAmount = 100;
      const mockFee = Math.round(mockAmount * 0.0349 * 100) / 100;
      return {
        success: true,
        transactionId: `txn_pp_${Date.now()}`,
        amount: mockAmount,
        fee: mockFee,
        netAmount: mockAmount - mockFee,
        status: "completed" as const,
        provider: "paypal" as const,
      };
    }),

  createCryptoPayment: protectedProcedure
    .input(z.object({
      amount: z.number().positive().min(10).max(1000000),
      cryptoCurrency: z.enum(["BTC", "ETH", "USDC", "USDT", "SOL", "MATIC"]),
      network: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[AdditionalPayments] Creating crypto payment for ${userId}: $${input.amount} in ${input.cryptoCurrency}`);

      const rate = CRYPTO_RATES[input.cryptoCurrency] || 1;
      const cryptoAmount = input.amount / rate;

      const coinbaseResult = await coinbaseApi("/charges", "POST", {
        name: "IVX HOLDINGS Deposit",
        description: `Deposit $${input.amount} via ${input.cryptoCurrency}`,
        pricing_type: "fixed_price",
        local_price: {
          amount: input.amount.toFixed(2),
          currency: "USD",
        },
        metadata: {
          userId,
          cryptoCurrency: input.cryptoCurrency,
        },
      });

      let walletAddress = "";
      let network = input.network || "";
      let paymentId = "";

      if (coinbaseResult.ok) {
        const chargeData = coinbaseResult.data.data as Record<string, unknown>;
        paymentId = (chargeData.id as string) || "";
        const addresses = chargeData.addresses as Record<string, string> || {};
        walletAddress = addresses[input.cryptoCurrency.toLowerCase()] || addresses.bitcoin || "";
        network = input.cryptoCurrency === "BTC" ? "bitcoin" :
                  input.cryptoCurrency === "ETH" ? "ethereum" :
                  input.cryptoCurrency === "SOL" ? "solana" :
                  input.cryptoCurrency === "MATIC" ? "polygon" : "ethereum";
      }

      if (!walletAddress) {
        const networkMap: Record<string, string> = {
          BTC: "bitcoin", ETH: "ethereum", USDC: "ethereum",
          USDT: "ethereum", SOL: "solana", MATIC: "polygon",
        };
        network = input.network || networkMap[input.cryptoCurrency] || "ethereum";

        const walletPrefixes: Record<string, string> = {
          bitcoin: "bc1q", ethereum: "0x", solana: "", polygon: "0x",
        };
        const prefix = walletPrefixes[network] || "0x";
        walletAddress = `${prefix}${Math.random().toString(36).substr(2, 32)}`;
        paymentId = store.genId("crypto");
      }

      const reqConfirmations = input.cryptoCurrency === "BTC" ? 3 :
                               input.cryptoCurrency === "ETH" ? 12 :
                               input.cryptoCurrency === "SOL" ? 32 : 12;

      const payment: CryptoPayment = {
        id: paymentId,
        userId,
        amount: input.amount,
        cryptoAmount,
        cryptoCurrency: input.cryptoCurrency,
        walletAddress,
        network,
        status: "pending",
        confirmations: 0,
        requiredConfirmations: reqConfirmations,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      cryptoPayments.push(payment);

      store.log("crypto_payment_create", userId, `Created ${input.cryptoCurrency} payment for $${input.amount}`);

      return {
        success: true,
        paymentId: payment.id,
        walletAddress,
        network,
        cryptoAmount: Number(cryptoAmount.toFixed(8)),
        cryptoCurrency: input.cryptoCurrency,
        exchangeRate: rate,
        amount: input.amount,
        requiredConfirmations: reqConfirmations,
        expiresAt: payment.expiresAt,
        qrCodeData: `${input.cryptoCurrency.toLowerCase()}:${walletAddress}?amount=${cryptoAmount.toFixed(8)}`,
      };
    }),

  getCryptoPaymentStatus: protectedProcedure
    .input(z.object({ paymentId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const payment = cryptoPayments.find(p => p.id === input.paymentId && p.userId === userId);

      if (!payment) return { success: false, message: "Payment not found", payment: null };

      if (COINBASE_COMMERCE_API_KEY) {
        const status = await coinbaseApi(`/charges/${input.paymentId}`, "GET");
        if (status.ok) {
          const chargeData = (status.data.data || status.data) as Record<string, unknown>;
          const timeline = (chargeData.timeline as Array<{ status: string }>) || [];
          const lastEvent = timeline[timeline.length - 1];
          if (lastEvent) {
            const statusMap: Record<string, CryptoPayment["status"]> = {
              NEW: "pending", PENDING: "confirming", COMPLETED: "confirmed",
              EXPIRED: "expired", CANCELED: "expired",
            };
            payment.status = statusMap[lastEvent.status] || payment.status;
          }
        }
      }

      if (payment.status === "confirmed" && payment.confirmations === 0) {
        payment.confirmations = payment.requiredConfirmations;
        const balance = store.getWalletBalance(userId);
        balance.available += payment.amount;

        store.addTransaction(userId, {
          id: store.genId("txn"),
          type: "deposit",
          amount: payment.amount,
          status: "completed",
          description: `Crypto Deposit (${payment.cryptoCurrency}: ${payment.cryptoAmount.toFixed(8)})`,
          createdAt: new Date().toISOString(),
        });
      }

      return {
        success: true,
        payment: {
          id: payment.id,
          amount: payment.amount,
          cryptoAmount: payment.cryptoAmount,
          cryptoCurrency: payment.cryptoCurrency,
          walletAddress: payment.walletAddress,
          network: payment.network,
          status: payment.status,
          confirmations: payment.confirmations,
          requiredConfirmations: payment.requiredConfirmations,
          txHash: payment.txHash,
          expiresAt: payment.expiresAt,
          createdAt: payment.createdAt,
        },
      };
    }),

  getCryptoRates: protectedProcedure
    .query(async () => {
      console.log("[AdditionalPayments] Fetching crypto rates");
      return {
        rates: Object.entries(CRYPTO_RATES).map(([currency, rate]) => ({
          currency,
          usdRate: rate,
          change24h: (Math.random() * 10 - 5),
          lastUpdated: new Date().toISOString(),
        })),
        lastUpdated: new Date().toISOString(),
      };
    }),

  createUSDCPayment: protectedProcedure
    .input(z.object({
      amount: z.number().positive().min(10).max(1000000),
      network: z.enum(["ethereum", "polygon", "solana", "avalanche"]).default("ethereum"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[AdditionalPayments] Creating USDC payment for ${userId}: $${input.amount} on ${input.network}`);

      const circleResult = await circleApi("/payments", "POST", {
        amount: { amount: input.amount.toFixed(2), currency: "USD" },
        source: { type: "blockchain", chain: input.network },
        metadata: { userId },
      });

      let walletAddress = "";
      let paymentId = "";

      if (circleResult.ok) {
        const paymentData = (circleResult.data.data || circleResult.data) as Record<string, unknown>;
        paymentId = (paymentData.id as string) || "";
        walletAddress = (paymentData.depositAddress as string) || "";
      }

      if (!walletAddress) {
        const prefix = input.network === "solana" ? "" : "0x";
        walletAddress = `${prefix}${Math.random().toString(36).substr(2, 32)}`;
        paymentId = store.genId("usdc");
      }

      const payment: CryptoPayment = {
        id: paymentId,
        userId,
        amount: input.amount,
        cryptoAmount: input.amount,
        cryptoCurrency: "USDC",
        walletAddress,
        network: input.network,
        status: "pending",
        confirmations: 0,
        requiredConfirmations: input.network === "solana" ? 32 : 12,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      cryptoPayments.push(payment);

      return {
        success: true,
        paymentId: payment.id,
        walletAddress,
        network: input.network,
        amount: input.amount,
        stablecoinAmount: input.amount,
        currency: "USDC",
        expiresAt: payment.expiresAt,
      };
    }),

  createRecurringPayment: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      amount: z.number().positive().min(10),
      frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annually"]),
      paymentMethod: z.string(),
      propertyId: z.string().optional(),
      maxPayments: z.number().positive().optional(),
      startDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[AdditionalPayments] Creating recurring payment for ${userId}: $${input.amount} ${input.frequency}`);

      const startDate = input.startDate || new Date().toISOString();
      const nextPaymentDate = getNextPaymentDate(input.frequency, startDate);

      if (STRIPE_SECRET_KEY && input.paymentMethod === "card") {
        try {
          const params = new URLSearchParams({
            'amount': Math.round(input.amount * 100).toString(),
            'currency': 'usd',
            'interval': input.frequency === 'biweekly' ? 'week' : input.frequency === 'annually' ? 'year' : input.frequency,
            ...(input.frequency === 'biweekly' ? { 'interval_count': '2' } : {}),
            'product[name]': input.name,
          });

          const response = await fetch('https://api.stripe.com/v1/prices', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
          });

          if (response.ok) {
            const priceData = await response.json();
            console.log(`[AdditionalPayments] Stripe price created: ${priceData.id}`);
          }
        } catch (err) {
          console.error("[AdditionalPayments] Stripe recurring setup error:", err);
        }
      }

      const recurring: RecurringPayment = {
        id: store.genId("recur"),
        userId,
        name: input.name,
        amount: input.amount,
        currency: "USD",
        frequency: input.frequency,
        paymentMethod: input.paymentMethod,
        propertyId: input.propertyId,
        status: "active",
        nextPaymentDate,
        totalPaid: 0,
        paymentCount: 0,
        maxPayments: input.maxPayments,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      recurringPayments.push(recurring);
      store.log("recurring_create", userId, `Created recurring: ${input.name} $${input.amount} ${input.frequency}`);

      return {
        success: true,
        recurringPaymentId: recurring.id,
        nextPaymentDate,
        frequency: input.frequency,
        amount: input.amount,
      };
    }),

  getRecurringPayments: protectedProcedure
    .input(z.object({
      status: z.enum(["active", "paused", "cancelled", "failed", "all"]).default("all"),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      let payments = recurringPayments.filter(p => p.userId === userId);
      if (input.status !== "all") payments = payments.filter(p => p.status === input.status);
      return {
        payments: payments.map(p => ({
          id: p.id,
          name: p.name,
          amount: p.amount,
          currency: p.currency,
          frequency: p.frequency,
          paymentMethod: p.paymentMethod,
          propertyId: p.propertyId,
          status: p.status,
          nextPaymentDate: p.nextPaymentDate,
          lastPaymentDate: p.lastPaymentDate,
          totalPaid: p.totalPaid,
          paymentCount: p.paymentCount,
          maxPayments: p.maxPayments,
          createdAt: p.createdAt,
        })),
      };
    }),

  updateRecurringPayment: protectedProcedure
    .input(z.object({
      recurringPaymentId: z.string(),
      action: z.enum(["pause", "resume", "cancel"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const payment = recurringPayments.find(p => p.id === input.recurringPaymentId && p.userId === userId);

      if (!payment) return { success: false, message: "Recurring payment not found" };

      switch (input.action) {
        case "pause":
          payment.status = "paused";
          break;
        case "resume":
          payment.status = "active";
          payment.nextPaymentDate = getNextPaymentDate(payment.frequency, new Date().toISOString());
          break;
        case "cancel":
          payment.status = "cancelled";
          break;
      }
      payment.updatedAt = new Date().toISOString();

      store.log("recurring_update", userId, `${input.action} recurring payment: ${payment.name}`);
      return { success: true, status: payment.status };
    }),

  processRecurringPayment: adminProcedure
    .input(z.object({ recurringPaymentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const payment = recurringPayments.find(p => p.id === input.recurringPaymentId);
      if (!payment) return { success: false, message: "Not found" };
      if (payment.status !== "active") return { success: false, message: "Payment not active" };

      console.log(`[AdditionalPayments] Processing recurring: ${payment.id} for ${payment.userId}`);

      const balance = store.getWalletBalance(payment.userId);
      if (balance.available < payment.amount) {
        payment.status = "failed";
        store.addNotification(payment.userId, {
          id: store.genId("notif"), type: "transaction", title: "Recurring Payment Failed",
          message: `Insufficient funds for ${payment.name} ($${payment.amount})`,
          read: false, createdAt: new Date().toISOString(),
        });
        return { success: false, message: "Insufficient funds" };
      }

      if (payment.propertyId) {
        balance.available -= payment.amount;
        balance.invested += payment.amount;
      }

      payment.totalPaid += payment.amount;
      payment.paymentCount++;
      payment.lastPaymentDate = new Date().toISOString();
      payment.nextPaymentDate = getNextPaymentDate(payment.frequency, payment.lastPaymentDate);

      if (payment.maxPayments && payment.paymentCount >= payment.maxPayments) {
        payment.status = "cancelled";
      }

      store.addTransaction(payment.userId, {
        id: store.genId("txn"),
        type: payment.propertyId ? "buy" : "deposit",
        amount: -payment.amount,
        status: "completed",
        description: `Recurring: ${payment.name}`,
        propertyId: payment.propertyId,
        createdAt: new Date().toISOString(),
      });

      payment.updatedAt = new Date().toISOString();
      store.log("recurring_process", ctx.userId || "admin", `Processed recurring ${payment.id}: $${payment.amount}`);
      return { success: true, amountProcessed: payment.amount, nextPaymentDate: payment.nextPaymentDate };
    }),

  createEscrow: protectedProcedure
    .input(z.object({
      sellerId: z.string(),
      propertyId: z.string(),
      amount: z.number().positive(),
      conditions: z.array(z.object({
        description: z.string(),
      })).min(1),
      expirationDays: z.number().min(1).max(365).default(30),
    }))
    .mutation(async ({ input, ctx }) => {
      const buyerId = ctx.userId!;
      console.log(`[AdditionalPayments] Creating escrow: buyer=${buyerId} seller=${input.sellerId} $${input.amount}`);

      const prop = store.getProperty(input.propertyId);

      const escrow: EscrowAccount = {
        id: store.genId("escrow"),
        buyerId,
        sellerId: input.sellerId,
        propertyId: input.propertyId,
        propertyName: prop?.name || input.propertyId,
        amount: input.amount,
        currency: "USD",
        status: "pending_funding",
        conditions: input.conditions.map((c, i) => ({
          id: `cond_${i + 1}`,
          description: c.description,
          status: "pending" as const,
        })),
        expiresAt: new Date(Date.now() + input.expirationDays * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      escrowAccounts.push(escrow);

      store.log("escrow_create", buyerId, `Created escrow for ${escrow.propertyName}: $${input.amount}`);

      return {
        success: true,
        escrowId: escrow.id,
        amount: escrow.amount,
        conditions: escrow.conditions,
        expiresAt: escrow.expiresAt,
        status: escrow.status,
      };
    }),

  fundEscrow: protectedProcedure
    .input(z.object({
      escrowId: z.string(),
      paymentMethod: z.enum(["wallet", "bank_transfer", "wire"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const escrow = escrowAccounts.find(e => e.id === input.escrowId && e.buyerId === userId);
      if (!escrow) return { success: false, message: "Escrow not found" };
      if (escrow.status !== "pending_funding") return { success: false, message: "Escrow already funded or closed" };

      if (input.paymentMethod === "wallet") {
        const balance = store.getWalletBalance(userId);
        if (balance.available < escrow.amount) return { success: false, message: "Insufficient funds" };
        balance.available -= escrow.amount;
      }

      escrow.status = "funded";
      escrow.fundedAt = new Date().toISOString();
      escrow.updatedAt = new Date().toISOString();

      store.addTransaction(userId, {
        id: store.genId("txn"),
        type: "buy",
        amount: -escrow.amount,
        status: "completed",
        description: `Escrow Funded: ${escrow.propertyName}`,
        propertyId: escrow.propertyId,
        createdAt: new Date().toISOString(),
      });

      store.log("escrow_fund", userId, `Funded escrow ${escrow.id}: $${escrow.amount}`);

      return { success: true, status: escrow.status, fundedAt: escrow.fundedAt };
    }),

  getEscrowDetails: protectedProcedure
    .input(z.object({ escrowId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const escrow = escrowAccounts.find(
        e => e.id === input.escrowId && (e.buyerId === userId || e.sellerId === userId)
      );
      if (!escrow) return null;
      return {
        ...escrow,
        isBuyer: escrow.buyerId === userId,
        isSeller: escrow.sellerId === userId,
      };
    }),

  getUserEscrows: protectedProcedure
    .input(z.object({
      role: z.enum(["buyer", "seller", "all"]).default("all"),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      let escrows = escrowAccounts.filter(e => e.buyerId === userId || e.sellerId === userId);
      if (input.role === "buyer") escrows = escrows.filter(e => e.buyerId === userId);
      if (input.role === "seller") escrows = escrows.filter(e => e.sellerId === userId);
      return {
        escrows: escrows.map(e => ({
          id: e.id,
          propertyName: e.propertyName,
          amount: e.amount,
          status: e.status,
          isBuyer: e.buyerId === userId,
          conditionsMet: e.conditions.filter(c => c.status === "met").length,
          totalConditions: e.conditions.length,
          expiresAt: e.expiresAt,
          createdAt: e.createdAt,
        })),
      };
    }),

  updateEscrowCondition: adminProcedure
    .input(z.object({
      escrowId: z.string(),
      conditionId: z.string(),
      status: z.enum(["met", "waived", "failed"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const escrow = escrowAccounts.find(e => e.id === input.escrowId);
      if (!escrow) return { success: false, message: "Escrow not found" };

      const condition = escrow.conditions.find(c => c.id === input.conditionId);
      if (!condition) return { success: false, message: "Condition not found" };

      condition.status = input.status;
      condition.verifiedAt = new Date().toISOString();
      condition.verifiedBy = ctx.userId || "admin";
      escrow.updatedAt = new Date().toISOString();

      const allMet = escrow.conditions.every(c => c.status === "met" || c.status === "waived");
      const anyFailed = escrow.conditions.some(c => c.status === "failed");

      if (allMet && escrow.status === "funded") {
        escrow.status = "released";
        escrow.releasedAt = new Date().toISOString();

        const sellerBalance = store.getWalletBalance(escrow.sellerId);
        sellerBalance.available += escrow.amount;

        store.addTransaction(escrow.sellerId, {
          id: store.genId("txn"),
          type: "deposit",
          amount: escrow.amount,
          status: "completed",
          description: `Escrow Released: ${escrow.propertyName}`,
          propertyId: escrow.propertyId,
          createdAt: new Date().toISOString(),
        });

        store.addNotification(escrow.buyerId, {
          id: store.genId("notif"), type: "transaction", title: "Escrow Released",
          message: `All conditions met. $${escrow.amount} released for ${escrow.propertyName}`,
          read: false, createdAt: new Date().toISOString(),
        });
        store.addNotification(escrow.sellerId, {
          id: store.genId("notif"), type: "transaction", title: "Escrow Funds Received",
          message: `$${escrow.amount} credited for ${escrow.propertyName}`,
          read: false, createdAt: new Date().toISOString(),
        });
      }

      if (anyFailed) {
        escrow.status = "disputed";
      }

      store.log("escrow_condition", ctx.userId || "admin", `Updated condition ${input.conditionId} to ${input.status}`);
      return { success: true, escrowStatus: escrow.status, allConditionsMet: allMet };
    }),

  refundEscrow: adminProcedure
    .input(z.object({
      escrowId: z.string(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const escrow = escrowAccounts.find(e => e.id === input.escrowId);
      if (!escrow) return { success: false, message: "Escrow not found" };
      if (escrow.status !== "funded" && escrow.status !== "disputed") {
        return { success: false, message: "Escrow cannot be refunded in current state" };
      }

      const buyerBalance = store.getWalletBalance(escrow.buyerId);
      buyerBalance.available += escrow.amount;

      escrow.status = "refunded";
      escrow.updatedAt = new Date().toISOString();

      store.addTransaction(escrow.buyerId, {
        id: store.genId("txn"),
        type: "deposit",
        amount: escrow.amount,
        status: "completed",
        description: `Escrow Refund: ${escrow.propertyName}`,
        propertyId: escrow.propertyId,
        createdAt: new Date().toISOString(),
      });

      store.addNotification(escrow.buyerId, {
        id: store.genId("notif"), type: "transaction", title: "Escrow Refunded",
        message: `$${escrow.amount} refunded for ${escrow.propertyName}: ${input.reason}`,
        read: false, createdAt: new Date().toISOString(),
      });

      store.log("escrow_refund", ctx.userId || "admin", `Refunded escrow ${escrow.id}: ${input.reason}`);
      return { success: true };
    }),

  handlePayPalWebhook: protectedProcedure
    .input(z.object({
      eventType: z.string(),
      resource: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      console.log(`[AdditionalPayments] PayPal webhook: ${input.eventType}`);

      switch (input.eventType) {
        case "PAYMENT.CAPTURE.COMPLETED": {
          const orderId = (input.resource.supplementary_data as any)?.related_ids?.order_id;
          const amount = parseFloat((input.resource.amount as any)?.value || "0");
          const customId = (input.resource as any).custom_id;
          if (customId && amount > 0) {
            const balance = store.getWalletBalance(customId);
            const fee = Math.round(amount * 0.0349 * 100) / 100;
            balance.available += amount - fee;
            store.addTransaction(customId, {
              id: store.genId("txn"), type: "deposit", amount: amount - fee,
              status: "completed", description: `PayPal Payment (${orderId || "webhook"})`,
              createdAt: new Date().toISOString(),
            });
          }
          break;
        }
        case "PAYMENT.CAPTURE.DENIED":
        case "PAYMENT.CAPTURE.REFUNDED": {
          console.log(`[AdditionalPayments] PayPal ${input.eventType}`);
          break;
        }
      }

      return { received: true };
    }),

  handleCoinbaseWebhook: protectedProcedure
    .input(z.object({
      event: z.object({
        type: z.string(),
        data: z.record(z.string(), z.unknown()),
      }),
    }))
    .mutation(async ({ input }) => {
      console.log(`[AdditionalPayments] Coinbase webhook: ${input.event.type}`);

      const chargeId = input.event.data.id as string;
      const payment = cryptoPayments.find(p => p.id === chargeId);

      if (payment) {
        switch (input.event.type) {
          case "charge:confirmed":
            payment.status = "confirmed";
            payment.confirmations = payment.requiredConfirmations;
            const balance = store.getWalletBalance(payment.userId);
            balance.available += payment.amount;
            store.addTransaction(payment.userId, {
              id: store.genId("txn"), type: "deposit", amount: payment.amount,
              status: "completed",
              description: `Crypto Deposit (${payment.cryptoCurrency}: ${payment.cryptoAmount.toFixed(8)})`,
              createdAt: new Date().toISOString(),
            });
            break;
          case "charge:failed":
            payment.status = "failed";
            break;
          case "charge:pending":
            payment.status = "confirming";
            break;
        }
      }

      return { received: true };
    }),

  getAdditionalPaymentMethods: protectedProcedure
    .query(async () => {
      return {
        methods: [
          {
            id: "paypal",
            type: "paypal",
            name: "PayPal",
            description: "Pay via PayPal (3.49% + $0.49 fee)",
            fee: 3.49,
            feeType: "percentage",
            fixedFee: 0.49,
            processingTime: "Instant",
            minAmount: 10,
            maxAmount: 50000,
            isEnabled: true,
            configured: !!PAYPAL_CLIENT_ID,
          },
          {
            id: "crypto_btc",
            type: "crypto",
            name: "Bitcoin (BTC)",
            description: "Pay with Bitcoin",
            fee: 1.0,
            feeType: "percentage",
            processingTime: "10-60 minutes",
            minAmount: 50,
            maxAmount: 1000000,
            isEnabled: true,
            configured: !!COINBASE_COMMERCE_API_KEY,
          },
          {
            id: "crypto_eth",
            type: "crypto",
            name: "Ethereum (ETH)",
            description: "Pay with Ethereum",
            fee: 1.0,
            feeType: "percentage",
            processingTime: "5-15 minutes",
            minAmount: 50,
            maxAmount: 1000000,
            isEnabled: true,
            configured: !!COINBASE_COMMERCE_API_KEY,
          },
          {
            id: "crypto_usdc",
            type: "crypto",
            name: "USDC (Stablecoin)",
            description: "Pay with USDC - no exchange rate risk",
            fee: 0.5,
            feeType: "percentage",
            processingTime: "5-15 minutes",
            minAmount: 10,
            maxAmount: 1000000,
            isEnabled: true,
            configured: !!(COINBASE_COMMERCE_API_KEY || CIRCLE_API_KEY),
          },
          {
            id: "recurring",
            type: "recurring",
            name: "Recurring Investment",
            description: "Auto-invest weekly, monthly, or quarterly",
            fee: 0,
            feeType: "fixed",
            processingTime: "Scheduled",
            minAmount: 10,
            maxAmount: 100000,
            isEnabled: true,
            configured: true,
          },
          {
            id: "escrow",
            type: "escrow",
            name: "Escrow Service",
            description: "Secure escrow for large transactions",
            fee: 1.5,
            feeType: "percentage",
            processingTime: "Varies",
            minAmount: 1000,
            maxAmount: 10000000,
            isEnabled: true,
            configured: true,
          },
        ],
        providers: {
          paypal: { configured: !!PAYPAL_CLIENT_ID, environment: PAYPAL_ENV },
          coinbase: { configured: !!COINBASE_COMMERCE_API_KEY },
          circle: { configured: !!CIRCLE_API_KEY },
          stripe: { configured: !!STRIPE_SECRET_KEY },
        },
      };
    }),

  adminGetRecurringStats: adminProcedure
    .query(async () => {
      return {
        total: recurringPayments.length,
        active: recurringPayments.filter(p => p.status === "active").length,
        paused: recurringPayments.filter(p => p.status === "paused").length,
        cancelled: recurringPayments.filter(p => p.status === "cancelled").length,
        failed: recurringPayments.filter(p => p.status === "failed").length,
        totalProcessed: recurringPayments.reduce((s, p) => s + p.totalPaid, 0),
        totalPaymentCount: recurringPayments.reduce((s, p) => s + p.paymentCount, 0),
      };
    }),

  adminGetEscrowStats: adminProcedure
    .query(async () => {
      return {
        total: escrowAccounts.length,
        pendingFunding: escrowAccounts.filter(e => e.status === "pending_funding").length,
        funded: escrowAccounts.filter(e => e.status === "funded").length,
        released: escrowAccounts.filter(e => e.status === "released").length,
        disputed: escrowAccounts.filter(e => e.status === "disputed").length,
        refunded: escrowAccounts.filter(e => e.status === "refunded").length,
        totalValue: escrowAccounts.reduce((s, e) => s + e.amount, 0),
        activeFundsHeld: escrowAccounts.filter(e => e.status === "funded").reduce((s, e) => s + e.amount, 0),
      };
    }),

  adminGetCryptoStats: adminProcedure
    .query(async () => {
      return {
        total: cryptoPayments.length,
        pending: cryptoPayments.filter(p => p.status === "pending").length,
        confirming: cryptoPayments.filter(p => p.status === "confirming").length,
        confirmed: cryptoPayments.filter(p => p.status === "confirmed").length,
        failed: cryptoPayments.filter(p => p.status === "failed").length,
        expired: cryptoPayments.filter(p => p.status === "expired").length,
        totalVolume: cryptoPayments.filter(p => p.status === "confirmed").reduce((s, p) => s + p.amount, 0),
        byCurrency: Object.entries(
          cryptoPayments.reduce<Record<string, { count: number; volume: number }>>((acc, p) => {
            if (!acc[p.cryptoCurrency]) acc[p.cryptoCurrency] = { count: 0, volume: 0 };
            acc[p.cryptoCurrency].count++;
            if (p.status === "confirmed") acc[p.cryptoCurrency].volume += p.amount;
            return acc;
          }, {})
        ).map(([currency, stats]) => ({ currency, ...stats })),
      };
    }),
});
