import mongoose, { Schema, Document } from "mongoose";

export interface FavoriteDocument extends Document {
  session_id: string;
  spot_id: string;
  spot_name: string;
  spot_loc: { type: "Point"; coordinates: [number, number] };
  // Accessibility snapshot captured at save time — survives Spot cache expiry (24h TTL)
  wheelchair: string | null;
  van_accessible: boolean | null;
  parking_type: string | null;
  opening_hours: string | null;
  report_flags: number;
  saved_at: Date;
}

const FavoriteSchema = new Schema<FavoriteDocument>({
  session_id: { type: String, required: true },
  spot_id: { type: String, required: true },
  spot_name: { type: String, default: "Unnamed Parking" },
  spot_loc: {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true },
  },
  wheelchair: { type: String, default: null },
  van_accessible: { type: Boolean, default: null },
  parking_type: { type: String, default: null },
  opening_hours: { type: String, default: null },
  report_flags: { type: Number, default: 0 },
  saved_at: { type: Date, default: Date.now },
});

FavoriteSchema.index({ session_id: 1 });
FavoriteSchema.index({ session_id: 1, spot_id: 1 }, { unique: true });
// 2dsphere on spot_loc enables future "favorites near me" geo-queries
FavoriteSchema.index({ spot_loc: "2dsphere" });

export const FavoriteModel =
  mongoose.models.Favorite ||
  mongoose.model<FavoriteDocument>("Favorite", FavoriteSchema);
