import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { ReportModel } from "@/models/Report";
import { SpotModel } from "@/models/Spot";

// GET /api/stats — community verification stats
// Pure MongoDB aggregation, zero external API calls.
// Used by the frontend to show a "community trust" dashboard panel.
export async function GET(): Promise<NextResponse> {
  try {
    await connectDB();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const [reportStats, verifiedSpotCount, vanAccessibleCount, mostVerified] =
      await Promise.all([
        // Report breakdown by status in the last 30 days
        ReportModel.aggregate([
          { $match: { created_at: { $gte: thirtyDaysAgo } } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),

        // How many spots have ever been crowd-verified (have a verified_at)
        SpotModel.countDocuments({ verified_at: { $ne: null } }),

        // How many distinct van-accessible spots are known
        SpotModel.countDocuments({ van_accessible: true }),

        // Top 5 most verified spots (most still_accessible + no_longer_accessible reports)
        ReportModel.aggregate([
          {
            $match: {
              status: { $in: ["still_accessible", "no_longer_accessible"] },
              created_at: { $gte: thirtyDaysAgo },
            },
          },
          { $group: { _id: "$spot_id", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]),
      ]);

    const statusCounts: Record<string, number> = {};
    for (const r of reportStats) {
      statusCounts[r._id as string] = r.count as number;
    }

    return NextResponse.json({
      period_days: 30,
      reports: {
        still_accessible: statusCounts["still_accessible"] ?? 0,
        no_longer_accessible: statusCounts["no_longer_accessible"] ?? 0,
        blocked: statusCounts["blocked"] ?? 0,
        damaged: statusCounts["damaged"] ?? 0,
        confirmed_ok: statusCounts["confirmed_ok"] ?? 0,
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      },
      spots: {
        crowd_verified: verifiedSpotCount,
        van_accessible_known: vanAccessibleCount,
      },
      most_verified_spots: mostVerified.map((s) => ({
        spot_id: s._id,
        verifications: s.count,
      })),
    });
  } catch (err) {
    console.error("Stats fetch failed:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
