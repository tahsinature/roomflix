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

export type RawCertificationResult = {
  iso_3166_1?: string;
  release_dates?: Array<{ certification?: string }>;
  rating?: string;
};

export type RawImage = {
  file_path?: string;
  width?: number;
  height?: number;
  aspect_ratio?: number;
  vote_average?: number;
  vote_count?: number;
};

export type RawImageCollection = {
  profiles?: RawImage[];
  backdrops?: RawImage[];
  posters?: RawImage[];
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
  seasons?: RawSeasonSummary[];
  created_by?: Array<{ id: number; name: string }>;
  credits?: { cast?: RawCredit[]; crew?: RawCredit[] };
  external_ids?: { imdb_id?: string | null };
  recommendations?: { results?: RawSearchItem[] };
  videos?: { results?: RawVideo[] };
  "watch/providers"?: { results?: Record<string, RawRegionProviders> };
  release_dates?: { results?: RawCertificationResult[] };
  content_ratings?: { results?: RawCertificationResult[] };
  images?: RawImageCollection;
};

export type RawSeasonSummary = {
  id: number;
  season_number?: number;
  name?: string;
  overview?: string;
  air_date?: string;
  episode_count?: number;
  poster_path?: string | null;
  vote_average?: number;
};

export type RawEpisodeDetails = {
  id: number;
  season_number?: number;
  episode_number?: number;
  name?: string;
  overview?: string;
  air_date?: string;
  runtime?: number | null;
  still_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  production_code?: string;
  crew?: RawCredit[];
  guest_stars?: RawCredit[];
  credits?: { cast?: RawCredit[]; crew?: RawCredit[] };
  external_ids?: { imdb_id?: string | null };
};

export type RawSeasonDetails = RawSeasonSummary & {
  episodes?: RawEpisodeDetails[];
};

export type RawPersonDetails = {
  id: number;
  name?: string;
  profile_path?: string | null;
  known_for_department?: string;
  biography?: string;
  combined_credits?: { cast?: RawCredit[]; crew?: RawCredit[] };
  images?: RawImageCollection;
};
