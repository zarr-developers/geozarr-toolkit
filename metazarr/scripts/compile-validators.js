/**
 * Pre-compile AJV validators for known convention schemas.
 *
 * Fetches each schema (and external $refs), compiles with AJV standalone mode,
 * and writes ESM validation modules to src/generated/.
 *
 * Run: node scripts/compile-validators.js
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../src/generated");

/** Known convention schemas to pre-compile, keyed by schema URL. */
const SCHEMAS = {
  "https://raw.githubusercontent.com/zarr-conventions/geo-proj/refs/heads/main/schema.json":
    { id: "geo_proj", draft: "07" },
  "https://raw.githubusercontent.com/zarr-conventions/spatial/refs/heads/main/schema.json":
    { id: "spatial", draft: "07" },
  "https://raw.githubusercontent.com/zarr-conventions/multiscales/refs/heads/main/schema.json":
    { id: "multiscales", draft: "07" },
  "https://raw.githubusercontent.com/zarr-conventions/CF/refs/heads/main/schema.json":
    { id: "cf", draft: "2020-12" },
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

/** Recursively collect external $ref URLs from a schema. */
function collectExternalRefs(node, refs = new Set()) {
  if (!node || typeof node !== "object") return refs;
  if (Array.isArray(node)) {
    for (const item of node) collectExternalRefs(item, refs);
    return refs;
  }
  if (typeof node.$ref === "string" && /^https?:\/\//.test(node.$ref)) {
    refs.add(node.$ref);
  }
  for (const value of Object.values(node)) {
    collectExternalRefs(value, refs);
  }
  return refs;
}

async function compileSchema(url, { id, draft }) {
  console.log(`  Fetching ${id} schema...`);
  const schema = await fetchJson(url);

  // Resolve external $refs
  const externalRefs = collectExternalRefs(schema);
  const refSchemas = new Map();
  for (const refUrl of externalRefs) {
    console.log(`    Fetching external ref: ${refUrl}`);
    const refSchema = await fetchJson(refUrl);
    refSchemas.set(refUrl, refSchema);
    // Check for nested refs
    for (const nestedUrl of collectExternalRefs(refSchema)) {
      if (!externalRefs.has(nestedUrl) && !refSchemas.has(nestedUrl)) {
        console.log(`    Fetching nested ref: ${nestedUrl}`);
        refSchemas.set(nestedUrl, await fetchJson(nestedUrl));
      }
    }
  }

  // Create AJV instance with standalone code generation enabled
  const ajv =
    draft === "2020-12"
      ? new Ajv2020({ code: { source: true, esm: true }, allErrors: true })
      : new Ajv({ code: { source: true, esm: true }, allErrors: true });

  // Add external ref schemas
  for (const [refUrl, refSchema] of refSchemas) {
    try {
      ajv.addSchema(refSchema, refUrl);
    } catch {
      // may already be registered
    }
  }

  // Compile and generate standalone code
  const validate = ajv.compile(schema);
  const code = standaloneCode(ajv, validate);

  return code;
}

async function main() {
  console.log("Compiling standalone AJV validators...\n");

  mkdirSync(OUT_DIR, { recursive: true });

  // Compile each schema and build the registry
  const entries = [];

  for (const [url, meta] of Object.entries(SCHEMAS)) {
    const code = await compileSchema(url, meta);
    const filename = `validate_${meta.id}.js`;
    const outPath = resolve(OUT_DIR, filename);
    writeFileSync(outPath, code);
    console.log(`  -> ${filename}`);
    entries.push({ url, id: meta.id, filename });
  }

  // Generate an index that maps schema URLs to validator imports
  const indexLines = [
    "// Auto-generated — do not edit. Run: node scripts/compile-validators.js",
    "",
  ];
  for (const { id, filename } of entries) {
    indexLines.push(
      `import { default as validate_${id} } from "./${filename}";`,
    );
  }
  indexLines.push("");
  indexLines.push("/** Map of schema URL → pre-compiled validate function. */");
  indexLines.push("const validators = new Map([");
  for (const { url, id } of entries) {
    indexLines.push(`  [${JSON.stringify(url)}, validate_${id}],`);
  }
  indexLines.push("]);");
  indexLines.push("");
  indexLines.push("export default validators;");
  indexLines.push("");

  const indexPath = resolve(OUT_DIR, "index.js");
  writeFileSync(indexPath, indexLines.join("\n"));
  console.log(`  -> index.js`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
