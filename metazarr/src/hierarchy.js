/**
 * Zarr hierarchy traversal — build a tree of groups and arrays.
 *
 * @typedef {Object} TreeNode
 * @property {string} path - Absolute path (e.g. "/", "/group1/array1")
 * @property {"group"|"array"} kind - Node type
 * @property {TreeNode[]} children - Child nodes (empty for arrays)
 * @property {Record<string, any>} attrs - Node attributes
 * @property {number[]|undefined} shape - Array shape (arrays only)
 * @property {string|undefined} dtype - Array data type (arrays only)
 * @property {any|undefined} chunks - Array chunk configuration (arrays only)
 * @property {object|null|undefined} meta - Raw metadata (.zarray for v2, zarr.json for v3)
 */

import * as zarr from "zarrita";

/**
 * Build a full hierarchy tree from a consolidated (Listable) store.
 *
 * @param {object} listableStore - A Listable store with .contents() method
 * @returns {Promise<TreeNode>}
 */
export async function buildTree(listableStore) {
  const contents = listableStore.contents();
  return buildTreeFromContents(listableStore, contents);
}

/**
 * Build a hierarchy tree from crawled directory entries.
 *
 * For non-consolidated stores where HTML directory crawling discovered the
 * hierarchy, this opens each discovered node to get its metadata.
 *
 * @param {object} store - A zarrita store (FetchStore)
 * @param {import("./crawl.js").CrawlEntry[]} entries - Crawled entries
 * @returns {Promise<TreeNode>}
 */
/**
 * Build a hierarchy tree from v3 inline consolidated metadata.
 *
 * This is the fast path — all metadata is already available from the root
 * zarr.json, so no additional HTTP requests are needed.
 *
 * @param {import("./consolidated-v3.js").V3NodeEntry[]} v3Entries
 * @returns {TreeNode}
 */
export function buildTreeFromV3(v3Entries) {
  /** @type {Map<string, TreeNode>} */
  const nodes = new Map();

  for (const entry of v3Entries) {
    /** @type {TreeNode} */
    const treeNode = {
      path: entry.path,
      kind: entry.kind,
      children: [],
      attrs: entry.attrs,
      meta: entry.meta || null,
    };

    // Extract array metadata from the v3 metadata object if available
    if (entry.kind === "array" && entry.meta) {
      if (entry.meta.shape) treeNode.shape = entry.meta.shape;
      if (entry.meta.data_type) treeNode.dtype = entry.meta.data_type;
      if (entry.meta.chunk_grid) treeNode.chunks = entry.meta.chunk_grid;
    }

    nodes.set(entry.path, treeNode);
  }

  // Ensure root exists
  if (!nodes.has("/")) {
    nodes.set("/", { path: "/", kind: "group", children: [], attrs: {} });
  }

  // Build parent-child relationships
  for (const [path, node] of nodes) {
    if (path === "/") continue;
    const parentPath = getParentPath(path);
    const parent = nodes.get(parentPath);
    if (parent) {
      parent.children.push(node);
    }
  }

  // Sort children
  for (const node of nodes.values()) {
    node.children.sort((a, b) => a.path.localeCompare(b.path));
  }

  return nodes.get("/");
}

export async function buildTreeFromCrawl(store, entries) {
  // Crawl entries have path + kind hint. "unknown" kind means zarr.json exists
  // but we don't know if it's a group or array yet — zarr.open will figure it out.
  const contents = entries.map((e) => ({
    path: e.path,
    kind: e.kind === "unknown" ? undefined : e.kind,
  }));
  return buildTreeFromContents(store, contents);
}

/**
 * @param {object} store
 * @param {{ path: string, kind?: string }[]} contents
 * @returns {Promise<TreeNode>}
 */
async function buildTreeFromContents(store, contents) {

  // Create a flat map of path → TreeNode
  /** @type {Map<string, TreeNode>} */
  const nodes = new Map();

  // Open each node to get attributes and array metadata
  for (const entry of contents) {
    const node = await openNodeFromStore(store, entry.path, entry.kind);
    nodes.set(entry.path, node);
  }

  // Ensure root exists
  if (!nodes.has("/")) {
    nodes.set("/", {
      path: "/",
      kind: "group",
      children: [],
      attrs: {},
    });
  }

  // Build parent-child relationships
  for (const [path, node] of nodes) {
    if (path === "/") continue;
    const parentPath = getParentPath(path);
    const parent = nodes.get(parentPath);
    if (parent) {
      parent.children.push(node);
    }
  }

  // Sort children alphabetically by path
  for (const node of nodes.values()) {
    node.children.sort((a, b) => a.path.localeCompare(b.path));
  }

  return nodes.get("/");
}

/**
 * Open a single node at an arbitrary path. Use this for non-consolidated
 * stores where paths must be added manually.
 *
 * @param {object} store - A zarrita store (FetchStore or Listable)
 * @param {string} path - Path within the store (e.g. "/mygroup/myarray")
 * @returns {Promise<TreeNode>}
 */
export async function openNode(store, path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return openNodeFromStore(store, normalizedPath);
}

/**
 * Insert a child node into an existing tree at the correct position.
 *
 * @param {TreeNode} root - Root of the tree
 * @param {TreeNode} childNode - Node to insert
 * @returns {TreeNode} The root node (mutated in place)
 */
export function insertNode(root, childNode) {
  const parentPath = getParentPath(childNode.path);
  const parent = findNode(root, parentPath);
  if (parent && parent.kind === "group") {
    // Avoid duplicates
    if (!parent.children.some((c) => c.path === childNode.path)) {
      parent.children.push(childNode);
      parent.children.sort((a, b) => a.path.localeCompare(b.path));
    }
  }
  return root;
}

/**
 * Find a node in the tree by path.
 *
 * @param {TreeNode} root
 * @param {string} path
 * @returns {TreeNode|undefined}
 */
export function findNode(root, path) {
  if (root.path === path) return root;
  for (const child of root.children) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return undefined;
}

/**
 * Read the raw metadata file (.zarray or zarr.json) from the store.
 * For consolidated stores, this hits the in-memory cache (no network request).
 *
 * @param {object} store - A zarrita store with a get() method
 * @param {string} path - Node path (e.g. "/", "/group1/array1")
 * @returns {Promise<object|null>} Parsed metadata object, or null
 */
async function readRawMeta(store, path) {
  const prefix = path === "/" ? "" : path;
  // Try v3 first
  try {
    const v3Bytes = await store.get(`${prefix}/zarr.json`);
    if (v3Bytes) {
      return JSON.parse(new TextDecoder().decode(v3Bytes));
    }
  } catch { /* ignore */ }
  // Fall back to v2
  try {
    const v2Bytes = await store.get(`${prefix}/.zarray`);
    if (v2Bytes) {
      return JSON.parse(new TextDecoder().decode(v2Bytes));
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * @param {object} store
 * @param {string} path
 * @param {"group"|"array"} [hintKind]
 * @returns {Promise<TreeNode>}
 */
async function openNodeFromStore(store, path, hintKind) {
  const location = zarr.root(store).resolve(path);

  try {
    const node = hintKind
      ? await zarr.open(location, { kind: hintKind })
      : await zarr.open(location);

    /** @type {TreeNode} */
    const treeNode = {
      path,
      kind: node.kind,
      children: [],
      attrs: node.attrs || {},
    };

    if (node.kind === "array") {
      treeNode.shape = node.shape;
      treeNode.dtype = node.dtype;
      treeNode.chunks = node.chunks;
      treeNode.meta = await readRawMeta(store, path);
    }

    return treeNode;
  } catch (err) {
    // Return a minimal node if we can't open it
    return {
      path,
      kind: hintKind || "group",
      children: [],
      attrs: {},
      _error: err.message,
    };
  }
}

/**
 * Get the parent path of a given path.
 * @param {string} path
 * @returns {string}
 */
function getParentPath(path) {
  if (path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}
