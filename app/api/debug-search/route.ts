import { NextResponse } from "next/server";
import { geocode, geocodeFallback } from "@/lib/ors";
import { queryWheelchairParking } from "@/lib/overpass";

export const maxDuration = 30;

export async function GET(): Promise<NextResponse> {
  const query = "Trump International Hotel Chicago";
  const debug: Record<string, unknown> = { query };

  // Step 1: geocode
  try {
    const t0 = Date.now();
    let geo = await geocode(query);
    if (!geo) geo = await geocodeFallback(query);
    debug.geocode_ms = Date.now() - t0;
    debug.geocoded = geo;

    if (!geo) {
      debug.error = "geocode failed";
      return NextResponse.json(debug);
    }

    // Step 2: overpass
    try {
      const t1 = Date.now();
      const result = await queryWheelchairParking(geo, 500);
      debug.overpass_ms = Date.now() - t1;
      debug.spots_count = result.spots.length;
      debug.fallback_used = result.fallback_used;
      debug.first_spot = result.spots[0] ?? null;

    } catch (err) {
      debug.overpass_error = String(err);
    }

    // Direct Nominatim test for diagnostic
    try {
      const nomUrl = new URL("https://nominatim.openstreetmap.org/search");
      nomUrl.searchParams.set("amenity", "parking");
      const delta = 1000 / 111000;
      nomUrl.searchParams.set("viewbox", `${geo.lon - delta},${geo.lat + delta},${geo.lon + delta},${geo.lat - delta}`);
      nomUrl.searchParams.set("bounded", "1");
      nomUrl.searchParams.set("format", "json");
      nomUrl.searchParams.set("limit", "10");
      const nr = await fetch(nomUrl.toString(), {
        headers: { "User-Agent": "AccessMap/1.0 (https://accessmap-alpha.vercel.app; accessmap-bot)" },
        signal: AbortSignal.timeout(8000),
      });
      const nd = await nr.json();
      debug.nominatim_direct_count = Array.isArray(nd) ? nd.length : "err";
      debug.nominatim_url = nomUrl.toString();
    } catch (err) {
      debug.nominatim_error = String(err);
    }
  } catch (err) {
    debug.geocode_error = String(err);
  }

  return NextResponse.json(debug);
}
