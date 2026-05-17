import mongoose, { Schema, Document } from "mongoose";

export interface ReportDocument extends Document {
  spot_id: string;
  session_id: string;
  status: "blocked" | "damaged" | "not_accessible" | "confirmed_ok" | "still_accessible" | "no_longer_accessible";
  note: string | null;
  created_at: Date;
}

const ReportSchema = new Schema<ReportDocument>({
  spot_id: { type: String, required: true },
  session_id: { type: String, required: true },
  status: {
    type: String,
    enum: ["blocked", "damaged", "not_accessible", "confirmed_ok", "still_accessible", "no_longer_accessible"],
    required: true,
  },
  note: { type: String, maxlength: 200, default: null },
  created_at: { type: Date, default: Date.now },
});

ReportSchema.index({ spot_id: 1, created_at: -1 });
// Prevent duplicate reports: 1 report per session per spot per day
ReportSchema.index(
  { spot_id: 1, session_id: 1, created_at: 1 },
  { unique: false }
);

export const ReportModel =
  mongoose.models.Report ||
  mongoose.model<ReportDocument>("Report", ReportSchema);
