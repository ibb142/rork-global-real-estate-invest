import { createTRPCRouter } from "./create-context";
import { membersRouter } from "./routes/members";
import { broadcastRouter } from "./routes/broadcast";
import { engagementRouter } from "./routes/engagement";
import { propertiesRouter } from "./routes/properties";
import { transactionsRouter } from "./routes/transactions";
import { teamRouter } from "./routes/team";
import { usersRouter } from "./routes/users";
import { walletRouter } from "./routes/wallet";
import { kycRouter } from "./routes/kyc";
import { notificationsRouter } from "./routes/notifications";
import { paymentsRouter } from "./routes/payments";
import { alertsRouter } from "./routes/alerts";
import { marketRouter } from "./routes/market";
import { referralsRouter } from "./routes/referrals";
import { submissionsRouter } from "./routes/submissions";
import { landPartnersRouter } from "./routes/land-partners";
import { debtAcquisitionRouter } from "./routes/debt-acquisition";
import { supportRouter } from "./routes/support";
import { influencersRouter } from "./routes/influencers";
import { documentsRouter } from "./routes/documents";
import { analyticsRouter } from "./routes/analytics";
import { emailEngineRouter } from "./routes/email-engine";
import { lenderSyncRouter } from "./routes/lender-sync";
import { autoReinvestRouter } from "./routes/auto-reinvest";
import { copyInvestingRouter } from "./routes/copy-investing";
import { giftSharesRouter } from "./routes/gift-shares";
import { smartInvestingRouter } from "./routes/smart-investing";
import { vipTiersRouter } from "./routes/vip-tiers";
import { earnRouter } from "./routes/earn";
import { taxRouter } from "./routes/tax";
import { fileStorageRouter } from "./routes/file-storage";
import { additionalPaymentsRouter } from "./routes/additional-payments";
import { externalApisRouter } from "./routes/external-apis";
import { testingRouter } from "./routes/testing";
import { envVaultRouter } from "./routes/env-vault";

export const appRouter = createTRPCRouter({
  users: usersRouter,
  wallet: walletRouter,
  kyc: kycRouter,
  notifications: notificationsRouter,
  payments: paymentsRouter,
  market: marketRouter,
  referrals: referralsRouter,
  support: supportRouter,

  members: membersRouter,
  broadcast: broadcastRouter,
  engagement: engagementRouter,
  properties: propertiesRouter,
  transactions: transactionsRouter,
  team: teamRouter,
  alerts: alertsRouter,
  analytics: analyticsRouter,

  submissions: submissionsRouter,
  landPartners: landPartnersRouter,
  debtAcquisition: debtAcquisitionRouter,
  influencers: influencersRouter,
  documents: documentsRouter,
  emailEngine: emailEngineRouter,
  lenderSync: lenderSyncRouter,
  autoReinvest: autoReinvestRouter,
  copyInvesting: copyInvestingRouter,
  giftShares: giftSharesRouter,
  smartInvesting: smartInvestingRouter,
  vipTiers: vipTiersRouter,
  earn: earnRouter,
  tax: taxRouter,
  fileStorage: fileStorageRouter,
  additionalPayments: additionalPaymentsRouter,
  externalApis: externalApisRouter,
  testing: testingRouter,
  envVault: envVaultRouter,
});

export type AppRouter = typeof appRouter;
