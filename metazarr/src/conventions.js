/**
 * Convention detection from Zarr node attributes.
 *
 * @typedef {Object} ConventionInfo
 * @property {string} uuid - Convention UUID
 * @property {string} name - Convention name (e.g. "proj:", "spatial:")
 * @property {string} display - Human-readable display name
 * @property {string} color - Colorblind-friendly color for UI display
 * @property {string|undefined} schemaUrl - URL to JSON Schema
 * @property {string|undefined} specUrl - URL to specification
 */

/**
 * Known GeoZarr conventions indexed by UUID.
 * Colors use the Wong (2011) colorblind-friendly palette.
 */
const KNOWN_CONVENTIONS = {
  "f17cb550-5864-4468-aeb7-f3180cfb622f": {
    name: "proj:",
    display: "Geospatial Projection (proj:)",
    color: "#0072B2", // blue
    schemaUrl: "https://raw.githubusercontent.com/zarr-conventions/geo-proj/refs/heads/main/schema.json",
    specUrl: "https://github.com/zarr-conventions/geo-proj/blob/main/README.md",
  },
  "689b58e2-cf7b-45e0-9fff-9cfc0883d6b4": {
    name: "spatial:",
    display: "Spatial Coordinates (spatial:)",
    color: "#E69F00", // orange
    schemaUrl: "https://raw.githubusercontent.com/zarr-conventions/spatial/refs/heads/main/schema.json",
    specUrl: "https://github.com/zarr-conventions/spatial/blob/main/README.md",
  },
  "d35379db-88df-4056-af3a-620245f8e347": {
    name: "multiscales",
    display: "Multiscales",
    color: "#009E73", // green
    schemaUrl: "https://raw.githubusercontent.com/zarr-conventions/multiscales/refs/heads/main/schema.json",
    specUrl: "https://github.com/zarr-conventions/multiscales/blob/main/README.md",
  },
  "77c308c7-4db2-4774-8b2d-aa37e9997db6": {
    name: "CF",
    display: "CF (Climate and Forecast)",
    color: "#D55E00", // vermilion
    schemaUrl: "https://raw.githubusercontent.com/zarr-conventions/CF/refs/heads/main/schema.json",
    specUrl: "https://github.com/zarr-conventions/CF/blob/main/README.md",
  },
};

/** Default color for unknown conventions. */
const DEFAULT_COLOR = "#888888";

/**
 * Validate that a URL is a safe HTTP(S) URL.
 * Rejects javascript:, data:, and other non-HTTP schemes.
 *
 * @param {string|undefined} url
 * @returns {string|undefined} The URL if safe, undefined otherwise
 */
function sanitizeUrl(url) {
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return url;
  } catch {
    // invalid URL
  }
  return undefined;
}

/** Attribute key prefixes used for fallback detection. */
const PREFIX_DETECTION = [
  { prefix: "proj:", uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f" },
  { prefix: "spatial:", uuid: "689b58e2-cf7b-45e0-9fff-9cfc0883d6b4" },
];

const KEY_DETECTION = [
  { key: "multiscales", uuid: "d35379db-88df-4056-af3a-620245f8e347" },
];

/**
 * Detect which GeoZarr conventions are declared on a Zarr node.
 *
 * Primary detection reads the `zarr_conventions` array. Fallback detection
 * checks for known attribute key prefixes when `zarr_conventions` is absent.
 *
 * @param {Record<string, any>} attrs - Node attributes object
 * @returns {ConventionInfo[]} Detected conventions
 */
export function detectConventions(attrs) {
  if (!attrs || typeof attrs !== "object") return [];

  const found = new Map();

  // Primary: read zarr_conventions array
  const conventions = attrs.zarr_conventions;
  if (Array.isArray(conventions)) {
    for (const conv of conventions) {
      if (!conv || typeof conv !== "object") continue;
      const uuid = conv.uuid;
      const known = uuid ? KNOWN_CONVENTIONS[uuid] : undefined;
      const info = {
        uuid: uuid || undefined,
        name: conv.name || known?.name || "unknown",
        display: known?.display || conv.name || conv.description || uuid || "Unknown Convention",
        color: known?.color || DEFAULT_COLOR,
        schemaUrl: known?.schemaUrl || sanitizeUrl(conv.schema_url),
        specUrl: known?.specUrl || sanitizeUrl(conv.spec_url),
      };
      const key = uuid || conv.name || conv.schema_url;
      if (key && !found.has(key)) {
        found.set(key, info);
      }
    }
  }

  // Fallback: detect by attribute key prefixes if zarr_conventions is absent
  if (found.size === 0) {
    const keys = Object.keys(attrs);

    for (const { prefix, uuid } of PREFIX_DETECTION) {
      if (keys.some((k) => k.startsWith(prefix))) {
        const known = KNOWN_CONVENTIONS[uuid];
        found.set(uuid, {
          uuid,
          name: known.name,
          display: known.display,
          color: known.color,
          schemaUrl: known.schemaUrl,
          specUrl: known.specUrl,
        });
      }
    }

    for (const { key, uuid } of KEY_DETECTION) {
      if (key in attrs) {
        const known = KNOWN_CONVENTIONS[uuid];
        found.set(uuid, {
          uuid,
          name: known.name,
          display: known.display,
          color: known.color,
          schemaUrl: known.schemaUrl,
          specUrl: known.specUrl,
        });
      }
    }
  }

  return Array.from(found.values());
}

/**
 * Look up a known convention by UUID.
 * @param {string} uuid
 * @returns {{ name: string, display: string } | undefined}
 */
export function getKnownConvention(uuid) {
  return KNOWN_CONVENTIONS[uuid];
}
