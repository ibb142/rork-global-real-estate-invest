import { Property } from '@/types';

const generatePriceHistory = (basePrice: number, days: number) => {
  const history = [];
  let price = basePrice * 0.9;
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const change = (Math.random() - 0.45) * basePrice * 0.02;
    price = Math.max(basePrice * 0.8, Math.min(basePrice * 1.3, price + change));
    const volume = Math.floor(Math.random() * 50000) + 10000;
    history.push({
      date: date.toISOString(),
      price: Math.round(price * 100) / 100,
      volume,
    });
  }
  return history;
};

export const properties: Property[] = [
  {
    id: '1',
    name: 'Marina Bay Residences',
    location: '123 Marina Boulevard',
    city: 'Dubai',
    country: 'UAE',
    images: [],
    pricePerShare: 52.40,
    totalShares: 100000,
    availableShares: 35000,
    minInvestment: 1,
    targetRaise: 5240000,
    currentRaise: 3406000,
    yield: 8.5,
    capRate: 6.2,
    irr: 14.5,
    occupancy: 96,
    propertyType: 'residential',
    status: 'live',
    riskLevel: 'medium',
    description: 'Luxury waterfront residential complex featuring 200 premium apartments with stunning marina views. Prime location in Dubai Marina with direct beach access.',
    highlights: [
      'Prime waterfront location',
      'Fully leased with 96% occupancy',
      'AAA tenant mix',
      'Recent renovations completed',
    ],
    documents: [
      { id: '1', name: 'Property Title', type: 'title', url: '#' },
      { id: '2', name: 'Appraisal Report 2024', type: 'appraisal', url: '#' },
      { id: '3', name: 'Insurance Certificate', type: 'insurance', url: '#' },
    ],
    distributions: [
      { id: '1', date: '2024-12-01', amount: 0.44, type: 'dividend' },
      { id: '2', date: '2024-09-01', amount: 0.42, type: 'dividend' },
      { id: '3', date: '2024-06-01', amount: 0.41, type: 'dividend' },
    ],
    priceHistory: generatePriceHistory(52.40, 365),
    createdAt: '2024-01-15T00:00:00Z',
    closingDate: '2025-03-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'Manhattan Office Tower',
    location: '500 Fifth Avenue',
    city: 'New York',
    country: 'USA',
    images: [],
    pricePerShare: 125.00,
    totalShares: 200000,
    availableShares: 80000,
    minInvestment: 1,
    targetRaise: 25000000,
    currentRaise: 15000000,
    yield: 6.8,
    capRate: 5.5,
    irr: 12.2,
    occupancy: 92,
    propertyType: 'commercial',
    status: 'live',
    riskLevel: 'low',
    description: 'Class A office building in the heart of Midtown Manhattan. 45-story tower with premium finishes and Fortune 500 tenants.',
    highlights: [
      'Class A office space',
      'Fortune 500 tenant base',
      'LEED Gold certified',
      '10-year average lease term',
    ],
    documents: [
      { id: '1', name: 'Property Title', type: 'title', url: '#' },
      { id: '2', name: 'Appraisal Report 2024', type: 'appraisal', url: '#' },
    ],
    distributions: [
      { id: '1', date: '2024-12-01', amount: 0.85, type: 'dividend' },
      { id: '2', date: '2024-09-01', amount: 0.82, type: 'dividend' },
    ],
    priceHistory: generatePriceHistory(125.00, 365),
    createdAt: '2024-02-01T00:00:00Z',
    closingDate: '2025-04-15T00:00:00Z',
  },
  {
    id: '3',
    name: 'London Luxury Flats',
    location: 'Kensington High Street',
    city: 'London',
    country: 'UK',
    images: [],
    pricePerShare: 78.50,
    totalShares: 150000,
    availableShares: 0,
    minInvestment: 1,
    targetRaise: 11775000,
    currentRaise: 11775000,
    yield: 5.2,
    capRate: 4.8,
    irr: 11.5,
    occupancy: 100,
    propertyType: 'residential',
    status: 'funded',
    riskLevel: 'low',
    description: 'Premium residential development in prestigious Kensington. 50 luxury flats with concierge service and private gardens.',
    highlights: [
      'Prime Kensington location',
      '100% occupancy rate',
      'High-net-worth tenants',
      'Heritage building status',
    ],
    documents: [],
    distributions: [
      { id: '1', date: '2024-12-01', amount: 0.34, type: 'dividend' },
    ],
    priceHistory: generatePriceHistory(78.50, 365),
    createdAt: '2023-06-01T00:00:00Z',
    closingDate: '2023-12-01T00:00:00Z',
  },
  {
    id: '4',
    name: 'Singapore Tech Hub',
    location: 'One-North Business Park',
    city: 'Singapore',
    country: 'Singapore',
    images: [],
    pricePerShare: 95.00,
    totalShares: 120000,
    availableShares: 120000,
    minInvestment: 1,
    targetRaise: 11400000,
    currentRaise: 0,
    yield: 7.2,
    capRate: 5.8,
    irr: 13.8,
    occupancy: 88,
    propertyType: 'commercial',
    status: 'coming_soon',
    riskLevel: 'medium',
    description: 'State-of-the-art tech campus in Singapore\'s premier innovation district. Home to leading tech companies and startups.',
    highlights: [
      'Tech-focused tenant base',
      'Green building certified',
      'Flexible workspace options',
      'Premium amenities',
    ],
    documents: [],
    distributions: [],
    priceHistory: generatePriceHistory(95.00, 30),
    createdAt: '2024-12-01T00:00:00Z',
    closingDate: '2025-06-01T00:00:00Z',
  },
  {
    id: '5',
    name: 'Paris Retail Complex',
    location: 'Champs-Élysées',
    city: 'Paris',
    country: 'France',
    images: [],
    pricePerShare: 185.00,
    totalShares: 80000,
    availableShares: 25000,
    minInvestment: 1,
    targetRaise: 14800000,
    currentRaise: 10175000,
    yield: 5.8,
    capRate: 4.5,
    irr: 10.8,
    occupancy: 98,
    propertyType: 'commercial',
    status: 'live',
    riskLevel: 'low',
    description: 'Iconic retail destination on the world\'s most famous avenue. Luxury brand tenants with long-term leases.',
    highlights: [
      'Champs-Élysées location',
      'Luxury brand tenants',
      '15-year average lease',
      'Trophy asset',
    ],
    documents: [
      { id: '1', name: 'Property Title', type: 'title', url: '#' },
    ],
    distributions: [
      { id: '1', date: '2024-12-01', amount: 1.07, type: 'dividend' },
    ],
    priceHistory: generatePriceHistory(185.00, 365),
    createdAt: '2024-03-01T00:00:00Z',
    closingDate: '2025-05-01T00:00:00Z',
  },
  {
    id: '6',
    name: 'Tokyo Mixed-Use Tower',
    location: 'Shibuya District',
    city: 'Tokyo',
    country: 'Japan',
    images: [],
    pricePerShare: 68.00,
    totalShares: 180000,
    availableShares: 72000,
    minInvestment: 1,
    targetRaise: 12240000,
    currentRaise: 7344000,
    yield: 6.5,
    capRate: 5.2,
    irr: 12.5,
    occupancy: 94,
    propertyType: 'mixed',
    status: 'live',
    riskLevel: 'medium',
    description: 'Modern mixed-use development in trendy Shibuya. Retail, office, and residential spaces in Tokyo\'s youth culture hub.',
    highlights: [
      'Prime Shibuya location',
      'Mixed-use diversification',
      'Strong foot traffic',
      'Tech-savvy tenant mix',
    ],
    documents: [],
    distributions: [],
    priceHistory: generatePriceHistory(68.00, 365),
    createdAt: '2024-04-15T00:00:00Z',
    closingDate: '2025-07-01T00:00:00Z',
  },
];

export const getPropertyById = (id: string): Property | undefined => {
  return properties.find(p => p.id === id);
};

export const getLiveProperties = (): Property[] => {
  return properties.filter(p => p.status === 'live');
};

export const getFundedProperties = (): Property[] => {
  return properties.filter(p => p.status === 'funded');
};

export const getComingSoonProperties = (): Property[] => {
  return properties.filter(p => p.status === 'coming_soon');
};
