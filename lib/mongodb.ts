import mongoose from "mongoose";

// Cache connection on globalThis to survive Next.js hot reloads in dev
declare global {
  var _mongooseConn: typeof mongoose | null;
  var _mongoosePromise: Promise<typeof mongoose> | null;
}

let cached = global._mongooseConn;
let cachedPromise = global._mongoosePromise;

export async function connectDB(): Promise<typeof mongoose> {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set in environment variables");
  }

  if (cached) return cached;

  if (!cachedPromise) {
    cachedPromise = mongoose.connect(MONGODB_URI as string, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000, // handle Atlas auto-pause resume delay
      socketTimeoutMS: 45000,
    });
  }

  try {
    cached = await cachedPromise;
    global._mongooseConn = cached;
    global._mongoosePromise = cachedPromise;
    return cached;
  } catch (err) {
    // Reset so next call retries the connection
    cachedPromise = null;
    global._mongoosePromise = null;
    throw err;
  }
}
