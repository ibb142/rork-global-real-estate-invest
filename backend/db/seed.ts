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

export const SEED_USERS: UserRecord[] = [
  {
    id: "user-1", email: "investor@example.com", firstName: "Alexander", lastName: "Sterling",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
    phone: "+1 (555) 123-4567", country: "United States", role: "owner", kycStatus: "approved", eligibilityStatus: "eligible",
    walletBalance: 25430.5, totalInvested: 48750.0, totalReturns: 6234.8, createdAt: "2024-01-01T00:00:00Z",
    passwordHash: "hashed_password", status: "active", lastActivity: new Date().toISOString(),
  },
  {
    id: "user-2", email: "maria.johnson@example.com", firstName: "Maria", lastName: "Johnson",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200",
    phone: "+1 (555) 234-5678", country: "United States", role: "investor", kycStatus: "approved", eligibilityStatus: "eligible",
    walletBalance: 15200.0, totalInvested: 32500.0, totalReturns: 4120.5, createdAt: "2024-02-15T00:00:00Z",
    passwordHash: "hashed_password", status: "active", lastActivity: "2025-01-23T10:15:00Z",
  },
  {
    id: "user-3", email: "james.chen@example.com", firstName: "James", lastName: "Chen",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200",
    phone: "+65 9123 4567", country: "Singapore", role: "investor", kycStatus: "in_review", eligibilityStatus: "pending",
    walletBalance: 50000.0, totalInvested: 0, totalReturns: 0, createdAt: "2025-01-20T00:00:00Z",
    passwordHash: "hashed_password", status: "active", lastActivity: "2025-01-20T09:00:00Z",
  },
  {
    id: "user-4", email: "sarah.williams@example.com", firstName: "Sarah", lastName: "Williams",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200",
    phone: "+44 20 7946 0958", country: "United Kingdom", role: "investor", kycStatus: "approved", eligibilityStatus: "eligible",
    walletBalance: 8750.25, totalInvested: 67800.0, totalReturns: 8945.3, createdAt: "2023-11-10T00:00:00Z",
    passwordHash: "hashed_password", status: "active", lastActivity: "2025-01-24T16:45:00Z",
  },
  {
    id: "user-5", email: "michael.brown@example.com", firstName: "Michael", lastName: "Brown",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
    phone: "+1 (555) 345-6789", country: "Canada", role: "investor", kycStatus: "pending", eligibilityStatus: "pending",
    walletBalance: 0, totalInvested: 0, totalReturns: 0, createdAt: "2025-01-22T00:00:00Z",
    passwordHash: "hashed_password", status: "inactive", lastActivity: "2025-01-22T11:30:00Z",
  },
  {
    id: "user-6", email: "emma.davis@example.com", firstName: "Emma", lastName: "Davis",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
    phone: "+61 2 9876 5432", country: "Australia", role: "investor", kycStatus: "rejected", eligibilityStatus: "restricted",
    walletBalance: 5000.0, totalInvested: 0, totalReturns: 0, createdAt: "2025-01-15T00:00:00Z",
    passwordHash: "hashed_password", status: "suspended", lastActivity: "2025-01-18T08:20:00Z",
  },
  {
    id: "user-7", email: "david.lee@example.com", firstName: "David", lastName: "Lee",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200",
    phone: "+852 9876 5432", country: "Hong Kong", role: "investor", kycStatus: "approved", eligibilityStatus: "eligible",
    walletBalance: 125000.0, totalInvested: 250000.0, totalReturns: 32500.0, createdAt: "2023-06-20T00:00:00Z",
    passwordHash: "hashed_password", status: "active", lastActivity: "2025-01-24T18:00:00Z",
  },
  {
    id: "user-8", email: "sophie.martin@example.com", firstName: "Sophie", lastName: "Martin",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200",
    phone: "+33 1 23 45 67 89", country: "France", role: "investor", kycStatus: "approved", eligibilityStatus: "eligible",
    walletBalance: 42300.75, totalInvested: 89500.0, totalReturns: 11234.6, createdAt: "2023-09-05T00:00:00Z",
    passwordHash: "hashed_password", status: "active", lastActivity: "2025-01-23T14:20:00Z",
  },
];

export const SEED_WALLET_BALANCES: Array<{ userId: string; available: number; pending: number; invested: number }> = [
  { userId: "user-1", available: 25430.5, pending: 0, invested: 48750 },
  { userId: "user-2", available: 15200, pending: 0, invested: 32500 },
  { userId: "user-3", available: 50000, pending: 0, invested: 0 },
  { userId: "user-4", available: 8750.25, pending: 0, invested: 67800 },
  { userId: "user-5", available: 0, pending: 0, invested: 0 },
  { userId: "user-6", available: 5000, pending: 0, invested: 0 },
  { userId: "user-7", available: 125000, pending: 0, invested: 250000 },
  { userId: "user-8", available: 42300.75, pending: 0, invested: 89500 },
];

export const SEED_TEAM_MEMBERS: TeamMemberRecord[] = [
  { id: "admin-1", email: "ceo@ipxholding.com", firstName: "IVXHOLDINGS", lastName: "CEO", phone: "+1 (561) 644-3503", roleId: "role-ceo", roleType: "ceo", status: "active", lastLogin: new Date().toISOString(), createdAt: "2024-01-01T00:00:00Z" },
  { id: "admin-2", email: "operations@ipxholding.com", firstName: "Sarah", lastName: "Martinez", phone: "+1 (555) 234-5678", roleId: "role-manager", roleType: "manager", status: "active", lastLogin: "2025-01-24T16:30:00Z", invitedBy: "admin-1", createdAt: "2024-03-15T10:00:00Z" },
  { id: "admin-3", email: "analyst@ipxholding.com", firstName: "Michael", lastName: "Chen", phone: "+1 (555) 345-6789", roleId: "role-analyst", roleType: "analyst", status: "active", lastLogin: "2025-01-23T11:00:00Z", invitedBy: "admin-1", createdAt: "2024-06-01T09:00:00Z" },
  { id: "admin-4", email: "support@ipxholding.com", firstName: "Emily", lastName: "Johnson", phone: "+1 (555) 456-7890", roleId: "role-support", roleType: "support", status: "active", lastLogin: "2025-01-25T08:45:00Z", invitedBy: "admin-1", createdAt: "2024-08-20T14:00:00Z" },
  { id: "admin-5", email: "newemployee@ipxholding.com", firstName: "James", lastName: "Wilson", roleId: "role-viewer", roleType: "viewer", status: "invited", invitedBy: "admin-1", createdAt: "2025-01-20T10:00:00Z" },
];

export const SEED_HOLDINGS: Record<string, HoldingRecord[]> = {
  "user-1": [
    { id: "holding-1", propertyId: "1", shares: 250, avgCostBasis: 48.5, currentValue: 13100, totalReturn: 975, totalReturnPercent: 8.04, unrealizedPnL: 975, unrealizedPnLPercent: 8.04, purchaseDate: "2024-03-15T00:00:00Z" },
    { id: "holding-2", propertyId: "2", shares: 120, avgCostBasis: 118, currentValue: 15000, totalReturn: 840, totalReturnPercent: 5.93, unrealizedPnL: 840, unrealizedPnLPercent: 5.93, purchaseDate: "2024-04-20T00:00:00Z" },
    { id: "holding-3", propertyId: "3", shares: 180, avgCostBasis: 72, currentValue: 14130, totalReturn: 1170, totalReturnPercent: 9.03, unrealizedPnL: 1170, unrealizedPnLPercent: 9.03, purchaseDate: "2023-08-10T00:00:00Z" },
    { id: "holding-4", propertyId: "5", shares: 35, avgCostBasis: 175, currentValue: 6475, totalReturn: 350, totalReturnPercent: 5.71, unrealizedPnL: 350, unrealizedPnLPercent: 5.71, purchaseDate: "2024-06-05T00:00:00Z" },
  ],
  "user-2": [
    { id: "h-u2-1", propertyId: "3", shares: 100, avgCostBasis: 78.5, currentValue: 7850, totalReturn: 0, totalReturnPercent: 0, unrealizedPnL: 0, unrealizedPnLPercent: 0, purchaseDate: "2025-01-21T15:30:00Z" },
  ],
  "user-4": [
    { id: "h-u4-1", propertyId: "1", shares: 300, avgCostBasis: 50, currentValue: 15720, totalReturn: 720, totalReturnPercent: 4.8, unrealizedPnL: 720, unrealizedPnLPercent: 4.8, purchaseDate: "2024-02-01T00:00:00Z" },
    { id: "h-u4-2", propertyId: "5", shares: 50, avgCostBasis: 180, currentValue: 9250, totalReturn: 250, totalReturnPercent: 2.78, unrealizedPnL: 250, unrealizedPnLPercent: 2.78, purchaseDate: "2024-06-15T00:00:00Z" },
  ],
  "user-7": [
    { id: "h-u7-1", propertyId: "2", shares: 100, avgCostBasis: 125, currentValue: 12500, totalReturn: 0, totalReturnPercent: 0, unrealizedPnL: 0, unrealizedPnLPercent: 0, purchaseDate: "2025-01-23T11:45:00Z" },
    { id: "h-u7-2", propertyId: "1", shares: 500, avgCostBasis: 49, currentValue: 26200, totalReturn: 1700, totalReturnPercent: 6.94, unrealizedPnL: 1700, unrealizedPnLPercent: 6.94, purchaseDate: "2023-08-01T00:00:00Z" },
    { id: "h-u7-3", propertyId: "5", shares: 200, avgCostBasis: 178, currentValue: 37000, totalReturn: 1400, totalReturnPercent: 3.93, unrealizedPnL: 1400, unrealizedPnLPercent: 3.93, purchaseDate: "2024-03-10T00:00:00Z" },
  ],
  "user-8": [
    { id: "h-u8-1", propertyId: "2", shares: 200, avgCostBasis: 120, currentValue: 25000, totalReturn: 1000, totalReturnPercent: 4.17, unrealizedPnL: 1000, unrealizedPnLPercent: 4.17, purchaseDate: "2024-01-15T00:00:00Z" },
    { id: "h-u8-2", propertyId: "6", shares: 150, avgCostBasis: 65, currentValue: 10200, totalReturn: 450, totalReturnPercent: 4.62, unrealizedPnL: 450, unrealizedPnLPercent: 4.62, purchaseDate: "2024-05-01T00:00:00Z" },
  ],
};

export const SEED_TRANSACTIONS: Record<string, TransactionRecord[]> = {
  "user-1": [
    { id: "tx-1", type: "deposit", amount: 10000, status: "completed", description: "Bank Transfer Deposit", createdAt: "2024-12-15T10:30:00Z" },
    { id: "tx-2", type: "buy", amount: -5240, status: "completed", description: "Bought 100 shares", propertyId: "1", propertyName: "Marina Bay Residences", createdAt: "2024-12-14T14:22:00Z" },
    { id: "tx-3", type: "dividend", amount: 156.75, status: "completed", description: "Q4 2024 Distribution", propertyId: "1", propertyName: "Marina Bay Residences", createdAt: "2024-12-01T00:00:00Z" },
    { id: "tx-4", type: "buy", amount: -3750, status: "completed", description: "Bought 30 shares", propertyId: "2", propertyName: "Manhattan Office Tower", createdAt: "2024-11-28T09:15:00Z" },
    { id: "tx-5", type: "dividend", amount: 102, status: "completed", description: "Q4 2024 Distribution", propertyId: "2", propertyName: "Manhattan Office Tower", createdAt: "2024-12-01T00:00:00Z" },
    { id: "tx-6", type: "withdrawal", amount: -2000, status: "completed", description: "Bank Transfer Withdrawal", createdAt: "2024-11-20T16:45:00Z" },
    { id: "tx-7", type: "deposit", amount: 15000, status: "completed", description: "Wire Transfer Deposit", createdAt: "2024-11-15T11:00:00Z" },
  ],
  "user-2": [
    { id: "tx-u2-1", type: "deposit", amount: 15000, status: "completed", description: "Credit Card Deposit", createdAt: "2025-01-21T13:15:00Z" },
    { id: "tx-u2-2", type: "buy", amount: -7850, status: "completed", description: "Bought 100 shares", propertyId: "3", propertyName: "London Luxury Flats", createdAt: "2025-01-21T15:30:00Z" },
  ],
  "user-4": [
    { id: "tx-u4-1", type: "withdrawal", amount: -2500, status: "pending", description: "Bank Transfer Withdrawal", createdAt: "2025-01-22T16:30:00Z" },
    { id: "tx-u4-2", type: "dividend", amount: 425.5, status: "completed", description: "Q4 2024 Distribution", propertyId: "1", propertyName: "Marina Bay Residences", createdAt: "2025-01-01T00:00:00Z" },
  ],
  "user-7": [
    { id: "tx-u7-1", type: "deposit", amount: 50000, status: "completed", description: "Wire Transfer Deposit", createdAt: "2025-01-23T09:00:00Z" },
    { id: "tx-u7-2", type: "buy", amount: -12500, status: "completed", description: "Bought 100 shares", propertyId: "2", propertyName: "Manhattan Office Tower", createdAt: "2025-01-23T11:45:00Z" },
  ],
  "user-8": [
    { id: "tx-u8-1", type: "sell", amount: 3400, status: "completed", description: "Sold 50 shares", propertyId: "6", propertyName: "Tokyo Mixed-Use Tower", createdAt: "2025-01-20T10:00:00Z" },
  ],
};

export const SEED_NOTIFICATIONS: Record<string, NotificationRecord[]> = {
  "user-1": [
    { id: "notif-1", type: "dividend", title: "Dividend Received", message: "You received $156.75 from Marina Bay Residences Q4 distribution.", read: false, createdAt: "2024-12-01T00:00:00Z" },
    { id: "notif-2", type: "order", title: "Order Filled", message: "Your buy order for 75 shares of Tokyo Mixed-Use Tower has been filled.", read: true, createdAt: "2024-12-15T14:30:05Z" },
    { id: "notif-3", type: "system", title: "New Property Available", message: "Singapore Tech Hub is now open for investment. Check it out!", read: false, createdAt: "2024-12-10T09:00:00Z" },
    { id: "notif-4", type: "kyc", title: "KYC Approved", message: "Your identity verification has been approved. You can now invest!", read: true, createdAt: "2024-01-05T12:00:00Z" },
  ],
  "user-2": [
    { id: "notif-u2-1", type: "system", title: "Welcome to IVXHOLDINGS!", message: "Complete your KYC to start investing.", read: true, createdAt: "2024-02-15T00:00:00Z" },
  ],
  "user-7": [
    { id: "notif-u7-1", type: "order", title: "Order Filled", message: "Your buy order for 100 shares of Manhattan Office Tower has been filled.", read: false, createdAt: "2025-01-23T11:45:00Z" },
  ],
};

export const SEED_REFERRALS: ReferralRecord[] = [
  { id: "ref-1", referrerId: "user-1", referrerName: "Alexander Sterling", referrerEmail: "investor@example.com", referredEmail: "mike.johnson@email.com", referredName: "Mike Johnson", referredId: "user-045", status: "invested", referralCode: "IPXUSER25", reward: 50, rewardPaid: true, signedUpAt: "2025-01-10T14:00:00Z", investedAt: "2025-01-15T10:00:00Z", investmentAmount: 5000, createdAt: "2025-01-09T10:00:00Z" },
  { id: "ref-2", referrerId: "user-1", referrerName: "Alexander Sterling", referrerEmail: "investor@example.com", referredEmail: "sarah.w@email.com", referredName: "Sarah Wilson", status: "signed_up", referralCode: "IPXUSER25", reward: 25, rewardPaid: false, signedUpAt: "2025-01-20T09:00:00Z", createdAt: "2025-01-18T15:00:00Z" },
  { id: "ref-3", referrerId: "user-1", referrerName: "Alexander Sterling", referrerEmail: "investor@example.com", referredEmail: "david.k@email.com", status: "pending", referralCode: "IPXUSER25", reward: 0, rewardPaid: false, createdAt: "2025-02-01T11:00:00Z" },
  { id: "ref-4", referrerId: "user-7", referrerName: "David Lee", referrerEmail: "david.lee@example.com", referredEmail: "test@email.com", referredName: "Test User", status: "signed_up", referralCode: "IPXDAVID", reward: 50, rewardPaid: false, signedUpAt: "2025-01-22T12:00:00Z", createdAt: "2025-01-20T08:00:00Z" },
];

export const SEED_SUPPORT_TICKETS: SupportTicketRecord[] = [
  {
    id: "ticket-1", userId: "user-1", subject: "Dividend Distribution Question", category: "general", status: "in_progress", priority: "low",
    messages: [
      { id: "msg-1", senderId: "support-1", senderName: "IVXHOLDINGS Support", message: "Hello! Welcome to IVXHOLDINGS support. How can I help you today?", timestamp: "2024-12-16T09:00:00Z", isSupport: true, status: "read" },
      { id: "msg-2", senderId: "user-1", senderName: "You", message: "Hi! I have a question about the dividend distribution schedule.", timestamp: "2024-12-16T09:05:00Z", isSupport: false, status: "read" },
      { id: "msg-3", senderId: "support-1", senderName: "IVXHOLDINGS Support", message: "Dividends are distributed quarterly, typically within the first week of each quarter.", timestamp: "2024-12-16T09:07:00Z", isSupport: true, status: "read" },
    ],
    createdAt: "2024-12-16T09:00:00Z", updatedAt: "2024-12-16T09:07:00Z",
  },
  {
    id: "ticket-2", userId: "user-1", subject: "Withdrawal Processing Time", category: "wallet", status: "resolved", priority: "medium",
    messages: [
      { id: "msg-t2-1", senderId: "user-1", senderName: "You", message: "How long does it take for withdrawals to process?", timestamp: "2024-12-10T14:00:00Z", isSupport: false, status: "read" },
      { id: "msg-t2-2", senderId: "support-2", senderName: "IVXHOLDINGS Support", message: "Withdrawals typically process within 2-3 business days for ACH transfers.", timestamp: "2024-12-10T14:30:00Z", isSupport: true, status: "read" },
    ],
    createdAt: "2024-12-10T14:00:00Z", updatedAt: "2024-12-10T14:30:00Z",
  },
];

export const SEED_PROPERTY_SUBMISSIONS: PropertySubmissionRecord[] = [
  {
    id: "sub-1", ownerId: "owner-1", ownerName: "Michael Thompson", ownerEmail: "michael.t@email.com",
    propertyAddress: "1425 Ocean Drive", city: "Miami Beach", state: "FL", zipCode: "33139", country: "USA",
    propertyType: "residential", estimatedValue: 4500000, verifiedValue: 4200000, deedNumber: "FL-2024-892341",
    status: "listed", lienStatus: "clear", debtStatus: "none", totalDebt: 0, totalLiens: 0,
    images: ["https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800"],
    description: "Stunning oceanfront luxury residence with 5 bedrooms.",
    submittedAt: "2025-01-01T00:00:00Z", verifiedAt: "2025-01-10T00:00:00Z",
  },
  {
    id: "sub-2", ownerId: "owner-2", ownerName: "Sarah Williams", ownerEmail: "sarah.w@email.com",
    propertyAddress: "890 Commerce Street", city: "Dallas", state: "TX", zipCode: "75201", country: "USA",
    propertyType: "commercial", estimatedValue: 12000000, verifiedValue: 11500000, deedNumber: "TX-2024-156723",
    status: "approved", lienStatus: "has_liens", debtStatus: "active", totalDebt: 850000, totalLiens: 150000,
    images: ["https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800"],
    description: "Prime commercial office building in downtown Dallas.",
    submittedAt: "2025-01-05T00:00:00Z", verifiedAt: "2025-01-18T00:00:00Z",
  },
];

export const SEED_BROADCASTS: BroadcastRecord[] = [
  {
    id: "bc-1", subject: "January Newsletter: Market Updates", body: "Dear Investors, Here is your January update...",
    channels: ["email", "push"], recipientFilter: "all", recipientCount: 8, batchSize: 100,
    status: "completed", progress: 100, sentCount: 8, failedCount: 0, createdAt: "2025-01-20T09:45:00Z",
  },
  {
    id: "bc-2", subject: "New Property Alert: Marina Bay Residences", body: "Exciting new investment opportunity...",
    channels: ["email", "sms", "push"], recipientFilter: "active", recipientCount: 6, batchSize: 50,
    status: "completed", progress: 100, sentCount: 6, failedCount: 0, createdAt: "2025-01-18T13:30:00Z",
  },
];

export const SEED_VIP_TIERS: Record<string, VipTierRecord> = {
  "user-1": {
    userId: "user-1", tier: "gold", points: 15200, totalPointsEarned: 22500,
    currentBenefits: ["Reduced fees", "Priority support", "Early access", "Quarterly reports"],
    nextTier: "platinum", pointsToNextTier: 4800, memberSince: "2024-01-01T00:00:00Z", lastTierUpdate: "2024-09-15T00:00:00Z",
  },
};

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
