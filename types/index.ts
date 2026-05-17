// ─── Parking Spot ────────────────────────────────────────────────────────────

export type WheelchairStatus = "yes" | "limited" | "no" | "unknown";

export interface GeoPoint {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

export interface ParkingSpot {
  _id?: string;
  osm_id: string;
  osm_type: "node" | "way" | "relation";
  name: string;
  loc: GeoPoint;
  wheelchair: WheelchairStatus;
  capacity_disabled: number | null;
  // van_accessible: true = 132"+ aisle/rear access for ramp-equipped vans
  // false = standard 96" accessible only, null = unknown
  van_accessible: boolean | null;
  // ISO date string from OSM check_date:wheelchair tag (e.g. "2024-03")
  check_date_wheelchair: string | null;
  // Last time a user confirmed/denied accessibility via crowd report
  verified_at: Date | null;
  // Raw OSM opening_hours string (e.g. "Mo-Fr 08:00-20:00; PH off")
  opening_hours: string | null;
  // OSM parking tag: surface lot, garage, underground, rooftop
  parking_type: "surface" | "multi-storey" | "underground" | "rooftop" | "street_side" | "other" | null;
  // Max stay allowed (e.g. "2 hours", "disabled only", "unlimited")
  maxstay: string | null;
  // Total capacity of the lot (context for congestion)
  capacity_total: number | null;
  surface: string | null;
  fee: boolean | null;
  covered: boolean | null;
  lit: boolean | null;
  access: string | null;
  report_flags: number;
  cached_at?: Date;
  cache_key?: string;
  // computed at query time
  distance_m?: number;
}

// ─── Routing ─────────────────────────────────────────────────────────────────

export interface RouteInstruction {
  text: string;
  distance: number;
  duration: number;
}

export interface SurfaceSegment {
  label: string;   // "asphalt", "gravel", "cobblestone", etc.
  percent: number; // 0-100 share of total route distance
}

export interface RouteResult {
  distance_m: number;
  duration_s: number;
  geometry: string; // encoded polyline
  instructions: RouteInstruction[];
  cache_hit: boolean;
  // ORS extra_info: surface breakdown (% of route by surface type)
  surface_summary: SurfaceSegment[];
  // ORS suitability: 0=unsuitable 1=very uncomfortable 2=OK 3=great
  suitability_score: number | null;
}

export interface IsochroneResult {
  // GeoJSON FeatureCollection — polygon of wheelchair-reachable area
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Polygon"; coordinates: number[][][] };
    properties: { value: number; area: number };
  }[];
  cache_hit: boolean;
}

// ─── Gemini Parsed Intent ─────────────────────────────────────────────────────

export type SpotFilter = "covered" | "free" | "lit" | "near_elevator" | "open_now" | "no_time_limit";

export interface ParsedIntent {
  location: string;
  radius_m: number;
  filters: SpotFilter[];
  // Preferred parking structure type from user query ("indoor", "garage", etc.)
  parking_type: "surface" | "multi-storey" | "underground" | "rooftop" | null;
  // true when user mentions van, ramp, power chair — prioritize van_accessible spots
  van_mode: boolean;
  ambiguous: boolean;
}

// ─── Geocoding ───────────────────────────────────────────────────────────────

export interface GeocodedLocation {
  lat: number;
  lon: number;
  display_name: string;
}

// ─── API Request / Response shapes ───────────────────────────────────────────

export interface SearchRequest {
  query: string;
  session_id: string;
}

export interface SearchResponse {
  spots: ParkingSpot[];
  narration: string;
  geocoded: GeocodedLocation;
  cache_hit: boolean;
  fallback_used: boolean; // true = 0 accessible spots found, showing all parking instead
  query_parsed: ParsedIntent;
  error?: string;
}

export interface RouteRequest {
  origin: [number, number]; // [lat, lon]
  destination: [number, number]; // [lat, lon]
  spot_id: string;
}

export interface FavoriteRequest {
  session_id: string;
  spot_id: string;
  action: "save" | "remove";
}

export interface ReportRequest {
  session_id: string;
  spot_id: string;
  status: "blocked" | "damaged" | "not_accessible" | "confirmed_ok" | "still_accessible" | "no_longer_accessible";
  note?: string;
}

export interface SavedFavorite {
  _id: string;
  spot_id: string;
  spot_name: string;
  spot_loc: GeoPoint;
  wheelchair: WheelchairStatus | null;
  van_accessible: boolean | null;
  parking_type: ParkingSpot["parking_type"];
  opening_hours: string | null;
  report_flags: number;
  saved_at: Date;
}

export interface FavoritesResponse {
  favorites: SavedFavorite[];
}

// ─── Overpass raw response ────────────────────────────────────────────────────

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}
