/**
 * JSON Schema validation engine using pre-compiled AJV standalone validators.
 *
 * Convention schemas are compiled at build time (scripts/compile-validators.js)
 * so no runtime eval() is needed, allowing strict Content-Security-Policy.
 *
 * @typedef {Object} ValidationError
 * @property {string} path - JSON pointer to the invalid value (instancePath)
 * @property {string} message - Human-readable error message
 * @property {string} schemaPath - JSON pointer into the schema that failed
 *
 * @typedef {Object} ContainsFailure
 * @property {string} arrayPath - JSON pointer to the array (e.g. "/attributes/zarr_conventions")
 * @property {number} bestMatchIndex - Index of the closest matching item
 * @property {object} bestMatchItem - The actual data of the closest matching item
 * @property {ValidationError[]} itemErrors - Errors for the best matching item
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the node passed validation
 * @property {ValidationError[]} errors - Attribute-level errors (outside zarr_conventions items)
 * @property {ContainsFailure[]} containsFailures - Contains check failures with best match info
 */

import validators from "./generated/index.js";

/**
 * Validate a Zarr node's full metadata document against a convention schema.
 *
 * Uses pre-compiled AJV standalone validators for known conventions.
 *
 * @param {object} nodeMetadata - Full node document: { zarr_format, node_type, attributes }
 * @param {string} schemaUrl - URL to the convention's JSON Schema
 * @returns {Promise<ValidationResult>}
 */
export async function validateNode(nodeMetadata, schemaUrl) {
  const validate = validators.get(schemaUrl);
  if (!validate) {
    throw new Error(`No pre-compiled validator for schema: ${schemaUrl}`);
  }

  return runValidation(validate, nodeMetadata);
}

/**
 * Run validation using a provided AJV validate function.
 *
 * This is the core validation logic, separated from schema lookup so it can
 * be used directly in tests with runtime-compiled AJV validators.
 *
 * @param {Function} validate - An AJV validate function (compiled with allErrors: true)
 * @param {object} nodeMetadata - Full node document to validate
 * @returns {ValidationResult}
 */
export function runValidation(validate, nodeMetadata) {
  const valid = validate(nodeMetadata);

  if (valid) {
    return { valid: true, errors: [], containsFailures: [] };
  }

  return separateContainsErrors(validate.errors, nodeMetadata);
}

/**
 * Separate AJV errors into attribute-level errors and contains failures.
 *
 * When `allErrors: true` is set, AJV reports sub-errors for every array item
 * that doesn't match the `contains` subschema. For `zarr_conventions` with
 * multiple conventions, this produces errors for items that were never meant
 * to match (e.g. the multiscales entry failing spatial's contains check).
 *
 * This function separates those into structured `ContainsFailure` objects
 * (keeping only the best-matching item per array) and plain attribute errors.
 *
 * We identify contains sub-errors by instancePath rather than schemaPath,
 * because when `contains` uses `$ref`, AJV resolves the schemaPath through
 * `$defs` instead of through `/contains/`.
 *
 * @param {object[]} rawErrors - Raw AJV error objects
 * @param {object} nodeMetadata - The validated document (for extracting item data)
 * @returns {ValidationResult}
 */
function separateContainsErrors(rawErrors, nodeMetadata) {
  // Find arrays that have a failing `contains` check
  const containsArrayPaths = new Set();
  for (const err of rawErrors) {
    if (err.keyword === "contains") {
      containsArrayPaths.add(err.instancePath);
    }
  }

  // No contains errors — return everything as attribute errors
  if (containsArrayPaths.size === 0) {
    return {
      valid: false,
      errors: rawErrors.map(formatError),
      containsFailures: [],
    };
  }

  // Separate: sub-errors of a contains check vs. everything else
  // containsSubs: arrayPath -> Map<index, error[]>
  const containsSubs = new Map();
  const attributeErrors = [];

  for (const err of rawErrors) {
    // Drop the contains keyword error itself — we represent it via containsFailures
    if (err.keyword === "contains") {
      continue;
    }

    // Check if this error's instancePath is inside a contains-failing array
    let matched = false;
    for (const arrayPath of containsArrayPaths) {
      const prefix = arrayPath + "/";
      if (err.instancePath.startsWith(prefix)) {
        const rest = err.instancePath.slice(prefix.length);
        const indexMatch = rest.match(/^(\d+)(\/|$)/);
        if (indexMatch) {
          const index = indexMatch[1];
          if (!containsSubs.has(arrayPath)) {
            containsSubs.set(arrayPath, new Map());
          }
          const byIndex = containsSubs.get(arrayPath);
          if (!byIndex.has(index)) {
            byIndex.set(index, []);
          }
          byIndex.get(index).push(err);
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      attributeErrors.push(err);
    }
  }

  // Build ContainsFailure objects — one per contains-failing array
  const containsFailures = [];
  for (const [arrayPath, byIndex] of containsSubs) {
    // Find best match (fewest errors)
    let bestIndex = null;
    let bestCount = Infinity;
    for (const [index, errs] of byIndex) {
      if (errs.length < bestCount) {
        bestCount = errs.length;
        bestIndex = index;
      }
    }

    if (bestIndex !== null) {
      const bestItem = resolveJsonPointer(nodeMetadata, `${arrayPath}/${bestIndex}`);
      const bestErrors = byIndex.get(bestIndex);

      // Make item error paths relative to the item (strip array path + index prefix)
      const itemPrefix = `${arrayPath}/${bestIndex}`;

      containsFailures.push({
        arrayPath,
        bestMatchIndex: parseInt(bestIndex, 10),
        bestMatchItem: bestItem,
        itemErrors: bestErrors.map((err) => {
          const formatted = formatError(err);
          // Strip the array/index prefix so paths are relative to the item
          if (formatted.path.startsWith(itemPrefix)) {
            formatted.path = formatted.path.slice(itemPrefix.length) || "/";
          }
          return formatted;
        }),
      });
    }
  }

  return {
    valid: false,
    errors: attributeErrors.map(formatError),
    containsFailures,
  };
}

/**
 * Resolve a JSON pointer path against an object.
 *
 * @param {object} obj - Root object
 * @param {string} pointer - JSON pointer (e.g. "/attributes/zarr_conventions/0")
 * @returns {any} The value at the pointer, or undefined
 */
function resolveJsonPointer(obj, pointer) {
  const parts = pointer.split("/").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Format an AJV error into a human-readable ValidationError.
 *
 * @param {object} err - AJV error object
 * @returns {ValidationError}
 */
function formatError(err) {
  const path = err.instancePath || "/";
  const params = err.params || {};
  const actual = err.data;
  let message = err.message || "Validation error";

  switch (err.keyword) {
    case "const":
      message = `must be equal to ${JSON.stringify(params.allowedValue)}, got ${summarize(actual)}`;
      break;
    case "enum":
      message = `must be one of: ${(params.allowedValues || []).map((v) => JSON.stringify(v)).join(", ")}, got ${summarize(actual)}`;
      break;
    case "pattern":
      message = `must match pattern ${params.pattern}, got ${summarize(actual)}`;
      break;
    case "required":
      message = `missing required property '${params.missingProperty}'`;
      break;
    case "additionalProperties":
      message = `unexpected property '${params.additionalProperty}'`;
      break;
    case "type":
      message = `must be ${params.type}, got ${summarize(actual)}`;
      break;
    case "minimum":
      message = `must be >= ${params.limit}, got ${summarize(actual)}`;
      break;
    case "maximum":
      message = `must be <= ${params.limit}, got ${summarize(actual)}`;
      break;
    case "minItems":
      message = `must have at least ${params.limit} items, got ${Array.isArray(actual) ? actual.length : summarize(actual)}`;
      break;
    case "maxItems":
      message = `must have at most ${params.limit} items, got ${Array.isArray(actual) ? actual.length : summarize(actual)}`;
      break;
    case "minLength":
      message = `must be at least ${params.limit} characters, got ${typeof actual === "string" ? actual.length : summarize(actual)}`;
      break;
    case "oneOf":
      message = `must match exactly one of the allowed schemas (matched ${params.passingSchemas === null ? "none" : params.passingSchemas})`;
      break;
    case "anyOf":
      message = "must match at least one of the allowed schemas";
      break;
    case "contains":
      message = "must contain at least one matching item";
      break;
  }

  return { path, message, schemaPath: err.schemaPath || "" };
}

/**
 * Format a value for display in error messages.
 *
 * @param {any} value
 * @returns {string}
 */
function summarize(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return JSON.stringify(value);
}

/**
 * Construct the full metadata document that convention schemas expect.
 *
 * Schemas validate against `{ zarr_format, node_type, attributes }`.
 * This function builds that structure from a tree node.
 *
 * @param {object} treeNode - A TreeNode from hierarchy.js
 * @param {number} [zarrFormat=3] - Zarr format version
 * @returns {object} Full metadata document
 */
export function buildNodeDocument(treeNode, zarrFormat = 3) {
  return {
    zarr_format: zarrFormat,
    node_type: treeNode.kind,
    attributes: treeNode.attrs || {},
  };
}
