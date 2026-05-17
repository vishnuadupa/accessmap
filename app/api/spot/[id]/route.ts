import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { SpotModel } from "@/models/Spot";
import { ReportModel } from "@/models/Report";

const ParamSchema = z.string().min(1).max(50).regex(/^[0-9a-zA-Z_-]+$/);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  if (!ParamSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid spot ID" }, { status: 400 });
  }

  try {
    await connectDB();

    const spot = await SpotModel.findOne({ osm_id: id }).lean();
    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    // Aggregate community report counts for the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const reportCounts = await ReportModel.aggregate([
      { $match: { spot_id: id, created_at: { $gte: thirtyDaysAgo } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const counts: Record<string, number> = {};
    for (const r of reportCounts) {
      counts[r._id as string] = r.count as number;
    }

    // Total verifications (still_accessible + no_longer_accessible) = trust signal
    const verifications =
      (counts["still_accessible"] ?? 0) + (counts["no_longer_accessible"] ?? 0);

    return NextResponse.json({
      spot: { ...spot, _id: String(spot._id) },
      community: {
        confirmed_accessible: counts["still_accessible"] ?? 0,
        no_longer_accessible: counts["no_longer_accessible"] ?? 0,
        blocked: counts["blocked"] ?? 0,
        damaged: counts["damaged"] ?? 0,
        not_accessible: counts["not_accessible"] ?? 0,
        confirmed_ok: counts["confirmed_ok"] ?? 0,
        total_verifications: verifications,
      },
    });
  } catch (err) {
    console.error("Spot detail fetch failed:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
