import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { ReportModel } from "@/models/Report";
import { SpotModel } from "@/models/Spot";
import { stripDangerous } from "@/lib/gemini";
import { checkIpRateLimit, recordIpRequest } from "@/lib/cache";

function getHashedIp(req: NextRequest): string {
  // Use framework-provided IP which correctly parses trusted proxy headers in Vercel.
  // Next.js automatically populates `req.ip` securely on Vercel deployments.
  const raw = (req as any).ip ?? "unknown";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

const ReportSchema = z.object({
  session_id: z.string().uuid(),
  spot_id: z.string().min(1).max(50).regex(/^[0-9a-zA-Z_-]+$/),
  status: z.enum([
    "blocked",
    "damaged",
    "not_accessible",
    "confirmed_ok",
    "still_accessible",      // crowd-verification: spot is still accessible
    "no_longer_accessible",  // crowd-verification: accessibility has changed
  ]),
  note: z.string().max(200).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) {
    // H1 FIX: never return Zod field details
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { session_id, spot_id, status, note } = parsed.data;

  // Fix: IP rate limit — prevents mass-reporting via UUID rotation
  const hashedIp = getHashedIp(req);
  const ipAllowed = await checkIpRateLimit(hashedIp);
  if (!ipAllowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }
  recordIpRequest(hashedIp).catch(() => {});

  try {
    await connectDB();

    // Prevent duplicate: 1 report per session per spot per 24h
    const oneDayAgo = new Date(Date.now() - 86400000);
    const existing = await ReportModel.findOne({
      session_id,
      spot_id,
      created_at: { $gte: oneDayAgo },
    });

    if (existing) {
      return NextResponse.json(
        { error: "You have already reported this spot today." },
        { status: 429 }
      );
    }

    // M3 FIX: sanitize free-text note before storing — user-supplied, goes to DB and frontend
    const safeNote = note ? stripDangerous(note).slice(0, 200) || null : null;

    await ReportModel.create({
      session_id,
      spot_id,
      status,
      note: safeNote,
      created_at: new Date(),
    });

    const now = new Date();

    // Crowd verification: still_accessible / no_longer_accessible stamp verified_at.
    // This is the timestamp no major mapping app surfaces — our core differentiator.
    if (status === "still_accessible" || status === "no_longer_accessible") {
      await SpotModel.updateMany(
        { osm_id: spot_id },
        { $set: { verified_at: now } }
      );
    }

    // Update report_flags on cached spot if 3+ negative reports in 7 days
    const negativeStatuses = ["blocked", "damaged", "not_accessible", "no_longer_accessible"];
    if (negativeStatuses.includes(status)) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
      const negativeCount = await ReportModel.countDocuments({
        spot_id,
        status: { $in: negativeStatuses },
        created_at: { $gte: sevenDaysAgo },
      });

      if (negativeCount >= 3) {
        await SpotModel.updateMany(
          { osm_id: spot_id },
          { $set: { report_flags: negativeCount } }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Report submission failed:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
