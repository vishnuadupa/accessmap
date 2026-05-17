import mongoose, { Schema, Document } from "mongoose";

export interface RouteDocument extends Document {
  origin_hash: string;
  dest_hash: string;
  distance_m: number;
  duration_s: number;
  geometry: string;
  instructions: { text: string; distance: number; duration: number }[];
  surface_summary: { label: string; percent: number }[];
  suitability_score: number | null;
  cached_at: Date;
}

const RouteSchema = new Schema<RouteDocument>({
  origin_hash: { type: String, required: true },
  dest_hash: { type: String, required: true },
  distance_m: { type: Number, required: true },
  duration_s: { type: Number, required: true },
  geometry: { type: String, required: true },
  instructions: [
    {
      text: String,
      distance: Number,
      duration: Number,
    },
  ],
  surface_summary: [{ label: String, percent: Number }],
  suitability_score: { type: Number, default: null },
  cached_at: { type: Date, default: Date.now },
});

RouteSchema.index({ origin_hash: 1, dest_hash: 1 }, { unique: true });
// TTL: auto-delete after 7 days
RouteSchema.index({ cached_at: 1 }, { expireAfterSeconds: 604800 });

export const RouteModel =
  mongoose.models.Route || mongoose.model<RouteDocument>("Route", RouteSchema);
