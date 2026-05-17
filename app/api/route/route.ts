import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWheelchairRoute } from "@/lib/ors";
import { getCachedRoute, setCachedRoute } from "@/lib/cache";

const RouteSchema = z.object({
  origin: z.tuple([z.number(), z.number()]),      // [lat, lon]
  destination: z.tuple([z.number(), z.number()]), // [lat, lon]
  spot_id: z.string().min(1).max(50),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RouteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { origin, destination } = parsed.data;

  // Validate coordinate ranges
  const [olat, olon] = origin;
  const [dlat, dlon] = destination;
  if (
    Math.abs(olat) > 90 || Math.abs(olon) > 180 ||
    Math.abs(dlat) > 90 || Math.abs(dlon) > 180
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  // Check cache first
  const cached = await getCachedRoute(origin, destination);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Fetch from ORS
  const route = await getWheelchairRoute(origin, destination);

  if (!route) {
    return NextResponse.json(
      {
        error: "route_unavailable",
        message: "Wheelchair routing is unavailable for this route. The spot coordinates are shown on the map.",
      },
      { status: 422 }
    );
  }

  // Cache in background
  setCachedRoute(origin, destination, route).catch(() => {});

  return NextResponse.json(route);
}
