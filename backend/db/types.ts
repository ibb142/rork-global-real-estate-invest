export interface BankAccount {
  id: string;
  userId: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  routingNumber?: string;
  swiftCode?: string;
  iban?: string;
  accountType: "checking" | "savings";
  country: string;
  isDefault: boolean;
  status: "pending_verification" | "verified" | "failed";
  last4: string;
  createdAt: string;
}

export interface KYCPersonalInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  nationalityCode: string;
  taxResidency: string;
  taxId: string;
  occupation: string;
  sourceOfFunds: "employment" | "business" | "investments" | "inheritance" | "savings" | "other";
  annualIncome: "under_50k" | "50k_100k" | "100k_250k" | "250k_500k" | "500k_1m" | "over_1m";
  netWorth: "under_100k" | "100k_500k" | "500k_1m" | "1m_5m" | "over_5m";
  investmentExperience: "none" | "limited" | "moderate" | "extensive";
  isPoliticallyExposed: boolean;
}

export interface KYCAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
}

export interface KYCDocument {
  id: string;
  type: "passport" | "national_id" | "drivers_license" | "utility_bill" | "bank_statement" | "tax_return" | "proof_of_address";
  url: string;
  documentNumber?: string;
  expiryDate?: string;
  issuingCountry?: string;
  status: "pending_review" | "verified" | "rejected" | "expired";
  verificationResult?: DocumentVerificationResult;
  uploadedAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface DocumentVerificationResult {
  isAuthentic: boolean;
  confidence: number;
  extractedData?: Record<string, string>;
  securityFeatures: Array<{ name: string; detected: boolean }>;
  tamperingDetected: boolean;
  expiryValid: boolean;
  provider: string;
  rawResponse?: string;
  checkedAt: string;
}

export interface LivenessCheckResult {
  id: string;
  isLive: boolean;
  confidence: number;
  challenges: Array<{ type: string; completed: boolean; score: number }>;
  spoofAttemptDetected: boolean;
  provider: string;
  sessionId: string;
  checkedAt: string;
}

export interface FaceMatchResult {
  isMatch: boolean;
  similarity: number;
  confidence: number;
  provider: string;
  checkedAt: string;
}

export interface SanctionsCheckResult {
  id: string;
  isClean: boolean;
  riskScore: number;
  databases: SanctionsDatabaseResult[];
  pepMatch: boolean;
  adverseMediaFound: boolean;
  watchlistHits: SanctionsHit[];
  provider: string;
  checkedAt: string;
  expiresAt: string;
}

export interface SanctionsDatabaseResult {
  name: string;
  checked: boolean;
  matchFound: boolean;
  matchScore: number;
  lastUpdated: string;
}

export interface SanctionsHit {
  source: string;
  name: string;
  matchScore: number;
  type: "sanction" | "pep" | "adverse_media" | "watchlist";
  details: string;
  listDate: string;
}

export interface AccreditationSubmission {
  id: string;
  type: "income" | "net_worth" | "professional" | "entity";
  status: "pending_review" | "approved" | "rejected" | "expired";
  proofUrl: string;
  proofDocumentType: string;
  additionalInfo?: string;
  verificationMethod: "self_certification" | "third_party" | "cpa_letter" | "broker_dealer";
  annualIncome?: number;
  netWorth?: number;
  professionalLicense?: string;
  entityName?: string;
  entityType?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  expiresAt?: string;
}

export interface KYCVerificationResult {
  id: string;
  overallStatus: "passed" | "failed" | "review_required";
  overallScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  checks: KYCVerificationCheck[];
  provider: string;
  completedAt: string;
}

export interface KYCVerificationCheck {
  name: string;
  category: "identity" | "document" | "biometric" | "sanctions" | "accreditation";
  status: "passed" | "failed" | "pending" | "warning";
  score: number;
  details: string;
  metadata?: Record<string, unknown>;
}

export interface KYCSubmission {
  userId: string;
  status: "pending" | "documents_submitted" | "in_review" | "approved" | "rejected" | "expired";
  level: number;
  tier: "basic" | "standard" | "enhanced";
  personalInfo?: KYCPersonalInfo;
  address?: KYCAddress;
  documents: KYCDocument[];
  selfieUrl?: string;
  livenessCheck?: LivenessCheckResult;
  faceMatch?: FaceMatchResult;
  sanctionsCheck?: SanctionsCheckResult;
  verificationResult?: KYCVerificationResult;
  accreditation?: AccreditationSubmission;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: string[];
  reviewHistory: Array<{
    action: string;
    by: string;
    reason?: string;
    timestamp: string;
  }>;
  submittedAt?: string;
  reviewedAt?: string;
  approvedAt?: string;
  rejectionReason?: string;
  expiresAt?: string;
  nextReviewAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleId: string;
  roleType: string;
  status: "active" | "invited" | "suspended";
  lastLogin?: string;
  invitedBy?: string;
  createdAt: string;
}

export interface BroadcastRecord {
  id: string;
  subject: string;
  body: string;
  channels: string[];
  recipientFilter: string;
  recipientCount: number;
  batchSize: number;
  status: string;
  progress: number;
  sentCount: number;
  failedCount: number;
  scheduledAt?: string;
  createdAt: string;
}

export interface SavedPaymentMethod {
  id: string;
  userId: string;
  type: string;
  token: string;
  last4?: string;
  brand?: string;
  isDefault: boolean;
  createdAt: string;
}

export interface DeviceRegistration {
  userId: string;
  token: string;
  platform: string;
  deviceId?: string;
  createdAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  phone?: string;
  country: string;
  role: "owner" | "ceo" | "staff" | "investor";
  kycStatus: "pending" | "in_review" | "approved" | "rejected";
  eligibilityStatus: "eligible" | "restricted" | "pending";
  walletBalance: number;
  totalInvested: number;
  totalReturns: number;
  createdAt: string;
  passwordHash: string;
  refreshToken?: string;
  refreshTokenId?: string;
  dateOfBirth?: string;
  address?: { street: string; city: string; state: string; postalCode: string; country: string };
  status: "active" | "suspended" | "inactive";
  lastActivity: string;
  emailVerified?: boolean;
  emailVerifyToken?: string;
  emailVerifyExpires?: string;
  passwordResetToken?: string;
  passwordResetExpires?: string;
  twoFactorSecret?: string;
  twoFactorEnabled?: boolean;
  twoFactorBackupCodes?: string[];
  failedLoginAttempts?: number;
  lockedUntil?: string;
}

export interface PropertyRecord {
  id: string;
  name: string;
  location: string;
  city: string;
  country: string;
  images: string[];
  pricePerShare: number;
  totalShares: number;
  availableShares: number;
  minInvestment: number;
  targetRaise: number;
  currentRaise: number;
  yield: number;
  capRate: number;
  irr: number;
  occupancy: number;
  propertyType: "residential" | "commercial" | "mixed" | "industrial";
  status: "live" | "coming_soon" | "funded" | "closed";
  riskLevel: "low" | "medium" | "high";
  description: string;
  highlights: string[];
  documents: Array<{ id: string; name: string; type: string; url: string }>;
  distributions: Array<{ id: string; date: string; amount: number; type: string }>;
  priceHistory: Array<{ date: string; price: number; volume: number }>;
  createdAt: string;
  closingDate: string;
}

export interface MarketDataRecord {
  propertyId: string;
  lastPrice: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  bids: Array<{ price: number; shares: number; total: number }>;
  asks: Array<{ price: number; shares: number; total: number }>;
}

export interface HoldingRecord {
  id: string;
  propertyId: string;
  shares: number;
  avgCostBasis: number;
  currentValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  purchaseDate: string;
}

export interface TransactionRecord {
  id: string;
  type: "deposit" | "withdrawal" | "buy" | "sell" | "dividend" | "fee";
  amount: number;
  status: "pending" | "completed" | "failed";
  description: string;
  propertyId?: string;
  propertyName?: string;
  createdAt: string;
  userId?: string;
}

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

export interface OrderRecord {
  id: string;
  propertyId: string;
  userId: string;
  type: "buy" | "sell";
  orderType: "market" | "limit";
  status: "pending" | "open" | "filled" | "partially_filled" | "cancelled";
  shares: number;
  filledShares: number;
  price: number;
  total: number;
  fees: number;
  createdAt: string;
  filledAt?: string;
}

export interface ReferralRecord {
  id: string;
  referrerId: string;
  referrerName: string;
  referrerEmail: string;
  referredEmail: string;
  referredName?: string;
  referredId?: string;
  status: "pending" | "signed_up" | "invested" | "rewarded";
  referralCode: string;
  reward: number;
  rewardPaid: boolean;
  signedUpAt?: string;
  investedAt?: string;
  investmentAmount?: number;
  createdAt: string;
}

export interface PropertySubmissionRecord {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  propertyAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  propertyType: string;
  estimatedValue: number;
  verifiedValue?: number;
  deedNumber: string;
  status: string;
  lienStatus: string;
  debtStatus: string;
  totalDebt: number;
  totalLiens: number;
  images: string[];
  description: string;
  submittedAt: string;
  verifiedAt?: string;
}

export interface LandPartnerDealRecord {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  partnerPhone: string;
  partnerType: string;
  propertyAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  lotSize: number;
  lotSizeUnit: string;
  zoning: string;
  propertyType: string;
  estimatedValue: number;
  appraisedValue?: number;
  cashPaymentPercent: number;
  collateralPercent: number;
  partnerProfitShare: number;
  developerProfitShare: number;
  termMonths: number;
  cashPaymentAmount: number;
  collateralAmount: number;
  status: string;
  submittedAt: string;
  approvedAt?: string;
}

export interface InfluencerRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  platform: string;
  handle: string;
  followers: number;
  tier: string;
  status: string;
  referralCode: string;
  commissionRate: number;
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  contractStartDate: string;
  contractEndDate?: string;
  createdAt: string;
}

export interface InfluencerApplicationRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  platform: string;
  handle: string;
  followers: number;
  profileUrl: string;
  bio: string;
  whyJoin: string;
  source: string;
  status: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface SupportTicketRecord {
  id: string;
  userId: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  messages: Array<{
    id: string;
    senderId: string;
    senderName: string;
    message: string;
    timestamp: string;
    isSupport: boolean;
    status: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface DebtAcquisitionRecord {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  images: string[];
  propertyType: string;
  marketValue: number;
  appraisedValue: number;
  ltvPercent: number;
  financingAmount: number;
  ipxFeePercent: number;
  ipxFeeAmount: number;
  ownerNetProceeds: number;
  mortgageInterestRate: number;
  mortgageTermMonths: number;
  monthlyMortgagePayment: number;
  tokenizationAmount: number;
  pricePerToken: number;
  totalTokens: number;
  availableTokens: number;
  minTokenPurchase: number;
  projectedYield: number;
  projectedIRR: number;
  status: string;
  tokenizationProgress: number;
  listingDate: string;
  tokenizationDeadline: string;
  riskFactors: string[];
}

export interface AlertRuleRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  channels: string[];
  isEnabled: boolean;
  cooldownMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRecord {
  id: string;
  ruleId: string;
  ruleName: string;
  category: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  channels: string[];
  triggeredAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface TitleCompanyRecord {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  licenseNumber: string;
  status: string;
  completedReviews: number;
  averageReviewDays: number;
  createdAt: string;
}

export interface DocumentSubmissionRecord {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  documents: Array<{
    id: string;
    type: string;
    name: string;
    description: string;
    status: string;
    required: boolean;
    fileUri?: string;
    uploadedAt?: string;
    reviewedAt?: string;
    reviewNotes?: string;
  }>;
  status: string;
  assignedTitleCompanyId?: string;
  assignedTitleCompanyName?: string;
  submittedAt?: string;
  completedAt?: string;
  tokenizationApproved: boolean;
  createdAt: string;
}

export interface FractionalShareRecord {
  id: string;
  submissionId: string;
  propertyName: string;
  propertyAddress: string;
  totalShares: number;
  availableShares: number;
  pricePerShare: number;
  minShares: number;
  ownerPercentage: number;
  investorPercentage: number;
  ipxFeePercentage: number;
  status: string;
  createdAt: string;
}

export interface SyncedLenderRecord {
  id: string;
  name: string;
  type: "public" | "private";
  category: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  website: string;
  city: string;
  state: string;
  country: string;
  description: string;
  aum: number;
  source: "sec_edgar" | "google_places" | "opencorporates" | "manual" | "crunchbase";
  sourceUrl: string;
  confidence: number;
  tags: string[];
  status: "new" | "verified" | "contacted" | "invalid" | "duplicate";
  syncedAt: string;
  lastVerifiedAt: string | null;
  emailVerified: boolean;
  syncJobId: string;
}

export interface SyncJobRecord {
  id: string;
  source: string;
  query: string;
  status: "pending" | "running" | "completed" | "failed";
  totalFound: number;
  totalImported: number;
  totalDuplicates: number;
  totalInvalid: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  triggeredBy: string;
}

export interface AutoReinvestConfig {
  userId: string;
  enabled: boolean;
  percentage: number;
  propertyPreferences: string[];
  minAmount: number;
  maxAmount: number;
  riskLevel: "low" | "medium" | "high" | "any";
  reinvestDividends: boolean;
  reinvestReturns: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CopyInvestingProfile {
  id: string;
  userId: string;
  userName: string;
  avatar?: string;
  description: string;
  strategy: string;
  riskLevel: "low" | "medium" | "high";
  totalReturn: number;
  totalReturnPercent: number;
  totalFollowers: number;
  totalInvested: number;
  winRate: number;
  isPublic: boolean;
  createdAt: string;
}

export interface CopyFollowRecord {
  id: string;
  followerId: string;
  profileId: string;
  profileUserId: string;
  allocationAmount: number;
  allocationPercent: number;
  status: "active" | "paused" | "stopped";
  totalCopied: number;
  totalReturn: number;
  createdAt: string;
}

export interface GiftShareRecord {
  id: string;
  senderId: string;
  senderName: string;
  recipientEmail: string;
  recipientName: string;
  recipientId?: string;
  propertyId: string;
  propertyName: string;
  shares: number;
  pricePerShare: number;
  totalValue: number;
  message?: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  claimCode: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
}

export interface SmartInvestingProfile {
  userId: string;
  riskTolerance: "conservative" | "moderate" | "aggressive";
  investmentGoal: "income" | "growth" | "balanced";
  timeHorizon: "short" | "medium" | "long";
  monthlyBudget: number;
  diversificationLevel: "low" | "medium" | "high";
  preferredPropertyTypes: string[];
  preferredRegions: string[];
  autoInvest: boolean;
  rebalanceFrequency: "monthly" | "quarterly" | "annually" | "never";
  createdAt: string;
  updatedAt: string;
}

export interface VipTierRecord {
  userId: string;
  tier: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  points: number;
  totalPointsEarned: number;
  currentBenefits: string[];
  nextTier: string | null;
  pointsToNextTier: number;
  memberSince: string;
  lastTierUpdate: string;
}

export interface EarnPositionRecord {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  amount: number;
  apy: number;
  earnedToDate: number;
  lockPeriodDays: number;
  startDate: string;
  maturityDate: string;
  status: "active" | "matured" | "withdrawn" | "pending";
  autoRenew: boolean;
  createdAt: string;
}

export interface EarnProductRecord {
  id: string;
  name: string;
  description: string;
  apy: number;
  minAmount: number;
  maxAmount: number;
  lockPeriodDays: number;
  category: string;
  status: string;
  totalDeposited: number;
  capacity: number;
}

export interface TaxDocumentRecord {
  id: string;
  userId: string;
  year: number;
  type: "1099-DIV" | "1099-B" | "1099-INT" | "K-1" | "annual_summary";
  status: "available" | "processing" | "not_available";
  generatedAt?: string;
  downloadUrl?: string;
}

export interface TaxInfoRecord {
  userId: string;
  taxId: string;
  taxIdType: "ssn" | "ein" | "itin";
  taxResidency: string;
  filingStatus: "single" | "married_jointly" | "married_separately" | "head_of_household";
  foreignTaxCredit: boolean;
  w9Submitted: boolean;
  w8Submitted: boolean;
  updatedAt: string;
}

export interface AlertSettings {
  ownerPhone: string;
  ownerEmail: string;
  ownerName: string;
  enableSMS: boolean;
  enableWhatsApp: boolean;
  enableEmail: boolean;
  enablePush: boolean;
  escalationTimeMinutes: number;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
}

export interface SyncConfig {
  autoSyncEnabled: boolean;
  syncIntervalHours: number;
  sources: Array<{
    id: string;
    name: string;
    enabled: boolean;
    apiKey: string;
    lastSynced: string | null;
    totalRecords: number;
  }>;
  defaultSearchQueries: string[];
  emailVerificationEnabled: boolean;
  autoDeduplicate: boolean;
  autoImportToDirectory: boolean;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  userId: string;
  details: string;
  timestamp: string;
}
