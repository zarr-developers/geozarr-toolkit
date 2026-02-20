import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { runValidation, buildNodeDocument } from "../src/validator.js";

/**
 * Tests use runtime AJV to compile test schemas, then pass the validate
 * function to runValidation(). This avoids needing pre-compiled validators
 * for test-only schemas while exercising the same error processing logic.
 */

// Minimal geo-proj schema (Draft-07) for testing
const PROJ_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    zarr_format: { type: "integer" },
    node_type: { type: "string", enum: ["array", "group"] },
    attributes: {
      type: "object",
      properties: {
        zarr_conventions: { type: "array" },
        "proj:code": {
          type: "string",
          pattern: "^[A-Z]+:[0-9]+$",
        },
      },
      required: ["zarr_conventions"],
    },
  },
  required: ["zarr_format", "node_type", "attributes"],
};

// Schema with contains + $ref (matches real spatial schema pattern)
const CONTAINS_REF_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    zarr_format: { type: "integer" },
    node_type: { type: "string" },
    attributes: {
      type: "object",
      properties: {
        zarr_conventions: {
          type: "array",
          contains: { $ref: "#/$defs/conventionMetadata" },
        },
        "spatial:dimensions": {
          type: "array",
          minItems: 2,
          items: { type: "string" },
        },
      },
      required: ["zarr_conventions", "spatial:dimensions"],
    },
  },
  required: ["zarr_format", "node_type", "attributes"],
  $defs: {
    conventionMetadata: {
      type: "object",
      properties: {
        uuid: { const: "689b58e2-cf7b-45e0-9fff-9cfc0883d6b4" },
        name: { const: "spatial:" },
        description: { const: "Spatial coordinate information" },
      },
      anyOf: [{ required: ["uuid"] }, { required: ["name"] }],
      additionalProperties: false,
    },
  },
};

/** Compile a test schema with runtime AJV. */
function compile(schema) {
  const ajv = new Ajv({ allErrors: true });
  return ajv.compile(schema);
}

describe("runValidation", () => {
  it("validates a passing document against Draft-07 schema", () => {
    const validate = compile(PROJ_SCHEMA);
    const doc = {
      zarr_format: 3,
      node_type: "array",
      attributes: {
        zarr_conventions: [
          { uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f", name: "proj:" },
        ],
        "proj:code": "EPSG:26711",
      },
    };

    const result = runValidation(validate, doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.containsFailures).toEqual([]);
  });

  it("returns attribute errors for a failing document", () => {
    const validate = compile(PROJ_SCHEMA);
    const doc = {
      zarr_format: 3,
      node_type: "array",
      attributes: {
        zarr_conventions: [
          { uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f" },
        ],
        "proj:code": "invalid-code", // doesn't match pattern
      },
    };

    const result = runValidation(validate, doc);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("pattern") && e.message.includes("^[A-Z]+:[0-9]+$"))).toBe(true);
    expect(result.containsFailures).toEqual([]);
  });

  it("fails when required fields are missing", () => {
    const validate = compile(PROJ_SCHEMA);
    const doc = {
      zarr_format: 3,
      // missing node_type and attributes
    };

    const result = runValidation(validate, doc);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns containsFailure with best match and item-relative errors", () => {
    const validate = compile(CONTAINS_REF_SCHEMA);
    const doc = {
      zarr_format: 3,
      node_type: "group",
      attributes: {
        zarr_conventions: [
          { uuid: "689b58e2-cf7b-45e0-9fff-9cfc0883d6b4", name: "spatial:", description: "Wrong desc" },
          { uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f", name: "proj:" },
        ],
        "spatial:dimensions": ["Y", "X"],
      },
    };

    const result = runValidation(validate, doc);
    expect(result.valid).toBe(false);

    // Should have a contains failure, not flat errors
    expect(result.containsFailures).toHaveLength(1);
    const failure = result.containsFailures[0];

    expect(failure.arrayPath).toBe("/attributes/zarr_conventions");
    expect(failure.bestMatchIndex).toBe(0); // spatial entry is best match
    expect(failure.bestMatchItem).toEqual(doc.attributes.zarr_conventions[0]);

    // Item errors should have paths relative to the item, not the document
    expect(failure.itemErrors.length).toBeGreaterThan(0);
    expect(failure.itemErrors.some((e) => e.message.includes("Spatial coordinate information"))).toBe(true);
    // Paths should NOT include the full /attributes/zarr_conventions/0 prefix
    for (const err of failure.itemErrors) {
      expect(err.path).not.toMatch(/\/zarr_conventions\/\d+/);
    }

    // No attribute errors since spatial:dimensions is valid
    expect(result.errors).toEqual([]);
  });

  it("returns both containsFailure and attribute errors when both fail", () => {
    const validate = compile(CONTAINS_REF_SCHEMA);
    const doc = {
      zarr_format: 3,
      node_type: "group",
      attributes: {
        zarr_conventions: [
          { uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f", name: "proj:" },
        ],
        // spatial:dimensions is missing (required)
      },
    };

    const result = runValidation(validate, doc);
    expect(result.valid).toBe(false);

    // Contains failure: no zarr_conventions entry matched
    expect(result.containsFailures).toHaveLength(1);

    // Attribute error: missing spatial:dimensions
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("spatial:dimensions"))).toBe(true);
  });

  it("filters out non-matching items from contains failures", () => {
    const validate = compile(CONTAINS_REF_SCHEMA);
    // 3 conventions — only index 1 is close to matching spatial
    const doc = {
      zarr_format: 3,
      node_type: "group",
      attributes: {
        zarr_conventions: [
          { uuid: "d35379db-88df-4056-af3a-620245f8e347", name: "multiscales" },
          { uuid: "689b58e2-cf7b-45e0-9fff-9cfc0883d6b4", name: "spatial:", description: "Wrong" },
          { uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f", name: "proj:" },
        ],
        "spatial:dimensions": ["Y", "X"],
      },
    };

    const result = runValidation(validate, doc);
    expect(result.valid).toBe(false);
    expect(result.containsFailures).toHaveLength(1);

    const failure = result.containsFailures[0];
    // Best match should be index 1 (spatial entry)
    expect(failure.bestMatchIndex).toBe(1);
    expect(failure.bestMatchItem.name).toBe("spatial:");

    // Should NOT have errors about multiscales (index 0) or proj (index 2)
    expect(result.errors).toEqual([]);
  });
});

describe("buildNodeDocument", () => {
  it("builds a v3 document from a tree node", () => {
    const treeNode = {
      path: "/data",
      kind: "array",
      children: [],
      attrs: {
        "proj:code": "EPSG:4326",
        zarr_conventions: [
          { uuid: "f17cb550-5864-4468-aeb7-f3180cfb622f" },
        ],
      },
      shape: [100, 200],
      dtype: "float32",
    };

    const doc = buildNodeDocument(treeNode);
    expect(doc).toEqual({
      zarr_format: 3,
      node_type: "array",
      attributes: treeNode.attrs,
    });
  });

  it("builds a group document", () => {
    const treeNode = {
      path: "/",
      kind: "group",
      children: [],
      attrs: { multiscales: { layout: [] } },
    };

    const doc = buildNodeDocument(treeNode);
    expect(doc.node_type).toBe("group");
    expect(doc.zarr_format).toBe(3);
  });

  it("allows specifying zarr format", () => {
    const doc = buildNodeDocument(
      { kind: "group", attrs: {} },
      2,
    );
    expect(doc.zarr_format).toBe(2);
  });
});
