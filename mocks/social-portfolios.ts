export interface TopInvestor {
  id: string;
  displayName: string;
  avatar: string;
  tier: string;
  totalReturn: number;
  totalReturnPercent: number;
  holdingsCount: number;
  followerCount: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  strategy: string;
  topHoldings: TopHolding[];
  monthlyReturn: number;
  yearlyReturn: number;
  joinedDate: string;
}

export interface TopHolding {
  propertyName: string;
  allocation: number;
  returnPercent: number;
  propertyType: string;
}

export const topInvestors: TopInvestor[] = [
  {
    id: 'inv-1',
    displayName: 'Eagle Capital',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100',
    tier: 'Platinum',
    totalReturn: 142500,
    totalReturnPercent: 18.5,
    holdingsCount: 8,
    followerCount: 1247,
    riskLevel: 'moderate',
    strategy: 'Diversified Global RE',
    topHoldings: [
      { propertyName: 'Marina Bay Residences', allocation: 30, returnPercent: 12.4, propertyType: 'Residential' },
      { propertyName: 'Manhattan Office Tower', allocation: 25, returnPercent: 8.2, propertyType: 'Commercial' },
      { propertyName: 'Paris Retail Complex', allocation: 20, returnPercent: 15.1, propertyType: 'Commercial' },
      { propertyName: 'London Luxury Flats', allocation: 15, returnPercent: 9.8, propertyType: 'Residential' },
    ],
    monthlyReturn: 3.2,
    yearlyReturn: 18.5,
    joinedDate: '2023-03-15',
  },
  {
    id: 'inv-2',
    displayName: 'Urban Yield Fund',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100',
    tier: 'Gold',
    totalReturn: 87300,
    totalReturnPercent: 14.2,
    holdingsCount: 5,
    followerCount: 892,
    riskLevel: 'conservative',
    strategy: 'High-Yield Commercial',
    topHoldings: [
      { propertyName: 'Manhattan Office Tower', allocation: 40, returnPercent: 8.2, propertyType: 'Commercial' },
      { propertyName: 'Paris Retail Complex', allocation: 35, returnPercent: 15.1, propertyType: 'Commercial' },
      { propertyName: 'Tokyo Mixed-Use Tower', allocation: 25, returnPercent: 11.3, propertyType: 'Mixed' },
    ],
    monthlyReturn: 2.1,
    yearlyReturn: 14.2,
    joinedDate: '2023-06-01',
  },
  {
    id: 'inv-3',
    displayName: 'Apex Ventures',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100',
    tier: 'Platinum',
    totalReturn: 215800,
    totalReturnPercent: 22.1,
    holdingsCount: 12,
    followerCount: 2340,
    riskLevel: 'aggressive',
    strategy: 'Growth Opportunities',
    topHoldings: [
      { propertyName: 'Singapore Tech Hub', allocation: 35, returnPercent: 19.8, propertyType: 'Commercial' },
      { propertyName: 'Tokyo Mixed-Use Tower', allocation: 25, returnPercent: 11.3, propertyType: 'Mixed' },
      { propertyName: 'Marina Bay Residences', allocation: 20, returnPercent: 12.4, propertyType: 'Residential' },
      { propertyName: 'London Luxury Flats', allocation: 20, returnPercent: 9.8, propertyType: 'Residential' },
    ],
    monthlyReturn: 4.1,
    yearlyReturn: 22.1,
    joinedDate: '2023-01-10',
  },
  {
    id: 'inv-4',
    displayName: 'Horizon RE',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
    tier: 'Gold',
    totalReturn: 63200,
    totalReturnPercent: 11.8,
    holdingsCount: 4,
    followerCount: 564,
    riskLevel: 'conservative',
    strategy: 'Stable Income Focus',
    topHoldings: [
      { propertyName: 'London Luxury Flats', allocation: 40, returnPercent: 9.8, propertyType: 'Residential' },
      { propertyName: 'Marina Bay Residences', allocation: 35, returnPercent: 12.4, propertyType: 'Residential' },
      { propertyName: 'Manhattan Office Tower', allocation: 25, returnPercent: 8.2, propertyType: 'Commercial' },
    ],
    monthlyReturn: 1.8,
    yearlyReturn: 11.8,
    joinedDate: '2023-08-20',
  },
  {
    id: 'inv-5',
    displayName: 'Global Alpha',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
    tier: 'Silver',
    totalReturn: 38900,
    totalReturnPercent: 16.3,
    holdingsCount: 6,
    followerCount: 421,
    riskLevel: 'moderate',
    strategy: 'Balanced Growth',
    topHoldings: [
      { propertyName: 'Paris Retail Complex', allocation: 30, returnPercent: 15.1, propertyType: 'Commercial' },
      { propertyName: 'Tokyo Mixed-Use Tower', allocation: 30, returnPercent: 11.3, propertyType: 'Mixed' },
      { propertyName: 'Marina Bay Residences', allocation: 25, returnPercent: 12.4, propertyType: 'Residential' },
      { propertyName: 'Singapore Tech Hub', allocation: 15, returnPercent: 19.8, propertyType: 'Commercial' },
    ],
    monthlyReturn: 2.8,
    yearlyReturn: 16.3,
    joinedDate: '2024-02-05',
  },
];
