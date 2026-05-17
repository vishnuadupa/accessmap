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
} from "@/lib/cache";
import type { SearchResponse } from "@/types";

const SearchSchema = z.object({
  query: z.string().min(1).max(200),
  session_id: z.string().uuid(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Validate input ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { query, session_id } = parsed.data;

  // ── 2. Check Gemini rate limit per session ─────────────────────────────────
  const geminiAllowed = await canMakeGeminiCall(session_id);

  // ── 3. Parse intent with Gemini (or degrade gracefully) ───────────────────
  let intent = {
    location: query,
    radius_m: 500,
    filters: [] as import("@/types").SpotFilter[],
    ambiguous: false,
  };

  if (geminiAllowed) {
    try {
      intent = await parseIntent(query);
      await recordGeminiCall(session_id);
    } catch (err) {
      console.error("Gemini parseIntent failed:", err);
      // Continue with raw query as location — don't block user
    }
  }

  // ── 4. Geocode the location ────────────────────────────────────────────────
  const locationQuery = intent.location || query;
  let geocoded = await geocode(locationQuery);

  // Fallback to Nominatim if ORS geocoding fails
  if (!geocoded) {
    geocoded = await geocodeFallback(locationQuery);
  }

  if (!geocoded) {
    return NextResponse.json(
      {
        error: "location_not_found",
        message: `Could not locate "${locationQuery}". Try a more specific address or landmark.`,
        query_parsed: intent,
      },
      { status: 422 }
    );
  }

  // ── 5. Check spot cache ────────────────────────────────────────────────────
  const cachedSpots = await getCachedSpots(
    geocoded.lat,
    geocoded.lon,
    intent.radius_m
  );

  let spots = cachedSpots;
  let cache_hit = true;

  if (!spots) {
    cache_hit = false;
    // ── 6. Query Overpass ────────────────────────────────────────────────────
    try {
      const result = await queryWheelchairParking(geocoded, intent.radius_m);
      spots = result.spots;
      // Cache in background — don't await (fire and forget)
      setCachedSpots(geocoded.lat, geocoded.lon, intent.radius_m, spots).catch(
        () => {}
      );
    } catch (err) {
      console.error("Overpass query failed:", err);
      spots = [];
    }
  }

  // ── 7. Apply filter preferences (post-query, no extra API calls) ──────────
  if (intent.filters.length > 0 && spots && spots.length > 0) {
    const filtered = spots.filter((s) => {
      if (intent.filters.includes("free") && s.fee === true) return false;
      if (intent.filters.includes("covered") && s.covered === false)
        return false;
      if (intent.filters.includes("lit") && s.lit === false) return false;
      return true;
    });
    // Only apply filter if it doesn't eliminate all results
    if (filtered.length > 0) spots = filtered;
  }

  // ── 8. Narrate results with Gemini ─────────────────────────────────────────
  let narration = "";
  if (geminiAllowed && spots) {
    try {
      narration = await narrateResults(spots, geocoded.display_name);
      await recordGeminiCall(session_id);
    } catch {
      // Silent fallback — narration is nice-to-have
      narration = spots.length > 0
        ? `Found ${spots.length} parking option${spots.length > 1 ? "s" : ""} near ${geocoded.display_name}.`
        : `No accessible parking found near ${geocoded.display_name}.`;
    }
  } else {
    narration = spots && spots.length > 0
      ? `Found ${spots.length} parking option${spots.length > 1 ? "s" : ""} near ${geocoded.display_name}.`
      : `No accessible parking found near ${geocoded.display_name}.`;
  }

  // ── 9. Record query history (background) ─────────────────────────────────
  appendQueryHistory(session_id, query).catch(() => {});

  const response: SearchResponse = {
    spots: spots ?? [],
    narration,
    geocoded,
    cache_hit,
    query_parsed: intent,
  };

  return NextResponse.json(response);
}
