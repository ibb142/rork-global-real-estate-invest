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

export const topInvestors: TopInvestor[] = [];
