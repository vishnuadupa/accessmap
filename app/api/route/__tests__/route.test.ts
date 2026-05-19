import { POST } from "../route";
import { NextRequest } from "next/server";

// Mocking dependencies
jest.mock("@/lib/ors", () => ({
  getWheelchairRoute: jest.fn(),
}));

jest.mock("@/lib/cache", () => ({
  getCachedRoute: jest.fn(),
  setCachedRoute: jest.fn().mockResolvedValue(undefined),
  checkIpRateLimit: jest.fn(),
  recordIpRequest: jest.fn().mockResolvedValue(undefined),
}));

import { getWheelchairRoute } from "@/lib/ors";
import { getCachedRoute, setCachedRoute, checkIpRateLimit, recordIpRequest } from "@/lib/cache";

describe("POST /api/route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validBody = {
    origin: [40.7128, -74.0060],
    destination: [40.7129, -74.0061],
    spot_id: "valid_spot_id",
  };

  function createRequest(body: any) {
    return new NextRequest("http://localhost/api/route", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("should return 400 if request body is invalid JSON", async () => {
    const req = createRequest("invalid json");
    const response = await POST(req);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
  });

  it("should return 400 if request has invalid schema", async () => {
    const req = createRequest({ origin: "invalid" });
    const response = await POST(req);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
  });

  it("should return 400 if coordinates are out of bounds", async () => {
    const req = createRequest({
      origin: [100, -74.0060], // Invalid latitude
      destination: [40.7129, -74.0061],
      spot_id: "valid_spot_id",
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid coordinates" });
  });

  it("should return 429 if rate limit is exceeded", async () => {
    (checkIpRateLimit as jest.Mock).mockResolvedValueOnce(false);

    const req = createRequest(validBody);
    const response = await POST(req);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "Too many requests. Please wait a moment and try again." });
  });

  it("should return cached route if available", async () => {
    (checkIpRateLimit as jest.Mock).mockResolvedValueOnce(true);
    const cachedRoute = { distance_m: 100 };
    (getCachedRoute as jest.Mock).mockResolvedValueOnce(cachedRoute);

    const req = createRequest(validBody);
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(cachedRoute);
    expect(getWheelchairRoute).not.toHaveBeenCalled();
    expect(recordIpRequest).not.toHaveBeenCalled();
  });

  it("should fetch route from ORS on cache miss", async () => {
    (checkIpRateLimit as jest.Mock).mockResolvedValueOnce(true);
    (getCachedRoute as jest.Mock).mockResolvedValueOnce(null);
    const mockRoute = { distance_m: 200 };
    (getWheelchairRoute as jest.Mock).mockResolvedValueOnce(mockRoute);

    const req = createRequest(validBody);
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(mockRoute);
    expect(recordIpRequest).toHaveBeenCalled();
    expect(getWheelchairRoute).toHaveBeenCalledWith(validBody.origin, validBody.destination);
    expect(setCachedRoute).toHaveBeenCalledWith(validBody.origin, validBody.destination, mockRoute);
  });

  it("should return 422 if ORS returns no route", async () => {
    (checkIpRateLimit as jest.Mock).mockResolvedValueOnce(true);
    (getCachedRoute as jest.Mock).mockResolvedValueOnce(null);
    (getWheelchairRoute as jest.Mock).mockResolvedValueOnce(null);

    const req = createRequest(validBody);
    const response = await POST(req);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "route_unavailable",
      message: "Wheelchair routing is unavailable for this route. The spot is pinned on the map.",
    });
    expect(recordIpRequest).toHaveBeenCalled();
    expect(setCachedRoute).not.toHaveBeenCalled();
  });
});
