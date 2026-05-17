import mongoose, { Schema, Document } from "mongoose";
import type { WheelchairStatus } from "@/types";

export interface SpotDocument extends Document {
  osm_id: string;
  osm_type: "node" | "way" | "relation";
  name: string;
  loc: { type: "Point"; coordinates: [number, number] };
  wheelchair: WheelchairStatus;
  capacity_disabled: number | null;
  surface: string | null;
  fee: boolean | null;
  covered: boolean | null;
  lit: boolean | null;
  access: string | null;
  report_flags: number;
  cached_at: Date;
  cache_key: string;
}

const SpotSchema = new Schema<SpotDocument>({
  osm_id: { type: String, required: true },
  osm_type: { type: String, enum: ["node", "way", "relation"], required: true },
  name: { type: String, default: "Unnamed Parking" },
  loc: {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true },
  },
  wheelchair: {
    type: String,
    enum: ["yes", "limited", "no", "unknown"],
    default: "unknown",
  },
  capacity_disabled: { type: Number, default: null },
  surface: { type: String, default: null },
  fee: { type: Boolean, default: null },
  covered: { type: Boolean, default: null },
  lit: { type: Boolean, default: null },
  access: { type: String, default: null },
  report_flags: { type: Number, default: 0 },
  cached_at: { type: Date, default: Date.now },
  cache_key: { type: String, required: true },
});

SpotSchema.index({ loc: "2dsphere" });
SpotSchema.index({ cache_key: 1, cached_at: 1 });
// TTL index: auto-delete cached spots after 24 hours
SpotSchema.index({ cached_at: 1 }, { expireAfterSeconds: 86400 });

export const SpotModel =
  mongoose.models.Spot || mongoose.model<SpotDocument>("Spot", SpotSchema);
