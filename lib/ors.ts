import type { RouteResult, GeocodedLocation } from "@/types";

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

    const [lon, lat] = feature.geometry.coordinates;
    return {
      lat,
      lon,
      display_name: feature.properties?.label ?? query,
    };
  } catch {
    return null;
  }
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export async function getWheelchairRoute(
  origin: [number, number], // [lat, lon]
  destination: [number, number]
): Promise<RouteResult | null> {
  if (!API_KEY) {
    console.warn("ORS_API_KEY not set — routing will fail");
    return null;
  }

  // ORS expects [lon, lat]
  const body = {
    coordinates: [
      [origin[1], origin[0]],
      [destination[1], destination[0]],
    ],
    instructions: true,
    units: "m",
  };

  try {
    const resp = await fetch(
      `${ORS_BASE}/v2/directions/wheelchair/json`,
      {
        method: "POST",
        headers: {
          Authorization: API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      console.error("ORS routing error:", err);
      return null;
    }

    const data = await resp.json();
    const route = data?.routes?.[0];
    if (!route) return null;

    const summary = route.summary;
    const steps: { text: string; distance: number; duration: number }[] =
      (route.segments?.[0]?.steps ?? []).map(
        (s: { instruction: string; distance: number; duration: number }) => ({
          text: s.instruction,
          distance: Math.round(s.distance),
          duration: Math.round(s.duration),
        })
      );

    return {
      distance_m: Math.round(summary.distance),
      duration_s: Math.round(summary.duration),
      geometry: route.geometry, // encoded polyline
      instructions: steps,
      cache_hit: false,
    };
  } catch (err) {
    console.error("ORS routing exception:", err);
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
    };
  } catch {
    return null;
  }
}
