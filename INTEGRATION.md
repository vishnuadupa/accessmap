# AccessMap — Frontend ↔ Backend Integration Guide

> Read this before starting integration. Backend is complete and on `master`.

---

## Backend is at: `a57004a` (master)

All 9 API endpoints are live, typed, and tested via TypeScript. Zero compilation errors.

---

## All API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/search` | Main search — intent → geocode → spots → narration |
| `POST` | `/api/route` | Wheelchair directions between two coords |
| `POST` | `/api/isochrone` | Wheelchair-reachable area polygon from a point |
| `GET` | `/api/spot/[id]` | Full spot detail + 30-day community report counts |
| `GET` | `/api/stats` | Community-wide verification stats |
| `GET` | `/api/history?session_id=` | Last 10 searches for this session |
| `POST` | `/api/favorite` | Save or remove a spot |
| `GET` | `/api/favorites?session_id=` | List saved spots with accessibility snapshot |
| `POST` | `/api/report` | Submit an accessibility report |

---

## Key Request / Response Contracts

### `POST /api/search`
```ts
// Request
{ query: string; session_id: string }

// Response
{
  spots: ParkingSpot[];
  narration: string;          // Gemini-generated 2-3 sentence summary
  geocoded: GeocodedLocation; // includes confidence + accuracy
  cache_hit: boolean;
  fallback_used: boolean;     // true = no accessible spots, showing all parking
  query_parsed: ParsedIntent; // includes van_mode, parking_type, filters
}
```

### `POST /api/route`
```ts
// Request
{ origin: [lat, lon]; destination: [lat, lon]; spot_id: string }

// Response
{
  distance_m: number;
  duration_s: number;
  geometry: string;           // encoded polyline — decode with polyline.js or leaflet
  instructions: { text: string; distance: number; duration: number }[];
  surface_summary: { label: string; percent: number }[]; // "cobblestone 38%"
  suitability_score: number | null; // 0-3, wheelchair route quality
  has_steps: boolean;         // TRUE = route has stairs, warn user loudly
  warnings: string[];         // ORS warning messages
  cache_hit: boolean;
}
```

### `POST /api/isochrone`
```ts
// Request
{ destination: [lat, lon]; range_minutes: number } // range_minutes 1-15

// Response — GeoJSON FeatureCollection
{
  type: "FeatureCollection";
  features: [{
    type: "Feature";
    geometry: { type: "Polygon"; coordinates: number[][][] };
    properties: { value: number; area: number };
  }];
  cache_hit: boolean;
}
```

### `GET /api/spot/[id]`
```ts
// Response
{
  spot: ParkingSpot;
  community: {
    confirmed_accessible: number;
    no_longer_accessible: number;
    blocked: number;
    damaged: number;
    not_accessible: number;
    confirmed_ok: number;
    total_verifications: number;
  }
}
```

### `POST /api/report`
```ts
// Request
{
  session_id: string;
  spot_id: string;             // osm_id of the spot
  status: "blocked" | "damaged" | "not_accessible" | "confirmed_ok"
        | "still_accessible" | "no_longer_accessible";
  note?: string;               // max 200 chars
}
// Response: { success: true }
```

### `POST /api/favorite`
```ts
// Request
{
  session_id: string;
  spot_id: string;
  action: "save" | "remove";
  spot_name?: string;
  spot_loc?: { type: "Point"; coordinates: [lon, lat] };
}
// Response: { success: true }
```

### `GET /api/favorites?session_id=`
```ts
// Response
{
  favorites: SavedFavorite[]; // includes wheelchair, van_accessible, parking_type, opening_hours, report_flags
}
```

---

## ParkingSpot — Full Shape

```ts
interface ParkingSpot {
  osm_id: string;
  osm_type: "node" | "way" | "relation";
  name: string;
  loc: { type: "Point"; coordinates: [lon, lat] };  // NOTE: [lon, lat] order
  wheelchair: "yes" | "limited" | "no" | "unknown";
  van_accessible: boolean | null;     // ← KEY DIFFERENTIATOR
  check_date_wheelchair: string | null; // OSM verification date "2024-03"
  verified_at: Date | null;           // crowd verification timestamp
  opening_hours: string | null;       // "Mo-Fr 08:00-20:00"
  parking_type: "surface" | "multi-storey" | "underground" | "rooftop" | "street_side" | "other" | null;
  maxstay: string | null;             // "2 hours"
  capacity_total: number | null;
  capacity_disabled: number | null;
  surface: string | null;
  fee: boolean | null;
  covered: boolean | null;
  lit: boolean | null;
  access: string | null;
  height: string | null;              // vehicle clearance "2.1m" — critical for vans
  ramp_wheelchair: boolean | null;    // ramp at entrance
  address: string | null;             // "42 Main St"
  level: string | null;               // floor in multi-storey
  report_flags: number;               // ≥3 = recent accessibility complaints
  distance_m?: number;                // from search centre
}
```

---

## GeocodedLocation — includes quality signals

```ts
interface GeocodedLocation {
  lat: number;
  lon: number;
  display_name: string;
  confidence: number | null; // < 0.5 = show "location may be imprecise" warning
  accuracy: "point" | "interpolated" | "centroid" | "street" | null;
}
```

---

## Frontend Priorities for Integration

### Must-haves (core value proposition)
1. **Van Accessible badge** — `van_accessible === true` → prominent green badge. This is the #1 feature no other app has.
2. **Steps warning** — `has_steps === true` on a route → red banner "⚠️ Route contains stairs — verify before travelling". Never suppress this.
3. **Height restriction warning** — `height !== null` and `parking_type === "underground"` → "⚠️ Height limit: 2.1m — check van clearance".
4. **Geocoding confidence** — `confidence < 0.5` → show "📍 Location may be approximate" under the search bar.
5. **Fallback banner** — `fallback_used === true` → "No confirmed accessible spots found — showing all nearby parking. Accessibility unverified."

### High value
6. **Verification age** — derive from `verified_at` or `check_date_wheelchair`. Green (<30d), yellow (30–180d), red (>180d or null).
7. **Parking type icon** — underground 🏢 / surface 🅿️ / rooftop 🏠 / garage 🏗
8. **Opening hours** — "Open now" / "Closes at 6pm" / "24/7" parsed from raw string.
9. **Surface bar on route** — horizontal bar showing surface breakdown `surface_summary`.
10. **Report buttons** — two tiers: quick ("Still Accessible" / "No Longer Accessible") and detailed ("Blocked" / "Damaged" / "Not Accessible").

### Session setup (localStorage)
```ts
// Generate once, persist forever — no login needed
const session_id = localStorage.getItem("session_id") 
  ?? (() => { const id = crypto.randomUUID(); localStorage.setItem("session_id", id); return id; })();
```

### Map notes (Leaflet)
- `loc.coordinates` is `[lon, lat]` — Leaflet uses `[lat, lon]`. Swap when placing markers.
- Use `dynamic import` with `ssr: false` for any Leaflet component — it breaks on SSR.
- Isochrone GeoJSON can go directly into `L.geoJSON(data)`.
- Route `geometry` is an encoded polyline — decode with `@mapbox/polyline` or `polyline` package.

---

## Environment Variables Needed

```env
GEMINI_API_KEY=       # Google AI Studio — free tier
ORS_API_KEY=          # openrouteservice.org — free tier 2000/day
MONGODB_URI=          # Atlas M0 connection string
```

---

## Rate Limits (stay aware during testing)

| API | Limit | Notes |
|-----|-------|-------|
| Gemini | 500 req/day, 10 req/min | 2 calls per search |
| ORS Directions | 2,000/day | cached 7 days |
| ORS Isochrones | 500/day | cached 7 days |
| Nominatim | 1 req/sec | fallback geocoder only |
| Overpass | no hard limit | cached 24 hours |
| MongoDB M0 | 512MB, 100 ops/sec | TTL indexes auto-clean |
