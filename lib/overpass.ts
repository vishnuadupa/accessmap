import type { OverpassResponse, ParkingSpot, GeocodedLocation } from "@/types";
import { stripDangerous } from "@/lib/gemini";

// Sanitize OSM tag string values before storing or using in prompts.
// OSM is public — anyone can set a parking spot name to injection content.
function sanitizeTag(value: string | undefined, maxLen = 100): string | null {
  if (!value) return null;
  return stripDangerous(value).slice(0, maxLen) || null;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter", // fallback
];

function buildQuery(lat: number, lon: number, radius: number): string {
  // Query wheelchair spots, disabled-capacity spots, AND van-accessible spots.
  // van:accessible and capacity:disabled:motorcar are the OSM tags for spots
  // with 132"+ aisle clearance required by ramp-equipped vans — not surfaced
  // by Apple Maps or Google Maps, which lump all accessible spots together.
  return `[out:json][timeout:25];
(
  nwr["amenity"="parking"]["wheelchair"="yes"](around:${radius},${lat},${lon});
  nwr["amenity"="parking"]["wheelchair"="limited"](around:${radius},${lat},${lon});
  nwr["amenity"="parking"]["capacity:disabled"~"^[1-9][0-9]*$"](around:${radius},${lat},${lon});
  nwr["amenity"="parking"]["capacity:disabled:motorcar"~"^[1-9][0-9]*$"](around:${radius},${lat},${lon});
  nwr["amenity"="parking"]["motorcar:disabled"="yes"](around:${radius},${lat},${lon});
);
out center ${Math.min(30, Math.ceil(radius / 20))};`;
}

function buildFallbackQuery(lat: number, lon: number, radius: number): string {
  // Used when the primary query returns 0 results — shows all parking
  return `[out:json][timeout:25];
nwr["amenity"="parking"](around:${radius},${lat},${lon});
out center 20;`;
}

function parseVanAccessible(tags: Record<string, string>): boolean | null {
  // Explicit van_accessible tag (custom but used in some regions)
  if (tags["van_accessible"] === "yes") return true;
  if (tags["van_accessible"] === "no") return false;
  // motorcar:disabled=yes signals van/motorized wheelchair accessible spot
  if (tags["motorcar:disabled"] === "yes") return true;
  // capacity:disabled:motorcar > 0 means at least one van-accessible space
  const vanCap = parseInt(tags["capacity:disabled:motorcar"] ?? "", 10);
  if (!isNaN(vanCap) && vanCap > 0 && vanCap < 10000) return true;
  return null;
}

// Validate OSM check_date:wheelchair values (format: YYYY, YYYY-MM, or YYYY-MM-DD)
const CHECK_DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function parseTag(tags: Record<string, string>): Partial<ParkingSpot> {
  const fee = tags["fee"];
  const lit = tags["lit"];
  const covered = tags["covered"];

  // Sanitize all string fields — OSM is public and any contributor can set arbitrary values
  const rawName =
    tags["name"] || tags["operator"] || tags["brand"] || "Unnamed Parking";
  const safeName = sanitizeTag(rawName, 100) ?? "Unnamed Parking";

  const capacityRaw = parseInt(tags["capacity:disabled"] ?? "", 10);

  // check_date:wheelchair = when a human last verified accessibility on the ground.
  // No major mapping app surfaces this — it's our key differentiator.
  const rawCheckDate = tags["check_date:wheelchair"] ?? tags["check_date"] ?? null;
  const check_date_wheelchair =
    rawCheckDate && CHECK_DATE_RE.test(rawCheckDate) ? rawCheckDate : null;

  return {
    name: safeName,
    wheelchair: (["yes", "limited", "no"].includes(tags["wheelchair"])
      ? tags["wheelchair"]
      : "unknown") as ParkingSpot["wheelchair"],
    van_accessible: parseVanAccessible(tags),
    check_date_wheelchair,
    verified_at: null,
    capacity_disabled:
      !isNaN(capacityRaw) && capacityRaw > 0 && capacityRaw < 10000
        ? capacityRaw
        : null,
    surface: sanitizeTag(tags["surface"], 50),
    fee: fee === "yes" ? true : fee === "no" ? false : null,
    covered: covered === "yes" ? true : covered === "no" ? false : null,
    lit: lit === "yes" ? true : lit === "no" ? false : null,
    access: sanitizeTag(tags["access"], 30),
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

  // Fix: validate geocoded coordinates are finite and in range before embedding
  // in Overpass QL. ORS/Nominatim are external — we can't assume valid output.
  if (
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    Math.abs(lat) > 90 || Math.abs(lon) > 180
  ) {
    throw new Error(`Invalid geocoded coordinates: lat=${lat}, lon=${lon}`);
  }

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
