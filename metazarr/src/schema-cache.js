/**
 * Schema fetching with in-memory cache and external $ref resolution.
 */

/** @type {Map<string, object>} */
const cache = new Map();

/**
 * Fetch a JSON Schema from a URL, returning a cached copy if available.
 *
 * @param {string} url - Schema URL
 * @returns {Promise<object>} Parsed JSON Schema
 */
export async function fetchSchema(url) {
  if (cache.has(url)) return cache.get(url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch schema: ${url} (${response.status})`);
  }
  const schema = await response.json();
  cache.set(url, schema);
  return schema;
}

/**
 * Walk a schema tree and collect all external `$ref` URLs that need to be
 * pre-loaded into AJV. Returns a Map of url → fetched schema.
 *
 * Only collects absolute HTTP(S) URLs; local `#/...` refs are handled by AJV.
 *
 * @param {object} schema - The root schema
 * @returns {Promise<Map<string, object>>} Map of ref URL → schema
 */
export async function resolveExternalRefs(schema) {
  const refs = new Set();
  collectRefs(schema, refs);

  const result = new Map();
  const fetches = Array.from(refs).map(async (url) => {
    const refSchema = await fetchSchema(url);
    result.set(url, refSchema);
    // Recursively resolve refs in the external schema too
    const nested = new Set();
    collectRefs(refSchema, nested);
    for (const nestedUrl of nested) {
      if (!refs.has(nestedUrl) && !result.has(nestedUrl)) {
        const nestedSchema = await fetchSchema(nestedUrl);
        result.set(nestedUrl, nestedSchema);
      }
    }
  });

  await Promise.all(fetches);
  return result;
}

/**
 * Recursively collect external $ref URLs from a schema object.
 *
 * @param {any} node - Current schema node
 * @param {Set<string>} refs - Accumulator for found URLs
 */
function collectRefs(node, refs) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectRefs(item, refs);
    }
    return;
  }

  if (typeof node.$ref === "string" && /^https?:\/\//.test(node.$ref)) {
    refs.add(node.$ref);
  }

  for (const value of Object.values(node)) {
    collectRefs(value, refs);
  }
}

/**
 * Clear the schema cache.
 */
export function clearCache() {
  cache.clear();
}
