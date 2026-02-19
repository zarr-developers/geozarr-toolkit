import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock zarrita before importing hierarchy.js
vi.mock("zarrita", () => {
  return {
    root: (store) => ({
      resolve: (path) => ({ store, path }),
    }),
    open: async (location, opts) => {
      const store = location.store;
      const path = location.path;
      const entry = store._nodes?.[path];

      if (!entry) {
        throw new Error(`Node not found: ${path}`);
      }

      return entry;
    },
  };
});

import { buildTree, openNode, insertNode, findNode } from "../src/hierarchy.js";

/** Create a mock listable store with consolidated metadata. */
function createMockListableStore(nodes) {
  const nodeMap = {};
  for (const node of nodes) {
    nodeMap[node.path] = {
      kind: node.kind,
      attrs: node.attrs || {},
      ...(node.kind === "array"
        ? { shape: node.shape || [], dtype: node.dtype || "float32", chunks: node.chunks || [] }
        : {}),
    };
  }

  return {
    _nodes: nodeMap,
    contents() {
      return nodes.map((n) => ({ path: n.path, kind: n.kind }));
    },
    async get() {
      return undefined;
    },
  };
}

describe("buildTree", () => {
  it("builds a tree from consolidated metadata", async () => {
    const store = createMockListableStore([
      { path: "/", kind: "group", attrs: {} },
      { path: "/data", kind: "array", attrs: { "proj:code": "EPSG:4326" }, shape: [100, 200] },
      { path: "/overview", kind: "group", attrs: {} },
      { path: "/overview/level0", kind: "array", attrs: {}, shape: [50, 100] },
    ]);

    const tree = await buildTree(store);

    expect(tree.path).toBe("/");
    expect(tree.kind).toBe("group");
    expect(tree.children).toHaveLength(2);

    // Children sorted alphabetically
    expect(tree.children[0].path).toBe("/data");
    expect(tree.children[0].kind).toBe("array");
    expect(tree.children[0].attrs["proj:code"]).toBe("EPSG:4326");

    expect(tree.children[1].path).toBe("/overview");
    expect(tree.children[1].kind).toBe("group");
    expect(tree.children[1].children).toHaveLength(1);
    expect(tree.children[1].children[0].path).toBe("/overview/level0");
  });

  it("creates root node if not in contents", async () => {
    const store = createMockListableStore([
      { path: "/data", kind: "array", attrs: {} },
    ]);

    const tree = await buildTree(store);
    expect(tree.path).toBe("/");
    expect(tree.kind).toBe("group");
    // /data won't be a child of root because its parent "/" isn't in the contents
    // but we create a synthetic root, so it should still be parented
  });
});

describe("openNode", () => {
  it("opens a node at a given path", async () => {
    const store = {
      _nodes: {
        "/myarray": {
          kind: "array",
          attrs: { "spatial:dimensions": ["Y", "X"] },
          shape: [512, 512],
          dtype: "int16",
          chunks: [256, 256],
        },
      },
    };

    const node = await openNode(store, "/myarray");
    expect(node.path).toBe("/myarray");
    expect(node.kind).toBe("array");
    expect(node.shape).toEqual([512, 512]);
    expect(node.dtype).toBe("int16");
    expect(node.attrs["spatial:dimensions"]).toEqual(["Y", "X"]);
  });

  it("normalizes path without leading slash", async () => {
    const store = {
      _nodes: {
        "/group1": { kind: "group", attrs: {} },
      },
    };

    const node = await openNode(store, "group1");
    expect(node.path).toBe("/group1");
  });

  it("returns error node when path not found", async () => {
    const store = { _nodes: {} };
    const node = await openNode(store, "/nonexistent");
    expect(node.path).toBe("/nonexistent");
    expect(node._error).toBeDefined();
  });
});

describe("insertNode", () => {
  it("inserts a child into the tree", () => {
    const root = {
      path: "/",
      kind: "group",
      children: [],
      attrs: {},
    };

    const child = {
      path: "/newarray",
      kind: "array",
      children: [],
      attrs: {},
    };

    insertNode(root, child);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].path).toBe("/newarray");
  });

  it("does not duplicate when inserting same path", () => {
    const root = {
      path: "/",
      kind: "group",
      children: [{ path: "/data", kind: "array", children: [], attrs: {} }],
      attrs: {},
    };

    insertNode(root, { path: "/data", kind: "array", children: [], attrs: {} });
    expect(root.children).toHaveLength(1);
  });

  it("sorts children after insertion", () => {
    const root = {
      path: "/",
      kind: "group",
      children: [{ path: "/b", kind: "array", children: [], attrs: {} }],
      attrs: {},
    };

    insertNode(root, { path: "/a", kind: "array", children: [], attrs: {} });
    expect(root.children[0].path).toBe("/a");
    expect(root.children[1].path).toBe("/b");
  });
});

describe("findNode", () => {
  it("finds root", () => {
    const root = { path: "/", kind: "group", children: [], attrs: {} };
    expect(findNode(root, "/")).toBe(root);
  });

  it("finds nested node", () => {
    const child = { path: "/a/b", kind: "array", children: [], attrs: {} };
    const root = {
      path: "/",
      kind: "group",
      children: [
        {
          path: "/a",
          kind: "group",
          children: [child],
          attrs: {},
        },
      ],
      attrs: {},
    };

    expect(findNode(root, "/a/b")).toBe(child);
  });

  it("returns undefined for missing path", () => {
    const root = { path: "/", kind: "group", children: [], attrs: {} };
    expect(findNode(root, "/missing")).toBeUndefined();
  });
});
