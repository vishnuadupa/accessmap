import mongoose, { Schema, Document } from "mongoose";

export interface IsochroneDocument extends Document {
  loc_hash: string;          // hash of [lat,lon,range_seconds]
  geojson: object;           // raw ORS GeoJSON FeatureCollection
  range_seconds: number;
  cached_at: Date;
}

const IsochroneSchema = new Schema<IsochroneDocument>({
  loc_hash: { type: String, required: true, unique: true },
  geojson: { type: Schema.Types.Mixed, required: true },
  range_seconds: { type: Number, required: true },
  cached_at: { type: Date, default: Date.now },
});

// TTL: isochrones expire after 7 days — road network changes slowly
IsochroneSchema.index({ cached_at: 1 }, { expireAfterSeconds: 604800 });

export const IsochroneModel =
  mongoose.models.Isochrone ||
  mongoose.model<IsochroneDocument>("Isochrone", IsochroneSchema);
