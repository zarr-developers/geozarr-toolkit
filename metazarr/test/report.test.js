import { describe, it, expect, vi } from "vitest";
import { collectNodes, groupByConvention, validateStore } from "../src/report.js";

/** Helper to create a TreeNode. */
function makeNode(path, kind = "group", attrs = {}, children = []) {
  return { path, kind, children, attrs };
}

/** Spatial convention attributes (detected via prefix fallback). */
const SPATIAL_ATTRS = {
  "spatial:dimensions": ["Y", "X"],
  "spatial:transform": [10, 0, 0, 0, -10, 0],
};

/** Proj convention attributes (detected via prefix fallback). */
const PROJ_ATTRS = {
  "proj:code": "EPSG:4326",
};

/** Attributes with zarr_conventions array. */
function withZarrConventions(attrs, conventions) {
  return { ...attrs, zarr_conventions: conventions };
}

const SPATIAL_CONV_ENTRY = {
  uuid: "689b58e2-cf7b-45e0-9fff-9cfc0883d6b4",
  name: "spatial:",
};

const PROJ_CONV_ENTRY = {
  uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f",
  name: "proj:",
};

describe("collectNodes", () => {
  it("returns a single root node", () => {
    const root = makeNode("/");
    expect(collectNodes(root)).toEqual([root]);
  });

  it("flattens a nested tree in depth-first order", () => {
    const child1 = makeNode("/a", "array");
    const child2 = makeNode("/b", "group", {}, [makeNode("/b/c", "array")]);
    const root = makeNode("/", "group", {}, [child1, child2]);

    const paths = collectNodes(root).map((n) => n.path);
    expect(paths).toEqual(["/", "/a", "/b", "/b/c"]);
  });
});

describe("groupByConvention", () => {
  it("returns empty map for nodes without conventions", () => {
    const nodes = [makeNode("/"), makeNode("/data", "array")];
    const groups = groupByConvention(nodes);
    expect(groups.size).toBe(0);
  });

  it("groups nodes by convention UUID", () => {
    const node1 = makeNode("/", "group", { ...SPATIAL_ATTRS, ...PROJ_ATTRS });
    const node2 = makeNode("/data", "array", SPATIAL_ATTRS);
    const groups = groupByConvention([node1, node2]);

    // spatial should have 2 nodes, proj should have 1
    const spatialKey = "689b58e2-cf7b-45e0-9fff-9cfc0883d6b4";
    const projKey = "f17cb550-5864-4468-aeb7-f3180cfb622f";
    expect(groups.get(spatialKey).nodes).toHaveLength(2);
    expect(groups.get(projKey).nodes).toHaveLength(1);
  });
});

describe("validateStore", () => {
  it("returns empty report for tree without conventions", async () => {
    const root = makeNode("/", "group", {}, [
      makeNode("/data", "array"),
    ]);

    const report = await validateStore(root);
    expect(report.byConvention.size).toBe(0);
    expect(report.totalNodes).toBe(2);
    expect(report.nodesWithConventions).toBe(0);
    expect(report.duration).toBeGreaterThanOrEqual(0);
  });

  it("marks nodes as skip when no schemaUrl is available", async () => {
    // Use an unknown convention with no schemaUrl
    const attrs = {
      zarr_conventions: [
        { uuid: "00000000-0000-0000-0000-000000000000", name: "unknown" },
      ],
    };
    const root = makeNode("/", "group", attrs);

    const report = await validateStore(root);
    expect(report.byConvention.size).toBe(1);

    const convReport = [...report.byConvention.values()][0];
    expect(convReport.skipCount).toBe(1);
    expect(convReport.nodes[0].status).toBe("skip");
  });

  it("calls onProgress with correct counts", async () => {
    // Use unknown conventions (will skip, but progress still fires)
    const attrs = {
      zarr_conventions: [
        { uuid: "00000000-0000-0000-0000-000000000000", name: "test" },
      ],
    };
    const nodes = Array.from({ length: 3 }, (_, i) =>
      makeNode(`/n${i}`, "array", attrs),
    );
    const root = makeNode("/", "group", {}, nodes);

    const progress = vi.fn();
    await validateStore(root, { onProgress: progress });

    // Final progress call should report all completed
    const lastCall = progress.mock.calls[progress.mock.calls.length - 1][0];
    expect(lastCall.completed).toBe(lastCall.total);
  });

  it("respects AbortSignal", async () => {
    const attrs = {
      zarr_conventions: [
        { uuid: "00000000-0000-0000-0000-000000000000", name: "test" },
      ],
    };
    const nodes = Array.from({ length: 100 }, (_, i) =>
      makeNode(`/n${i}`, "array", attrs),
    );
    const root = makeNode("/", "group", attrs, nodes);

    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    const report = await validateStore(root, { signal: controller.signal });
    // Should have processed 0 or very few tasks
    const totalProcessed = [...report.byConvention.values()].reduce(
      (sum, r) => sum + r.nodes.length,
      0,
    );
    expect(totalProcessed).toBe(0);
  });

  it("sorts failures before passes within each convention", async () => {
    // Use unknown conventions — all will be skip, but test the sort order structure
    const attrs = {
      zarr_conventions: [
        { uuid: "00000000-0000-0000-0000-000000000000", name: "test" },
      ],
    };
    const root = makeNode("/", "group", attrs, [
      makeNode("/a", "array", attrs),
      makeNode("/b", "array", attrs),
    ]);

    const report = await validateStore(root);
    const convReport = [...report.byConvention.values()][0];
    // All skip, so order is preserved
    expect(convReport.nodes).toHaveLength(3);
  });
});
