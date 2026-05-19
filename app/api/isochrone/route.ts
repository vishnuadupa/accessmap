import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getIsochrone } from "@/lib/ors";
import { connectDB } from "@/lib/mongodb";
import { IsochroneModel } from "@/models/Isochrone";
import { checkIpRateLimit, recordIpRequest, getHashedIp } from "@/lib/cache";

const IsochroneSchema = z.object({
  // destination the user is trying to reach [lat, lon]
  destination: z.tuple([z.number(), z.number()]),
  // travel time budget in minutes (1-15, default 5)
  range_minutes: z.number().min(1).max(15).default(5),
});

function makeLocHash(lat: number, lon: number, range_s: number): string {
  return crypto
    .createHash("md5")
    .update(`${lat.toFixed(4)},${lon.toFixed(4)},${range_s}`)
    .digest("hex")
    .slice(0, 16);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = IsochroneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { destination, range_minutes } = parsed.data;
  const [lat, lon] = destination;

  if (
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    Math.abs(lat) > 90 || Math.abs(lon) > 180
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const range_seconds = range_minutes * 60;
  const locHash = makeLocHash(lat, lon, range_seconds);

  // Check MongoDB cache first — isochrones are expensive (500/day ORS limit)
  try {
    await connectDB();
    const cached = await IsochroneModel.findOne({ loc_hash: locHash }).lean();
    if (cached) {
      return NextResponse.json({ ...cached.geojson, cache_hit: true });
    }
  } catch {
    // Cache miss on DB error — continue to ORS
  }

  // IP rate limit — isochrone calls count against the shared 60/hr bucket
  const hashedIp = getHashedIp(req);
  const ipAllowed = await checkIpRateLimit(hashedIp);
  if (!ipAllowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }
  recordIpRequest(hashedIp).catch(() => {});

  const result = await getIsochrone([lat, lon], range_seconds);

  if (!result) {
    return NextResponse.json(
      { error: "isochrone_unavailable", message: "Could not compute reachable area for this location." },
      { status: 422 }
    );
  }

  // Cache to MongoDB
  IsochroneModel.findOneAndUpdate(
    { loc_hash: locHash },
    { loc_hash: locHash, geojson: result, range_seconds, cached_at: new Date() },
    { upsert: true }
  ).catch(() => {});

  return NextResponse.json(result);
}
