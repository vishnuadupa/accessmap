import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('geocode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ORS_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should handle out of bounds coordinates', async () => {
    const { geocode } = await import('../ors');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        features: [
          {
            geometry: {
              coordinates: [200, 100] // invalid lon (max 180), lat (max 90)
            },
            properties: {
              label: 'Test Location',
              accuracy: 'point'
            }
          }
        ]
      })
    });

    const result = await geocode('test query');
    expect(result).toBeNull();
  });

  it('should handle missing coordinates array', async () => {
    const { geocode } = await import('../ors');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        features: [
          {
            geometry: {
              // Missing coordinates entirely
            },
            properties: {
              label: 'Test Location',
            }
          }
        ]
      })
    });

    const result = await geocode('test query');
    expect(result).toBeNull();
  });

  it('should handle missing geometry', async () => {
    const { geocode } = await import('../ors');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        features: [
          {
            properties: {
              label: 'Test Location',
            }
          }
        ]
      })
    });

    const result = await geocode('test query');
    expect(result).toBeNull();
  });

  it('should handle valid coordinates', async () => {
    const { geocode } = await import('../ors');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        features: [
          {
            geometry: {
              coordinates: [-122.3321, 47.6062] // valid lon, lat
            },
            properties: {
              label: 'Seattle',
              accuracy: 'point'
            }
          }
        ]
      })
    });

    const result = await geocode('seattle');
    expect(result).toEqual({
      lat: 47.6062,
      lon: -122.3321,
      display_name: 'Seattle',
      confidence: null,
      accuracy: 'point'
    });
  });
});
