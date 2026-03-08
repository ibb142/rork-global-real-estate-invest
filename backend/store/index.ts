import { dynamoDB } from '../db/dynamo';
import {
  SEED_PROPERTIES,
  SEED_USERS,
  SEED_WALLET_BALANCES,
  SEED_TEAM_MEMBERS,
  SEED_HOLDINGS,
  SEED_TRANSACTIONS,
  SEED_NOTIFICATIONS,
  SEED_REFERRALS,
  SEED_SUPPORT_TICKETS,
  SEED_PROPERTY_SUBMISSIONS,
  SEED_BROADCASTS,
  SEED_MARKET_DATA,
  SEED_VIP_TIERS,
  SEED_EARN_PRODUCTS,
  SEED_ALERT_SETTINGS,
  SEED_SYNC_CONFIG,
} from '../db/seed';

import type {
  UserRecord,
  PropertyRecord,
  TransactionRecord,
  NotificationRecord,
  OrderRecord,
  HoldingRecord,
  MarketDataRecord,
  BankAccount,
  KYCSubmission,
  TeamMemberRecord,
  BroadcastRecord,
  SavedPaymentMethod,
  DeviceRegistration,
  ReferralRecord,
  PropertySubmissionRecord,
  LandPartnerDealRecord,
  InfluencerRecord,
  InfluencerApplicationRecord,
  SupportTicketRecord,
  DebtAcquisitionRecord,
  AlertRuleRecord,
  AlertRecord,
  TitleCompanyRecord,
  DocumentSubmissionRecord,
  FractionalShareRecord,
  SyncedLenderRecord,
  SyncJobRecord,
  AutoReinvestConfig,
  CopyInvestingProfile,
  CopyFollowRecord,
  GiftShareRecord,
  SmartInvestingProfile,
  VipTierRecord,
  EarnPositionRecord,
  EarnProductRecord,
  TaxDocumentRecord,
  TaxInfoRecord,
  AlertSettings,
  SyncConfig,
  BrokerApplicationRecord,
  AgentApplicationRecord,
} from '../db/types';

interface LiveSession {
  sessionId: string;
  ip: string;
  device: string;
  os: string;
  browser: string;
  geo?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    lat?: number;
    lng?: number;
    timezone?: string;
  };
  currentStep: number;
  sessionDuration: number;
  activeTime: number;
  lastSeen: string;
  startedAt: string;
}

class Store {
  properties: PropertyRecord[] = [];
  users: Map<string, UserRecord> = new Map();
  holdings: Map<string, HoldingRecord[]> = new Map();
  transactions: Map<string, TransactionRecord[]> = new Map();
  notifications: Map<string, NotificationRecord[]> = new Map();
  notificationSettings: Map<string, Record<string, unknown>> = new Map();
  orders: Map<string, OrderRecord[]> = new Map();
  marketData: Map<string, MarketDataRecord> = new Map();
  bankAccounts: Map<string, BankAccount[]> = new Map();
  kycSubmissions: Map<string, KYCSubmission> = new Map();
  teamMembers: TeamMemberRecord[] = [];
  broadcasts: BroadcastRecord[] = [];
  referrals: ReferralRecord[] = [];
  propertySubmissions: PropertySubmissionRecord[] = [];
  landPartnerDeals: LandPartnerDealRecord[] = [];
  influencers: InfluencerRecord[] = [];
  influencerApplications: InfluencerApplicationRecord[] = [];
  brokerApplications: BrokerApplicationRecord[] = [];
  agentApplications: AgentApplicationRecord[] = [];
  supportTickets: SupportTicketRecord[] = [];
  savedPaymentMethods: Map<string, SavedPaymentMethod[]> = new Map();
  deviceRegistrations: DeviceRegistration[] = [];
  fractionalShares: FractionalShareRecord[] = [];
  titleCompanies: TitleCompanyRecord[] = [];
  documentSubmissions: DocumentSubmissionRecord[] = [];
  alertRules: AlertRuleRecord[] = [];
  alerts: AlertRecord[] = [];
  alertSettings: AlertSettings = SEED_ALERT_SETTINGS;
  debtAcquisitions: DebtAcquisitionRecord[] = [];
  syncedLenders: SyncedLenderRecord[] = [];
  syncJobs: SyncJobRecord[] = [];
  autoReinvestConfigs: Map<string, AutoReinvestConfig> = new Map();
  copyInvestingProfiles: CopyInvestingProfile[] = [];
  copyFollows: CopyFollowRecord[] = [];
  giftShares: GiftShareRecord[] = [];
  smartInvestingProfiles: Map<string, SmartInvestingProfile> = new Map();
  vipTiers: Map<string, VipTierRecord> = new Map();
  earnPositions: EarnPositionRecord[] = [];
  earnProducts: EarnProductRecord[] = [];
  taxDocuments: TaxDocumentRecord[] = [];
  taxInfo: Map<string, TaxInfoRecord> = new Map();
  syncConfig: SyncConfig = SEED_SYNC_CONFIG;
  walletBalances: Map<string, { available: number; pending: number; invested: number }> = new Map();
  waitlistEntries: Array<{ id: string; firstName: string; lastName: string; email: string; phone: string; country: string; investmentInterest: string; source: string; joinedAt: string }> = [];
  auditLog: Array<{ id: string; action: string; userId: string; details: string; timestamp: string }> = [];
  visitorLog: Array<{
    id: string;
    sessionId: string;
    ip: string;
    userAgent: string;
    browser: string;
    browserVersion: string;
    os: string;
    osVersion: string;
    device: 'Mobile' | 'Tablet' | 'Desktop' | 'Bot' | 'Unknown';
    deviceModel: string;
    isBot: boolean;
    referrer: string;
    page: string;
    event: string;
    geo?: {
      city?: string;
      region?: string;
      country?: string;
      countryCode?: string;
      lat?: number;
      lng?: number;
      timezone?: string;
    };
    timestamp: string;
  }> = [];
  analyticsEvents: Array<{
    id: string;
    userId: string;
    event: string;
    category: string;
    properties: Record<string, unknown>;
    sessionId: string;
    timestamp: string;
    geo?: {
      city?: string;
      region?: string;
      country?: string;
      countryCode?: string;
      lat?: number;
      lng?: number;
      timezone?: string;
    };
  }> = [];
  liveSessions: Map<string, LiveSession> = new Map();

  aiLearnings: Array<{
    id: string;
    type: 'pattern' | 'anomaly' | 'prediction' | 'recommendation' | 'trend';
    category: string;
    title: string;
    description: string;
    confidence: number;
    impact: 'critical' | 'high' | 'medium' | 'low';
    dataPoints: number;
    metadata: Record<string, unknown>;
    learnedAt: string;
    expiresAt: string;
    isActive: boolean;
  }> = [];

  aiMemory: {
    totalPatternsLearned: number;
    totalDataPointsProcessed: number;
    lastLearningCycle: string;
    learningCycles: number;
    knownPatterns: Record<string, { count: number; lastSeen: string; confidence: number }>;
    behaviorBaselines: Record<string, { avg: number; min: number; max: number; stdDev: number; samples: number }>;
    predictedTrends: Array<{ metric: string; direction: 'up' | 'down' | 'stable'; confidence: number; predictedAt: string }>;
  } = {
    totalPatternsLearned: 0,
    totalDataPointsProcessed: 0,
    lastLearningCycle: new Date().toISOString(),
    learningCycles: 0,
    knownPatterns: {},
    behaviorBaselines: {},
    predictedTrends: [],
  };

  private initialized = false;

  constructor() {
    this._applySeedData();
    console.log('[Store] In-memory seed applied, awaiting DynamoDB init…');
  }

  async init(): Promise<void> {
    try {
      await dynamoDB.init();
      if (!dynamoDB.isAvailable) {
        console.warn('[Store] DynamoDB unavailable — running with seed data only');
        this.initialized = true;
        return;
      }

      const hasSavedData = await dynamoDB.hasData('users');
      if (hasSavedData) {
        await this._loadFromDynamo();
        console.log('[Store] Loaded from DynamoDB');
      } else {
        await this._persistAll();
        console.log('[Store] Seeded DynamoDB with initial data');
      }
      this.initialized = true;
    } catch (err) {
      console.warn('[Store] Init error (falling back to in-memory mode):', (err as Error)?.message || err);
      this.initialized = true;
    }
  }

  get isReady(): boolean {
    return this.initialized;
  }

  private _applySeedData(): void {
    this.properties = [...SEED_PROPERTIES];
    for (const user of SEED_USERS) this.users.set(user.id, user);
    for (const wb of SEED_WALLET_BALANCES) {
      this.walletBalances.set(wb.userId, { available: wb.available, pending: wb.pending, invested: wb.invested });
    }
    this.teamMembers = [...SEED_TEAM_MEMBERS];
    this.referrals = [...SEED_REFERRALS];
    this.supportTickets = [...SEED_SUPPORT_TICKETS];
    this.propertySubmissions = [...SEED_PROPERTY_SUBMISSIONS];
    this.broadcasts = [...SEED_BROADCASTS];
    this.earnProducts = [...SEED_EARN_PRODUCTS];
    this.alertSettings = { ...SEED_ALERT_SETTINGS };
    this.syncConfig = { ...SEED_SYNC_CONFIG };
    for (const md of SEED_MARKET_DATA) this.marketData.set(md.propertyId, md);
    for (const [userId, tiers] of Object.entries(SEED_VIP_TIERS)) this.vipTiers.set(userId, tiers);
    for (const [userId, txs] of Object.entries(SEED_TRANSACTIONS)) this.transactions.set(userId, [...txs]);
    for (const [userId, holds] of Object.entries(SEED_HOLDINGS)) this.holdings.set(userId, [...holds]);
    for (const [userId, notifs] of Object.entries(SEED_NOTIFICATIONS)) this.notifications.set(userId, [...notifs]);
    console.log(`[Store] Seed applied: ${this.properties.length} properties, ${this.users.size} users (real data mode)`);
  }

  _seedLandingAnalytics(): void {
    console.log('[Store] Real data mode — no fake analytics seeded');
  }

  private async _loadFromDynamo(): Promise<void> {
    const [
      properties, users, mdList, wbList, kycList, arList, spList, vipList, tiList, nsList,
      teamMembers, referrals, broadcasts, propertySubmissions, landPartnerDeals,
      influencers, influencerApplications, supportTickets, fractionalShares,
      titleCompanies, documentSubmissions, alertRules, alerts, debtAcquisitions,
      syncedLenders, syncJobs, copyInvestingProfiles, copyFollows, giftShares,
      earnPositions, earnProds, taxDocuments, deviceRegistrations, analyticsEventsData, waitlistData,
      alertCfg, syncCfg,
      holdingsRows, transactionsRows, notificationsRows, ordersRows, bankAccountsRows, savedPaymentMethodsRows,
    ] = await Promise.all([
      dynamoDB.getAll<PropertyRecord>('properties'),
      dynamoDB.getAll<UserRecord>('users'),
      dynamoDB.getAll<MarketDataRecord>('marketData'),
      dynamoDB.getAll<{ id?: string; userId?: string; available: number; pending: number; invested: number }>('walletBalances'),
      dynamoDB.getAll<KYCSubmission & { id?: string }>('kycSubmissions'),
      dynamoDB.getAll<AutoReinvestConfig & { id?: string }>('autoReinvestConfigs'),
      dynamoDB.getAll<SmartInvestingProfile & { id?: string }>('smartInvestingProfiles'),
      dynamoDB.getAll<VipTierRecord & { id?: string }>('vipTiers'),
      dynamoDB.getAll<TaxInfoRecord & { id?: string }>('taxInfo'),
      dynamoDB.getAll<Record<string, unknown> & { id?: string }>('notificationSettings'),
      dynamoDB.getAll<TeamMemberRecord>('teamMembers'),
      dynamoDB.getAll<ReferralRecord>('referrals'),
      dynamoDB.getAll<BroadcastRecord>('broadcasts'),
      dynamoDB.getAll<PropertySubmissionRecord>('propertySubmissions'),
      dynamoDB.getAll<LandPartnerDealRecord>('landPartnerDeals'),
      dynamoDB.getAll<InfluencerRecord>('influencers'),
      dynamoDB.getAll<InfluencerApplicationRecord>('influencerApplications'),
      dynamoDB.getAll<SupportTicketRecord>('supportTickets'),
      dynamoDB.getAll<FractionalShareRecord>('fractionalShares'),
      dynamoDB.getAll<TitleCompanyRecord>('titleCompanies'),
      dynamoDB.getAll<DocumentSubmissionRecord>('documentSubmissions'),
      dynamoDB.getAll<AlertRuleRecord>('alertRules'),
      dynamoDB.getAll<AlertRecord>('alerts'),
      dynamoDB.getAll<DebtAcquisitionRecord>('debtAcquisitions'),
      dynamoDB.getAll<SyncedLenderRecord>('syncedLenders'),
      dynamoDB.getAll<SyncJobRecord>('syncJobs'),
      dynamoDB.getAll<CopyInvestingProfile>('copyInvestingProfiles'),
      dynamoDB.getAll<CopyFollowRecord>('copyFollows'),
      dynamoDB.getAll<GiftShareRecord>('giftShares'),
      dynamoDB.getAll<EarnPositionRecord>('earnPositions'),
      dynamoDB.getAll<EarnProductRecord>('earnProducts'),
      dynamoDB.getAll<TaxDocumentRecord>('taxDocuments'),
      dynamoDB.getAll<DeviceRegistration>('deviceRegistrations'),
      dynamoDB.getAll<Store['analyticsEvents'][number]>('analyticsEvents'),
      dynamoDB.getAll<Store['waitlistEntries'][number]>('waitlistEntries'),
      dynamoDB.getConfig<AlertSettings>('alertSettings'),
      dynamoDB.getConfig<SyncConfig>('syncConfig'),
      dynamoDB.getAllUserEntities<HoldingRecord>('holdings'),
      dynamoDB.getAllUserEntities<TransactionRecord>('transactions'),
      dynamoDB.getAllUserEntities<NotificationRecord>('notifications'),
      dynamoDB.getAllUserEntities<OrderRecord>('orders'),
      dynamoDB.getAllUserEntities<BankAccount>('bankAccounts'),
      dynamoDB.getAllUserEntities<SavedPaymentMethod>('savedPaymentMethods'),
    ]);

    if (properties.length === 0) return;

    this.properties = properties;
    this.users = new Map(users.map(u => [u.id, u]));

    this.marketData = new Map();
    for (const md of mdList) this.marketData.set(md.propertyId, md);

    this.walletBalances = new Map();
    for (const wb of wbList) {
      const id = (wb as any).id || (wb as any).userId;
      if (id) this.walletBalances.set(id, { available: wb.available, pending: wb.pending, invested: wb.invested });
    }

    this.kycSubmissions = new Map();
    for (const kyc of kycList) {
      const key = (kyc as any).id || kyc.userId;
      if (key) this.kycSubmissions.set(key, kyc);
    }

    this.autoReinvestConfigs = new Map();
    for (const ar of arList) {
      const key = (ar as any).id || ar.userId;
      if (key) this.autoReinvestConfigs.set(key, ar);
    }

    this.smartInvestingProfiles = new Map();
    for (const sp of spList) {
      const key = (sp as any).id || sp.userId;
      if (key) this.smartInvestingProfiles.set(key, sp);
    }

    this.vipTiers = new Map();
    for (const vip of vipList) {
      const key = (vip as any).id || vip.userId;
      if (key) this.vipTiers.set(key, vip);
    }

    this.taxInfo = new Map();
    for (const ti of tiList) {
      const key = (ti as any).id || ti.userId;
      if (key) this.taxInfo.set(key, ti);
    }

    this.notificationSettings = new Map();
    for (const ns of nsList) {
      if ((ns as any).id) this.notificationSettings.set((ns as any).id, ns);
    }

    this.teamMembers = teamMembers;
    this.referrals = referrals;
    this.broadcasts = broadcasts;
    this.propertySubmissions = propertySubmissions;
    this.landPartnerDeals = landPartnerDeals;
    this.influencers = influencers;
    this.influencerApplications = influencerApplications;
    this.supportTickets = supportTickets;
    this.fractionalShares = fractionalShares;
    this.titleCompanies = titleCompanies;
    this.documentSubmissions = documentSubmissions;
    this.alertRules = alertRules;
    this.alerts = alerts;
    this.debtAcquisitions = debtAcquisitions;
    this.syncedLenders = syncedLenders;
    this.syncJobs = syncJobs;
    this.copyInvestingProfiles = copyInvestingProfiles;
    this.copyFollows = copyFollows;
    this.giftShares = giftShares;
    this.earnPositions = earnPositions;
    this.deviceRegistrations = deviceRegistrations;
    this.taxDocuments = taxDocuments;
    if (earnProds.length > 0) this.earnProducts = earnProds;
    if (alertCfg) this.alertSettings = alertCfg;
    if (syncCfg) this.syncConfig = syncCfg;
    if (analyticsEventsData.length > 0) {
      this.analyticsEvents = analyticsEventsData;
      console.log(`[Store] Loaded ${analyticsEventsData.length} real analytics events from DynamoDB`);
    }
    if (waitlistData.length > 0) {
      this.waitlistEntries = waitlistData;
      console.log(`[Store] Loaded ${waitlistData.length} waitlist entries from DynamoDB`);
    }

    const mapUserRows = <T>(rows: Array<{ userId: string; id: string; data: T }>, map: Map<string, T[]>) => {
      map.clear();
      for (const row of rows) {
        const existing = map.get(row.userId) || [];
        existing.push(row.data);
        map.set(row.userId, existing);
      }
    };

    mapUserRows(holdingsRows, this.holdings);
    mapUserRows(transactionsRows, this.transactions);
    mapUserRows(notificationsRows, this.notifications);
    mapUserRows(ordersRows, this.orders);
    mapUserRows(bankAccountsRows, this.bankAccounts);
    mapUserRows(savedPaymentMethodsRows, this.savedPaymentMethods);

    console.log(`[Store] Loaded from DynamoDB: ${this.properties.length} properties, ${this.users.size} users`);
  }

  async persist(): Promise<void> {
    if (!dynamoDB.isAvailable) return;

    try {
      await Promise.all([
        dynamoDB.clearCollection('properties').then(() =>
          dynamoDB.batchPut('properties', this.properties.map(p => ({ id: p.id, data: p })))
        ),
        (async () => {
          await dynamoDB.clearCollection('users');
          const userItems = Array.from(this.users.entries()).map(([id, user]) => ({ id, data: user }));
          await dynamoDB.batchPut('users', userItems);
        })(),
        (async () => {
          await dynamoDB.clearCollection('marketData');
          const mdItems = Array.from(this.marketData.entries()).map(([id, md]) => ({ id, data: md }));
          await dynamoDB.batchPut('marketData', mdItems);
        })(),
        (async () => {
          await dynamoDB.clearCollection('walletBalances');
          const wbItems = Array.from(this.walletBalances.entries()).map(([id, bal]) => ({ id, data: { ...bal, id } }));
          await dynamoDB.batchPut('walletBalances', wbItems);
        })(),
        (async () => {
          await dynamoDB.clearCollection('kycSubmissions');
          const kycItems = Array.from(this.kycSubmissions.entries()).map(([id, kyc]) => ({ id, data: kyc }));
          await dynamoDB.batchPut('kycSubmissions', kycItems);
        })(),
        (async () => {
          await dynamoDB.clearCollection('autoReinvestConfigs');
          const arItems = Array.from(this.autoReinvestConfigs.entries()).map(([id, cfg]) => ({ id, data: cfg }));
          await dynamoDB.batchPut('autoReinvestConfigs', arItems);
        })(),
        (async () => {
          await dynamoDB.clearCollection('smartInvestingProfiles');
          const spItems = Array.from(this.smartInvestingProfiles.entries()).map(([id, p]) => ({ id, data: p }));
          await dynamoDB.batchPut('smartInvestingProfiles', spItems);
        })(),
        (async () => {
          await dynamoDB.clearCollection('vipTiers');
          const vipItems = Array.from(this.vipTiers.entries()).map(([id, vip]) => ({ id, data: vip }));
          await dynamoDB.batchPut('vipTiers', vipItems);
        })(),
        (async () => {
          await dynamoDB.clearCollection('taxInfo');
          const tiItems = Array.from(this.taxInfo.entries()).map(([id, ti]) => ({ id, data: ti }));
          await dynamoDB.batchPut('taxInfo', tiItems);
        })(),
        (async () => {
          await dynamoDB.clearCollection('notificationSettings');
          const nsItems = Array.from(this.notificationSettings.entries()).map(([id, ns]) => ({ id, data: { ...ns, id } }));
          await dynamoDB.batchPut('notificationSettings', nsItems);
        })(),
        dynamoDB.setConfig('alertSettings', this.alertSettings),
        dynamoDB.setConfig('syncConfig', this.syncConfig),
      ]);

      const arrayCollections: Array<[string, Array<{ id?: string } & Record<string, unknown>>]> = [
        ['teamMembers', this.teamMembers],
        ['referrals', this.referrals],
        ['broadcasts', this.broadcasts],
        ['propertySubmissions', this.propertySubmissions],
        ['landPartnerDeals', this.landPartnerDeals],
        ['influencers', this.influencers],
        ['influencerApplications', this.influencerApplications],
        ['brokerApplications', this.brokerApplications],
        ['agentApplications', this.agentApplications],
        ['supportTickets', this.supportTickets],
        ['fractionalShares', this.fractionalShares],
        ['titleCompanies', this.titleCompanies],
        ['documentSubmissions', this.documentSubmissions],
        ['alertRules', this.alertRules],
        ['alerts', this.alerts],
        ['debtAcquisitions', this.debtAcquisitions],
        ['syncedLenders', this.syncedLenders],
        ['syncJobs', this.syncJobs],
        ['copyInvestingProfiles', this.copyInvestingProfiles],
        ['copyFollows', this.copyFollows],
        ['giftShares', this.giftShares],
        ['earnPositions', this.earnPositions],
        ['earnProducts', this.earnProducts as any],
        ['taxDocuments', this.taxDocuments],
        ['deviceRegistrations', this.deviceRegistrations as any],
        ['analyticsEvents', this.analyticsEvents as any],
        ['waitlistEntries', this.waitlistEntries as any],
      ];

      await Promise.all(
        arrayCollections.map(async ([name, items]) => {
          await dynamoDB.clearCollection(name);
          if (items.length > 0) {
            await dynamoDB.batchPut(name, items.map((item, idx) => ({
              id: (item as any).id || `${name}_${idx}`,
              data: item,
            })));
          }
        })
      );

      const userCollections: Array<[string, Map<string, Array<{ id?: string } & Record<string, unknown>>>]> = [
        ['holdings', this.holdings as any],
        ['transactions', this.transactions as any],
        ['notifications', this.notifications as any],
        ['orders', this.orders as any],
        ['bankAccounts', this.bankAccounts as any],
        ['savedPaymentMethods', this.savedPaymentMethods as any],
      ];

      await Promise.all(
        userCollections.map(async ([name, map]) => {
          await dynamoDB.clearAllUserData(name);
          const allItems: Array<{ userId: string; id: string; data: unknown }> = [];
          for (const [userId, items] of map) {
            for (const item of items) {
              allItems.push({
                userId,
                id: (item as any).id || `${name}_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                data: item,
              });
            }
          }
          if (allItems.length > 0) await dynamoDB.batchPutUserEntities(name, allItems);
        })
      );
    } catch (e) {
      console.error('[Store] DynamoDB persist error:', e);
    }
  }

  private async _persistAll(): Promise<void> {
    await this.persist();
  }

  genId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  log(action: string, userId: string, details: string): void {
    const auditId = this.genId("audit");
    const timestamp = new Date().toISOString();
    this.auditLog.push({ id: auditId, action, userId, details, timestamp });
    if (dynamoDB.isAvailable) {
      dynamoDB.addAudit(auditId, action, userId, details).catch(err =>
        console.error('[Store] Audit log error:', err)
      );
    }
    console.log(`[Store] ${action} by ${userId}: ${details}`);
    this.persist().catch(err => console.error('[Store] Persist error after log:', err));
  }

  getUser(userId: string): UserRecord | undefined {
    return this.users.get(userId);
  }

  getUserByEmail(email: string): UserRecord | undefined {
    for (const u of this.users.values()) {
      if (u.email === email) return u;
    }
    return undefined;
  }

  getWalletBalance(userId: string) {
    return this.walletBalances.get(userId) || { available: 0, pending: 0, invested: 0 };
  }

  getUserHoldings(userId: string): HoldingRecord[] {
    return this.holdings.get(userId) || [];
  }

  getUserTransactions(userId: string): TransactionRecord[] {
    return this.transactions.get(userId) || [];
  }

  getUserNotifications(userId: string): NotificationRecord[] {
    return this.notifications.get(userId) || [];
  }

  getUserOrders(userId: string): OrderRecord[] {
    return this.orders.get(userId) || [];
  }

  addTransaction(userId: string, tx: TransactionRecord): void {
    const list = this.transactions.get(userId) || [];
    list.unshift(tx);
    this.transactions.set(userId, list);
    this.persist().catch(err => console.error('[Store] Persist error:', err));
  }

  addNotification(userId: string, notif: NotificationRecord): void {
    const list = this.notifications.get(userId) || [];
    list.unshift(notif);
    this.notifications.set(userId, list);
    this.persist().catch(err => console.error('[Store] Persist error:', err));
  }

  addOrder(userId: string, order: OrderRecord): void {
    const list = this.orders.get(userId) || [];
    list.unshift(order);
    this.orders.set(userId, list);
    this.persist().catch(err => console.error('[Store] Persist error:', err));
  }

  addAnalyticsEvent(evt: Store['analyticsEvents'][number]): void {
    this.analyticsEvents.push(evt);
    if (this.analyticsEvents.length > 100000) {
      this.analyticsEvents.splice(0, this.analyticsEvents.length - 50000);
    }
    if (dynamoDB.isAvailable) {
      dynamoDB.put('analyticsEvents', evt.id, evt).catch(err =>
        console.error('[Store] Analytics event persist error:', err)
      );
    }
    this.aiMemory.totalDataPointsProcessed++;
  }

  addAILearning(learning: Store['aiLearnings'][number]): void {
    this.aiLearnings.push(learning);
    this.aiMemory.totalPatternsLearned++;
    this.aiMemory.lastLearningCycle = new Date().toISOString();
    if (this.aiLearnings.length > 5000) {
      this.aiLearnings = this.aiLearnings.filter(l => l.isActive).slice(-2500);
    }
    console.log(`[AI Brain] New learning: ${learning.type} — ${learning.title} (confidence: ${learning.confidence}%)`);
    if (dynamoDB.isAvailable) {
      dynamoDB.put('aiLearnings', learning.id, learning).catch(err =>
        console.error('[Store] AI learning persist error:', err)
      );
    }
  }

  updateAIMemory(updates: Partial<Store['aiMemory']>): void {
    Object.assign(this.aiMemory, updates);
    if (dynamoDB.isAvailable) {
      dynamoDB.put('aiMemory', 'main', this.aiMemory).catch(err =>
        console.error('[Store] AI memory persist error:', err)
      );
    }
  }

  addVisitorLog(entry: Store['visitorLog'][number]): void {
    this.visitorLog.push(entry);
    if (this.visitorLog.length > 50000) {
      this.visitorLog.splice(0, this.visitorLog.length - 25000);
    }
    console.log(`[Visitor] ${entry.ip} | ${entry.device} | ${entry.os} ${entry.osVersion} | ${entry.browser} ${entry.browserVersion} | ${entry.event}`);
    if (dynamoDB.isAvailable) {
      dynamoDB.put('visitorLog', entry.id, entry).catch(err =>
        console.error('[Store] Visitor log persist error:', err)
      );
    }
  }

  updateLiveSession(session: Omit<LiveSession, 'startedAt'> & { startedAt: string | undefined }): void {
    const existing = this.liveSessions.get(session.sessionId);
    const now = new Date().toISOString();
    this.liveSessions.set(session.sessionId, {
      sessionId: session.sessionId,
      ip: session.ip,
      device: session.device,
      os: session.os,
      browser: session.browser,
      geo: session.geo,
      currentStep: session.currentStep,
      sessionDuration: session.sessionDuration,
      activeTime: session.activeTime,
      lastSeen: session.lastSeen || now,
      startedAt: existing?.startedAt || now,
    });
    if (this.liveSessions.size > 10000) {
      const cutoff = Date.now() - 600000;
      for (const [key, val] of this.liveSessions) {
        if (new Date(val.lastSeen).getTime() < cutoff) this.liveSessions.delete(key);
      }
    }
  }

  getLiveSessions(): LiveSession[] {
    return Array.from(this.liveSessions.values())
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  }

  getVisitorLog(options?: { period?: string; device?: string; os?: string; page?: number; limit?: number }): { items: Store['visitorLog'][number][]; total: number; page: number; limit: number; totalPages: number } {
    const now = Date.now();
    let cutoffMs = 30 * 24 * 60 * 60 * 1000;
    switch (options?.period) {
      case '1h': cutoffMs = 60 * 60 * 1000; break;
      case '24h': cutoffMs = 24 * 60 * 60 * 1000; break;
      case '7d': cutoffMs = 7 * 24 * 60 * 60 * 1000; break;
      case '30d': cutoffMs = 30 * 24 * 60 * 60 * 1000; break;
      case '90d': cutoffMs = 90 * 24 * 60 * 60 * 1000; break;
      case 'all': cutoffMs = 365 * 10 * 24 * 60 * 60 * 1000; break;
    }
    let filtered = this.visitorLog.filter(v => new Date(v.timestamp).getTime() >= now - cutoffMs);
    if (options?.device && options.device !== 'all') {
      filtered = filtered.filter(v => v.device === options.device);
    }
    if (options?.os && options.os !== 'all') {
      filtered = filtered.filter(v => v.os === options.os);
    }
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const pg = options?.page || 1;
    const lim = options?.limit || 50;
    return this.paginate(filtered, pg, lim);
  }

  getProperty(id: string): PropertyRecord | undefined {
    return this.properties.find(p => p.id === id);
  }

  getAllUsers(): UserRecord[] {
    return Array.from(this.users.values());
  }

  getAllTransactions(): TransactionRecord[] {
    const all: TransactionRecord[] = [];
    for (const [userId, txs] of this.transactions.entries()) {
      txs.forEach(tx => all.push({ ...tx, userId }));
    }
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  paginate<T>(items: T[], page: number, limit: number): { items: T[]; total: number; page: number; limit: number; totalPages: number } {
    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);
    return { items: paged, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

export const store = new Store();
export type {
  UserRecord,
  PropertyRecord,
  TransactionRecord,
  NotificationRecord,
  OrderRecord,
  HoldingRecord,
  MarketDataRecord,
  BankAccount,
  KYCSubmission,
  TeamMemberRecord,
  BroadcastRecord,
  ReferralRecord,
  PropertySubmissionRecord,
  LandPartnerDealRecord,
  InfluencerRecord,
  InfluencerApplicationRecord,
  SupportTicketRecord,
  SavedPaymentMethod,
  DeviceRegistration,
  DebtAcquisitionRecord,
  AlertRuleRecord,
  AlertRecord,
  TitleCompanyRecord,
  DocumentSubmissionRecord,
  FractionalShareRecord,
  SyncedLenderRecord,
  SyncJobRecord,
  AutoReinvestConfig,
  CopyInvestingProfile,
  CopyFollowRecord,
  GiftShareRecord,
  SmartInvestingProfile,
  VipTierRecord,
  EarnPositionRecord,
  TaxDocumentRecord,
  TaxInfoRecord,
};
