export type RawSearchItem = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  adult?: boolean;
  profile_path?: string | null;
  known_for_department?: string;
  known_for?: RawSearchItem[];
};

export type RawCredit = RawSearchItem & {
  character?: string;
  job?: string;
  department?: string;
  popularity?: number;
};

export type RawVideo = {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
};

export type RawWatchProvider = {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
};

export type RawRegionProviders = {
  link?: string;
  flatrate?: RawWatchProvider[];
  free?: RawWatchProvider[];
  ads?: RawWatchProvider[];
  rent?: RawWatchProvider[];
  buy?: RawWatchProvider[];
};

export type RawTitleDetails = RawSearchItem & {
  runtime?: number | null;
  episode_run_time?: number[];
  genres?: Array<{ name?: string }>;
  spoken_languages?: Array<{ english_name?: string; name?: string }>;
  original_language?: string;
  tagline?: string;
  status?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  created_by?: Array<{ id: number; name: string }>;
  credits?: { cast?: RawCredit[]; crew?: RawCredit[] };
  external_ids?: { imdb_id?: string | null };
  recommendations?: { results?: RawSearchItem[] };
  videos?: { results?: RawVideo[] };
  "watch/providers"?: { results?: Record<string, RawRegionProviders> };
};

export type RawPersonDetails = {
  id: number;
  name?: string;
  profile_path?: string | null;
  known_for_department?: string;
  biography?: string;
  combined_credits?: { cast?: RawCredit[]; crew?: RawCredit[] };
};
