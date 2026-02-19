/**
 * Zarr v3 inline consolidated metadata parser.
 *
 * Zarr v3 stores can embed consolidated metadata directly in the root
 * `zarr.json` under the `consolidated_metadata` field. This provides a
 * complete listing of all nodes and their attributes in a single file.
 *
 * Format:
 * ```json
 * {
 *   "zarr_format": 3,
 *   "node_type": "group",
 *   "attributes": { ... },
 *   "consolidated_metadata": {
 *     "kind": "inline",
 *     "must_understand": false,
 *     "metadata": {
 *       "child/path": { "zarr_format": 3, "node_type": "group", "attributes": { ... } },
 *       "child/array": { "zarr_format": 3, "node_type": "array", "attributes": { ... }, ... }
 *     }
 *   }
 * }
 * ```
 *
 * @typedef {Object} V3ConsolidatedResult
 * @property {V3NodeEntry[]} entries - All nodes including root
 * @property {object} rootMeta - The full root zarr.json object
 *
 * @typedef {Object} V3NodeEntry
 * @property {string} path - Absolute path (e.g. "/", "/measurements/reflectance")
 * @property {"group"|"array"} kind - Node type
 * @property {Record<string, any>} attrs - Node attributes
 * @property {object} meta - Full node metadata (for arrays: includes shape, dtype, etc.)
 */

/**
 * Try to fetch and parse v3 consolidated metadata from a store's root zarr.json.
 *
 * @param {string} baseUrl - Store root URL (no trailing slash)
 * @returns {Promise<V3ConsolidatedResult|null>} Parsed result, or null if not v3 consolidated
 */
export async function tryV3Consolidated(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/zarr.json`);
    if (!response.ok) return null;

    const rootMeta = await response.json();
    return parseV3Consolidated(rootMeta);
  } catch {
    return null;
  }
}

/**
 * Parse v3 consolidated metadata from a root zarr.json object.
 *
 * @param {object} rootMeta - Parsed root zarr.json
 * @returns {V3ConsolidatedResult|null}
 */
export function parseV3Consolidated(rootMeta) {
  if (!rootMeta || rootMeta.zarr_format !== 3) return null;

  const cm = rootMeta.consolidated_metadata;
  if (!cm || typeof cm !== "object") return null;
  if (!cm.metadata || typeof cm.metadata !== "object") return null;

  /** @type {V3NodeEntry[]} */
  const entries = [];

  // Root node
  entries.push({
    path: "/",
    kind: rootMeta.node_type || "group",
    attrs: rootMeta.attributes || {},
    meta: rootMeta,
  });

  // Child nodes from consolidated_metadata.metadata
  for (const [relativePath, nodeMeta] of Object.entries(cm.metadata)) {
    if (!nodeMeta || typeof nodeMeta !== "object") continue;

    const absolutePath = `/${relativePath}`;
    const kind = nodeMeta.node_type || "group";

    entries.push({
      path: absolutePath,
      kind,
      attrs: nodeMeta.attributes || {},
      meta: nodeMeta,
    });
  }

  return { entries, rootMeta };
}

/**
 * Flatten v3 consolidated metadata into the contents() format expected
 * by the hierarchy builder.
 *
 * @param {V3NodeEntry[]} entries
 * @returns {{ path: string, kind: "group"|"array" }[]}
 */
export function v3EntriesToContents(entries) {
  return entries.map((e) => ({ path: e.path, kind: e.kind }));
}
