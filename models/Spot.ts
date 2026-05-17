import mongoose, { Schema, Document } from "mongoose";
import type { WheelchairStatus } from "@/types";

export interface SpotDocument extends Document {
  osm_id: string;
  osm_type: "node" | "way" | "relation";
  name: string;
  loc: { type: "Point"; coordinates: [number, number] };
  wheelchair: WheelchairStatus;
  capacity_disabled: number | null;
  van_accessible: boolean | null;
  check_date_wheelchair: string | null;
  verified_at: Date | null;
  opening_hours: string | null;
  parking_type: string | null;
  maxstay: string | null;
  capacity_total: number | null;
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
  van_accessible: { type: Boolean, default: null },
  check_date_wheelchair: { type: String, default: null },
  verified_at: { type: Date, default: null },
  opening_hours: { type: String, default: null },
  parking_type: { type: String, default: null },
  maxstay: { type: String, default: null },
  capacity_total: { type: Number, default: null },
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
// osm_id lookup: spot detail endpoint + verified_at update in report route
SpotSchema.index({ osm_id: 1 });
// cache lookup: simple key scan, no need for cached_at in the key
SpotSchema.index({ cache_key: 1 });
// van_accessible filter: stats aggregation + future geo-filter of van spots
SpotSchema.index({ van_accessible: 1 });
// verified_at: sort by most recently crowd-verified
SpotSchema.index({ verified_at: -1 });
// TTL index: auto-delete cached spots after 24 hours
SpotSchema.index({ cached_at: 1 }, { expireAfterSeconds: 86400 });

export const SpotModel =
  mongoose.models.Spot || mongoose.model<SpotDocument>("Spot", SpotSchema);
