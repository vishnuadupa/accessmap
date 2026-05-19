import mongoose, { Schema, Document } from "mongoose";

export interface SessionDocument extends Document {
  session_id: string;
  query_history: string[];
  gemini_calls_today: number;
  gemini_calls_reset_at: Date;
  created_at: Date;
  last_active: Date;
}

const SessionSchema = new Schema<SessionDocument>({
  session_id: { type: String, required: true, unique: true },
  query_history: { type: [String], default: [] },
  // Track Gemini calls per session to prevent quota drain from one user
  gemini_calls_today: { type: Number, default: 0 },
  gemini_calls_reset_at: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now },
  last_active: { type: Date, default: Date.now },
});

// TTL: auto-delete inactive sessions after 90 days.
// IP rate-limit records (session_id prefix "ip:") also cleaned up here.
SessionSchema.index({ last_active: 1 }, { expireAfterSeconds: 7776000 });

export const SessionModel =
  mongoose.models.Session ||
  mongoose.model<SessionDocument>("Session", SessionSchema);
