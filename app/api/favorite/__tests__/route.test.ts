import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { NextRequest } from 'next/server';
import { connectDB } from "@/lib/mongodb";
import { FavoriteModel } from "@/models/Favorite";

// Mock MongoDB
vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn(),
}));

// Mock Models
vi.mock("@/models/Favorite", () => ({
  FavoriteModel: {
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock("@/models/Spot", () => ({
  SpotModel: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    }),
  },
}));

describe('POST /api/favorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 for invalid request body (JSON parsing error)', async () => {
    // Testing the specific catch block
    const req = new NextRequest('http://localhost/api/favorite', {
      method: 'POST',
      body: 'not a valid json string', // NextRequest throws when parsing invalid JSON
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json).toEqual({ error: 'Invalid request body' });
  });

  it('should return 400 for invalid request (Zod validation error)', async () => {
    // Invalid schema (missing session_id)
    const req = new NextRequest('http://localhost/api/favorite', {
      method: 'POST',
      body: JSON.stringify({
        spot_id: 'spot_1',
        action: 'save',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json).toEqual({ error: 'Invalid request' });
  });

  it('should process a valid save request', async () => {
    const payload = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      spot_id: 'spot_1',
      action: 'save',
    };

    const req = new NextRequest('http://localhost/api/favorite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({ success: true });

    expect(connectDB).toHaveBeenCalled();
    expect(FavoriteModel.findOneAndUpdate).toHaveBeenCalled();
  });

  it('should process a valid remove request', async () => {
    const payload = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      spot_id: 'spot_1',
      action: 'remove',
    };

    const req = new NextRequest('http://localhost/api/favorite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({ success: true });

    expect(connectDB).toHaveBeenCalled();
    expect(FavoriteModel.deleteOne).toHaveBeenCalled();
  });
});
