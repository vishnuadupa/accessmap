import mongoose, { Schema, Document } from "mongoose";

export interface FavoriteDocument extends Document {
  session_id: string;
  spot_id: string;
  spot_name: string;
  spot_loc: { type: "Point"; coordinates: [number, number] };
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
  saved_at: { type: Date, default: Date.now },
});

FavoriteSchema.index({ session_id: 1 });
FavoriteSchema.index({ session_id: 1, spot_id: 1 }, { unique: true });

export const FavoriteModel =
  mongoose.models.Favorite ||
  mongoose.model<FavoriteDocument>("Favorite", FavoriteSchema);
