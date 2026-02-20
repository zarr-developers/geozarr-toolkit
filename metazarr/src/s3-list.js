/**
 * S3 XML listing for discovering Zarr hierarchy from public S3 buckets.
 *
 * When a Zarr store is hosted on S3 without consolidated metadata, the HTML
 * crawler won't work because S3 returns XML `ListBucketResult` responses.
 * This module uses the S3 ListObjectsV2 API with delimiter-based listing
 * to efficiently traverse the directory structure and find zarr metadata.
 *
 * @typedef {import("./crawl.js").CrawlEntry} CrawlEntry
 */

/** Matches S3 path-style HTTPS URLs: https://s3.<region>.amazonaws.com/<bucket>/... */
const S3_PATH_RE =
  /^(https:\/\/s3\.[^/]+\.amazonaws\.com\/[^/]+)\/?(.*)$/;

/** Directory names that are chunk storage, not zarr nodes */
const CHUNK_DIR_NAMES = new Set(["c"]);

/**
 * Parse an S3 path-style HTTPS URL into bucket endpoint and key prefix.
 *
 * @param {string} url - e.g. "https://s3.us-west-2.amazonaws.com/bucket/prefix/path"
 * @returns {{ bucketUrl: string, prefix: string } | null}
 */
function parseS3Url(url) {
  const match = url.match(S3_PATH_RE);
  if (!match) return null;
  return {
    bucketUrl: match[1],
    prefix: match[2].replace(/\/+$/, ""),
  };
}

/**
 * Try to discover Zarr nodes in a public S3 bucket via XML listing.
 * Returns null if the URL isn't an S3 path-style URL or listing fails.
 *
 * @param {string} url - Store root URL (path-style S3 HTTPS URL)
 * @param {object} [options]
 * @param {(path: string) => void} [options.onProgress]
 * @returns {Promise<CrawlEntry[]|null>}
 */
export async function tryS3List(url, options = {}) {
  const parsed = parseS3Url(url);
  if (!parsed) return null;

  try {
    /** @type {CrawlEntry[]} */
    const entries = [];
    await listRecursive(
      parsed.bucketUrl,
      parsed.prefix,
      parsed.prefix,
      entries,
      0,
      10,
      options.onProgress,
    );
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

/**
 * Recursively list S3 prefixes to discover zarr nodes.
 *
 * @param {string} bucketUrl - S3 bucket endpoint (path-style, no trailing slash)
 * @param {string} rootPrefix - The store root prefix (for computing relative paths)
 * @param {string} prefix - Current prefix to list
 * @param {CrawlEntry[]} entries - Accumulator for discovered nodes
 * @param {number} depth
 * @param {number} maxDepth
 * @param {Function|undefined} onProgress
 */
async function listRecursive(
  bucketUrl,
  rootPrefix,
  prefix,
  entries,
  depth,
  maxDepth,
  onProgress,
) {
  if (depth > maxDepth) return;

  const { files, directories } = await listS3Prefix(bucketUrl, prefix);

  const hasZarrJson = files.includes("zarr.json");
  const hasZarray = files.includes(".zarray");
  const hasZgroup = files.includes(".zgroup");

  if (hasZarrJson || hasZarray || hasZgroup) {
    const kind = hasZarray ? "array" : hasZgroup ? "group" : "unknown";
    const zarrFormat = hasZarrJson ? 3 : 2;

    // Compute store-relative path
    const nodePath =
      prefix === rootPrefix
        ? "/"
        : "/" + prefix.slice(rootPrefix.length + 1);

    entries.push({ path: nodePath, kind, zarrFormat });
    onProgress?.(nodePath);
  }

  // Recurse into subdirectories, skipping known chunk storage dirs
  const promises = directories
    .filter((dir) => {
      const name = dir.split("/").pop();
      return !CHUNK_DIR_NAMES.has(name);
    })
    .map((dir) =>
      listRecursive(
        bucketUrl,
        rootPrefix,
        dir,
        entries,
        depth + 1,
        maxDepth,
        onProgress,
      ),
    );

  await Promise.all(promises);
}

/**
 * List objects and common prefixes at an S3 prefix using ListObjectsV2.
 * Handles pagination automatically.
 *
 * @param {string} bucketUrl - S3 bucket endpoint (path-style)
 * @param {string} prefix - Key prefix to list (no trailing slash)
 * @returns {Promise<{ files: string[], directories: string[] }>}
 */
async function listS3Prefix(bucketUrl, prefix) {
  const files = [];
  const directories = [];
  let continuationToken = null;

  do {
    const params = new URLSearchParams({
      "list-type": "2",
      prefix: prefix ? prefix + "/" : "",
      delimiter: "/",
    });
    if (continuationToken) {
      params.set("continuation-token", continuationToken);
    }

    const response = await fetch(`${bucketUrl}?${params}`);
    if (!response.ok) throw new Error(`S3 list failed: ${response.status}`);

    const xml = await response.text();
    const doc = new DOMParser().parseFromString(xml, "text/xml");

    // Extract filenames from Contents > Key
    const prefixWithSlash = prefix ? prefix + "/" : "";
    for (const el of doc.querySelectorAll("Contents > Key")) {
      const key = el.textContent;
      const name = key.slice(prefixWithSlash.length);
      if (name && !name.includes("/")) {
        files.push(name);
      }
    }

    // Extract directory prefixes from CommonPrefixes > Prefix
    for (const el of doc.querySelectorAll("CommonPrefixes > Prefix")) {
      directories.push(el.textContent.replace(/\/+$/, ""));
    }

    // Handle pagination
    const isTruncated =
      doc.querySelector("IsTruncated")?.textContent === "true";
    continuationToken = isTruncated
      ? doc.querySelector("NextContinuationToken")?.textContent
      : null;
  } while (continuationToken);

  return { files, directories };
}
