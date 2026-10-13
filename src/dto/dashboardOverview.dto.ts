export interface DashboardOverviewTotalsOutDto {
  visits: number;
  chatUsed: number;
  faqViews: number;
  newsViews: number;
  involvementRate: number;
}

export interface DashboardOverviewProjectOutDto {
  apiKeyId: string;
  label: string;
  status: string;
  visits: number;
  chatUsed: number;
}

export interface DashboardOverviewOutDto {
  from: string;
  to: string;
  lookbackDays: number;
  totals: DashboardOverviewTotalsOutDto;
  projects: DashboardOverviewProjectOutDto[];
  hottestApiKeyId: string | null;
}
