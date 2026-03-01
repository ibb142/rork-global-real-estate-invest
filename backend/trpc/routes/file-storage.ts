import * as z from "zod";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

const CLOUDFLARE_R2_ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT;
const CLOUDFLARE_R2_ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY;
const CLOUDFLARE_R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET || "ipx-files";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || "ivx-holdings-prod";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const isS3Configured = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER ||
  (isS3Configured ? "s3" : (CLOUDFLARE_R2_ENDPOINT ? "r2" : "local"))) as "r2" | "s3" | "local";

let s3Client: S3Client | null = null;
if (isS3Configured) {
  s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    },
  });
  console.log(`[FileStorage] AWS S3 configured: bucket=${AWS_S3_BUCKET}, region=${AWS_REGION}, provider=${STORAGE_PROVIDER}`);
} else {
  console.log(`[FileStorage] AWS S3 not configured. Storage provider: ${STORAGE_PROVIDER}`);
}

interface StoredFile {
  id: string;
  userId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: "document" | "tax" | "statement" | "receipt" | "kyc" | "property" | "report" | "other";
  storageKey: string;
  storageProvider: string;
  downloadUrl: string;
  metadata: Record<string, string>;
  createdAt: string;
  expiresAt?: string;
}

interface GeneratedPDF {
  id: string;
  userId: string;
  type: string;
  title: string;
  downloadUrl: string;
  size: number;
  generatedAt: string;
  expiresAt: string;
  metadata: Record<string, string>;
}

const fileStore: StoredFile[] = [];
const pdfStore: GeneratedPDF[] = [];

function generateStorageKey(userId: string, category: string, fileName: string): string {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).substr(2, 8);
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${category}/${userId}/${timestamp}_${rand}_${sanitized}`;
}

async function uploadToR2(key: string, _data: string, _mimeType: string): Promise<{ ok: boolean; url: string }> {
  if (!CLOUDFLARE_R2_ENDPOINT || !CLOUDFLARE_R2_ACCESS_KEY) {
    console.log("[FileStorage] R2 not configured, using local storage");
    return { ok: false, url: "" };
  }

  try {
    const url = `${CLOUDFLARE_R2_ENDPOINT}/${CLOUDFLARE_R2_BUCKET}/${key}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": _mimeType,
        "X-Custom-Auth-Key": CLOUDFLARE_R2_ACCESS_KEY,
      },
      body: _data,
    });

    if (!response.ok) {
      console.error("[FileStorage] R2 upload failed:", response.status);
      return { ok: false, url: "" };
    }

    console.log(`[FileStorage] R2 upload success: ${key}`);
    return { ok: true, url: `${CLOUDFLARE_R2_ENDPOINT}/${CLOUDFLARE_R2_BUCKET}/${key}` };
  } catch (error) {
    console.error("[FileStorage] R2 upload error:", error);
    return { ok: false, url: "" };
  }
}

async function uploadToS3(key: string, data: string, mimeType: string): Promise<{ ok: boolean; url: string }> {
  if (!s3Client) {
    console.log("[FileStorage] S3 not configured, using local storage");
    return { ok: false, url: "" };
  }

  try {
    const command = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: key,
      Body: data,
      ContentType: mimeType,
    });
    await s3Client.send(command);
    const url = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    console.log(`[FileStorage] S3 upload success: ${key}`);
    return { ok: true, url };
  } catch (error) {
    console.error("[FileStorage] S3 upload error:", error);
    return { ok: false, url: "" };
  }
}

async function uploadFile(key: string, data: string, mimeType: string): Promise<{ ok: boolean; url: string; provider: string }> {
  if (STORAGE_PROVIDER === "r2") {
    const result = await uploadToR2(key, data, mimeType);
    if (result.ok) return { ...result, provider: "r2" };
  }

  if (STORAGE_PROVIDER === "s3") {
    const result = await uploadToS3(key, data, mimeType);
    if (result.ok) return { ...result, provider: "s3" };
  }

  const localUrl = `https://api.ipxholding.com/files/${key}`;
  console.log(`[FileStorage] Using local storage for: ${key}`);
  return { ok: true, url: localUrl, provider: "local" };
}

async function deleteFromStorage(key: string): Promise<boolean> {
  if (STORAGE_PROVIDER === "r2" && CLOUDFLARE_R2_ENDPOINT) {
    try {
      const url = `${CLOUDFLARE_R2_ENDPOINT}/${CLOUDFLARE_R2_BUCKET}/${key}`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: { "X-Custom-Auth-Key": CLOUDFLARE_R2_ACCESS_KEY || "" },
      });
      return response.ok;
    } catch (e) {
      console.error("[FileStorage] R2 delete error:", e);
    }
  }

  if (STORAGE_PROVIDER === "s3" && s3Client) {
    try {
      const command = new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key });
      await s3Client.send(command);
      console.log(`[FileStorage] S3 delete success: ${key}`);
      return true;
    } catch (e) {
      console.error("[FileStorage] S3 delete error:", e);
    }
  }

  console.log(`[FileStorage] Local delete: ${key}`);
  return true;
}

function generateTransactionStatementHTML(
  userId: string,
  startDate: string,
  endDate: string,
): string {
  const user = store.getUser(userId);
  const txs = store.getUserTransactions(userId).filter(t => {
    return t.createdAt >= startDate && t.createdAt <= endDate;
  });
  const balance = store.getWalletBalance(userId);

  const totalDeposits = txs.filter(t => t.type === "deposit" && t.status === "completed").reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = txs.filter(t => t.type === "withdrawal" && t.status === "completed").reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalDividends = txs.filter(t => t.type === "dividend" && t.status === "completed").reduce((s, t) => s + t.amount, 0);
  const totalBuys = txs.filter(t => t.type === "buy" && t.status === "completed").reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalSells = txs.filter(t => t.type === "sell" && t.status === "completed").reduce((s, t) => s + t.amount, 0);

  const txRows = txs.map(t => `
    <tr>
      <td>${new Date(t.createdAt).toLocaleDateString()}</td>
      <td>${t.type.charAt(0).toUpperCase() + t.type.slice(1)}</td>
      <td>${t.description}</td>
      <td style="text-align:right">${t.amount >= 0 ? "" : "-"}$${Math.abs(t.amount).toFixed(2)}</td>
      <td>${t.status}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Account Statement</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1a237e; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #1a237e; }
    .title { font-size: 20px; margin-bottom: 10px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .info-box { background: #f5f5f5; padding: 15px; border-radius: 8px; }
    .info-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .info-value { font-size: 18px; font-weight: bold; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #1a237e; color: white; padding: 10px; text-align: left; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background: #f9f9f9; }
    .summary { margin-top: 30px; background: #f0f0f0; padding: 20px; border-radius: 8px; }
    .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">IVX HOLDINGS</div>
      <div>Account Statement</div>
    </div>
    <div style="text-align:right">
      <div>Statement Period</div>
      <div style="font-weight:bold">${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}</div>
      <div style="margin-top:5px">Generated: ${new Date().toLocaleDateString()}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">Account Holder</div>
      <div class="info-value">${user ? `${user.firstName} ${user.lastName}` : "Account Holder"}</div>
      <div style="font-size:13px;color:#666;margin-top:3px">${user?.email || ""}</div>
    </div>
    <div class="info-box">
      <div class="info-label">Current Balance</div>
      <div class="info-value">$${balance.available.toFixed(2)}</div>
      <div style="font-size:13px;color:#666;margin-top:3px">Invested: $${balance.invested.toFixed(2)}</div>
    </div>
  </div>

  <div class="title">Transaction History (${txs.length} transactions)</div>
  <table>
    <thead>
      <tr><th>Date</th><th>Type</th><th>Description</th><th style="text-align:right">Amount</th><th>Status</th></tr>
    </thead>
    <tbody>
      ${txRows || '<tr><td colspan="5" style="text-align:center;padding:20px">No transactions in this period</td></tr>'}
    </tbody>
  </table>

  <div class="summary">
    <div style="font-weight:bold;margin-bottom:10px">Period Summary</div>
    <div class="summary-row"><span>Total Deposits</span><span style="color:green">+$${totalDeposits.toFixed(2)}</span></div>
    <div class="summary-row"><span>Total Withdrawals</span><span style="color:red">-$${totalWithdrawals.toFixed(2)}</span></div>
    <div class="summary-row"><span>Total Buys</span><span>$${totalBuys.toFixed(2)}</span></div>
    <div class="summary-row"><span>Total Sells</span><span>$${totalSells.toFixed(2)}</span></div>
    <div class="summary-row"><span>Total Dividends</span><span style="color:green">+$${totalDividends.toFixed(2)}</span></div>
    <div class="summary-row" style="border-top:1px solid #ccc;padding-top:10px;font-weight:bold">
      <span>Net Change</span><span>$${(totalDeposits + totalDividends + totalSells - totalWithdrawals - totalBuys).toFixed(2)}</span>
    </div>
  </div>

  <div class="footer">
    <p>This statement is generated by IVX HOLDINGS LLC. All amounts are in USD.</p>
    <p>This document is for informational purposes only and does not constitute financial advice.</p>
    <p>IVX HOLDINGS LLC | support@ipxholding.com | www.ipxholding.com</p>
  </div>
</body>
</html>`;
}

function generateTaxReportHTML(userId: string, year: number): string {
  const user = store.getUser(userId);
  const txs = store.getUserTransactions(userId).filter(t => {
    return new Date(t.createdAt).getFullYear() === year;
  });
  const holdings = store.getUserHoldings(userId);

  const dividends = txs.filter(t => t.type === "dividend").reduce((s, t) => s + t.amount, 0);
  const salesProceeds = txs.filter(t => t.type === "sell").reduce((s, t) => s + t.amount, 0);
  const purchases = txs.filter(t => t.type === "buy").reduce((s, t) => s + Math.abs(t.amount), 0);
  const fees = txs.filter(t => t.type === "fee").reduce((s, t) => s + t.amount, 0);
  const unrealizedGains = holdings.reduce((s, h) => s + h.unrealizedPnL, 0);
  const estimatedTax = (dividends + Math.max(0, salesProceeds - purchases * 0.3)) * 0.25;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tax Report ${year}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { border-bottom: 2px solid #1a237e; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #1a237e; }
    .section { margin: 25px 0; }
    .section-title { font-size: 16px; font-weight: bold; color: #1a237e; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .row-label { color: #666; }
    .row-value { font-weight: bold; }
    .highlight { background: #e8eaf6; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1a237e; color: white; padding: 10px; text-align: left; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">IVX HOLDINGS</div>
    <div>Annual Tax Report - ${year}</div>
    <div style="margin-top:10px">
      <strong>${user ? `${user.firstName} ${user.lastName}` : "Account Holder"}</strong>
      <span style="margin-left:20px;color:#666">${user?.email || ""}</span>
    </div>
    <div style="margin-top:5px;color:#666">Generated: ${new Date().toLocaleDateString()}</div>
  </div>

  <div class="section">
    <div class="section-title">Income Summary</div>
    <div class="row"><span class="row-label">Dividend Income (1099-DIV)</span><span class="row-value">$${dividends.toFixed(2)}</span></div>
    <div class="row"><span class="row-label">Sales Proceeds (1099-B)</span><span class="row-value">$${salesProceeds.toFixed(2)}</span></div>
    <div class="row"><span class="row-label">Cost Basis of Sales</span><span class="row-value">$${(purchases * 0.3).toFixed(2)}</span></div>
    <div class="row"><span class="row-label">Realized Capital Gains</span><span class="row-value">$${(salesProceeds - purchases * 0.3).toFixed(2)}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Investment Activity</div>
    <div class="row"><span class="row-label">Total Purchases</span><span class="row-value">$${purchases.toFixed(2)}</span></div>
    <div class="row"><span class="row-label">Total Sales</span><span class="row-value">$${salesProceeds.toFixed(2)}</span></div>
    <div class="row"><span class="row-label">Total Fees Paid</span><span class="row-value">$${fees.toFixed(2)}</span></div>
    <div class="row"><span class="row-label">Total Transactions</span><span class="row-value">${txs.length}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Current Holdings</div>
    <table>
      <thead><tr><th>Property</th><th>Shares</th><th>Cost Basis</th><th>Current Value</th><th>Unrealized P&L</th></tr></thead>
      <tbody>
        ${holdings.map(h => {
          const prop = store.getProperty(h.propertyId);
          return `<tr>
            <td>${prop?.name || h.propertyId}</td>
            <td>${h.shares}</td>
            <td>$${(h.avgCostBasis * h.shares).toFixed(2)}</td>
            <td>$${h.currentValue.toFixed(2)}</td>
            <td style="color:${h.unrealizedPnL >= 0 ? "green" : "red"}">${h.unrealizedPnL >= 0 ? "+" : ""}$${h.unrealizedPnL.toFixed(2)}</td>
          </tr>`;
        }).join("")}
        ${holdings.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:15px">No holdings</td></tr>' : ""}
      </tbody>
    </table>
    <div class="row" style="font-weight:bold;margin-top:10px">
      <span>Total Unrealized Gains</span>
      <span style="color:${unrealizedGains >= 0 ? "green" : "red"}">${unrealizedGains >= 0 ? "+" : ""}$${unrealizedGains.toFixed(2)}</span>
    </div>
  </div>

  <div class="highlight">
    <div style="font-weight:bold;margin-bottom:10px">Estimated Tax Liability</div>
    <div class="row"><span>Taxable Income (Dividends + Realized Gains)</span><span>$${(dividends + Math.max(0, salesProceeds - purchases * 0.3)).toFixed(2)}</span></div>
    <div class="row"><span>Estimated Federal Tax (25%)</span><span style="font-weight:bold;font-size:18px">$${estimatedTax.toFixed(2)}</span></div>
    <div style="font-size:11px;color:#666;margin-top:10px">* Estimate only. Consult a tax professional for accurate filing.</div>
  </div>

  <div class="footer">
    <p>This report is generated by IVX HOLDINGS LLC for informational purposes only.</p>
    <p>It is NOT a substitute for professional tax advice. Please consult a qualified tax advisor.</p>
    <p>IVX HOLDINGS LLC | support@ipxholding.com | www.ipxholding.com</p>
  </div>
</body>
</html>`;
}

function generatePortfolioReportHTML(userId: string): string {
  const user = store.getUser(userId);
  const holdings = store.getUserHoldings(userId);
  const balance = store.getWalletBalance(userId);
  const totalPortfolioValue = holdings.reduce((s, h) => s + h.currentValue, 0) + balance.available;
  const totalReturn = holdings.reduce((s, h) => s + h.totalReturn, 0);
  const totalInvested = holdings.reduce((s, h) => s + (h.avgCostBasis * h.shares), 0);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Portfolio Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { border-bottom: 2px solid #1a237e; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #1a237e; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 25px 0; }
    .metric { background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; }
    .metric-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .metric-value { font-size: 22px; font-weight: bold; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #1a237e; color: white; padding: 10px; text-align: left; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">IVX HOLDINGS</div>
    <div>Portfolio Report</div>
    <div style="margin-top:10px">
      <strong>${user ? `${user.firstName} ${user.lastName}` : "Account Holder"}</strong>
      <span style="margin-left:20px;color:#666">Generated: ${new Date().toLocaleDateString()}</span>
    </div>
  </div>

  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Total Portfolio Value</div>
      <div class="metric-value">$${totalPortfolioValue.toFixed(2)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Total Invested</div>
      <div class="metric-value">$${totalInvested.toFixed(2)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Total Return</div>
      <div class="metric-value" style="color:${totalReturn >= 0 ? "green" : "red"}">${totalReturn >= 0 ? "+" : ""}$${totalReturn.toFixed(2)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Cash Balance</div>
      <div class="metric-value">$${balance.available.toFixed(2)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Number of Holdings</div>
      <div class="metric-value">${holdings.length}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Pending Balance</div>
      <div class="metric-value">$${balance.pending.toFixed(2)}</div>
    </div>
  </div>

  <h3>Holdings Detail</h3>
  <table>
    <thead><tr><th>Property</th><th>Shares</th><th>Avg Cost</th><th>Current Value</th><th>Return</th><th>Return %</th></tr></thead>
    <tbody>
      ${holdings.map(h => {
        const prop = store.getProperty(h.propertyId);
        return `<tr>
          <td>${prop?.name || h.propertyId}</td>
          <td>${h.shares}</td>
          <td>$${h.avgCostBasis.toFixed(2)}</td>
          <td>$${h.currentValue.toFixed(2)}</td>
          <td style="color:${h.totalReturn >= 0 ? "green" : "red"}">${h.totalReturn >= 0 ? "+" : ""}$${h.totalReturn.toFixed(2)}</td>
          <td style="color:${h.totalReturnPercent >= 0 ? "green" : "red"}">${h.totalReturnPercent >= 0 ? "+" : ""}${h.totalReturnPercent.toFixed(2)}%</td>
        </tr>`;
      }).join("")}
      ${holdings.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:15px">No holdings</td></tr>' : ""}
    </tbody>
  </table>

  <div class="footer">
    <p>Past performance is not indicative of future results. All amounts in USD.</p>
    <p>IVX HOLDINGS LLC | support@ipxholding.com | www.ipxholding.com</p>
  </div>
</body>
</html>`;
}

function generateReceiptHTML(
  userId: string,
  transactionId: string,
  amount: number,
  type: string,
  description: string,
  fee: number,
): string {
  const user = store.getUser(userId);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Transaction Receipt</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; max-width: 600px; margin: 40px auto; }
    .header { text-align: center; border-bottom: 2px solid #1a237e; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #1a237e; }
    .receipt-id { font-size: 12px; color: #999; margin-top: 5px; }
    .amount-box { text-align: center; background: #f5f5f5; padding: 25px; border-radius: 12px; margin: 25px 0; }
    .amount { font-size: 36px; font-weight: bold; color: #1a237e; }
    .status { display: inline-block; background: #4caf50; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; margin-top: 10px; }
    .details { margin: 25px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
    .detail-label { color: #666; }
    .detail-value { font-weight: bold; }
    .footer { margin-top: 30px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">IVX HOLDINGS</div>
    <div>Transaction Receipt</div>
    <div class="receipt-id">Receipt #${transactionId}</div>
  </div>

  <div class="amount-box">
    <div class="amount">$${amount.toFixed(2)}</div>
    <div class="status">COMPLETED</div>
  </div>

  <div class="details">
    <div class="detail-row"><span class="detail-label">Transaction ID</span><span class="detail-value">${transactionId}</span></div>
    <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${type.charAt(0).toUpperCase() + type.slice(1)}</span></div>
    <div class="detail-row"><span class="detail-label">Description</span><span class="detail-value">${description}</span></div>
    <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">$${amount.toFixed(2)}</span></div>
    ${fee > 0 ? `<div class="detail-row"><span class="detail-label">Fee</span><span class="detail-value">$${fee.toFixed(2)}</span></div>` : ""}
    ${fee > 0 ? `<div class="detail-row"><span class="detail-label">Net Amount</span><span class="detail-value">$${(amount - fee).toFixed(2)}</span></div>` : ""}
    <div class="detail-row"><span class="detail-label">Account Holder</span><span class="detail-value">${user ? `${user.firstName} ${user.lastName}` : "N/A"}</span></div>
    <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${new Date().toLocaleString()}</span></div>
  </div>

  <div class="footer">
    <p>Thank you for using IVX HOLDINGS.</p>
    <p>IVX HOLDINGS LLC | support@ipxholding.com | www.ipxholding.com</p>
  </div>
</body>
</html>`;
}

function generateInvestorProspectusHTML(propertyId: string): string {
  const prop = store.getProperty(propertyId);
  if (!prop) return "<html><body><p>Property not found</p></body></html>";
  const md = store.marketData.get(propertyId);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Investor Prospectus - ${prop.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { border-bottom: 2px solid #1a237e; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #1a237e; }
    .prop-name { font-size: 22px; font-weight: bold; margin-top: 15px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 25px 0; }
    .metric { background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; }
    .metric-label { font-size: 11px; color: #666; text-transform: uppercase; }
    .metric-value { font-size: 18px; font-weight: bold; margin-top: 5px; color: #1a237e; }
    .section { margin: 25px 0; }
    .section-title { font-size: 16px; font-weight: bold; color: #1a237e; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px; }
    .highlight { background: #e8eaf6; padding: 12px; border-radius: 8px; margin: 8px 0; }
    .disclaimer { background: #fff3e0; padding: 15px; border-radius: 8px; margin-top: 30px; font-size: 12px; }
    .footer { margin-top: 30px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">IVX HOLDINGS</div>
    <div>Investor Prospectus</div>
    <div class="prop-name">${prop.name}</div>
    <div style="color:#666">${prop.location} | ${prop.city}, ${prop.country}</div>
    <div style="font-size:12px;color:#999;margin-top:5px">Generated: ${new Date().toLocaleDateString()}</div>
  </div>

  <div class="metrics">
    <div class="metric"><div class="metric-label">Price/Share</div><div class="metric-value">$${prop.pricePerShare.toFixed(2)}</div></div>
    <div class="metric"><div class="metric-label">Annual Yield</div><div class="metric-value">${prop.yield}%</div></div>
    <div class="metric"><div class="metric-label">Cap Rate</div><div class="metric-value">${prop.capRate}%</div></div>
    <div class="metric"><div class="metric-label">IRR</div><div class="metric-value">${prop.irr}%</div></div>
    <div class="metric"><div class="metric-label">Occupancy</div><div class="metric-value">${prop.occupancy}%</div></div>
    <div class="metric"><div class="metric-label">Total Shares</div><div class="metric-value">${prop.totalShares.toLocaleString()}</div></div>
    <div class="metric"><div class="metric-label">Target Raise</div><div class="metric-value">$${(prop.targetRaise / 1000000).toFixed(1)}M</div></div>
    <div class="metric"><div class="metric-label">Funding</div><div class="metric-value">${prop.targetRaise > 0 ? Math.round((prop.currentRaise / prop.targetRaise) * 100) : 0}%</div></div>
  </div>

  <div class="section">
    <div class="section-title">Property Overview</div>
    <p>${prop.description}</p>
    <div style="margin-top:10px"><strong>Type:</strong> ${prop.propertyType} | <strong>Risk:</strong> ${prop.riskLevel} | <strong>Status:</strong> ${prop.status}</div>
  </div>

  <div class="section">
    <div class="section-title">Investment Highlights</div>
    ${prop.highlights.map(h => `<div class="highlight">✓ ${h}</div>`).join("")}
  </div>

  ${md ? `
  <div class="section">
    <div class="section-title">Market Data</div>
    <div class="metrics" style="grid-template-columns: repeat(3, 1fr)">
      <div class="metric"><div class="metric-label">Last Price</div><div class="metric-value">$${md.lastPrice.toFixed(2)}</div></div>
      <div class="metric"><div class="metric-label">24h Change</div><div class="metric-value" style="color:${md.changePercent24h >= 0 ? "green" : "red"}">${md.changePercent24h >= 0 ? "+" : ""}${md.changePercent24h.toFixed(2)}%</div></div>
      <div class="metric"><div class="metric-label">24h Volume</div><div class="metric-value">${md.volume24h.toLocaleString()}</div></div>
    </div>
  </div>
  ` : ""}

  <div class="disclaimer">
    <strong>Important Disclaimer:</strong> This prospectus is for informational purposes only and does not constitute an offer to sell or a solicitation of an offer to buy securities. Investment involves risk, including possible loss of principal. Past performance is not indicative of future results. Please review all offering documents carefully before investing.
  </div>

  <div class="footer">
    <p>IVX HOLDINGS LLC | Confidential | For Qualified Investors Only</p>
    <p>support@ipxholding.com | www.ipxholding.com</p>
  </div>
</body>
</html>`;
}

export const fileStorageRouter = createTRPCRouter({
  uploadFile: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      mimeType: z.string(),
      size: z.number().positive().max(50 * 1024 * 1024),
      category: z.enum(["document", "tax", "statement", "receipt", "kyc", "property", "report", "other"]),
      fileData: z.string(),
      metadata: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[FileStorage] Uploading file: ${input.fileName} (${input.category}) for ${userId}`);

      const storageKey = generateStorageKey(userId, input.category, input.fileName);
      const result = await uploadFile(storageKey, input.fileData, input.mimeType);

      const storedFile: StoredFile = {
        id: store.genId("file"),
        userId,
        fileName: storageKey.split("/").pop() || input.fileName,
        originalName: input.fileName,
        mimeType: input.mimeType,
        size: input.size,
        category: input.category,
        storageKey,
        storageProvider: result.provider,
        downloadUrl: result.url,
        metadata: input.metadata || {},
        createdAt: new Date().toISOString(),
      };

      fileStore.push(storedFile);
      store.log("file_upload", userId, `Uploaded ${input.fileName} (${input.category})`);

      return {
        success: true,
        fileId: storedFile.id,
        downloadUrl: storedFile.downloadUrl,
        storageProvider: result.provider,
      };
    }),

  getUploadUrl: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      mimeType: z.string(),
      category: z.enum(["document", "tax", "statement", "receipt", "kyc", "property", "report", "other"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const storageKey = generateStorageKey(userId, input.category, input.fileName);
      console.log(`[FileStorage] Generating presigned URL for: ${storageKey}`);

      let uploadUrl = "";
      let provider = "local";

      if (STORAGE_PROVIDER === "r2" && CLOUDFLARE_R2_ENDPOINT) {
        uploadUrl = `${CLOUDFLARE_R2_ENDPOINT}/${CLOUDFLARE_R2_BUCKET}/${storageKey}`;
        provider = "r2";
      } else if (STORAGE_PROVIDER === "s3" && s3Client) {
        try {
          const command = new PutObjectCommand({
            Bucket: AWS_S3_BUCKET,
            Key: storageKey,
            ContentType: input.mimeType,
          });
          uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 1800 });
          provider = "s3";
        } catch (e) {
          console.error("[FileStorage] Failed to generate presigned URL:", e);
          uploadUrl = `https://api.ivxholdings.com/upload/${storageKey}`;
        }
      } else {
        uploadUrl = `https://api.ivxholdings.com/upload/${storageKey}`;
      }

      return {
        uploadUrl,
        storageKey,
        provider,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        headers: {
          "Content-Type": input.mimeType,
        },
      };
    }),

  confirmUpload: protectedProcedure
    .input(z.object({
      storageKey: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      size: z.number(),
      category: z.enum(["document", "tax", "statement", "receipt", "kyc", "property", "report", "other"]),
      metadata: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[FileStorage] Confirming upload: ${input.storageKey}`);

      let downloadUrl = "";
      if (STORAGE_PROVIDER === "r2" && CLOUDFLARE_R2_ENDPOINT) {
        downloadUrl = `${CLOUDFLARE_R2_ENDPOINT}/${CLOUDFLARE_R2_BUCKET}/${input.storageKey}`;
      } else if (STORAGE_PROVIDER === "s3") {
        downloadUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${input.storageKey}`;
      } else {
        downloadUrl = `https://api.ipxholding.com/files/${input.storageKey}`;
      }

      const storedFile: StoredFile = {
        id: store.genId("file"),
        userId,
        fileName: input.storageKey.split("/").pop() || input.fileName,
        originalName: input.fileName,
        mimeType: input.mimeType,
        size: input.size,
        category: input.category,
        storageKey: input.storageKey,
        storageProvider: STORAGE_PROVIDER,
        downloadUrl,
        metadata: input.metadata || {},
        createdAt: new Date().toISOString(),
      };

      fileStore.push(storedFile);
      store.log("file_confirm", userId, `Confirmed upload: ${input.fileName}`);

      return { success: true, fileId: storedFile.id, downloadUrl };
    }),

  getUserFiles: protectedProcedure
    .input(z.object({
      category: z.enum(["document", "tax", "statement", "receipt", "kyc", "property", "report", "other", "all"]).default("all"),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      let files = fileStore.filter(f => f.userId === userId);
      if (input.category !== "all") files = files.filter(f => f.category === input.category);
      files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const result = store.paginate(files, input.page, input.limit);
      return {
        files: result.items.map(f => ({
          id: f.id,
          fileName: f.originalName,
          mimeType: f.mimeType,
          size: f.size,
          category: f.category,
          downloadUrl: f.downloadUrl,
          createdAt: f.createdAt,
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    }),

  deleteFile: protectedProcedure
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const idx = fileStore.findIndex(f => f.id === input.fileId && f.userId === userId);
      if (idx < 0) return { success: false, message: "File not found" };

      const file = fileStore[idx];
      await deleteFromStorage(file.storageKey);
      fileStore.splice(idx, 1);
      store.log("file_delete", userId, `Deleted file: ${file.originalName}`);

      return { success: true };
    }),

  getStorageUsage: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const files = fileStore.filter(f => f.userId === userId);
      const totalSize = files.reduce((s, f) => s + f.size, 0);
      const maxStorage = 5 * 1024 * 1024 * 1024;

      const byCategory: Record<string, { count: number; size: number }> = {};
      files.forEach(f => {
        if (!byCategory[f.category]) byCategory[f.category] = { count: 0, size: 0 };
        byCategory[f.category].count++;
        byCategory[f.category].size += f.size;
      });

      return {
        totalFiles: files.length,
        totalSize,
        maxStorage,
        usagePercent: Math.round((totalSize / maxStorage) * 10000) / 100,
        byCategory,
      };
    }),

  generateStatement: protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      format: z.enum(["pdf", "html"]).default("pdf"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[FileStorage] Generating statement for ${userId}: ${input.startDate} to ${input.endDate}`);

      const html = generateTransactionStatementHTML(userId, input.startDate, input.endDate);
      const storageKey = generateStorageKey(userId, "statement", `statement_${input.startDate}_${input.endDate}.${input.format}`);
      const result = await uploadFile(storageKey, html, input.format === "pdf" ? "application/pdf" : "text/html");

      const pdf: GeneratedPDF = {
        id: store.genId("pdf"),
        userId,
        type: "statement",
        title: `Account Statement ${input.startDate} - ${input.endDate}`,
        downloadUrl: result.url,
        size: html.length,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { startDate: input.startDate, endDate: input.endDate },
      };
      pdfStore.push(pdf);

      store.log("pdf_generate", userId, `Generated statement: ${input.startDate} to ${input.endDate}`);

      return {
        success: true,
        documentId: pdf.id,
        downloadUrl: pdf.downloadUrl,
        title: pdf.title,
        htmlContent: html,
      };
    }),

  generateTaxReport: protectedProcedure
    .input(z.object({
      year: z.number().min(2020).max(2030),
      format: z.enum(["pdf", "html"]).default("pdf"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[FileStorage] Generating tax report for ${userId}: ${input.year}`);

      const html = generateTaxReportHTML(userId, input.year);
      const storageKey = generateStorageKey(userId, "tax", `tax_report_${input.year}.${input.format}`);
      const result = await uploadFile(storageKey, html, input.format === "pdf" ? "application/pdf" : "text/html");

      const pdf: GeneratedPDF = {
        id: store.genId("pdf"),
        userId,
        type: "tax_report",
        title: `Tax Report ${input.year}`,
        downloadUrl: result.url,
        size: html.length,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { year: input.year.toString() },
      };
      pdfStore.push(pdf);

      store.log("pdf_generate", userId, `Generated tax report: ${input.year}`);

      return {
        success: true,
        documentId: pdf.id,
        downloadUrl: pdf.downloadUrl,
        title: pdf.title,
        htmlContent: html,
      };
    }),

  generatePortfolioReport: protectedProcedure
    .input(z.object({
      format: z.enum(["pdf", "html"]).default("pdf"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[FileStorage] Generating portfolio report for ${userId}`);

      const html = generatePortfolioReportHTML(userId);
      const storageKey = generateStorageKey(userId, "report", `portfolio_report.${input.format}`);
      const result = await uploadFile(storageKey, html, input.format === "pdf" ? "application/pdf" : "text/html");

      const pdf: GeneratedPDF = {
        id: store.genId("pdf"),
        userId,
        type: "portfolio_report",
        title: "Portfolio Report",
        downloadUrl: result.url,
        size: html.length,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {},
      };
      pdfStore.push(pdf);

      return {
        success: true,
        documentId: pdf.id,
        downloadUrl: pdf.downloadUrl,
        title: pdf.title,
        htmlContent: html,
      };
    }),

  generateReceipt: protectedProcedure
    .input(z.object({
      transactionId: z.string(),
      amount: z.number(),
      type: z.string(),
      description: z.string(),
      fee: z.number().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[FileStorage] Generating receipt for ${userId}: ${input.transactionId}`);

      const html = generateReceiptHTML(userId, input.transactionId, input.amount, input.type, input.description, input.fee);
      const storageKey = generateStorageKey(userId, "receipt", `receipt_${input.transactionId}.pdf`);
      const result = await uploadFile(storageKey, html, "application/pdf");

      const pdf: GeneratedPDF = {
        id: store.genId("pdf"),
        userId,
        type: "receipt",
        title: `Receipt - ${input.transactionId}`,
        downloadUrl: result.url,
        size: html.length,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { transactionId: input.transactionId },
      };
      pdfStore.push(pdf);

      return {
        success: true,
        documentId: pdf.id,
        downloadUrl: pdf.downloadUrl,
        htmlContent: html,
      };
    }),

  generateProspectus: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[FileStorage] Generating prospectus for property: ${input.propertyId}`);

      const html = generateInvestorProspectusHTML(input.propertyId);
      const storageKey = generateStorageKey(userId, "document", `prospectus_${input.propertyId}.pdf`);
      const result = await uploadFile(storageKey, html, "application/pdf");

      const prop = store.getProperty(input.propertyId);
      const pdf: GeneratedPDF = {
        id: store.genId("pdf"),
        userId,
        type: "prospectus",
        title: `Investor Prospectus - ${prop?.name || input.propertyId}`,
        downloadUrl: result.url,
        size: html.length,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { propertyId: input.propertyId },
      };
      pdfStore.push(pdf);

      return {
        success: true,
        documentId: pdf.id,
        downloadUrl: pdf.downloadUrl,
        title: pdf.title,
        htmlContent: html,
      };
    }),

  getGeneratedDocuments: protectedProcedure
    .input(z.object({
      type: z.string().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      let docs = pdfStore.filter(p => p.userId === userId);
      if (input.type) docs = docs.filter(p => p.type === input.type);
      docs.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
      const result = store.paginate(docs, input.page, input.limit);
      return {
        documents: result.items.map(d => ({
          id: d.id,
          type: d.type,
          title: d.title,
          downloadUrl: d.downloadUrl,
          generatedAt: d.generatedAt,
          expiresAt: d.expiresAt,
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    }),

  adminBulkGenerate: adminProcedure
    .input(z.object({
      type: z.enum(["tax_report", "statement", "portfolio_report"]),
      year: z.number().optional(),
      userIds: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`[FileStorage] Admin bulk generate: ${input.type}`);
      const targetUsers = input.userIds
        ? input.userIds.map(id => store.getUser(id)).filter(Boolean)
        : store.getAllUsers();

      let generated = 0;
      let failed = 0;

      for (const user of targetUsers) {
        if (!user) continue;
        try {
          let html = "";
          let storageKey = "";
          let title = "";

          if (input.type === "tax_report" && input.year) {
            html = generateTaxReportHTML(user.id, input.year);
            storageKey = generateStorageKey(user.id, "tax", `tax_report_${input.year}.pdf`);
            title = `Tax Report ${input.year}`;
          } else if (input.type === "portfolio_report") {
            html = generatePortfolioReportHTML(user.id);
            storageKey = generateStorageKey(user.id, "report", "portfolio_report.pdf");
            title = "Portfolio Report";
          } else if (input.type === "statement") {
            const now = new Date();
            const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
            const endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
            html = generateTransactionStatementHTML(user.id, startDate, endDate);
            storageKey = generateStorageKey(user.id, "statement", "monthly_statement.pdf");
            title = "Monthly Statement";
          }

          if (html && storageKey) {
            const result = await uploadFile(storageKey, html, "application/pdf");
            pdfStore.push({
              id: store.genId("pdf"),
              userId: user.id,
              type: input.type,
              title,
              downloadUrl: result.url,
              size: html.length,
              generatedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              metadata: input.year ? { year: input.year.toString() } : {},
            });
            generated++;
          }
        } catch (e) {
          console.error(`[FileStorage] Bulk generate error for ${user.id}:`, e);
          failed++;
        }
      }

      store.log("admin_bulk_generate", ctx.userId || "admin", `Bulk generated ${generated} ${input.type} documents`);
      return { success: true, generated, failed, total: targetUsers.length };
    }),

  adminGetAllFiles: adminProcedure
    .input(z.object({
      category: z.string().optional(),
      userId: z.string().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      let files = [...fileStore];
      if (input.category) files = files.filter(f => f.category === input.category);
      if (input.userId) files = files.filter(f => f.userId === input.userId);
      files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const result = store.paginate(files, input.page, input.limit);
      return {
        files: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    }),

  adminGetStorageStats: adminProcedure
    .query(async () => {
      const totalSize = fileStore.reduce((s, f) => s + f.size, 0);
      const byProvider: Record<string, { count: number; size: number }> = {};
      const byCategory: Record<string, { count: number; size: number }> = {};

      fileStore.forEach(f => {
        if (!byProvider[f.storageProvider]) byProvider[f.storageProvider] = { count: 0, size: 0 };
        byProvider[f.storageProvider].count++;
        byProvider[f.storageProvider].size += f.size;

        if (!byCategory[f.category]) byCategory[f.category] = { count: 0, size: 0 };
        byCategory[f.category].count++;
        byCategory[f.category].size += f.size;
      });

      return {
        totalFiles: fileStore.length,
        totalSize,
        totalPDFs: pdfStore.length,
        byProvider,
        byCategory,
        storageProvider: STORAGE_PROVIDER,
        r2Configured: !!CLOUDFLARE_R2_ENDPOINT,
        s3Configured: isS3Configured,
      };
    }),
});
