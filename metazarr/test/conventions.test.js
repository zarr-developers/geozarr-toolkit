import { describe, it, expect } from "vitest";
import { detectConventions, getKnownConvention } from "../src/conventions.js";

describe("detectConventions", () => {
  it("detects conventions from zarr_conventions array", () => {
    const attrs = {
      zarr_conventions: [
        {
          uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f",
          name: "proj:",
          schema_url:
            "https://raw.githubusercontent.com/zarr-experimental/geo-proj/refs/tags/v1/schema.json",
        },
        {
          uuid: "689b58e2-cf7b-45e0-9fff-9cfc0883d6b4",
          name: "spatial:",
          schema_url:
            "https://raw.githubusercontent.com/zarr-conventions/spatial/refs/tags/v1/schema.json",
        },
      ],
      "proj:code": "EPSG:26711",
      "spatial:dimensions": ["Y", "X"],
    };

    const result = detectConventions(attrs);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("proj:");
    expect(result[0].display).toBe("Geospatial Projection (proj:)");
    expect(result[0].schemaUrl).toContain("geo-proj");
    expect(result[1].name).toBe("spatial:");
    expect(result[1].display).toBe("Spatial Coordinates (spatial:)");
  });

  it("detects multiple conventions including multiscales", () => {
    const attrs = {
      zarr_conventions: [
        {
          uuid: "d35379db-88df-4056-af3a-620245f8e347",
          name: "multiscales",
        },
        {
          uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f",
          name: "proj:",
        },
        {
          uuid: "689b58e2-cf7b-45e0-9fff-9cfc0883d6b4",
          name: "spatial:",
        },
      ],
    };

    const result = detectConventions(attrs);
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.name)).toEqual([
      "multiscales",
      "proj:",
      "spatial:",
    ]);
  });

  it("detects CF convention", () => {
    const attrs = {
      zarr_conventions: [
        {
          uuid: "77c308c7-4db2-4774-8b2d-aa37e9997db6",
          name: "CF",
        },
      ],
    };

    const result = detectConventions(attrs);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("CF");
    expect(result[0].display).toBe("CF (Climate and Forecast)");
  });

  it("falls back to key prefix detection with schema URLs", () => {
    const attrs = {
      "proj:code": "EPSG:4326",
      "spatial:dimensions": ["Y", "X"],
      "spatial:transform": [1, 0, 0, 0, -1, 90],
    };

    const result = detectConventions(attrs);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name).sort()).toEqual(["proj:", "spatial:"]);
    // Fallback detection still provides schema URLs from the registry
    for (const conv of result) {
      expect(conv.schemaUrl).toContain("refs/heads/main");
    }
  });

  it("falls back to key detection for multiscales with schema URL", () => {
    const attrs = {
      multiscales: { layout: [] },
    };

    const result = detectConventions(attrs);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("multiscales");
    expect(result[0].schemaUrl).toContain("multiscales");
  });

  it("returns empty array for null/undefined attrs", () => {
    expect(detectConventions(null)).toEqual([]);
    expect(detectConventions(undefined)).toEqual([]);
  });

  it("returns empty array for attrs with no conventions", () => {
    const attrs = { some_key: "value" };
    expect(detectConventions(attrs)).toEqual([]);
  });

  it("handles unknown UUIDs gracefully", () => {
    const attrs = {
      zarr_conventions: [
        {
          uuid: "00000000-0000-0000-0000-000000000000",
          name: "custom:",
          description: "A custom convention",
        },
      ],
    };

    const result = detectConventions(attrs);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("custom:");
    expect(result[0].display).toBe("custom:");
  });

  it("uses registry schemaUrl for known conventions over data schema_url", () => {
    const attrs = {
      zarr_conventions: [
        {
          uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f",
          name: "proj:",
          schema_url: "https://example.com/old-tagged-schema.json",
          spec_url: "https://example.com/spec",
        },
      ],
    };

    const result = detectConventions(attrs);
    expect(result[0].schemaUrl).toContain("refs/heads/main");
    expect(result[0].schemaUrl).toContain("geo-proj");
    // Registry specUrl takes precedence over data spec_url for known conventions
    expect(result[0].specUrl).toContain("geo-proj");
    expect(result[0].specUrl).toContain("blob/main");
  });

  it("uses data schema_url for unknown conventions", () => {
    const attrs = {
      zarr_conventions: [
        {
          uuid: "00000000-0000-0000-0000-111111111111",
          name: "custom:",
          schema_url: "https://example.com/custom-schema.json",
        },
      ],
    };

    const result = detectConventions(attrs);
    expect(result[0].schemaUrl).toBe("https://example.com/custom-schema.json");
  });

  it("does not duplicate conventions", () => {
    const attrs = {
      zarr_conventions: [
        { uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f", name: "proj:" },
        { uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f", name: "proj:" },
      ],
    };

    const result = detectConventions(attrs);
    expect(result).toHaveLength(1);
  });
});

describe("getKnownConvention", () => {
  it("returns known convention by UUID", () => {
    const conv = getKnownConvention(
      "f17cb550-5864-4468-aeb7-f3180cfb622f",
    );
    expect(conv).toBeDefined();
    expect(conv.name).toBe("proj:");
  });

  it("returns undefined for unknown UUID", () => {
    expect(
      getKnownConvention("00000000-0000-0000-0000-000000000000"),
    ).toBeUndefined();
  });
});
