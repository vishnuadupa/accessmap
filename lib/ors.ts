import type { RouteResult, RouteInstruction, SurfaceSegment, IsochroneResult, GeocodedLocation } from "@/types";

const ORS_BASE = "https://api.openrouteservice.org";
const API_KEY = process.env.ORS_API_KEY;

// ─── Geocoding ────────────────────────────────────────────────────────────────

export async function geocode(query: string): Promise<GeocodedLocation | null> {
  if (!API_KEY) {
    console.warn("ORS_API_KEY not set — geocoding will fail");
    return null;
  }

  const url = new URL(`${ORS_BASE}/geocode/search`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("text", query);
  url.searchParams.set("size", "1");

  try {
    const resp = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) throw new Error(`ORS geocode HTTP ${resp.status}`);

    const data = await resp.json();
    const feature = data?.features?.[0];
    if (!feature) return null;

    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

    const [lon, lat] = coordinates;
    if (typeof lat !== "number" || typeof lon !== "number") return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

    const props = feature.properties ?? {};

    const VALID_ACCURACY = ["point", "interpolated", "centroid", "street"];

    return {
      lat,
      lon,
      display_name: props.label ?? query,
      confidence: typeof props.confidence === "number" ? props.confidence : null,
      accuracy: VALID_ACCURACY.includes(props.accuracy) ? props.accuracy : null,
    };
  } catch {
    return null;
  }
}

// ─── Routing ──────────────────────────────────────────────────────────────────

async function fetchOrsRoute(
  profile: "wheelchair" | "foot-walking",
  origin: [number, number],
  destination: [number, number],
  apiKey: string
): Promise<RouteResult | null> {
  const body = {
    coordinates: [
      [origin[1], origin[0]],
      [destination[1], destination[0]],
    ],
    instructions: true,
    units: "m",
    extra_info: profile === "wheelchair" ? ["surface", "waytypes", "suitability"] : ["surface", "waytypes"],
  };

  const resp = await fetch(`${ORS_BASE}/v2/directions/${profile}/json`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`ORS ${profile} routing error ${resp.status}:`, errText.slice(0, 200));
    return null;
  }

  const data = await resp.json();
  const route = data?.routes?.[0];
  if (!route) return null;

  const summary = route.summary;
  const steps: RouteInstruction[] = (route.segments?.[0]?.steps ?? []).map(
    (s: { instruction: string; distance: number; duration: number }) => ({
      text: s.instruction,
      distance: Math.round(s.distance),
      duration: Math.round(s.duration),
    })
  );

  return {
    distance_m: Math.round(summary.distance),
    duration_s: Math.round(summary.duration),
    geometry: route.geometry,
    instructions: steps,
    cache_hit: false,
    surface_summary: parseSurfaceSummary(data.extras?.surface?.summary ?? []),
    suitability_score: profile === "wheelchair"
      ? parseSuitabilityScore(data.extras?.suitability?.summary ?? [])
      : null,
    has_steps: parseHasSteps(data.extras?.waytypes?.summary ?? []),
    warnings: parseWarnings(route.warnings ?? []),
  };
}

export async function getWheelchairRoute(
  origin: [number, number], // [lat, lon]
  destination: [number, number]
): Promise<RouteResult | null> {
  if (!API_KEY) {
    console.warn("ORS_API_KEY not set — routing will fail");
    return null;
  }

  try {
    // Try wheelchair profile first — gives suitability + surface data
    const result = await fetchOrsRoute("wheelchair", origin, destination, API_KEY);
    if (result) return result;

    // Wheelchair profile failed (common in US where OSM lacks sidewalk coverage).
    // Fall back to foot-walking so users get at least a walking route with a warning.
    console.warn("[ors] wheelchair profile failed, falling back to foot-walking");
    const fallback = await fetchOrsRoute("foot-walking", origin, destination, API_KEY);
    if (!fallback) return null;

    return {
      ...fallback,
      warnings: [
        "Wheelchair-specific routing unavailable for this area — showing walking route. Verify accessibility before travelling.",
        ...fallback.warnings,
      ],
    };
  } catch (err) {
    console.error("ORS routing exception:", err);
    return null;
  }
}

// ─── ORS surface/suitability parsers ─────────────────────────────────────────

// ORS surface codes → human labels
// https://giscience.github.io/openrouteservice/documentation/extra-info/Surface
const SURFACE_LABELS: Record<number, string> = {
  0: "unknown", 1: "paved", 2: "unpaved", 3: "asphalt", 4: "concrete",
  5: "cobblestone", 6: "metal", 7: "wood", 8: "compacted gravel",
  9: "fine gravel", 10: "gravel", 11: "dirt", 12: "ground",
  13: "ice", 14: "paving stones", 15: "sand", 17: "grass",
};

function parseSurfaceSummary(
  summary: { value: number; distance: number; amount: number }[]
): SurfaceSegment[] {
  return summary
    .filter((s) => s.value !== 0 && s.amount > 1) // skip unknown + tiny slivers
    .map((s) => ({
      label: SURFACE_LABELS[s.value] ?? "other",
      percent: Math.round(s.amount),
    }))
    .sort((a, b) => b.percent - a.percent);
}

function parseSuitabilityScore(
  summary: { value: number; distance: number; amount: number }[]
): number | null {
  if (summary.length === 0) return null;
  // Weighted average of suitability values (0-3) by distance share
  const total = summary.reduce((acc, s) => acc + s.amount, 0);
  if (total === 0) return null;
  const weighted = summary.reduce((acc, s) => acc + s.value * s.amount, 0);
  return Math.round((weighted / total) * 10) / 10;
}

// ORS waytype code 5 = steps — if present anywhere on the route, wheelchair
// users cannot complete it regardless of suitability score
function parseHasSteps(
  summary: { value: number; distance: number; amount: number }[]
): boolean {
  return summary.some((s) => s.value === 5 && s.distance > 0);
}

function parseWarnings(warnings: { code: number; message: string }[]): string[] {
  if (!Array.isArray(warnings)) return [];
  return warnings
    .filter((w) => w.message && typeof w.message === "string")
    .map((w) => String(w.message).slice(0, 200));
}

// ─── Isochrone API ────────────────────────────────────────────────────────────

export async function getIsochrone(
  destination: [number, number], // [lat, lon]
  range_seconds = 300            // default: 5-minute wheelchair roll
): Promise<IsochroneResult | null> {
  if (!API_KEY) {
    console.warn("ORS_API_KEY not set — isochrone will fail");
    return null;
  }

  const body = {
    locations: [[destination[1], destination[0]]], // ORS expects [lon, lat]
    range: [range_seconds],
    range_type: "time",
    attributes: ["area"],
  };

  try {
    const resp = await fetch(`${ORS_BASE}/v2/isochrones/wheelchair`, {
      method: "POST",
      headers: {
        Authorization: API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      console.error("ORS isochrone error:", resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    return { ...data, cache_hit: false } as IsochroneResult;
  } catch (err) {
    console.error("ORS isochrone exception:", err);
    return null;
  }
}

// ─── Nominatim fallback geocoder ──────────────────────────────────────────────

export async function geocodeFallback(
  query: string
): Promise<GeocodedLocation | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        // Nominatim policy requires a valid User-Agent identifying your app
        "User-Agent": "AccessMap/1.0 (accessmap.vercel.app)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data?.[0]) return null;

    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      display_name: data[0].display_name,
      // Nominatim doesn't expose ORS-style confidence/accuracy
      confidence: null,
      accuracy: null,
    };
  } catch {
    return null;
  }
}
