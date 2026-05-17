import type { OverpassResponse, ParkingSpot, GeocodedLocation } from "@/types";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter", // fallback
];

function buildQuery(lat: number, lon: number, radius: number): string {
  // Query both confirmed wheelchair spots AND spots with disabled capacity
  // Falls back to all parking if neither tag exists (flagged as unknown)
  return `[out:json][timeout:25];
(
  nwr["amenity"="parking"]["wheelchair"="yes"](around:${radius},${lat},${lon});
  nwr["amenity"="parking"]["wheelchair"="limited"](around:${radius},${lat},${lon});
  nwr["amenity"="parking"]["capacity:disabled"~"^[1-9][0-9]*$"](around:${radius},${lat},${lon});
);
out center ${Math.min(30, Math.ceil(radius / 20))};`;
}

function buildFallbackQuery(lat: number, lon: number, radius: number): string {
  // Used when the primary query returns 0 results — shows all parking
  return `[out:json][timeout:25];
nwr["amenity"="parking"](around:${radius},${lat},${lon});
out center 20;`;
}

function parseTag(tags: Record<string, string>): Partial<ParkingSpot> {
  const fee = tags["fee"];
  const lit = tags["lit"];
  const covered = tags["covered"];

  return {
    name:
      tags["name"] ||
      tags["operator"] ||
      tags["brand"] ||
      "Unnamed Parking",
    wheelchair: (["yes", "limited", "no"].includes(tags["wheelchair"])
      ? tags["wheelchair"]
      : "unknown") as ParkingSpot["wheelchair"],
    capacity_disabled: tags["capacity:disabled"]
      ? parseInt(tags["capacity:disabled"], 10) || null
      : null,
    surface: tags["surface"] ?? null,
    fee: fee === "yes" ? true : fee === "no" ? false : null,
    covered: covered === "yes" ? true : covered === "no" ? false : null,
    lit: lit === "yes" ? true : lit === "no" ? false : null,
    access: tags["access"] ?? null,
  };
}

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30000),
      });

      if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
      return (await resp.json()) as OverpassResponse;
    } catch (err) {
      lastError = err as Error;
      // Try next endpoint
    }
  }

  throw lastError ?? new Error("All Overpass endpoints failed");
}

export async function queryWheelchairParking(
  location: GeocodedLocation,
  radius: number
): Promise<{ spots: ParkingSpot[]; fallback_used: boolean }> {
  const { lat, lon } = location;

  let data = await fetchOverpass(buildQuery(lat, lon, radius));
  let fallback_used = false;

  // If nothing found, widen to all parking (unknown accessibility)
  if (data.elements.length === 0) {
    data = await fetchOverpass(buildFallbackQuery(lat, lon, radius * 2));
    fallback_used = true;
  }

  const spots: ParkingSpot[] = data.elements
    .filter((el) => el.tags) // skip untagged elements
    .map((el) => {
      const coords =
        el.lat && el.lon
          ? { lat: el.lat, lon: el.lon }
          : el.center ?? { lat, lon };

      const parsed = parseTag(el.tags!);

      // Distance from query center (Haversine approximation)
      const dlat = ((coords.lat - lat) * Math.PI) / 180;
      const dlon = ((coords.lon - lon) * Math.PI) / 180;
      const a =
        Math.sin(dlat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((coords.lat * Math.PI) / 180) *
          Math.sin(dlon / 2) ** 2;
      const distance_m = Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));

      return {
        osm_id: String(el.id),
        osm_type: el.type,
        loc: { type: "Point", coordinates: [coords.lon, coords.lat] },
        report_flags: 0,
        ...parsed,
        distance_m,
      } as ParkingSpot;
    })
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));

  return { spots, fallback_used };
}
