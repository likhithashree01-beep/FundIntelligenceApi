export interface FundMetrics {
  irr: number;
  tvpi: number;
  dpi: number;
  rvpi: number;
  nav: number;
}

export interface NavPoint {
  month: string;
  nav: number;
}

export interface PortfolioCompany {
  id: string;
  name: string;
  sector: string;
  country: string;
  revenue: number;
  ebitda: number;
  ebitdaMargin: number;
  status: string;
  investmentDate: string;
  investedCapital: number;
  currentValue: number;
  flags: string[];
}

export interface FundSummary {
  id: string;
  name: string;
  type: string;
  vintage: number;
  totalCommitments: number;
  metrics: FundMetrics;
}

export interface FundDetail extends FundSummary {
  navHistory: NavPoint[];
  portfolioCompanies: PortfolioCompany[];
}

export interface SeedDataset {
  funds: FundDetail[];
}

export interface JwtPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
}
