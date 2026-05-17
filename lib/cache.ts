import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { SpotModel } from "@/models/Spot";
import { RouteModel } from "@/models/Route";
import type { ParkingSpot, RouteResult } from "@/types";

// ─── Spot cache ───────────────────────────────────────────────────────────────

// Round coords to 4 decimal places (~11m precision) for cache key stability
function makeCacheKey(lat: number, lon: number, radius: number): string {
  return `${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}`;
}

export async function getCachedSpots(
  lat: number,
  lon: number,
  radius: number
): Promise<ParkingSpot[] | null> {
  try {
    await connectDB();
    const key = makeCacheKey(lat, lon, radius);
    const docs = await SpotModel.find({ cache_key: key }).lean();
    if (docs.length === 0) return null;
    return docs.map((d) => ({
      ...d,
      _id: String(d._id),
    })) as unknown as ParkingSpot[];
  } catch {
    return null; // cache miss on DB error — caller hits API
  }
}

export async function setCachedSpots(
  lat: number,
  lon: number,
  radius: number,
  spots: ParkingSpot[]
): Promise<void> {
  try {
    await connectDB();
    const key = makeCacheKey(lat, lon, radius);

    // Delete old entries for this key first
    await SpotModel.deleteMany({ cache_key: key });

    if (spots.length === 0) return;

    await SpotModel.insertMany(
      spots.map((s) => ({ ...s, cache_key: key, cached_at: new Date() })),
      { ordered: false }
    );
  } catch (err) {
    // Cache write failure is non-fatal — just means next request re-fetches
    console.warn("Cache write failed (spots):", err);
  }
}

// ─── Route cache ──────────────────────────────────────────────────────────────

function makeRouteHash(coords: [number, number]): string {
  return crypto
    .createHash("md5")
    .update(`${coords[0].toFixed(5)},${coords[1].toFixed(5)}`)
    .digest("hex")
    .slice(0, 16);
}

export async function getCachedRoute(
  origin: [number, number],
  destination: [number, number]
): Promise<RouteResult | null> {
  try {
    await connectDB();
    const doc = await RouteModel.findOne({
      origin_hash: makeRouteHash(origin),
      dest_hash: makeRouteHash(destination),
    }).lean();

    if (!doc) return null;

    return {
      distance_m: doc.distance_m,
      duration_s: doc.duration_s,
      geometry: doc.geometry,
      instructions: doc.instructions,
      cache_hit: true,
    };
  } catch {
    return null;
  }
}

export async function setCachedRoute(
  origin: [number, number],
  destination: [number, number],
  route: RouteResult
): Promise<void> {
  try {
    await connectDB();
    await RouteModel.findOneAndUpdate(
      {
        origin_hash: makeRouteHash(origin),
        dest_hash: makeRouteHash(destination),
      },
      {
        ...route,
        origin_hash: makeRouteHash(origin),
        dest_hash: makeRouteHash(destination),
        cached_at: new Date(),
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn("Cache write failed (routes):", err);
  }
}

// ─── Session helpers ──────────────────────────────────────────────────────────

export async function canMakeGeminiCall(session_id: string): Promise<boolean> {
  try {
    await connectDB();
    const { SessionModel } = await import("@/models/Session");

    const session = await SessionModel.findOne({ session_id }).lean();
    if (!session) return true; // new session, always allow

    const now = new Date();
    const resetAt = new Date(session.gemini_calls_reset_at);
    const hoursSinceReset =
      (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);

    // Reset counter if 24h have passed
    if (hoursSinceReset >= 24) return true;

    // Max 20 Gemini calls per session per 24h — prevents one user draining quota
    return session.gemini_calls_today < 20;
  } catch {
    return true; // DB error — allow the call, don't block the user
  }
}

export async function recordGeminiCall(session_id: string): Promise<void> {
  try {
    await connectDB();
    const { SessionModel } = await import("@/models/Session");

    const now = new Date();
    await SessionModel.findOneAndUpdate(
      { session_id },
      [
        {
          $set: {
            gemini_calls_today: {
              $cond: {
                if: {
                  $gte: [
                    { $subtract: [now, "$gemini_calls_reset_at"] },
                    86400000,
                  ],
                },
                then: 1,
                else: { $add: ["$gemini_calls_today", 1] },
              },
            },
            gemini_calls_reset_at: {
              $cond: {
                if: {
                  $gte: [
                    { $subtract: [now, "$gemini_calls_reset_at"] },
                    86400000,
                  ],
                },
                then: now,
                else: "$gemini_calls_reset_at",
              },
            },
            last_active: now,
          },
        },
      ],
      { upsert: true }
    );
  } catch (err) {
    console.warn("Session record failed:", err);
  }
}

export async function appendQueryHistory(
  session_id: string,
  query: string
): Promise<void> {
  try {
    await connectDB();
    const { SessionModel } = await import("@/models/Session");

    await SessionModel.findOneAndUpdate(
      { session_id },
      {
        $push: {
          query_history: {
            $each: [query],
            $slice: -10, // keep only last 10 queries
          },
        },
        $set: { last_active: new Date() },
        $setOnInsert: { created_at: new Date(), gemini_calls_today: 0 },
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn("Query history append failed:", err);
  }
}
