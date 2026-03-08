import type {
  UserRecord,
  TeamMemberRecord,
  TransactionRecord,
  NotificationRecord,
  HoldingRecord,
  ReferralRecord,
  PropertySubmissionRecord,
  SupportTicketRecord,
  BroadcastRecord,
  PropertyRecord,
  MarketDataRecord,
  VipTierRecord,
  EarnProductRecord,
  AlertSettings,
  SyncConfig,
} from './types';

const generatePriceHistory = (basePrice: number, days: number) => {
  const history: Array<{ date: string; price: number; volume: number }> = [];
  let price = basePrice * 0.9;
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const change = (Math.random() - 0.45) * basePrice * 0.02;
    price = Math.max(basePrice * 0.8, Math.min(basePrice * 1.3, price + change));
    history.push({
      date: date.toISOString(),
      price: Math.round(price * 100) / 100,
      volume: Math.floor(Math.random() * 50000) + 10000,
    });
  }
  return history;
};

const generateOrderBook = (basePrice: number) => {
  const bids: Array<{ price: number; shares: number; total: number }> = [];
  const asks: Array<{ price: number; shares: number; total: number }> = [];
  for (let i = 0; i < 5; i++) {
    const bidPrice = Math.round((basePrice - (i + 1) * 0.2) * 100) / 100;
    const askPrice = Math.round((basePrice + (i + 1) * 0.2) * 100) / 100;
    const bidShares = Math.floor(Math.random() * 500) + 100;
    const askShares = Math.floor(Math.random() * 500) + 100;
    bids.push({ price: bidPrice, shares: bidShares, total: Math.round(bidPrice * bidShares * 100) / 100 });
    asks.push({ price: askPrice, shares: askShares, total: Math.round(askPrice * askShares * 100) / 100 });
  }
  return { bids, asks };
};

export const SEED_PROPERTIES: PropertyRecord[] = [
  {
    id: "1", name: "Marina Bay Residences", location: "123 Marina Boulevard", city: "Dubai", country: "UAE",
    images: [
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800",
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800",
      "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800",
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800",
      "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800",
    ],
    pricePerShare: 52.4, totalShares: 100000, availableShares: 35000, minInvestment: 1,
    targetRaise: 5240000, currentRaise: 3406000, yield: 8.5, capRate: 6.2, irr: 14.5, occupancy: 96,
    propertyType: "residential", status: "live", riskLevel: "medium",
    description: "Luxury waterfront residential complex featuring 200 premium apartments with stunning marina views. Prime location in Dubai Marina with direct beach access.",
    highlights: ["Prime waterfront location", "Fully leased with 96% occupancy", "AAA tenant mix", "Recent renovations completed"],
    documents: [
      { id: "doc-1", name: "Property Title", type: "title", url: "#" },
      { id: "doc-2", name: "Appraisal Report 2024", type: "appraisal", url: "#" },
      { id: "doc-3", name: "Insurance Certificate", type: "insurance", url: "#" },
    ],
    distributions: [
      { id: "dist-1", date: "2024-12-01", amount: 0.44, type: "dividend" },
      { id: "dist-2", date: "2024-09-01", amount: 0.42, type: "dividend" },
      { id: "dist-3", date: "2024-06-01", amount: 0.41, type: "dividend" },
    ],
    priceHistory: generatePriceHistory(52.4, 365),
    createdAt: "2024-01-15T00:00:00Z", closingDate: "2025-03-01T00:00:00Z",
  },
  {
    id: "2", name: "Manhattan Office Tower", location: "500 Fifth Avenue", city: "New York", country: "USA",
    images: [
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800",
      "https://images.unsplash.com/photo-1554435493-93422e8220c8?w=800",
      "https://images.unsplash.com/photo-1577985043696-8bd54d9c4e25?w=800",
      "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800",
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800",
      "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800",
      "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=800",
      "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=800",
    ],
    pricePerShare: 125.0, totalShares: 200000, availableShares: 80000, minInvestment: 1,
    targetRaise: 25000000, currentRaise: 15000000, yield: 6.8, capRate: 5.5, irr: 12.2, occupancy: 92,
    propertyType: "commercial", status: "live", riskLevel: "low",
    description: "Class A office building in the heart of Midtown Manhattan. 45-story tower with premium finishes and Fortune 500 tenants.",
    highlights: ["Class A office space", "Fortune 500 tenant base", "LEED Gold certified", "10-year average lease term"],
    documents: [
      { id: "doc-4", name: "Property Title", type: "title", url: "#" },
      { id: "doc-5", name: "Appraisal Report 2024", type: "appraisal", url: "#" },
    ],
    distributions: [
      { id: "dist-4", date: "2024-12-01", amount: 0.85, type: "dividend" },
      { id: "dist-5", date: "2024-09-01", amount: 0.82, type: "dividend" },
    ],
    priceHistory: generatePriceHistory(125.0, 365),
    createdAt: "2024-02-01T00:00:00Z", closingDate: "2025-04-15T00:00:00Z",
  },
  {
    id: "3", name: "London Luxury Flats", location: "Kensington High Street", city: "London", country: "UK",
    images: [
      "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800",
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800",
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800",
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800",
    ],
    pricePerShare: 78.5, totalShares: 150000, availableShares: 0, minInvestment: 1,
    targetRaise: 11775000, currentRaise: 11775000, yield: 5.2, capRate: 4.8, irr: 11.5, occupancy: 100,
    propertyType: "residential", status: "funded", riskLevel: "low",
    description: "Premium residential development in prestigious Kensington. 50 luxury flats with concierge service and private gardens.",
    highlights: ["Prime Kensington location", "100% occupancy rate", "High-net-worth tenants", "Heritage building status"],
    documents: [],
    distributions: [{ id: "dist-6", date: "2024-12-01", amount: 0.34, type: "dividend" }],
    priceHistory: generatePriceHistory(78.5, 365),
    createdAt: "2023-06-01T00:00:00Z", closingDate: "2023-12-01T00:00:00Z",
  },
  {
    id: "4", name: "Singapore Tech Hub", location: "One-North Business Park", city: "Singapore", country: "Singapore",
    images: [
      "https://images.unsplash.com/photo-1486718448742-163732cd1544?w=800",
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800",
      "https://images.unsplash.com/photo-1497366412874-3415097a27e7?w=800",
      "https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=800",
      "https://images.unsplash.com/photo-1562664348-2ec86283a0dc?w=800",
    ],
    pricePerShare: 95.0, totalShares: 120000, availableShares: 120000, minInvestment: 1,
    targetRaise: 11400000, currentRaise: 0, yield: 7.2, capRate: 5.8, irr: 13.8, occupancy: 88,
    propertyType: "commercial", status: "coming_soon", riskLevel: "medium",
    description: "State-of-the-art tech campus in Singapore's premier innovation district. Home to leading tech companies and startups.",
    highlights: ["Tech-focused tenant base", "Green building certified", "Flexible workspace options", "Premium amenities"],
    documents: [], distributions: [],
    priceHistory: generatePriceHistory(95.0, 30),
    createdAt: "2024-12-01T00:00:00Z", closingDate: "2025-06-01T00:00:00Z",
  },
  {
    id: "5", name: "Paris Retail Complex", location: "Champs-\u00C9lys\u00E9es", city: "Paris", country: "France",
    images: [
      "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800",
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800",
      "https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=800",
      "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
    ],
    pricePerShare: 185.0, totalShares: 80000, availableShares: 25000, minInvestment: 1,
    targetRaise: 14800000, currentRaise: 10175000, yield: 5.8, capRate: 4.5, irr: 10.8, occupancy: 98,
    propertyType: "commercial", status: "live", riskLevel: "low",
    description: "Iconic retail destination on the world's most famous avenue. Luxury brand tenants with long-term leases.",
    highlights: ["Champs-\u00C9lys\u00E9es location", "Luxury brand tenants", "15-year average lease", "Trophy asset"],
    documents: [{ id: "doc-6", name: "Property Title", type: "title", url: "#" }],
    distributions: [{ id: "dist-7", date: "2024-12-01", amount: 1.07, type: "dividend" }],
    priceHistory: generatePriceHistory(185.0, 365),
    createdAt: "2024-03-01T00:00:00Z", closingDate: "2025-05-01T00:00:00Z",
  },
  {
    id: "6", name: "Tokyo Mixed-Use Tower", location: "Shibuya District", city: "Tokyo", country: "Japan",
    images: [
      "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800",
      "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800",
      "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=800",
      "https://images.unsplash.com/photo-1551641506-ee5bf4cb45f1?w=800",
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800",
    ],
    pricePerShare: 68.0, totalShares: 180000, availableShares: 72000, minInvestment: 1,
    targetRaise: 12240000, currentRaise: 7344000, yield: 6.5, capRate: 5.2, irr: 12.5, occupancy: 94,
    propertyType: "mixed", status: "live", riskLevel: "medium",
    description: "Modern mixed-use development in trendy Shibuya. Retail, office, and residential spaces in Tokyo's youth culture hub.",
    highlights: ["Prime Shibuya location", "Mixed-use diversification", "Strong foot traffic", "Tech-savvy tenant mix"],
    documents: [], distributions: [],
    priceHistory: generatePriceHistory(68.0, 365),
    createdAt: "2024-04-15T00:00:00Z", closingDate: "2025-07-01T00:00:00Z",
  },
];

export const SEED_MARKET_DATA: MarketDataRecord[] = [
  { propertyId: "1", lastPrice: 52.40, change24h: 0.85, changePercent24h: 1.65, volume24h: 125000, high24h: 53.10, low24h: 51.20, ...generateOrderBook(52.40) },
  { propertyId: "2", lastPrice: 125.00, change24h: -1.20, changePercent24h: -0.95, volume24h: 85000, high24h: 126.50, low24h: 124.00, ...generateOrderBook(125.00) },
  { propertyId: "3", lastPrice: 78.50, change24h: 0.50, changePercent24h: 0.64, volume24h: 45000, high24h: 79.00, low24h: 77.80, ...generateOrderBook(78.50) },
  { propertyId: "5", lastPrice: 185.00, change24h: 2.50, changePercent24h: 1.37, volume24h: 62000, high24h: 186.00, low24h: 182.00, ...generateOrderBook(185.00) },
  { propertyId: "6", lastPrice: 68.00, change24h: -0.45, changePercent24h: -0.66, volume24h: 98000, high24h: 69.00, low24h: 67.50, ...generateOrderBook(68.00) },
];

export const SEED_USERS: UserRecord[] = [];

export const SEED_WALLET_BALANCES: Array<{ userId: string; available: number; pending: number; invested: number }> = [];

export const SEED_TEAM_MEMBERS: TeamMemberRecord[] = [
  { id: "admin-1", email: "ceo@ivxholding.com", firstName: "Ivan", lastName: "Perez", phone: "+1 (561) 644-3503", roleId: "role-ceo", roleType: "ceo", status: "active", lastLogin: new Date().toISOString(), createdAt: "2024-01-01T00:00:00Z" },
  { id: "admin-km", email: "kimberly@ivxholding.com", firstName: "Kimberly", lastName: "Perez", roleId: "role-manager", roleType: "manager", status: "active", lastLogin: new Date().toISOString(), invitedBy: "admin-1", createdAt: "2024-03-15T10:00:00Z" },
  { id: "admin-sh", email: "sharon@ivxholding.com", firstName: "Sharon", lastName: "", roleId: "role-manager", roleType: "manager", status: "active", lastLogin: new Date().toISOString(), invitedBy: "admin-1", createdAt: "2024-03-15T10:00:00Z" },
];

export const SEED_HOLDINGS: Record<string, HoldingRecord[]> = {};

export const SEED_TRANSACTIONS: Record<string, TransactionRecord[]> = {};

export const SEED_NOTIFICATIONS: Record<string, NotificationRecord[]> = {};

export const SEED_REFERRALS: ReferralRecord[] = [];

export const SEED_SUPPORT_TICKETS: SupportTicketRecord[] = [];

export const SEED_PROPERTY_SUBMISSIONS: PropertySubmissionRecord[] = [];

export const SEED_BROADCASTS: BroadcastRecord[] = [];

export const SEED_VIP_TIERS: Record<string, VipTierRecord> = {};

export const SEED_EARN_PRODUCTS: EarnProductRecord[] = [
  { id: "earn-1", name: "Flexible Savings", description: "Earn daily interest with no lock-up", apy: 4.5, minAmount: 100, maxAmount: 500000, lockPeriodDays: 0, category: "savings", status: "active", totalDeposited: 2500000, capacity: 10000000 },
  { id: "earn-2", name: "30-Day Fixed", description: "Higher yield with 30-day lock", apy: 6.2, minAmount: 500, maxAmount: 250000, lockPeriodDays: 30, category: "fixed", status: "active", totalDeposited: 1800000, capacity: 5000000 },
  { id: "earn-3", name: "90-Day Fixed", description: "Premium yield with 90-day lock", apy: 8.0, minAmount: 1000, maxAmount: 200000, lockPeriodDays: 90, category: "fixed", status: "active", totalDeposited: 3200000, capacity: 8000000 },
  { id: "earn-4", name: "Property Yield Plus", description: "Backed by real estate income streams", apy: 9.5, minAmount: 5000, maxAmount: 100000, lockPeriodDays: 180, category: "structured", status: "active", totalDeposited: 950000, capacity: 3000000 },
  { id: "earn-5", name: "Annual Lock", description: "Best rate with 365-day commitment", apy: 11.0, minAmount: 10000, maxAmount: 500000, lockPeriodDays: 365, category: "fixed", status: "active", totalDeposited: 4100000, capacity: 15000000 },
];

export const SEED_ALERT_SETTINGS: AlertSettings = {
  ownerPhone: "+1234567890", ownerEmail: "admin@ipxholding.com", ownerName: "IVXHOLDINGS Admin",
  enableSMS: true, enableWhatsApp: true, enableEmail: true, enablePush: true,
  escalationTimeMinutes: 30, dailyDigestEnabled: true, dailyDigestTime: "08:00",
};

export const SEED_SYNC_CONFIG: SyncConfig = {
  autoSyncEnabled: false,
  syncIntervalHours: 24,
  sources: [
    { id: "sec_edgar", name: "SEC EDGAR", enabled: true, apiKey: "", lastSynced: null, totalRecords: 0 },
    { id: "google_places", name: "Google Places API", enabled: false, apiKey: "", lastSynced: null, totalRecords: 0 },
    { id: "opencorporates", name: "OpenCorporates", enabled: false, apiKey: "", lastSynced: null, totalRecords: 0 },
    { id: "crunchbase", name: "Crunchbase", enabled: false, apiKey: "", lastSynced: null, totalRecords: 0 },
  ],
  defaultSearchQueries: [
    "real estate investment trust",
    "private equity real estate",
    "mortgage lending company",
    "real estate fund manager",
    "commercial real estate lender",
  ],
  emailVerificationEnabled: true,
  autoDeduplicate: true,
  autoImportToDirectory: true,
};
