import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseIntent, narrateResults } from "@/lib/gemini";
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
import type { SearchResponse, SpotFilter } from "@/types";

const SearchSchema = z.object({
  query: z.string().min(1).max(200),
  session_id: z.string().uuid(),
});

function getHashedIp(req: NextRequest): string {
  const raw =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
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

  const { query, session_id } = parsed.data;

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
  let intent = {
    location: query,
    radius_m: 500,
    filters: [] as SpotFilter[],
    ambiguous: false,
  };

  if (geminiAllowed) {
    try {
      intent = await parseIntent(query);
      await recordGeminiCall(session_id);
    } catch (err) {
      console.error("Gemini parseIntent failed:", err);
      // Continue with raw query — don't block user
    }
  }

  // ── 5. Geocode location ────────────────────────────────────────────────────
  const locationQuery = intent.location || query;
  let geocoded = await geocode(locationQuery);
  if (!geocoded) geocoded = await geocodeFallback(locationQuery);

  if (!geocoded) {
    return NextResponse.json(
      {
        error: "location_not_found",
        // Safe to echo locationQuery here — it's already been through Gemini
        // validation and sanitization. Cap length for safety.
        message: `Could not locate that address. Try a more specific landmark or postcode.`,
        query_parsed: intent,
      },
      { status: 422 }
    );
  }

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
      const result = await queryWheelchairParking(geocoded, intent.radius_m);
      spots = result.spots;
      fallback_used = result.fallback_used;
      // M5 FIX: surface fallback_used so frontend can warn the user
      setCachedSpots(geocoded.lat, geocoded.lon, intent.radius_m, spots).catch(
        () => {}
      );
    } catch (err) {
      console.error("Overpass query failed:", err);
      spots = [];
    }
  }

  // ── 7. Apply filter preferences ───────────────────────────────────────────
  if (intent.filters.length > 0 && spots && spots.length > 0) {
    const filtered = spots.filter((s) => {
      if (intent.filters.includes("free") && s.fee === true) return false;
      if (intent.filters.includes("covered") && s.covered === false) return false;
      if (intent.filters.includes("lit") && s.lit === false) return false;
      return true;
    });
    if (filtered.length > 0) spots = filtered;
  }

  // ── 8. Narrate results with Gemini ─────────────────────────────────────────
  // L1 FIX: narrateResults now throws on Gemini failure (doesn't silently
  // swallow errors). We catch here and use a fallback string WITHOUT counting
  // the call against the quota.
  let narration = "";
  if (geminiAllowed && spots) {
    try {
      narration = await narrateResults(spots, geocoded.display_name);
      await recordGeminiCall(session_id);
    } catch {
      narration =
        spots.length > 0
          ? `Found ${spots.length} parking option${spots.length > 1 ? "s" : ""} near ${geocoded.display_name}.${fallback_used ? " Accessibility status may not be confirmed for all spots." : ""}`
          : `No accessible parking found near ${geocoded.display_name}.`;
    }
  } else {
    narration =
      spots && spots.length > 0
        ? `Found ${spots.length} parking option${spots.length > 1 ? "s" : ""} near ${geocoded.display_name}.${fallback_used ? " Accessibility status may not be confirmed for all spots." : ""}`
        : `No accessible parking found near ${geocoded.display_name}.`;
  }

  // ── 9. Record query history (background, non-blocking) ────────────────────
  appendQueryHistory(session_id, query).catch(() => {});

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
