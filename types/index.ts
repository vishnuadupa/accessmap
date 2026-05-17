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

export interface RouteResult {
  distance_m: number;
  duration_s: number;
  geometry: string; // encoded polyline
  instructions: RouteInstruction[];
  cache_hit: boolean;
}

// ─── Gemini Parsed Intent ─────────────────────────────────────────────────────

export type SpotFilter = "covered" | "free" | "lit" | "near_elevator";

export interface ParsedIntent {
  location: string;
  radius_m: number;
  filters: SpotFilter[];
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

export interface FavoritesResponse {
  favorites: ParkingSpot[];
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
