/**
 * metazarr — Client-side Zarr metadata explorer and GeoZarr convention validator.
 *
 * @example
 * import { openStore, buildTree, detectConventions, validateNode, buildNodeDocument } from "metazarr";
 *
 * const { store, consolidated } = await openStore("https://example.com/data.zarr");
 * const tree = consolidated ? await buildTree(store) : await openNode(store, "/");
 * const conventions = detectConventions(tree.attrs);
 * for (const conv of conventions) {
 *   if (conv.schemaUrl) {
 *     const doc = buildNodeDocument(tree);
 *     const result = await validateNode(doc, conv.schemaUrl);
 *     console.log(conv.display, result.valid ? "PASS" : "FAIL", result.errors);
 *   }
 * }
 */

export { openStore } from "./store.js";
export {
  buildTree,
  buildTreeFromV3,
  buildTreeFromCrawl,
  openNode,
  insertNode,
  findNode,
} from "./hierarchy.js";
export { tryV3Consolidated, parseV3Consolidated } from "./consolidated-v3.js";
export { crawlDirectory, tryCrawlDirectory } from "./crawl.js";
export { detectConventions, getKnownConvention } from "./conventions.js";
export { validateNode, buildNodeDocument } from "./validator.js";
export { fetchSchema, clearCache } from "./schema-cache.js";
