import { describe, it, expect, vi, beforeEach } from "vitest";
import { tryV3Consolidated, parseV3Consolidated } from "../src/consolidated-v3.js";
import { buildTreeFromV3 } from "../src/hierarchy.js";

const SAMPLE_ROOT_ZARR_JSON = {
  zarr_format: 3,
  node_type: "group",
  attributes: { title: "Test dataset" },
  consolidated_metadata: {
    kind: "inline",
    must_understand: false,
    metadata: {
      measurements: {
        zarr_format: 3,
        node_type: "group",
        attributes: {},
        consolidated_metadata: { kind: "inline", must_understand: false, metadata: {} },
      },
      "measurements/reflectance": {
        zarr_format: 3,
        node_type: "group",
        attributes: {
          zarr_conventions: [
            { uuid: "d35379db-88df-4056-af3a-620245f8e347", name: "multiscales" },
            { uuid: "689b58e2-cf7b-45e0-9fff-9cfc0883d6b4", name: "spatial:" },
          ],
          "spatial:dimensions": ["Y", "X"],
        },
      },
      "measurements/reflectance/r10m": {
        zarr_format: 3,
        node_type: "group",
        attributes: { "spatial:dimensions": ["Y", "X"] },
      },
      "measurements/reflectance/r10m/b02": {
        zarr_format: 3,
        node_type: "array",
        attributes: { dtype: "uint16", long_name: "Band 2" },
        shape: [10980, 10980],
        data_type: "uint16",
        chunk_grid: { name: "regular", configuration: { chunk_shape: [1024, 1024] } },
      },
    },
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("parseV3Consolidated", () => {
  it("parses v3 consolidated metadata from root zarr.json", () => {
    const result = parseV3Consolidated(SAMPLE_ROOT_ZARR_JSON);

    expect(result).not.toBeNull();
    expect(result.entries).toHaveLength(5); // root + 4 children

    const root = result.entries.find((e) => e.path === "/");
    expect(root.kind).toBe("group");
    expect(root.attrs.title).toBe("Test dataset");

    const reflectance = result.entries.find((e) => e.path === "/measurements/reflectance");
    expect(reflectance.kind).toBe("group");
    expect(reflectance.attrs.zarr_conventions).toHaveLength(2);

    const b02 = result.entries.find((e) => e.path === "/measurements/reflectance/r10m/b02");
    expect(b02.kind).toBe("array");
    expect(b02.meta.shape).toEqual([10980, 10980]);
    expect(b02.meta.data_type).toBe("uint16");
  });

  it("returns null for non-v3 metadata", () => {
    expect(parseV3Consolidated({ zarr_format: 2 })).toBeNull();
    expect(parseV3Consolidated({})).toBeNull();
    expect(parseV3Consolidated(null)).toBeNull();
  });

  it("returns null when consolidated_metadata is missing", () => {
    expect(parseV3Consolidated({ zarr_format: 3, node_type: "group" })).toBeNull();
  });
});

describe("tryV3Consolidated", () => {
  it("fetches and parses root zarr.json", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_ROOT_ZARR_JSON), { status: 200 }),
    );

    const result = await tryV3Consolidated("https://example.com/data.zarr");
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(5);
    expect(fetch).toHaveBeenCalledWith("https://example.com/data.zarr/zarr.json");
  });

  it("returns null on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    const result = await tryV3Consolidated("https://example.com/data.zarr");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const result = await tryV3Consolidated("https://example.com/data.zarr");
    expect(result).toBeNull();
  });
});

describe("buildTreeFromV3", () => {
  it("builds a tree from v3 entries without HTTP requests", () => {
    const result = parseV3Consolidated(SAMPLE_ROOT_ZARR_JSON);
    const tree = buildTreeFromV3(result.entries);

    expect(tree.path).toBe("/");
    expect(tree.kind).toBe("group");
    expect(tree.children).toHaveLength(1); // measurements

    const measurements = tree.children[0];
    expect(measurements.path).toBe("/measurements");
    expect(measurements.children).toHaveLength(1); // reflectance

    const reflectance = measurements.children[0];
    expect(reflectance.path).toBe("/measurements/reflectance");
    expect(reflectance.attrs.zarr_conventions).toHaveLength(2);

    const r10m = reflectance.children[0];
    expect(r10m.path).toBe("/measurements/reflectance/r10m");
    expect(r10m.children).toHaveLength(1); // b02

    const b02 = r10m.children[0];
    expect(b02.path).toBe("/measurements/reflectance/r10m/b02");
    expect(b02.kind).toBe("array");
    expect(b02.shape).toEqual([10980, 10980]);
    expect(b02.dtype).toBe("uint16");
  });
});
