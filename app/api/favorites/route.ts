import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { FavoriteModel } from "@/models/Favorite";

const QuerySchema = z.object({
  session_id: z.string().uuid(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionId = req.nextUrl.searchParams.get("session_id");

  const parsed = QuerySchema.safeParse({ session_id: sessionId });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    await connectDB();
    const favorites = await FavoriteModel.find({
      session_id: parsed.data.session_id,
    })
      .sort({ saved_at: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({ favorites });
  } catch (err) {
    console.error("Favorites fetch failed:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
