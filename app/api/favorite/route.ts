import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { FavoriteModel } from "@/models/Favorite";
import { SpotModel } from "@/models/Spot";
import { stripDangerous } from "@/lib/gemini";

const FavoriteSchema = z.object({
  session_id: z.string().uuid(),
  // M1 FIX: add same regex guard as /api/report for consistency
  spot_id: z.string().min(1).max(50).regex(/^[0-9a-zA-Z_-]+$/),
  action: z.enum(["save", "remove"]),
  // M2 FIX: spot_name comes from OSM data or frontend — sanitize before storing
  spot_name: z
    .string()
    .max(200)
    .optional()
    .transform((val) =>
      val ? stripDangerous(val).slice(0, 150) || "Unnamed Parking" : "Unnamed Parking"
    ),
  spot_loc: z
    .object({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = FavoriteSchema.safeParse(body);
  if (!parsed.success) {
    // H1 FIX: never return Zod field details
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { session_id, spot_id, action, spot_name, spot_loc } = parsed.data;

  // Validate coordinates are plausible if provided
  if (spot_loc) {
    const [lon, lat] = spot_loc.coordinates;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }
  }

  try {
    await connectDB();

    if (action === "remove") {
      await FavoriteModel.deleteOne({ session_id, spot_id });
      return NextResponse.json({ success: true });
    }

    // Snapshot key accessibility fields from the Spot cache so the favorites
    // list stays informative after the 24h Spot TTL expires.
    const cachedSpot = await SpotModel.findOne({ osm_id: spot_id }).lean();

    await FavoriteModel.findOneAndUpdate(
      { session_id, spot_id },
      {
        session_id,
        spot_id,
        spot_name,
        spot_loc: spot_loc ?? { type: "Point", coordinates: [0, 0] },
        wheelchair: cachedSpot?.wheelchair ?? null,
        van_accessible: cachedSpot?.van_accessible ?? null,
        parking_type: cachedSpot?.parking_type ?? null,
        opening_hours: cachedSpot?.opening_hours ?? null,
        report_flags: cachedSpot?.report_flags ?? 0,
        saved_at: new Date(),
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Favorite action failed:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
