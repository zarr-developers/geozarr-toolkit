/**
 * Zarr store creation and hierarchy discovery.
 *
 * Tries four strategies in order:
 * 1. Zarr v3 inline consolidated metadata (root zarr.json)
 * 2. Zarr v2 consolidated metadata (.zmetadata)
 * 3. HTML directory crawling (S3-backed HTTP endpoints)
 * 4. Manual path entry
 *
 * TODO: v3 consolidated metadata support should be contributed upstream to
 * zarrita.js (in consolidated.ts alongside withConsolidated). The natural
 * place is on the Group object, following zarrs's design where consolidated
 * metadata is a group-level property parsed from zarr.json additional fields.
 *
 * @typedef {"consolidated-v3"|"consolidated-v2"|"crawled"|"manual"} DiscoveryMethod
 *
 * @typedef {Object} StoreResult
 * @property {object} store - The zarrita FetchStore or Listable store
 * @property {string} url - Normalized store URL
 * @property {DiscoveryMethod} discovery - How the hierarchy was discovered
 * @property {2|3|null} zarrFormat - Detected Zarr format version (null if unknown)
 * @property {import("./consolidated-v3.js").V3NodeEntry[]|null} v3Entries - v3 consolidated entries
 * @property {import("./crawl.js").CrawlEntry[]|null} crawledEntries - Crawled entries
 */

import * as zarr from "zarrita";
import { tryV3Consolidated } from "./consolidated-v3.js";
import { tryCrawlDirectory } from "./crawl.js";

/**
 * Open a remote Zarr store by URL.
 *
 * @param {string} url - URL to the Zarr store root
 * @param {object} [options]
 * @param {(path: string) => void} [options.onProgress] - Progress callback for crawling
 * @returns {Promise<StoreResult>}
 */
export async function openStore(url, options = {}) {
  const normalizedUrl = url.replace(/\/+$/, "");
  const fetchStore = new zarr.FetchStore(normalizedUrl);

  // Strategy 1: v3 inline consolidated metadata
  const v3Result = await tryV3Consolidated(normalizedUrl);
  if (v3Result) {
    return {
      store: fetchStore,
      url: normalizedUrl,
      discovery: "consolidated-v3",
      zarrFormat: 3,
      v3Entries: v3Result.entries,
      crawledEntries: null,
    };
  }

  // Strategy 2: v2 consolidated metadata (.zmetadata)
  try {
    const listable = await zarr.withConsolidated(fetchStore);
    return {
      store: listable,
      url: normalizedUrl,
      discovery: "consolidated-v2",
      zarrFormat: 2,
      v3Entries: null,
      crawledEntries: null,
    };
  } catch {
    // No v2 consolidated metadata
  }

  // Strategy 3: HTML directory crawling
  const entries = await tryCrawlDirectory(normalizedUrl, {
    onProgress: options.onProgress,
  });
  if (entries) {
    return {
      store: fetchStore,
      url: normalizedUrl,
      discovery: "crawled",
      zarrFormat: entries[0]?.zarrFormat ?? null,
      v3Entries: null,
      crawledEntries: entries,
    };
  }

  // Strategy 4: manual
  return {
    store: fetchStore,
    url: normalizedUrl,
    discovery: "manual",
    zarrFormat: null,
    v3Entries: null,
    crawledEntries: null,
  };
}
