import { describe, it, expect } from "vitest";
import { parseTag } from "../lib/overpass";

describe("parseTag capacity parsing", () => {
  it("parses valid positive integer capacities", () => {
    const result = parseTag({ capacity: "150", "capacity:disabled": "5" });
    expect(result.capacity_total).toBe(150);
    expect(result.capacity_disabled).toBe(5);
  });

  it("handles missing or empty string capacities", () => {
    const result1 = parseTag({});
    expect(result1.capacity_total).toBeNull();
    expect(result1.capacity_disabled).toBeNull();

    const result2 = parseTag({ capacity: "", "capacity:disabled": "" });
    expect(result2.capacity_total).toBeNull();
    expect(result2.capacity_disabled).toBeNull();
  });

  it("handles zero values (should be null based on current logic > 0)", () => {
    const result = parseTag({ capacity: "0", "capacity:disabled": "0" });
    expect(result.capacity_total).toBeNull();
    expect(result.capacity_disabled).toBeNull();
  });

  it("handles negative numbers (should be null based on current logic > 0)", () => {
    const result = parseTag({ capacity: "-10", "capacity:disabled": "-2" });
    expect(result.capacity_total).toBeNull();
    expect(result.capacity_disabled).toBeNull();
  });

  it("handles non-numeric strings (should be null)", () => {
    const result = parseTag({ capacity: "unknown", "capacity:disabled": "none" });
    expect(result.capacity_total).toBeNull();
    expect(result.capacity_disabled).toBeNull();
  });

  it("parses numbers with trailing text (parseInt behavior)", () => {
    // parseInt("12 spaces", 10) returns 12
    const result = parseTag({ capacity: "120 spaces", "capacity:disabled": "12 reserved" });
    expect(result.capacity_total).toBe(120);
    expect(result.capacity_disabled).toBe(12);
  });

  it("handles excessively large numbers (should be null based on thresholds)", () => {
    // Thresholds are < 100000 for total, < 10000 for disabled
    const result = parseTag({ capacity: "100000", "capacity:disabled": "10000" });
    expect(result.capacity_total).toBeNull();
    expect(result.capacity_disabled).toBeNull();

    const result2 = parseTag({ capacity: "99999", "capacity:disabled": "9999" });
    expect(result2.capacity_total).toBe(99999);
    expect(result2.capacity_disabled).toBe(9999);
  });
});
