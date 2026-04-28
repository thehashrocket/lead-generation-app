export type SearchResultOrg = {
  id: string;
  ein: string;
  name: string;
  nteeCode: string | null;
  state: string | null;
  city?: string | null;
  website?: string | null;
  totalRevenue: string | null;
  propublicaUrl: string | null;
  missionText: string | null;
};

export type SearchFiltersState = {
  q: string;
  nteeCode: string;
  state: string;
};
