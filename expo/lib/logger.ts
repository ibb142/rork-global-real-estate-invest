import { envConfig } from './environment';

function createLogger(prefix: string) {
  const shouldLog = envConfig.enableDebugLogging;

  return {
    log: (...args: unknown[]) => {
      if (shouldLog) console.log(`[${prefix}]`, ...args);
    },
    info: (...args: unknown[]) => {
      if (shouldLog) console.info(`[${prefix}]`, ...args);
    },
    warn: (...args: unknown[]) => {
      console.warn(`[${prefix}]`, ...args);
    },
    error: (...args: unknown[]) => {
      console.warn(`[${prefix}]`, ...args);
    },
  };
}

export const logger = {
  wallet: createLogger('Wallet'),
  kyc: createLogger('KYC'),
  auth: createLogger('Auth'),
  push: createLogger('PushNotifications'),
  payment: createLogger('PaymentService'),
  analytics: createLogger('Analytics'),
  environment: createLogger('Environment'),
  verification: createLogger('VerificationService'),
  dataHooks: createLogger('DataHooks'),
  videoPresentation: createLogger('VideoPresentation'),
  aiGallery: createLogger('AIGallery'),
  aiReport: createLogger('AIReport'),
  shareContent: createLogger('ShareContent'),
  contractGenerator: createLogger('ContractGenerator'),
  secEdgar: createLogger('SEC-EDGAR'),
  taxDocs: createLogger('TaxDocs'),
  taxInfo: createLogger('TaxInfo'),
  statements: createLogger('Statements'),
  referrals: createLogger('Referrals'),
  signup: createLogger('Signup'),
  personalInfo: createLogger('PersonalInfo'),
  drip: createLogger('DRIP'),
  companyInfo: createLogger('CompanyInfo'),
  giftShares: createLogger('GiftShares'),
  titleReview: createLogger('TitleReview'),
  authStore: createLogger('AuthStore'),
  property: createLogger('Property'),
  general: createLogger('App'),
};

export default logger;
