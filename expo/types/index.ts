/**
 * =============================================================================
 * TYPE DEFINITIONS - types/index.ts
 * =============================================================================
 * 
 * This file contains all TypeScript interfaces and types used throughout
 * the application. Types are organized by domain/feature area.
 * 
 * TABLE OF CONTENTS:
 * ------------------
 * 
 * CORE ENTITIES (Lines ~1-200):
 * - Property - Real estate property listings
 * - PropertyDocument - Property documentation (title, appraisal, etc.)
 * - Distribution - Dividend/rental distributions
 * - PricePoint - Historical price data
 * - Holding - User's property holdings
 * - Order - Buy/sell orders
 * - Transaction - Financial transactions
 * - User - User account information
 * 
 * COMMUNICATION (Lines ~108-156):
 * - ChatMessage - Support chat messages
 * - SupportTicket - Support ticket tracking
 * - Notification - User notifications
 * 
 * MARKET DATA (Lines ~139-156):
 * - MarketData - Real-time market information
 * - OrderBookEntry - Order book data
 * - TimeRange - Chart time ranges
 * 
 * ADMIN TYPES (Lines ~159-374):
 * - AdminUser, AdminPermission - Admin accounts
 * - Member, AdminStats - Member management
 * - BroadcastMessage, BroadcastTemplate - Mass messaging
 * - TeamMember, AdminRole - Team management
 * - FeeConfiguration, FeeTransaction - Fee management
 * 
 * IVXHOLDINGS INVESTMENT MODULE (Lines ~375-526):
 * - PropertySubmission - Property listing submissions
 * - PropertyLien, PropertyDebt - Property encumbrances
 * - IPXFeeConfig, IPXTransaction - IVXHOLDINGS-specific fees
 * - FractionalShare, SharePurchase - Fractional ownership
 * - DocumentScan, DeedVerification - Document verification
 * 
 * MEMBER REGISTRATION (Lines ~549-618):
 * - RegistrationData - Signup form data
 * - EmailVerification, PhoneVerification - Verification flow
 * - KYCDocument, MemberKYCData - KYC process
 * - MemberProfile - Extended user profile
 * 
 * LAND PARTNER DEALS (Lines ~621-742):
 * - LandPartnerDeal - JV/LP land partner agreements
 * - LandPartnerFormData - Deal submission form
 * - DealScenarioResult - Financial modeling
 * 
 * MARKETING & GROWTH (Lines ~745-868):
 * - SocialMediaContent - Social media posts
 * - MarketingCampaign - Marketing campaigns
 * - Referral, ReferralStats - Referral program
 * - TrendingTopic - Social media trends
 * - AIMarketingInsight - AI-generated insights
 * 
 * AI COMP SEARCH (Lines ~871-908):
 * - ComparableProperty - Comparable property data
 * - CompSearchResult - AI valuation results
 * 
 * INFLUENCER TRACKING (Lines ~910-977):
 * - Influencer - Influencer profiles
 * - InfluencerReferral - Influencer referrals
 * - InfluencerStats, InfluencerPerformance - Analytics
 * 
 * USAGE:
 * ------
 * import { Property, User, Transaction } from '@/types';
 * =============================================================================
 */

// =============================================================================
// CORE ENTITIES - Properties, Holdings, Orders, Transactions
// =============================================================================

export interface Property {
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
  propertyType: 'residential' | 'commercial' | 'mixed' | 'industrial';
  status: 'live' | 'coming_soon' | 'funded' | 'closed';
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
  highlights: string[];
  documents: PropertyDocument[];
  distributions: Distribution[];
  priceHistory: PricePoint[];
  createdAt: string;
  closingDate: string;
}

export interface PropertyDocument {
  id: string;
  name: string;
  type: 'title' | 'appraisal' | 'insurance' | 'inspection' | 'legal';
  url: string;
}

export interface Distribution {
  id: string;
  date: string;
  amount: number;
  type: 'dividend' | 'rental';
}

export interface PricePoint {
  date: string;
  price: number;
  volume: number;
}

export interface Holding {
  id: string;
  propertyId: string;
  property: Property;
  shares: number;
  avgCostBasis: number;
  currentValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  purchaseDate: string;
}

export interface Order {
  id: string;
  propertyId: string;
  property: Property;
  type: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  status: 'pending' | 'open' | 'filled' | 'partially_filled' | 'cancelled';
  shares: number;
  filledShares: number;
  price: number;
  total: number;
  fees: number;
  createdAt: string;
  filledAt?: string;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'buy' | 'sell' | 'dividend' | 'fee';
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  description: string;
  propertyId?: string;
  propertyName?: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  phone?: string;
  country: string;
  kycStatus: 'pending' | 'in_review' | 'approved' | 'rejected';
  eligibilityStatus: 'eligible' | 'restricted' | 'pending';
  walletBalance: number;
  totalInvested: number;
  totalReturns: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  message: string;
  timestamp: string;
  isSupport: boolean;
  status: 'sent' | 'delivered' | 'read';
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: 'kyc' | 'wallet' | 'trading' | 'general' | 'technical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  type: 'kyc' | 'transaction' | 'dividend' | 'order' | 'system';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

export interface MarketData {
  propertyId: string;
  lastPrice: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export interface OrderBookEntry {
  price: number;
  shares: number;
  total: number;
}

export type TimeRange = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

export interface AdminUser extends User {
  role: 'admin' | 'super_admin';
  permissions: AdminPermission[];
}

export type AdminPermission = 
  | 'manage_members'
  | 'manage_transactions'
  | 'manage_properties'
  | 'manage_kyc'
  | 'manage_support'
  | 'view_analytics';

export interface Member extends User {
  holdings: number;
  totalTransactions: number;
  lastActivity: string;
  status: 'active' | 'suspended' | 'inactive';
}

export interface AdminStats {
  totalMembers: number;
  activeMembers: number;
  pendingKyc: number;
  totalTransactions: number;
  totalVolume: number;
  totalProperties: number;
  liveProperties: number;
  totalInvested: number;
}

export interface AdminTransaction extends Transaction {
  userId: string;
  userName: string;
  userEmail: string;
}

export interface PropertyFormData {
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
  yield: number;
  capRate: number;
  irr: number;
  occupancy: number;
  propertyType: 'residential' | 'commercial' | 'mixed' | 'industrial';
  status: 'live' | 'coming_soon' | 'funded' | 'closed';
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
  highlights: string[];
  closingDate: string;
}

export interface MemberActivity {
  id: string;
  memberId: string;
  memberName: string;
  type: 'login' | 'view_property' | 'investment' | 'withdrawal' | 'kyc_update' | 'profile_update' | 'support_ticket' | 'system';
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface EngagementMessage {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  subject: string;
  message: string;
  type: 'reengagement' | 'promotion' | 'update' | 'reminder';
  status: 'draft' | 'sent' | 'delivered' | 'opened' | 'failed';
  aiGenerated: boolean;
  sentAt?: string;
  createdAt: string;
}

export interface MemberEngagementStats {
  memberId: string;
  memberName: string;
  memberEmail: string;
  memberAvatar?: string;
  lastActivityDate: string;
  daysSinceLastActivity: number;
  totalInvested: number;
  engagementScore: number;
  riskLevel: 'active' | 'at_risk' | 'inactive' | 'churned';
  suggestedAction?: string;
}

export type BroadcastChannel = 'email' | 'sms' | 'push';
export type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'paused';
export type RecipientFilter = 'all' | 'active' | 'inactive' | 'kyc_pending' | 'high_value' | 'custom';

export interface BroadcastRecipient {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  selected: boolean;
}

export interface BroadcastMessage {
  id: string;
  subject: string;
  body: string;
  channels: BroadcastChannel[];
  recipientFilter: RecipientFilter;
  recipientCount: number;
  batchSize: number;
  status: BroadcastStatus;
  progress: number;
  sentCount: number;
  failedCount: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface BroadcastTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: 'welcome' | 'reengagement' | 'promotion' | 'update' | 'reminder' | 'custom';
}

export interface BroadcastStats {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalOpened: number;
  deliveryRate: number;
  openRate: number;
}

export type AdminRoleType = 'ceo' | 'manager' | 'analyst' | 'support' | 'viewer';

export interface AdminRole {
  id: string;
  name: string;
  type: AdminRoleType;
  description: string;
  permissions: AdminPermission[];
  isSystemRole: boolean;
}

export interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  phone?: string;
  roleId: string;
  role: AdminRole;
  status: 'active' | 'invited' | 'suspended';
  lastLogin?: string;
  invitedBy?: string;
  invitedAt?: string;
  createdAt: string;
}

export type FeeType = 'buy' | 'sell' | 'withdrawal' | 'deposit';

export interface FeeConfiguration {
  id: string;
  type: FeeType;
  name: string;
  percentage: number;
  minFee: number;
  maxFee: number;
  isActive: boolean;
  updatedAt: string;
}

export interface FeeTransaction {
  id: string;
  transactionId: string;
  transactionType: FeeType;
  userId: string;
  userName: string;
  userEmail: string;
  transactionAmount: number;
  feePercentage: number;
  feeAmount: number;
  propertyId?: string;
  propertyName?: string;
  status: 'collected' | 'pending' | 'waived';
  createdAt: string;
}

export interface FeeStats {
  totalFeesCollected: number;
  feesThisMonth: number;
  feesLastMonth: number;
  feeGrowthPercent: number;
  totalTransactionsWithFees: number;
  averageFeeAmount: number;
  feesByType: {
    buy: number;
    sell: number;
    withdrawal: number;
    deposit: number;
  };
}

// IVX HOLDINGS LLC Investment Module Types
export type PropertySubmissionStatus = 'pending' | 'verification' | 'lien_check' | 'debt_review' | 'approved' | 'rejected' | 'listed';
export type LienStatus = 'clear' | 'has_liens' | 'pending_resolution';
export type DebtStatus = 'none' | 'active' | 'in_payment' | 'cleared';

export interface PropertySubmission {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  propertyAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  propertyType: 'residential' | 'commercial' | 'mixed' | 'industrial' | 'land';
  estimatedValue: number;
  verifiedValue?: number;
  listingValue?: number;
  deedNumber: string;
  deedDocument?: string;
  status: PropertySubmissionStatus;
  lienStatus: LienStatus;
  debtStatus: DebtStatus;
  totalDebt: number;
  totalLiens: number;
  liens: PropertyLien[];
  debts: PropertyDebt[];
  verificationNotes?: string;
  images: string[];
  description: string;
  submittedAt: string;
  verifiedAt?: string;
  listedAt?: string;
}

export interface PropertyLien {
  id: string;
  type: 'tax' | 'mortgage' | 'judgment' | 'mechanic' | 'hoa' | 'other';
  holder: string;
  amount: number;
  filedDate: string;
  status: 'active' | 'paid' | 'disputed';
}

export interface PropertyDebt {
  id: string;
  type: 'mortgage' | 'tax' | 'utility' | 'hoa' | 'contractor' | 'other';
  creditor: string;
  originalAmount: number;
  remainingAmount: number;
  monthlyPayment?: number;
  status: 'current' | 'delinquent' | 'in_collection' | 'paid';
  dueDate?: string;
}

export interface IPXFeeConfig {
  id: string;
  name: string;
  description: string;
  feeType: 'transaction' | 'listing' | 'management' | 'performance' | 'verification';
  percentage: number;
  minFee: number;
  maxFee: number;
  isActive: boolean;
  appliesTo: ('buy' | 'sell' | 'dividend' | 'listing' | 'verification')[];
  updatedAt: string;
}

export interface IPXTransaction {
  id: string;
  propertySubmissionId?: string;
  propertyId?: string;
  propertyName: string;
  userId: string;
  userName: string;
  transactionType: 'buy' | 'sell' | 'dividend' | 'listing' | 'verification' | 'debt_payment';
  grossAmount: number;
  ipxFeePercent: number;
  ipxFeeAmount: number;
  netAmount: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface IPXProfitStats {
  totalProfit: number;
  profitThisMonth: number;
  profitLastMonth: number;
  growthPercent: number;
  totalTransactions: number;
  profitByType: {
    transaction: number;
    listing: number;
    management: number;
    performance: number;
    verification: number;
  };
}

export interface FractionalShare {
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
  demandMultiplier: number;
  basePrice: number;
  currentPrice: number;
  totalRaised: number;
  targetRaise: number;
  status: 'open' | 'closed' | 'fully_funded';
  createdAt: string;
}

export interface SharePurchase {
  id: string;
  fractionalShareId: string;
  userId: string;
  userName: string;
  shares: number;
  pricePerShare: number;
  totalAmount: number;
  ipxFee: number;
  netToProperty: number;
  purchasedAt: string;
}

export type DocumentVerificationStatus = 'not_uploaded' | 'scanning' | 'verifying' | 'verified' | 'failed' | 'suspicious';

export interface DocumentScan {
  uri: string;
  uploadedAt: string;
  status: DocumentVerificationStatus;
  verificationResult?: DocumentVerificationResult;
}

export interface DocumentVerificationResult {
  isAuthentic: boolean;
  confidence: number;
  documentType: string;
  extractedData: Record<string, string>;
  issues: string[];
  recommendations: string[];
}

export interface DeedVerification {
  scan: DocumentScan | null;
  deedNumber: string;
  propertyAddress: string;
  ownerName: string;
  issuingAuthority: string;
  issueDate: string;
  isAuthentic: boolean;
  matchesSubmission: boolean;
}

export interface IDVerification {
  scan: DocumentScan | null;
  documentType: 'drivers_license' | 'passport' | 'national_id' | 'other';
  fullName: string;
  documentNumber: string;
  expirationDate: string;
  isExpired: boolean;
  isAuthentic: boolean;
}

// Member Registration & Verification Types
export interface RegistrationData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  acceptTerms: boolean;
}

export interface EmailVerification {
  email: string;
  code: string;
  verified: boolean;
  sentAt: string;
  expiresAt: string;
}

export interface PhoneVerification {
  phone: string;
  code: string;
  verified: boolean;
  sentAt: string;
  expiresAt: string;
}

export interface KYCDocument {
  id: string;
  type: 'government_id' | 'passport' | 'drivers_license' | 'proof_of_address' | 'selfie';
  status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  uploadedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
  documentUri?: string;
}

export interface MemberKYCData {
  userId: string;
  documents: KYCDocument[];
  personalInfo: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    ssn?: string;
  };
  status: 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected';
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export interface MemberProfile extends User {
  emailVerified: boolean;
  phoneVerified: boolean;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  ssn?: string;
  kycData?: MemberKYCData;
}

// JV/LP Land Partner Types
export type PartnerType = 'jv' | 'lp' | 'hybrid';
export type LandPartnerStatus = 'draft' | 'submitted' | 'valuation' | 'review' | 'approved' | 'active' | 'completed' | 'rejected';
export type PaymentStructure = 'immediate' | 'deferred' | 'milestone' | 'exit_balloon';
export type AccreditedInvestorStatus = 'not_required';

export interface LandPartnerDeal {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  partnerPhone: string;
  partnerType: PartnerType;
  
  // Property Details
  propertyAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  lotSize: number;
  lotSizeUnit: 'sqft' | 'acres';
  zoning: string;
  propertyType: 'residential' | 'commercial' | 'mixed' | 'industrial' | 'land';
  
  // Valuation
  estimatedValue: number;
  appraisedValue?: number;
  
  // Deal Economics (Fixed Terms)
  cashPaymentPercent: number; // 60%
  collateralPercent: number; // 40%
  partnerProfitShare: number; // 30%
  developerProfitShare: number; // 70%
  termMonths: number; // 30 months
  
  // Calculated Values
  cashPaymentAmount: number;
  collateralAmount: number;
  
  // Documents
  deedDocument?: DocumentScan;
  idDocument?: DocumentScan;
  titleClearance?: boolean;
  
  // Status
  status: LandPartnerStatus;
  controlDisclosureAccepted: boolean;
  controlDisclosureAcceptedAt?: string;
  
  // Timestamps
  submittedAt: string;
  valuationCompletedAt?: string;
  approvedAt?: string;
  activatedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  
  // Notes
  internalNotes?: string;
  rejectionReason?: string;
}

export interface LandPartnerCalculation {
  appraisedLandValue: number;
  cashPayment: number;
  collateralValue: number;
  estimatedProjectCost: number;
  estimatedSaleValue: number;
  estimatedNetProfit: number;
  partnerProfit: number;
  developerProfit: number;
  totalPartnerReturn: number;
}

export interface LandPartnerFormData {
  partnerType: PartnerType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  propertyAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  lotSize: string;
  lotSizeUnit: 'sqft' | 'acres';
  zoning: string;
  propertyType: 'residential' | 'commercial' | 'mixed' | 'industrial' | 'land';
  estimatedValue: string;
  description: string;
  deedDocument?: DocumentScan;
  idDocument?: DocumentScan;
  controlDisclosureAccepted: boolean;
  // New fields for enhanced module
  paymentStructure: PaymentStructure;
  // LP-specific fields
  isAccreditedInvestor?: boolean;
  annualIncome?: string;
  netWorth?: string;
  investmentExperience?: 'none' | 'limited' | 'moderate' | 'extensive';
  // Hybrid-specific fields
  hybridCashPercent?: number; // Defaults to 60%
  hybridEquityPercent?: number; // Defaults to 40%
}

export interface ScenarioModelingData {
  salePriceVariance: number; // -20% to +20%
  timelineVariance: number; // -6 to +12 months
  costOverrunPercent: number; // 0% to 30%
}

export interface DealScenarioResult {
  scenario: 'optimistic' | 'base' | 'pessimistic';
  salePrice: number;
  projectCost: number;
  netProfit: number;
  partnerProfit: number;
  totalReturn: number;
  roi: number;
}

// AI Marketing & Growth Types
export type SocialPlatform = 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'google' | 'tiktok';
export type ContentType = 'post' | 'story' | 'ad' | 'reel' | 'article';
export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';
export type ReferralStatus = 'pending' | 'signed_up' | 'invested' | 'rewarded';

export interface SocialMediaContent {
  id: string;
  platform: SocialPlatform;
  contentType: ContentType;
  title: string;
  content: string;
  hashtags: string[];
  imagePrompt?: string;
  generatedImageUrl?: string;
  targetAudience: string;
  aiGenerated: boolean;
  status: 'draft' | 'approved' | 'posted';
  scheduledAt?: string;
  postedAt?: string;
  engagement?: {
    likes: number;
    shares: number;
    comments: number;
    clicks: number;
    impressions: number;
  };
  createdAt: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  description: string;
  platforms: SocialPlatform[];
  status: CampaignStatus;
  budget: number;
  spent: number;
  startDate: string;
  endDate: string;
  targetAudience: {
    locations: string[];
    interests: string[];
    ageRange: { min: number; max: number };
    investmentLevel: 'beginner' | 'intermediate' | 'advanced' | 'all';
  };
  contents: SocialMediaContent[];
  metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    costPerClick: number;
    costPerConversion: number;
    roi: number;
  };
  aiInsights: string[];
  createdAt: string;
}

export interface Referral {
  id: string;
  referrerId: string;
  referrerName: string;
  referrerEmail: string;
  referredEmail: string;
  referredName?: string;
  referredId?: string;
  status: ReferralStatus;
  referralCode: string;
  reward: number;
  rewardPaid: boolean;
  signedUpAt?: string;
  investedAt?: string;
  investmentAmount?: number;
  createdAt: string;
}

export interface ReferralStats {
  totalReferrals: number;
  pendingReferrals: number;
  signedUpReferrals: number;
  investedReferrals: number;
  totalRewardsPaid: number;
  totalInvestmentFromReferrals: number;
  topReferrers: {
    id: string;
    name: string;
    email: string;
    referralCount: number;
    investmentGenerated: number;
  }[];
}

export interface TrendingTopic {
  id: string;
  topic: string;
  platform: SocialPlatform;
  relevanceScore: number;
  volume: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  suggestedContent: string;
  discoveredAt: string;
}

export interface AIMarketingInsight {
  id: string;
  type: 'opportunity' | 'trend' | 'recommendation' | 'alert';
  title: string;
  description: string;
  platform?: SocialPlatform;
  actionItems: string[];
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface GrowthStats {
  totalUsers: number;
  newUsersThisMonth: number;
  userGrowthPercent: number;
  totalReferrals: number;
  referralConversionRate: number;
  socialReach: number;
  engagementRate: number;
  topPerformingPlatform: SocialPlatform;
  topPerformingContent: SocialMediaContent | null;
}

// AI Comp Search Types
export interface ComparableProperty {
  address: string;
  city: string;
  state: string;
  distance: number;
  lotSize: number;
  lotSizeUnit: 'sqft' | 'acres';
  salePrice: number;
  pricePerSqft: number;
  saleDate: string;
  propertyType: string;
  zoning: string;
  daysOnMarket: number;
  source: string;
}

export interface CompSearchResult {
  subjectProperty: {
    address: string;
    city: string;
    state: string;
    lotSize: number;
    lotSizeUnit: 'sqft' | 'acres';
  };
  comparables: ComparableProperty[];
  marketAnalysis: {
    averagePrice: number;
    medianPrice: number;
    priceRange: { low: number; high: number };
    averagePricePerSqft: number;
    marketTrend: 'rising' | 'stable' | 'declining';
    confidenceScore: number;
    recommendedValue: number;
  };
  insights: string[];
  generatedAt: string;
}

// Influencer Tracking Types
export type InfluencerStatus = 'active' | 'paused' | 'pending' | 'terminated';
export type InfluencerTier = 'micro' | 'mid' | 'macro' | 'mega';

export interface Influencer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  platform: SocialPlatform;
  handle: string;
  followers: number;
  tier: InfluencerTier;
  status: InfluencerStatus;
  referralCode: string;
  qrCodeUrl?: string;
  commissionRate: number;
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  contractStartDate: string;
  contractEndDate?: string;
  notes?: string;
  createdAt: string;
}

export interface InfluencerReferral {
  id: string;
  influencerId: string;
  influencerName: string;
  referralCode: string;
  referredEmail: string;
  referredName?: string;
  referredId?: string;
  status: ReferralStatus;
  signedUpAt?: string;
  investedAt?: string;
  investmentAmount?: number;
  commission: number;
  commissionPaid: boolean;
  createdAt: string;
}

export interface InfluencerStats {
  totalInfluencers: number;
  activeInfluencers: number;
  totalReferrals: number;
  totalSignups: number;
  totalInvestments: number;
  totalInvestmentAmount: number;
  totalCommissionsPaid: number;
  pendingCommissions: number;
  averageConversionRate: number;
  topPerformers: Influencer[];
}

export interface InfluencerPerformance {
  influencerId: string;
  period: string;
  clicks: number;
  signups: number;
  investments: number;
  investmentAmount: number;
  commission: number;
  conversionRate: number;
}

export type InfluencerApplicationStatus = 'pending' | 'approved' | 'rejected';
export type InfluencerApplicationSource = 'app_search' | 'referral' | 'social_media' | 'website';

export interface InfluencerApplication {
  id: string;
  name: string;
  email: string;
  phone?: string;
  platform: SocialPlatform;
  handle: string;
  followers: number;
  profileUrl: string;
  bio: string;
  whyJoin: string;
  source: InfluencerApplicationSource;
  referredBy?: string;
  referralCode?: string;
  status: InfluencerApplicationStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

// =============================================================================
// PAYMENT PROCESSING TYPES
// =============================================================================

export type PaymentMethodType = 'fednow' | 'rtp' | 'same_day_ach' | 'bank_transfer' | 'usdc' | 'apple_pay' | 'google_pay' | 'card' | 'wire' | 'paypal';

export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'requires_action'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface PaymentMethodConfig {
  id: string;
  type: PaymentMethodType;
  name: string;
  description: string;
  icon: string;
  fee: number;
  feeType: 'percentage' | 'fixed';
  processingTime: string;
  minAmount: number;
  maxAmount: number;
  isEnabled: boolean;
  requiresVerification: boolean;
}

export interface PaymentTransaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  fee: number;
  netAmount: number;
  currency: string;
  paymentMethod: PaymentMethodType;
  status: PaymentStatus;
  processingTime: string;
  bankInstructions?: BankTransferInstructions;
  receipt?: PaymentReceipt;
  createdAt: string;
  completedAt?: string;
  failedAt?: string;
  failureReason?: string;
}

export interface BankTransferInstructions {
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
  swiftCode?: string;
  reference: string;
  instructions: string[];
}

export interface PaymentReceipt {
  id: string;
  transactionId: string;
  amount: number;
  fee: number;
  netAmount: number;
  currency: string;
  timestamp: string;
  description: string;
  downloadUrl?: string;
}

export interface SavedPaymentMethod {
  id: string;
  userId: string;
  type: PaymentMethodType;
  last4?: string;
  brand?: string;
  bankName?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  isVerified: boolean;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  fee: number;
  netAmount: number;
  paymentMethodId: string;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected';
  requestedAt: string;
  processedAt?: string;
  rejectionReason?: string;
}

export interface PaymentWebhookEvent {
  id: string;
  type: 'payment.succeeded' | 'payment.failed' | 'refund.created' | 'payout.paid';
  data: Record<string, unknown>;
  createdAt: string;
}

// =============================================================================
// TRACKABLE LINKS & ANALYTICS
// =============================================================================

export type TrackableLinkStatus = 'active' | 'paused' | 'expired';
export type LinkEventType = 'click' | 'download' | 'registration' | 'investment';

export interface TrackableLink {
  id: string;
  name: string;
  shortCode: string;
  fullUrl: string;
  qrCodeUrl: string;
  campaignId?: string;
  campaignName?: string;
  source: 'social' | 'email' | 'influencer' | 'ad' | 'direct' | 'referral';
  platform?: SocialPlatform;
  status: TrackableLinkStatus;
  expiresAt?: string;
  createdAt: string;
  stats: LinkStats;
}

export interface LinkStats {
  totalClicks: number;
  uniqueClicks: number;
  downloads: number;
  registrations: number;
  investments: number;
  investmentAmount: number;
  conversionRate: number;
  clickThroughRate: number;
}

export interface LinkEvent {
  id: string;
  linkId: string;
  linkName: string;
  eventType: LinkEventType;
  userId?: string;
  userName?: string;
  userEmail?: string;
  ipAddress?: string;
  country?: string;
  city?: string;
  device: 'ios' | 'android' | 'web' | 'unknown';
  browser?: string;
  referrer?: string;
  investmentAmount?: number;
  timestamp: string;
}

export interface LinkAnalytics {
  totalLinks: number;
  activeLinks: number;
  totalClicks: number;
  totalDownloads: number;
  totalRegistrations: number;
  totalInvestments: number;
  totalInvestmentAmount: number;
  avgConversionRate: number;
  topPerformingLinks: TrackableLink[];
  recentEvents: LinkEvent[];
  clicksByPlatform: Record<string, number>;
  clicksByDevice: Record<string, number>;
  clicksByCountry: Record<string, number>;
}

// =============================================================================
// SMART MONITORING & ALERT SYSTEM
// =============================================================================

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertCategory = 
  | 'security'
  | 'transaction'
  | 'kyc'
  | 'system'
  | 'fraud'
  | 'compliance'
  | 'user_activity'
  | 'financial';

export type AlertChannel = 'sms' | 'whatsapp' | 'email' | 'push' | 'in_app';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'escalated';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  category: AlertCategory;
  severity: AlertSeverity;
  condition: AlertCondition;
  channels: AlertChannel[];
  isEnabled: boolean;
  cooldownMinutes: number;
  recipients: AlertRecipient[];
  createdAt: string;
  updatedAt: string;
}

export interface AlertCondition {
  type: 'threshold' | 'anomaly' | 'pattern' | 'event';
  metric?: string;
  operator?: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value?: number;
  timeWindowMinutes?: number;
  pattern?: string;
  eventType?: string;
}

export interface AlertRecipient {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  channels: AlertChannel[];
  isOwner: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  details: Record<string, unknown>;
  status: AlertStatus;
  channels: AlertChannel[];
  sentTo: string[];
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  escalatedAt?: string;
}

export interface AlertSettings {
  ownerPhone: string;
  ownerEmail: string;
  ownerName: string;
  enableSMS: boolean;
  enableWhatsApp: boolean;
  enableEmail: boolean;
  enablePush: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  escalationTimeMinutes: number;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
}

export interface AlertStats {
  totalAlerts: number;
  activeAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
  resolvedToday: number;
  avgResolutionTimeMinutes: number;
  alertsByCategory: Record<AlertCategory, number>;
  alertsBySeverity: Record<AlertSeverity, number>;
  alertTrend: { date: string; count: number }[];
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  lastChecked: string;
  services: {
    name: string;
    status: 'up' | 'down' | 'slow';
    responseTime: number;
    lastError?: string;
  }[];
  metrics: {
    activeUsers: number;
    transactionsPerHour: number;
    errorRate: number;
    avgResponseTime: number;
  };
}

// =============================================================================
// TOKENIZED MORTGAGE & FIRST LIEN STRATEGY TYPES
// Clean Property Model: Owner brings debt-free property → IVXHOLDINGS finances 85% LTV
// → First lien mortgage recorded → Mortgage tokenized → 24/7 investor access
// =============================================================================

export type DebtAcquisitionStatus = 'available' | 'tokenizing' | 'funded' | 'first_lien_secured';
export type LienPositionType = 'first' | 'second' | 'third';

export interface DebtAcquisitionProperty {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  images: string[];
  propertyType: 'residential' | 'commercial' | 'mixed' | 'industrial';

  // Property Valuation
  marketValue: number;
  appraisedValue: number;

  // IVXHOLDINGS Tokenized Mortgage (Clean Property Model)
  ltvPercent: number; // 85% of appraised value
  financingAmount: number; // 85% of appraisedValue
  closingCostPercent: number; // Closing costs %
  closingCostAmount: number;
  ipxFeePercent: number; // IVXHOLDINGS origination/service fee %
  ipxFeeAmount: number;
  ownerNetProceeds: number; // What the owner actually receives
  mortgageInterestRate: number; // Interest rate on tokenized mortgage
  mortgageTermMonths: number; // Mortgage term
  monthlyMortgagePayment: number;

  // Tokenization
  tokenizationAmount: number; // = financingAmount (entire mortgage is tokenized)
  pricePerToken: number;
  totalTokens: number;
  availableTokens: number;
  minTokenPurchase: number;

  // IVXHOLDINGS First Lien Position
  ipxLienPosition: LienPositionType;
  ipxFirstLienSecured: boolean;

  // Returns & Economics
  projectedYield: number;
  projectedIRR: number;
  debtServiceCoverageRatio: number;
  loanToValue: number;

  // Status
  status: DebtAcquisitionStatus;
  tokenizationProgress: number; // 0-100

  // Timeline
  listingDate: string;
  tokenizationDeadline: string;

  // Legal
  legalDisclosure: string;
  riskFactors: string[];
}

export interface DebtTokenPurchase {
  id: string;
  propertyId: string;
  propertyName: string;
  userId: string;
  userName: string;
  tokens: number;
  pricePerToken: number;
  totalAmount: number;
  ipxFee: number;
  netInvestment: number;
  lienPosition: LienPositionType;
  expectedYield: number;
  purchasedAt: string;
}

export interface FirstLienInvestment {
  id: string;
  propertyId: string;
  propertyName: string;
  investorId: string;
  investorName: string;
  tokensOwned: number;
  investmentAmount: number;
  currentValue: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  lienPosition: LienPositionType;
  dividendsEarned: number;
  nextDividendDate: string;
  status: 'active' | 'matured' | 'liquidated';
  acquiredAt: string;
}

export interface DebtAcquisitionStats {
  totalPropertiesListed: number;
  totalDebtAcquired: number;
  totalTokenized: number;
  firstLiensSecured: number;
  totalInvestorReturns: number;
  averageYield: number;
  averageLTV: number;
}

// =============================================================================
// TITLE COMPANY & DOCUMENT PORTAL TYPES
// Property owner uploads required docs → Admin assigns title company → Title co reviews
// =============================================================================

export type TitleDocumentType =
  | 'title_insurance'
  | 'alta_settlement'
  | 'warranty_deed'
  | 'closing_protection_letter'
  | 'property_tax_info'
  | 'affidavits'
  | 'wire_instructions'
  | 'survey';

export type TitleDocumentStatus = 'not_uploaded' | 'uploaded' | 'under_review' | 'approved' | 'rejected';

export interface TitleDocument {
  id: string;
  propertyId: string;
  type: TitleDocumentType;
  name: string;
  description: string;
  fileName?: string;
  fileUri?: string;
  status: TitleDocumentStatus;
  uploadedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  rejectionReason?: string;
  required: boolean;
}

export type TitleCompanyStatus = 'active' | 'inactive' | 'pending_verification';

export interface TitleCompany {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  licenseNumber: string;
  status: TitleCompanyStatus;
  assignedProperties: string[];
  completedReviews: number;
  averageReviewDays: number;
  createdAt: string;
}

export interface TitleCompanyAssignment {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  titleCompanyId: string;
  titleCompanyName: string;
  assignedAt: string;
  assignedBy: string;
  status: 'assigned' | 'in_review' | 'completed' | 'revoked';
  completedAt?: string;
  notes?: string;
}

export type PropertyDocumentPortalStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'needs_revision';

// =============================================================================
// LENDER DIRECTORY & AI OUTREACH TYPES
// =============================================================================

export type LenderType = 'public' | 'private';
export type LenderCategory = 'bank' | 'credit_union' | 'hedge_fund' | 'private_equity' | 'family_office' | 'reit' | 'pension_fund' | 'insurance' | 'individual' | 'crowdfunding';
export type LenderStatus = 'active' | 'inactive' | 'prospect' | 'contacted' | 'interested' | 'committed';

export interface Lender {
  id: string;
  name: string;
  type: LenderType;
  category: LenderCategory;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  website?: string;
  address: string;
  city: string;
  state: string;
  country: string;
  logo?: string;
  description: string;
  aum: number;
  minInvestment: number;
  maxInvestment: number;
  preferredPropertyTypes: ('residential' | 'commercial' | 'mixed' | 'industrial')[];
  preferredRegions: string[];
  interestRate?: number;
  ltvRange?: { min: number; max: number };
  status: LenderStatus;
  lastContactedAt?: string;
  totalInvested: number;
  propertiesInvested: number;
  rating: number;
  notes?: string;
  tags: string[];
  createdAt: string;
}

export type OutreachStatus = 'draft' | 'scheduled' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed';
export type OutreachType = 'invitation' | 'follow_up' | 'property_alert' | 'newsletter' | 'partnership';

export interface LenderOutreach {
  id: string;
  lenderId: string;
  lenderName: string;
  lenderEmail: string;
  propertyId?: string;
  propertyName?: string;
  type: OutreachType;
  subject: string;
  body: string;
  aiGenerated: boolean;
  status: OutreachStatus;
  sentAt?: string;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  scheduledAt?: string;
  createdAt: string;
}

export interface OutreachCampaign {
  id: string;
  name: string;
  propertyId: string;
  propertyName: string;
  type: OutreachType;
  subject: string;
  body: string;
  aiGenerated: boolean;
  lenderIds: string[];
  totalRecipients: number;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  status: 'draft' | 'sending' | 'completed' | 'paused';
  createdAt: string;
  completedAt?: string;
}

export interface LenderStats {
  totalLenders: number;
  publicLenders: number;
  privateLenders: number;
  activeLenders: number;
  totalAUM: number;
  totalInvested: number;
  outreachSent: number;
  outreachOpenRate: number;
  outreachReplyRate: number;
  topCategories: { category: LenderCategory; count: number }[];
}

export interface PropertyDocumentSubmission {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  documents: TitleDocument[];
  status: PropertyDocumentPortalStatus;
  assignedTitleCompanyId?: string;
  assignedTitleCompanyName?: string;
  submittedAt?: string;
  reviewStartedAt?: string;
  completedAt?: string;
  overallNotes?: string;
  tokenizationApproved: boolean;
  createdAt: string;
}
