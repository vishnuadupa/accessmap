import type { OverpassResponse, ParkingSpot, GeocodedLocation } from "@/types";
import { stripDangerous } from "@/lib/gemini";

// Sanitize OSM tag string values before storing or using in prompts.
// OSM is public — anyone can set a parking spot name to injection content.
function sanitizeTag(value: string | undefined, maxLen = 100): string | null {
  if (!value) return null;
  return stripDangerous(value).slice(0, maxLen) || null;
}

// Only endpoints with verified global OSM coverage.
// Removed: overpass.osm.ch (Swiss mirror — returns 200 with 0 elements for non-Swiss queries),
//          maps.mail.ru (403 from Vercel IPs), overpass.openstreetmap.ru / overpass.private.coffee (timeouts).
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

function buildQuery(lat: number, lon: number, radius: number): string {
  // Query wheelchair spots, disabled-capacity spots, AND van-accessible spots.
  // van:accessible and capacity:disabled:motorcar are the OSM tags for spots
  // with 132"+ aisle clearance required by ramp-equipped vans — not surfaced
  // by Apple Maps or Google Maps, which lump all accessible spots together.
  // timeout:25 — downtown dense areas (Chicago, NYC) can take 10–15s to resolve;
  // 8s was causing premature empty responses on busy Overpass servers.
  return `[out:json][timeout:25];
(
  nwr["amenity"="parking"]["wheelchair"="yes"](around:${radius},${lat},${lon});
  nwr["amenity"="parking"]["wheelchair"="limited"](around:${radius},${lat},${lon});
  nwr["amenity"="parking"]["capacity:disabled"~"^[1-9][0-9]*$"](around:${radius},${lat},${lon});
  nwr["amenity"="parking"]["capacity:disabled:motorcar"~"^[1-9][0-9]*$"](around:${radius},${lat},${lon});
  nwr["amenity"="parking"]["motorcar:disabled"="yes"](around:${radius},${lat},${lon});
);
out center ${Math.min(60, Math.ceil(radius / 10))};`;
}

function buildFallbackQuery(lat: number, lon: number, radius: number): string {
  // Used when the primary query returns 0 results — shows all parking
  return `[out:json][timeout:25];
nwr["amenity"="parking"](around:${radius},${lat},${lon});
out center 50;`;
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

const PARKING_TYPES = ["surface", "multi-storey", "underground", "rooftop", "street_side"] as const;

function parseTag(tags: Record<string, string>): Partial<ParkingSpot> {
  const fee = tags["fee"];
  const lit = tags["lit"];
  const covered = tags["covered"];

  // Sanitize all string fields — OSM is public and any contributor can set arbitrary values
  const rawName =
    tags["name"] || tags["operator"] || tags["brand"] || "Unnamed Parking";
  const safeName = sanitizeTag(rawName, 100) ?? "Unnamed Parking";

  const capacityRaw = parseInt(tags["capacity:disabled"] ?? "", 10);
  const capacityTotalRaw = parseInt(tags["capacity"] ?? "", 10);

  // check_date:wheelchair = when a human last verified accessibility on the ground.
  // No major mapping app surfaces this — it's our key differentiator.
  const rawCheckDate = tags["check_date:wheelchair"] ?? tags["check_date"] ?? null;
  const check_date_wheelchair =
    rawCheckDate && CHECK_DATE_RE.test(rawCheckDate) ? rawCheckDate : null;

  // parking type — critical accessibility signal: underground often has no ramp
  const rawParking = tags["parking"];
  const parking_type = rawParking
    ? (PARKING_TYPES.includes(rawParking as typeof PARKING_TYPES[number])
        ? (rawParking as ParkingSpot["parking_type"])
        : "other")
    : null;

  // Build street address from OSM addr:* tags
  const addrParts = [
    tags["addr:housenumber"],
    tags["addr:street"],
  ].filter(Boolean);
  const rawAddress = addrParts.length > 0 ? addrParts.join(" ") : null;

  // ramp:wheelchair tag
  const rampRaw = tags["ramp:wheelchair"] ?? tags["ramp"];

  return {
    name: safeName,
    wheelchair: (["yes", "limited", "no"].includes(tags["wheelchair"])
      ? tags["wheelchair"]
      : "unknown") as ParkingSpot["wheelchair"],
    van_accessible: parseVanAccessible(tags),
    check_date_wheelchair,
    verified_at: null,
    opening_hours: sanitizeTag(tags["opening_hours"], 100),
    parking_type,
    maxstay: sanitizeTag(tags["maxstay"], 50),
    capacity_total:
      !isNaN(capacityTotalRaw) && capacityTotalRaw > 0 && capacityTotalRaw < 100000
        ? capacityTotalRaw
        : null,
    capacity_disabled:
      !isNaN(capacityRaw) && capacityRaw > 0 && capacityRaw < 10000
        ? capacityRaw
        : null,
    surface: sanitizeTag(tags["surface"], 50),
    fee: fee === "yes" ? true : fee === "no" ? false : null,
    covered: covered === "yes" ? true : covered === "no" ? false : null,
    lit: lit === "yes" ? true : lit === "no" ? false : null,
    access: sanitizeTag(tags["access"], 30),
    height: sanitizeTag(tags["height"] ?? tags["maxheight"], 20),
    ramp_wheelchair: rampRaw === "yes" ? true : rampRaw === "no" ? false : null,
    address: rawAddress ? sanitizeTag(rawAddress, 100) : null,
    level: sanitizeTag(tags["level"], 10),
    phone: sanitizeTag(tags["phone"] ?? tags["contact:phone"], 30),
    website: sanitizeTag(tags["website"] ?? tags["contact:website"] ?? tags["url"], 100),
  };
}

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  // Race all endpoints in parallel but resolve with the FIRST NON-EMPTY response.
  //
  // Why not Promise.any(): mirror servers (overpass.openstreetmap.fr,
  // overpass.kumi.systems) respond faster but return {"elements":[]} for US
  // queries because their data sync lags behind overpass-api.de.
  // Promise.any picks the fastest HTTP-200 — which is the empty mirror.
  // This was causing all searches to return 0 spots for real locations.
  //
  // Strategy: all endpoints race. First one with elements.length > 0 wins.
  // If ALL return empty (genuinely no results), resolve with empty rather than
  // reject — the caller decides what to do with 0 results.
  const body = `data=${encodeURIComponent(query)}`;
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "AccessMap/1.0 (https://accessmap-alpha.vercel.app; accessmap-bot)",
  };

  return new Promise<OverpassResponse>((resolve, reject) => {
    let resolved = false;
    let remaining = OVERPASS_ENDPOINTS.length;
    let firstEmpty: OverpassResponse | null = null;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      (async () => {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(12000),
        });
        if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status} from ${endpoint}`);
        return (await resp.json()) as OverpassResponse;
      })()
        .then((data) => {
          remaining--;
          if (resolved) return;
          if (data.elements.length > 0) {
            // Got real results — resolve immediately, cancel waiting for others
            resolved = true;
            resolve(data);
          } else {
            // Empty response — remember it, wait for a better one
            if (!firstEmpty) firstEmpty = data;
            if (remaining === 0) {
              // Every endpoint returned empty — it's genuinely no results
              resolve(firstEmpty!);
            }
          }
        })
        .catch(() => {
          remaining--;
          if (remaining === 0 && !resolved) {
            // All failed or errored
            if (firstEmpty) resolve(firstEmpty);
            else reject(new Error("All Overpass endpoints failed"));
          }
        });
    }
  });
}

// Nominatim amenity search — used when all Overpass endpoints fail/429
async function queryNominatim(lat: number, lon: number, radius: number): Promise<OverpassResponse> {
  const delta = radius / 111000;
  const viewbox = `${lon - delta},${lat + delta},${lon + delta},${lat - delta}`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  // Structured amenity search ("amenity=parking" as a param, not "q") returns
  // correct results. Free-text "q=amenity=parking" returns 0 for many locations.
  url.searchParams.set("amenity", "parking");
  url.searchParams.set("viewbox", viewbox);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "30");
  url.searchParams.set("extratags", "1");

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": "AccessMap/1.0 (https://accessmap-alpha.vercel.app; accessmap-bot)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
  const items: Array<{
    osm_id: number; osm_type: string; lat: string; lon: string;
    display_name: string; extratags?: Record<string, string>;
  }> = await resp.json();

  // Adapt Nominatim response to Overpass element shape
  const elements = items.map((item) => ({
    id: item.osm_id,
    type: (item.osm_type === "way" ? "way" : item.osm_type === "relation" ? "relation" : "node") as "node" | "way" | "relation",
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    tags: { amenity: "parking", name: item.display_name, ...(item.extratags ?? {}) },
  }));

  return { elements };
}

export async function queryWheelchairParking(
  location: GeocodedLocation,
  radius: number
): Promise<{ spots: ParkingSpot[]; fallback_used: boolean }> {
  const { lat, lon } = location;

  if (
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    Math.abs(lat) > 90 || Math.abs(lon) > 180
  ) {
    throw new Error(`Invalid geocoded coordinates: lat=${lat}, lon=${lon}`);
  }

  let data: OverpassResponse;
  let fallback_used = false;

  try {
    data = await fetchOverpass(buildQuery(lat, lon, radius));
  } catch (err) {
    console.warn("[overpass] primary failed, trying Nominatim:", String(err));
    data = await queryNominatim(lat, lon, radius * 2);
    fallback_used = true;
  }

  // If primary found nothing, widen to all parking
  if (data.elements.length === 0 && !fallback_used) {
    try {
      data = await fetchOverpass(buildFallbackQuery(lat, lon, radius * 2));
    } catch (err2) {
      console.warn("[overpass] fallback Overpass failed:", String(err2));
      data = await queryNominatim(lat, lon, radius * 2);
    }
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
