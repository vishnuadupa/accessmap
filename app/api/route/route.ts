import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWheelchairRoute } from "@/lib/ors";
import { getCachedRoute, setCachedRoute, checkIpRateLimit, recordIpRequest } from "@/lib/cache";

const RouteSchema = z.object({
  origin: z.tuple([z.number(), z.number()]),
  destination: z.tuple([z.number(), z.number()]),
  // Fix: add regex guard consistent with /api/report and /api/favorite
  spot_id: z.string().min(1).max(50).regex(/^[0-9a-zA-Z_-]+$/),
});

function getHashedIp(req: NextRequest): string {
  const raw =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = RouteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { origin, destination } = parsed.data;

  // Coordinate bounds check
  const [olat, olon] = origin;
  const [dlat, dlon] = destination;
  if (
    !Number.isFinite(olat) || !Number.isFinite(olon) ||
    !Number.isFinite(dlat) || !Number.isFinite(dlon) ||
    Math.abs(olat) > 90 || Math.abs(olon) > 180 ||
    Math.abs(dlat) > 90 || Math.abs(dlon) > 180
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  // Check cache first — if cached, don't count against IP limit
  const cached = await getCachedRoute(origin, destination);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Fix: IP rate limit — prevents draining ORS 2,000/day quota
  // Routes are cached so real ORS calls only happen on cache miss.
  // Reuse the same 60/hr bucket as search (shared IP limit across endpoints).
  const hashedIp = getHashedIp(req);
  const ipAllowed = await checkIpRateLimit(hashedIp);
  if (!ipAllowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  // Cache miss — record the IP request and hit ORS
  recordIpRequest(hashedIp).catch(() => {});

  const route = await getWheelchairRoute(origin, destination);

  if (!route) {
    return NextResponse.json(
      {
        error: "route_unavailable",
        message:
          "Wheelchair routing is unavailable for this route. The spot is pinned on the map.",
      },
      { status: 422 }
    );
  }

  setCachedRoute(origin, destination, route).catch(() => {});

  return NextResponse.json(route);
}
