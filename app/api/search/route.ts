import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 45; // seconds — needs Vercel Pro; Hobby cap is 10s
import { z } from "zod";
import { parseIntent, stripDangerous, sanitizeQuery } from "@/lib/gemini";
import { geocode, geocodeFallback } from "@/lib/ors";
import { queryWheelchairParking } from "@/lib/overpass";
import {
  getCachedSpots,
  setCachedSpots,
  canMakeGeminiCall,
  recordGeminiCall,
  appendQueryHistory,
  checkIpRateLimit,
  recordIpRequest,
} from "@/lib/cache";
import type { SearchResponse, SpotFilter, ParsedIntent } from "@/types";

const SearchSchema = z.object({
  query: z.string().min(1).max(200),
  session_id: z.string().uuid(),
  // Optional: client-supplied coordinates skip geocoding (used for "Near Me")
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
});

function getHashedIp(req: NextRequest): string {
  const raw =
    (req as any).ip ??
    "unknown";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Validate input ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    // H1 FIX: never leak Zod field details — tells attackers the exact schema
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { query, session_id, lat: coordLat, lon: coordLon } = parsed.data;

  // ── 2. IP-level rate limit (H2 FIX) ───────────────────────────────────────
  // Prevents bots generating new UUIDs to bypass per-session limits
  const hashedIp = getHashedIp(req);
  const ipAllowed = await checkIpRateLimit(hashedIp);
  if (!ipAllowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }
  recordIpRequest(hashedIp).catch(() => {});

  // ── 3. Check per-session Gemini quota ──────────────────────────────────────
  const geminiAllowed = await canMakeGeminiCall(session_id);

  // ── 4. Parse intent with Gemini ────────────────────────────────────────────
  let intent: ParsedIntent = {
    location: query,
    radius_m: 500,
    filters: [],
    parking_type: null,
    van_mode: false,
    ambiguous: false,
  };

  if (geminiAllowed) {
    try {
      intent = await parseIntent(query);
      await recordGeminiCall(session_id);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.error(`Gemini parseIntent failed [${e.status ?? "?"}]: ${String(e.message ?? err).slice(0, 200)}`);
    }
  }

  // ── 5. Geocode location ────────────────────────────────────────────────────
  let geocoded: Awaited<ReturnType<typeof geocode>> = null;

  if (coordLat !== undefined && coordLon !== undefined) {
    // Client supplied coordinates (Near Me) — skip geocoding entirely
    geocoded = { lat: coordLat, lon: coordLon, display_name: "your location", confidence: 1, accuracy: "point" };
  } else {
    // Strip mobility/parking noise before geocoding so "wheelchair parking near X" → "X"
    const PARKING_NOISE = /\bwheel[\s-]?chair\b|\b(accessible|disabled|handicap|parking|near|close to|next to|around|by|spaces?|spots?)\b/gi;
    const rawLocation = intent.location || query;
    const locationQuery = rawLocation.replace(PARKING_NOISE, " ").replace(/\s{2,}/g, " ").trim() || rawLocation;
    const HIGH_PRECISION = new Set(["point", "interpolated", "street"]);
    const orsGeo = await geocode(locationQuery);
    geocoded =
      orsGeo && HIGH_PRECISION.has(orsGeo.accuracy ?? "")
        ? orsGeo
        : (await geocodeFallback(locationQuery)) ?? orsGeo;
  }

  if (!geocoded) {
    return NextResponse.json(
      {
        error: "location_not_found",
        message: `Could not locate that address. Try a more specific landmark or postcode.`,
        query_parsed: intent,
      },
      { status: 422 }
    );
  }

  console.log(`[search] intent.location="${intent.location}" radius=${intent.radius_m} van=${intent.van_mode} filters=${JSON.stringify(intent.filters)}`);
  console.log(`[search] geocoded: lat=${geocoded.lat}, lon=${geocoded.lon}, name="${geocoded.display_name}"`);

  // ── 6. Check spot cache ────────────────────────────────────────────────────
  const cachedSpots = await getCachedSpots(
    geocoded.lat,
    geocoded.lon,
    intent.radius_m
  );

  let spots = cachedSpots;
  let cache_hit = true;
  let fallback_used = false;
  if (!spots) {
    cache_hit = false;
    try {
      const t0 = Date.now();
      const result = await queryWheelchairParking(geocoded, intent.radius_m);
      spots = result.spots;
      fallback_used = result.fallback_used;
      console.log(`[search] Overpass OK: ${spots.length} spots, fallback=${fallback_used}, ${Date.now()-t0}ms`);
      setCachedSpots(geocoded.lat, geocoded.lon, intent.radius_m, spots).catch(
        () => {}
      );
    } catch (err) {
      console.error("[search] Overpass query failed:", err);
      spots = [];
    }
  }

  // ── 7. Apply filter + intent preferences ──────────────────────────────────
  if (spots && spots.length > 0) {
    let filtered = spots.filter((s) => {
      if (intent.filters.includes("free") && s.fee === true) return false;
      if (intent.filters.includes("covered") && s.covered === false) return false;
      if (intent.filters.includes("lit") && s.lit === false) return false;
      // no_time_limit: exclude spots with a maxstay set (has a time restriction)
      if (intent.filters.includes("no_time_limit") && s.maxstay !== null) return false;
      // parking_type: match preferred structure type from user query
      if (intent.parking_type && s.parking_type !== null && s.parking_type !== intent.parking_type) return false;
      return true;
    });

    // van_mode: if user is in van mode, sort van-accessible spots to the top
    // rather than hard-filtering (there may be very few van_accessible spots)
    if (intent.van_mode && filtered.length > 0) {
      filtered = [
        ...filtered.filter((s) => s.van_accessible === true),
        ...filtered.filter((s) => s.van_accessible !== true),
      ];
    }

    // Always float confirmed/tagged spots above completely unknown ones,
    // preserving distance order within each tier.
    const accessTier = (s: typeof filtered[0]) => {
      if (s.wheelchair === "yes" || s.van_accessible === true) return 3;
      if (s.wheelchair === "limited") return 2;
      if (s.capacity_disabled !== null && s.capacity_disabled > 0) return 1;
      return 0;
    };
    filtered.sort((a, b) => {
      const diff = accessTier(b) - accessTier(a);
      return diff !== 0 ? diff : (a.distance_m ?? 0) - (b.distance_m ?? 0);
    });

    if (filtered.length > 0) spots = filtered;
  }

  // ── 8. Narrate results with Gemini ─────────────────────────────────────────
  // L1 FIX: narrateResults now throws on Gemini failure (doesn't silently
  // swallow errors). We catch here and use a fallback string WITHOUT counting
  // the call against the quota.
  let narration = "";
  // Narration uses a template — saves the second Gemini call per search.
  // This doubles our daily Gemini budget (now 1 call/search for parseIntent only).
  const safeName = stripDangerous(geocoded.display_name).slice(0, 100);
  if (spots && spots.length > 0) {
    const wheelchairCount = spots.filter((s) => s.wheelchair === "yes").length;
    const taggedCount = spots.filter((s) =>
      s.wheelchair === "yes" || s.wheelchair === "limited" ||
      s.van_accessible === true || (s.capacity_disabled !== null && (s.capacity_disabled ?? 0) > 0)
    ).length;
    const verifiedNote = fallback_used ? " Accessibility status may not be confirmed for all spots." : "";
    if (wheelchairCount > 0) {
      narration = `Found ${spots.length} parking option${spots.length > 1 ? "s" : ""} near ${safeName}, including ${wheelchairCount} confirmed wheelchair-accessible.${verifiedNote}`;
    } else if (taggedCount > 0) {
      narration = `Found ${spots.length} parking option${spots.length > 1 ? "s" : ""} near ${safeName}. ${taggedCount} ha${taggedCount === 1 ? "s" : "ve"} accessibility tags in OpenStreetMap — call ahead to confirm current access.${verifiedNote}`;
    } else {
      narration = `Found ${spots.length} nearby parking option${spots.length > 1 ? "s" : ""} near ${safeName}, but none have accessibility data in OpenStreetMap. Call ahead or check Google Maps for accessible space details.${verifiedNote}`;
    }
  } else {
    narration = `No confirmed wheelchair-accessible parking was found near ${safeName}. Try widening your search or check nearby garages directly.`;
  }

  // ── 9. Record query history — sanitize before storing (goes to DB, may be displayed)
  appendQueryHistory(session_id, sanitizeQuery(query)).catch(() => {});

  const response: SearchResponse = {
    spots: spots ?? [],
    narration,
    geocoded,
    cache_hit,
    fallback_used,
    query_parsed: intent,
  };

  return NextResponse.json(response);
}
