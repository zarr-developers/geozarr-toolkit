/**
 * Zarr store creation and hierarchy discovery.
 *
 * Tries five strategies in order:
 * 1. Zarr v3 inline consolidated metadata (root zarr.json)
 * 2. Zarr v2 consolidated metadata (.zmetadata)
 * 3. S3 XML listing (ListObjectsV2 for public buckets)
 * 4. HTML directory crawling (S3-backed HTTP endpoints)
 * 5. Manual path entry
 *
 * TODO: v3 consolidated metadata support should be contributed upstream to
 * zarrita.js (in consolidated.ts alongside withConsolidated). The natural
 * place is on the Group object, following zarrs's design where consolidated
 * metadata is a group-level property parsed from zarr.json additional fields.
 *
 * @typedef {"consolidated-v3"|"consolidated-v2"|"crawled"|"s3-list"|"manual"} DiscoveryMethod
 *
 * @typedef {Object} StoreResult
 * @property {object} store - The zarrita FetchStore or Listable store
 * @property {string} url - Normalized store URL
 * @property {DiscoveryMethod} discovery - How the hierarchy was discovered
 * @property {2|3|null} zarrFormat - Detected Zarr format version (null if unknown)
 * @property {import("./consolidated-v3.js").V3NodeEntry[]|null} v3Entries - v3 consolidated entries
 * @property {import("./crawl.js").CrawlEntry[]|null} crawledEntries - Crawled entries
 * @property {boolean} truncated - True if node discovery was capped by maxNodes
 */

import { FetchStore, withConsolidated } from "zarrita";
import { tryV3Consolidated } from "./consolidated-v3.js";
import { tryCrawlDirectory } from "./crawl.js";
import { tryS3List } from "./s3-list.js";

/**
 * AWS region pattern — matches prefixes like "us-west-2", "eu-central-1", etc.
 */
const AWS_REGION_RE =
  /^(us|eu|ap|sa|ca|me|af|il)-(north|south|east|west|central|northeast|southeast|northwest|southwest)-\d+/;

/**
 * Convert an S3 URL to an HTTPS path-style URL for browser access.
 * Path-style avoids SSL issues with dotted bucket names.
 * Detects the region from the bucket name when possible to avoid
 * CORS-blocked redirects from the global S3 endpoint.
 *
 * @param {string} url - Potential S3 URL (s3://bucket/key)
 * @returns {string} HTTPS URL, or the original URL if not an S3 URL
 */
function s3ToHttps(url) {
  const match = url.match(/^s3:\/\/([^/]+)\/?(.*)$/);
  if (!match) return url;
  const [, bucket, key] = match;

  // Try to detect region from bucket name (e.g. "us-west-2.opendata.source.coop")
  const regionMatch = bucket.match(AWS_REGION_RE);
  const region = regionMatch ? regionMatch[0] : "us-east-1";
  const base = `https://s3.${region}.amazonaws.com/${bucket}`;

  return key ? `${base}/${key}` : base;
}

/**
 * Open a remote Zarr store by URL.
 *
 * @param {string} url - URL to the Zarr store root (https:// or s3://)
 * @param {object} [options]
 * @param {number} [options.maxNodes=50] - Maximum nodes to discover (crawl/S3 paths only)
 * @param {(path: string) => void} [options.onProgress] - Progress callback for crawling
 * @returns {Promise<StoreResult>}
 */
export async function openStore(url, options = {}) {
  const maxNodes = options.maxNodes ?? 50;
  const normalizedUrl = s3ToHttps(url).replace(/\/+$/, "");
  const fetchStore = new FetchStore(normalizedUrl);

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
      truncated: false,
    };
  }

  // Strategy 2: v2 consolidated metadata (.zmetadata)
  try {
    const listable = await withConsolidated(fetchStore);
    return {
      store: listable,
      url: normalizedUrl,
      discovery: "consolidated-v2",
      zarrFormat: 2,
      v3Entries: null,
      crawledEntries: null,
      truncated: false,
    };
  } catch {
    // No v2 consolidated metadata
  }

  // Strategy 3: S3 XML listing (tried before HTML crawl — instant no-op
  // for non-S3 URLs, avoids a wasted HTML fetch for S3 URLs)
  const s3Entries = await tryS3List(normalizedUrl, {
    maxNodes,
    onProgress: options.onProgress,
  });
  if (s3Entries) {
    return {
      store: fetchStore,
      url: normalizedUrl,
      discovery: "s3-list",
      zarrFormat: s3Entries[0]?.zarrFormat ?? null,
      v3Entries: null,
      crawledEntries: s3Entries,
      truncated: s3Entries.length >= maxNodes,
    };
  }

  // Strategy 4: HTML directory crawling
  const entries = await tryCrawlDirectory(normalizedUrl, {
    maxNodes,
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
      truncated: entries.length >= maxNodes,
    };
  }

  // All discovery strategies failed — verify the store is reachable at all.
  // CORS failures silently return null from each strategy above, so we do an
  // explicit check to surface a helpful error instead of silently falling
  // through to manual mode with a broken store.
  try {
    const probe = await fetch(normalizedUrl, { method: "HEAD" });
    // If HEAD isn't allowed, try GET — some servers reject HEAD
    if (!probe.ok) {
      const getProbe = await fetch(normalizedUrl);
      if (!getProbe.ok && getProbe.status !== 404) {
        throw new Error(`Server returned HTTP ${getProbe.status}`);
      }
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new CorsError(normalizedUrl);
    }
    throw err;
  }

  // Strategy 5: manual
  return {
    store: fetchStore,
    url: normalizedUrl,
    discovery: "manual",
    zarrFormat: null,
    v3Entries: null,
    crawledEntries: null,
    truncated: false,
  };
}

/**
 * Error thrown when a store URL is unreachable due to CORS restrictions.
 */
export class CorsError extends Error {
  constructor(url) {
    const origin = typeof location !== "undefined" ? location.origin : "this origin";
    super(
      `The server at ${new URL(url).hostname} does not allow requests from ${origin}. ` +
      `This is a CORS (Cross-Origin Resource Sharing) restriction set by the server.`
    );
    this.name = "CorsError";
    this.url = url;
  }
}
