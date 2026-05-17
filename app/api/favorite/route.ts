import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { FavoriteModel } from "@/models/Favorite";

const FavoriteSchema = z.object({
  session_id: z.string().uuid(),
  spot_id: z.string().min(1).max(50),
  action: z.enum(["save", "remove"]),
  spot_name: z.string().max(200).optional(),
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = FavoriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { session_id, spot_id, action, spot_name, spot_loc } = parsed.data;

  try {
    await connectDB();

    if (action === "remove") {
      await FavoriteModel.deleteOne({ session_id, spot_id });
      return NextResponse.json({ success: true });
    }

    // Save — upsert to avoid duplicates
    await FavoriteModel.findOneAndUpdate(
      { session_id, spot_id },
      {
        session_id,
        spot_id,
        spot_name: spot_name ?? "Unnamed Parking",
        spot_loc: spot_loc ?? { type: "Point", coordinates: [0, 0] },
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
