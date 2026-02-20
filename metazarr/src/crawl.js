/**
 * HTML directory listing crawler for S3-backed HTTP endpoints.
 *
 * Many object stores (S3, MinIO, etc.) serve HTML directory listings when
 * accessed via HTTP with a trailing slash. This module parses those listings
 * to discover the Zarr hierarchy without requiring consolidated metadata.
 *
 * @typedef {Object} CrawlEntry
 * @property {string} path - Absolute path within the store (e.g. "/group1/array1")
 * @property {"group"|"array"|"unknown"} kind - Inferred node type
 * @property {2|3} zarrFormat - Zarr format version (3 if zarr.json found, 2 if .zarray/.zgroup)
 */

/**
 * Crawl an HTTP directory listing to discover all Zarr nodes.
 *
 * Fetches the HTML index page at `baseUrl + path + "/"`, parses `<a>` links
 * to find subdirectories and `zarr.json`/`.zarray`/`.zgroup` files, then
 * recurses into subdirectories.
 *
 * @param {string} baseUrl - Store root URL (no trailing slash)
 * @param {object} [options]
 * @param {string} [options.path="/"] - Starting path to crawl from
 * @param {number} [options.maxDepth=10] - Maximum recursion depth
 * @param {number} [options.maxNodes=50] - Maximum number of nodes to discover
 * @param {(path: string) => void} [options.onProgress] - Called for each discovered path
 * @returns {Promise<CrawlEntry[]>} All discovered nodes
 */
export async function crawlDirectory(baseUrl, options = {}) {
  const { path = "/", maxDepth = 10, maxNodes = 50, onProgress } = options;
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  /** @type {CrawlEntry[]} */
  const entries = [];
  const visited = new Set();

  await crawlRecursive(normalizedBase, path, entries, visited, 0, maxDepth, maxNodes, onProgress);
  return entries;
}

/**
 * Try to crawl an HTTP endpoint. Returns null if the endpoint doesn't
 * serve directory listings (non-HTML response or no parseable links).
 *
 * @param {string} baseUrl - Store root URL
 * @returns {Promise<CrawlEntry[]|null>}
 */
export async function tryCrawlDirectory(baseUrl, options = {}) {
  try {
    const entries = await crawlDirectory(baseUrl, options);
    // If we found at least one zarr metadata file, the crawl was productive
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} baseUrl
 * @param {string} path
 * @param {CrawlEntry[]} entries
 * @param {Set<string>} visited
 * @param {number} depth
 * @param {number} maxDepth
 * @param {number} maxNodes
 * @param {Function|undefined} onProgress
 */
async function crawlRecursive(baseUrl, path, entries, visited, depth, maxDepth, maxNodes, onProgress) {
  if (depth > maxDepth) return;
  if (entries.length >= maxNodes) return;

  const normalizedPath = path.endsWith("/") ? path : path + "/";
  if (visited.has(normalizedPath)) return;
  visited.add(normalizedPath);

  const url = baseUrl + normalizedPath;
  let html;
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html")) return;
    html = await response.text();
  } catch {
    return;
  }

  const links = parseDirectoryLinks(html, normalizedPath);

  // Check what's in this directory
  const hasZarrJson = links.files.some((f) => f === "zarr.json");
  const hasZarray = links.files.some((f) => f === ".zarray");
  const hasZgroup = links.files.some((f) => f === ".zgroup");

  if (hasZarrJson || hasZarray || hasZgroup) {
    const nodeKind = hasZarray
      ? "array"
      : hasZgroup
        ? "group"
        : "unknown";

    const nodePath = normalizedPath.replace(/\/+$/, "") || "/";
    const zarrFormat = hasZarrJson ? 3 : 2;
    entries.push({ path: nodePath, kind: nodeKind, zarrFormat });
    onProgress?.(nodePath);

    if (entries.length >= maxNodes) return;
  }

  // Recurse into subdirectories
  for (const dir of links.directories) {
    if (entries.length >= maxNodes) return;
    const childPath = normalizedPath + dir;
    await crawlRecursive(baseUrl, childPath, entries, visited, depth + 1, maxDepth, maxNodes, onProgress);
  }
}

/**
 * Parse an HTML directory listing to extract file and directory links.
 *
 * Looks for `<a href="...">` elements and classifies them as files or
 * directories (directories end with `/`). Filters out parent links (`..`).
 *
 * @param {string} html - HTML content
 * @param {string} currentPath - Current directory path for resolving relative links
 * @returns {{ files: string[], directories: string[] }}
 */
function parseDirectoryLinks(html, currentPath) {
  const files = [];
  const directories = [];

  // Match all href attributes in anchor tags
  const hrefPattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1];

    // Skip parent directory links and absolute protocol links
    if (href === "../" || href === ".." || href.startsWith("http://") || href.startsWith("https://")) {
      continue;
    }

    // Extract the entry name from the href
    let name;
    if (href.startsWith("/")) {
      // Absolute path — extract just the filename/dirname relative to currentPath
      const relative = href.startsWith(currentPath)
        ? href.slice(currentPath.length)
        : null;
      if (!relative) continue;
      name = relative;
    } else {
      name = href;
    }

    // Clean up
    name = name.replace(/^\/+/, "");
    if (!name) continue;

    if (name.endsWith("/")) {
      directories.push(name.replace(/\/+$/, ""));
    } else {
      files.push(name);
    }
  }

  return { files, directories };
}
