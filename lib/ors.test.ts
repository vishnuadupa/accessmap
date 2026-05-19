import test, { describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";

describe("geocode", () => {
  let originalFetch: typeof global.fetch;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalApiKey = process.env.ORS_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.ORS_API_KEY;
    } else {
      process.env.ORS_API_KEY = originalApiKey;
    }
  });

  async function getGeocodeModule(apiKey: string | undefined) {
    if (apiKey === undefined) {
      delete process.env.ORS_API_KEY;
    } else {
      process.env.ORS_API_KEY = apiKey;
    }
    // Bust ESM cache by appending a random query parameter
    const m = await import(`./ors.ts?bust=${Math.random()}`);
    return m.geocode;
  }

  test("Missing API Key", async () => {
    const geocode = await getGeocodeModule(undefined);

    // Silence console.warn for this test
    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };

    const result = await geocode("Seattle, WA");

    console.warn = originalWarn;

    assert.strictEqual(result, null);
    assert.strictEqual(warned, true);
  });

  test("Valid Request", async () => {
    const geocode = await getGeocodeModule("test-api-key");

    let requestedUrl = "";
    global.fetch = mock.fn(async (url: URL | RequestInfo) => {
      requestedUrl = url.toString();
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: [-122.3321, 47.6062] },
              properties: { label: "Seattle, WA", confidence: 1, accuracy: "centroid" },
            },
          ],
        }),
      } as Response;
    });

    const result = await geocode("Seattle, WA");

    assert.strictEqual(
      requestedUrl,
      "https://api.openrouteservice.org/geocode/search?api_key=test-api-key&text=Seattle%2C+WA&size=1"
    );
    assert.deepStrictEqual(result, {
      lat: 47.6062,
      lon: -122.3321,
      display_name: "Seattle, WA",
      confidence: 1,
      accuracy: "centroid",
    });
  });

  test("URL Encoding", async () => {
    const geocode = await getGeocodeModule("test-api-key");

    let requestedUrl = "";
    global.fetch = mock.fn(async (url: URL | RequestInfo) => {
      requestedUrl = url.toString();
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: [0, 0] },
              properties: { label: "Test", confidence: 1, accuracy: "point" },
            },
          ],
        }),
      } as Response;
    });

    await geocode("hello world &?%");

    assert.strictEqual(
      requestedUrl,
      "https://api.openrouteservice.org/geocode/search?api_key=test-api-key&text=hello+world+%26%3F%25&size=1"
    );
  });

  test("Failed fetch (resp.ok is false)", async () => {
    const geocode = await getGeocodeModule("test-api-key");

    global.fetch = mock.fn(async () => {
      return {
        ok: false,
        status: 500,
      } as Response;
    });

    const result = await geocode("Seattle, WA");
    assert.strictEqual(result, null);
  });

  test("Failed fetch (throws error)", async () => {
    const geocode = await getGeocodeModule("test-api-key");

    global.fetch = mock.fn(async () => {
      throw new Error("Network error");
    });

    const result = await geocode("Seattle, WA");
    assert.strictEqual(result, null);
  });

  test("Empty response", async () => {
    const geocode = await getGeocodeModule("test-api-key");

    global.fetch = mock.fn(async () => {
      return {
        ok: true,
        json: async () => ({ features: [] }),
      } as Response;
    });

    const result = await geocode("Seattle, WA");
    assert.strictEqual(result, null);
  });
});
