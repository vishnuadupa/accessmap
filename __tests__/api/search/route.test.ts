import { NextRequest } from "next/server";
import { POST } from "../../../app/api/search/route";
import { describe, it, expect } from "vitest";

describe("POST /api/search", () => {
  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: "invalid json",
    });

    const response = await POST(req);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json).toEqual({ error: "Invalid JSON body", spots: [], intent: null });
  });
});
