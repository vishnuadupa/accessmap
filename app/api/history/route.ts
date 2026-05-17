import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { SessionModel } from "@/models/Session";

const QuerySchema = z.object({
  session_id: z.string().uuid(),
});

// GET /api/history?session_id=xxx
// Returns the last 10 search queries for this session.
// Data is already stored in Session.query_history — this endpoint just serves it.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionId = req.nextUrl.searchParams.get("session_id");

  const parsed = QuerySchema.safeParse({ session_id: sessionId });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    await connectDB();

    const session = await SessionModel.findOne(
      { session_id: parsed.data.session_id },
      { query_history: 1 }
    ).lean();

    // Return empty array if session doesn't exist yet — not an error
    const history = session?.query_history ?? [];

    return NextResponse.json({
      // Most recent first
      queries: [...history].reverse(),
    });
  } catch (err) {
    console.error("History fetch failed:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
