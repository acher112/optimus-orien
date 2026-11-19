/**
 * TypeScript Interfaces for Public Directory & Campus Leaderboard ("Find a School")
 */

export interface PublicCampusCardData {
  slug: string;
  display_name: string;
  tagline: string;
  logo_url: string;
  country: string;
  province: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  boards: string[];
  levels: string[];
  gender_type: 'co-ed' | 'boys' | 'girls';
  medium: 'english' | 'urdu' | 'bilingual';
  established_year: number | null;
  facilities?: string[];
  admission_status: 'open' | 'closed';
  principal_name: string | null;
  principal_display?: string;
  principal_title: string | null;
  location_display?: string;
  contact_mode: 'enquiry_only' | 'official_contact' | 'principal_direct';
  rank_display_mode: 'exact_rank' | 'tier_only' | 'unranked_listing';
  score: number | null;
  average_display?: string;
  performance_display?: string;
  band: string;
  rank_overall: number | null;
  rank_city: number | null;
  rank_tier: string;
  score_delta: number | null;
  is_eligible: boolean;
  updated_at: string;
}

export interface PublicCampusDetailData extends PublicCampusCardData {
  about: string;
  facilities: string[];
  website: string;
  social_links: Record<string, string>;
  history: Array<{
    period_name: string;
    academic_year: string;
    aqi_score: number | null;
    band: string;
    rank_overall: number | null;
    score_delta: number | null;
    generated_at: string;
  }>;
  honesty_statement_url: string;
  methodology_url: string;
}

export interface RevealedContactInfo {
  contact_mode: string;
  official_phone: string;
  official_email: string;
  principal_direct_phone: string;
  principal_direct_email: string;
}

export interface MethodologyConfigData {
  title: string;
  honesty_statement: string;
  eligibility_criteria: {
    min_active_students: number;
    min_published_assessments: number;
    min_subjects_covered: number;
    data_freshness_months: number;
    enquiry_retention_days: number;
  };
  bands: Array<{
    label: string;
    range: string;
  }>;
  tie_breaking_policy: string;
}
