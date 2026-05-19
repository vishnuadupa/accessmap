import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SpotModel } from '@/models/Spot';

let mongoServer: MongoMemoryServer;

describe('SpotModel', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await SpotModel.deleteMany({});
  });

  it('should create a valid spot with all required fields', async () => {
    const validSpot = {
      osm_id: '123456',
      osm_type: 'node',
      name: 'Test Parking',
      loc: { type: 'Point', coordinates: [10, 20] },
      cache_key: 'test_key',
    };

    const spot = new SpotModel(validSpot);
    const savedSpot = await spot.save();

    expect(savedSpot._id).toBeDefined();
    expect(savedSpot.osm_id).toBe(validSpot.osm_id);
    expect(savedSpot.osm_type).toBe(validSpot.osm_type);
    expect(savedSpot.name).toBe(validSpot.name);
    expect(savedSpot.loc.type).toBe('Point');
    expect(savedSpot.loc.coordinates).toEqual([10, 20]);
    expect(savedSpot.cache_key).toBe(validSpot.cache_key);

    // Check default values
    expect(savedSpot.wheelchair).toBe('unknown');
    expect(savedSpot.report_flags).toBe(0);
    expect(savedSpot.cached_at).toBeDefined();
    expect(savedSpot.capacity_disabled).toBeNull();
    expect(savedSpot.van_accessible).toBeNull();
  });

  it('should fail validation when osm_id is missing', async () => {
    const invalidSpot = new SpotModel({
      osm_type: 'node',
      loc: { type: 'Point', coordinates: [10, 20] },
      cache_key: 'test_key',
    });

    let error;
    try {
      await invalidSpot.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error?.name).toBe('ValidationError');
    expect(error?.errors?.osm_id).toBeDefined();
  });

  it('should fail validation when cache_key is missing', async () => {
    const invalidSpot = new SpotModel({
      osm_id: '123456',
      osm_type: 'node',
      loc: { type: 'Point', coordinates: [10, 20] },
    });

    let error;
    try {
      await invalidSpot.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error?.name).toBe('ValidationError');
    expect(error?.errors?.cache_key).toBeDefined();
  });

  it('should fail validation with invalid osm_type', async () => {
    const invalidSpot = new SpotModel({
      osm_id: '123456',
      osm_type: 'invalid', // should be node, way, or relation
      loc: { type: 'Point', coordinates: [10, 20] },
      cache_key: 'test_key',
    });

    let error;
    try {
      await invalidSpot.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error?.name).toBe('ValidationError');
    expect(error?.errors?.osm_type).toBeDefined();
  });

  it('should fail validation with invalid wheelchair status', async () => {
    const invalidSpot = new SpotModel({
      osm_id: '123456',
      osm_type: 'node',
      loc: { type: 'Point', coordinates: [10, 20] },
      cache_key: 'test_key',
      wheelchair: 'invalid_status' // should be yes, limited, no, or unknown
    });

    let error;
    try {
      await invalidSpot.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error?.name).toBe('ValidationError');
    expect(error?.errors?.wheelchair).toBeDefined();
  });

  it('should fail validation when loc is missing', async () => {
    const invalidSpot = new SpotModel({
      osm_id: '123456',
      osm_type: 'node',
      cache_key: 'test_key',
    });

    let error;
    try {
      await invalidSpot.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error?.name).toBe('ValidationError');
    expect(error?.errors['loc.type']).toBeDefined();
    expect(error?.errors['loc.coordinates']).toBeDefined();
  });

  it('should fail validation when loc.type is not Point', async () => {
    const invalidSpot = new SpotModel({
      osm_id: '123456',
      osm_type: 'node',
      loc: { type: 'Polygon', coordinates: [[10, 20], [10, 21]] },
      cache_key: 'test_key',
    });

    let error;
    try {
      await invalidSpot.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error?.name).toBe('ValidationError');
    expect(error?.errors['loc.type']).toBeDefined();
  });
});
