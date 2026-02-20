/**
 * Detail panel — shows node info, attributes, conventions, and validation.
 */

import { validateNode, buildNodeDocument } from "../src/validator.js";

/**
 * Render the detail panel for a selected tree node.
 *
 * @param {import("../src/hierarchy.js").TreeNode} node
 * @param {import("../src/conventions.js").ConventionInfo[]} conventions
 * @param {HTMLElement} container
 */
export function renderDetail(node, conventions, container) {
  container.innerHTML = "";

  // Node info
  const infoSection = createNodeInfo(node);
  container.appendChild(infoSection);

  // Attributes
  const attrsSection = createAttrsSection(node.attrs);
  container.appendChild(attrsSection);

  // Conventions
  const convSection = createConventionsSection(node, conventions);
  container.appendChild(convSection);
}

/**
 * @param {import("../src/hierarchy.js").TreeNode} node
 * @returns {HTMLElement}
 */
function createNodeInfo(node) {
  const section = document.createElement("div");
  section.className = "node-info";

  const h2 = document.createElement("h2");
  h2.textContent = node.path;
  section.appendChild(h2);

  const dl = document.createElement("dl");
  dl.className = "info-grid";

  const meta = node.meta;

  addInfoRow(dl, "Type", node.kind);

  // Zarr format version
  if (meta?.zarr_format) {
    addInfoRow(dl, "Zarr Format", `v${meta.zarr_format}`);
  }

  if (node.kind === "array") {
    if (node.shape) addInfoRow(dl, "Shape", `[${node.shape.join(", ")}]`);

    // Dimension names (v3 native, or v2 _ARRAY_DIMENSIONS convention)
    const dimNames = meta?.dimension_names || node.attrs?._ARRAY_DIMENSIONS;
    if (dimNames) {
      addInfoRow(dl, "Dimensions", dimNames.map((d) => d || "?").join(", "));
    }

    if (node.dtype) addInfoRow(dl, "Dtype", formatDtype(node.dtype));

    // Fill value
    if (meta && "fill_value" in meta) {
      addInfoRow(dl, "Fill Value", formatFillValue(meta.fill_value));
    }

    if (node.chunks) addInfoRow(dl, "Chunks", formatChunks(node.chunks));

    // Computed: chunk count, chunk size, uncompressed size
    if (node.shape) {
      const chunkShape = getChunkShape(node);
      const byteSize = dtypeByteSize(node.dtype);

      if (chunkShape) {
        const numChunks = node.shape.map((s, i) => Math.ceil(s / chunkShape[i]));
        const totalChunks = numChunks.reduce((a, b) => a * b, 1);
        addInfoRow(
          dl,
          "Chunk Count",
          `${totalChunks.toLocaleString()}` +
            (numChunks.length > 1 ? ` [${numChunks.join(" \u00d7 ")}]` : ""),
        );

        if (byteSize) {
          const chunkElements = chunkShape.reduce((a, b) => a * b, 1);
          addInfoRow(dl, "Chunk Size", formatBytes(chunkElements * byteSize));
        }
      }

      if (byteSize) {
        const totalElements = node.shape.reduce((a, b) => a * b, 1);
        addInfoRow(dl, "Uncompressed", formatBytes(totalElements * byteSize));
      }
    }

    // Codecs (v3) or Compressor + Filters (v2)
    if (meta?.zarr_format === 3 && meta?.codecs) {
      addInfoRow(dl, "Codecs", formatCodecs(meta.codecs));

      // Sharding detection
      const shardingCodec = meta.codecs.find(
        (c) => c.name === "sharding_indexed",
      );
      if (shardingCodec?.configuration?.chunk_shape) {
        const subShape = shardingCodec.configuration.chunk_shape;
        const subByteSize = dtypeByteSize(node.dtype);
        let shardLabel = `Sub-chunks: [${subShape.join(", ")}]`;
        if (subByteSize) {
          const subElements = subShape.reduce((a, b) => a * b, 1);
          shardLabel += ` (${formatBytes(subElements * subByteSize)})`;
        }
        addInfoRow(dl, "Sharding", shardLabel);
      }
    } else if (meta?.zarr_format === 2) {
      if (meta.compressor) {
        addInfoRow(dl, "Compressor", formatV2Codec(meta.compressor));
      } else if (meta.compressor === null) {
        addInfoRow(dl, "Compressor", "none");
      }
      if (meta.filters && meta.filters.length > 0) {
        addInfoRow(
          dl,
          "Filters",
          meta.filters.map(formatV2Codec).join(" \u2192 "),
        );
      }
    }

    // Memory order (v2 only)
    if (meta?.zarr_format === 2 && meta?.order) {
      addInfoRow(
        dl,
        "Order",
        meta.order === "C" ? "C (row-major)" : "F (column-major)",
      );
    }

    // Chunk key encoding (v3) or dimension separator (v2)
    if (meta?.zarr_format === 3 && meta?.chunk_key_encoding) {
      const enc = meta.chunk_key_encoding;
      const sep =
        enc.configuration?.separator || (enc.name === "default" ? "/" : ".");
      addInfoRow(dl, "Chunk Keys", `${enc.name} (sep: "${sep}")`);
    } else if (meta?.zarr_format === 2 && meta?.dimension_separator) {
      addInfoRow(dl, "Dim. Separator", `"${meta.dimension_separator}"`);
    }
  }

  if (node.children) {
    addInfoRow(dl, "Children", String(node.children.length));
  }

  if (node._error) {
    addInfoRow(dl, "Error", node._error);
  }

  section.appendChild(dl);
  return section;
}

/**
 * @param {HTMLDListElement} dl
 * @param {string} label
 * @param {string} value
 */
function addInfoRow(dl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  dl.appendChild(dt);
  dl.appendChild(dd);
}

/**
 * @param {any} chunks
 * @returns {string}
 */
function formatChunks(chunks) {
  if (Array.isArray(chunks)) return `[${chunks.join(", ")}]`;
  // v3 chunk_grid object — show just the chunk_shape
  if (chunks?.configuration?.chunk_shape) {
    return `[${chunks.configuration.chunk_shape.join(", ")}]`;
  }
  if (typeof chunks === "object" && chunks !== null) {
    return JSON.stringify(chunks);
  }
  return String(chunks);
}

/**
 * Format a data type for display.
 * @param {any} dtype
 * @returns {string}
 */
function formatDtype(dtype) {
  if (typeof dtype === "object" && dtype !== null && dtype.name) {
    // v3 extension data type: { name: "numpy.datetime64", configuration: {...} }
    return dtype.name;
  }
  return String(dtype);
}

/**
 * Format a fill value for display.
 * @param {any} v
 * @returns {string}
 */
function formatFillValue(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" && isNaN(v)) return "NaN";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

/**
 * Format a v3 codec pipeline for display.
 * @param {Array<{name: string, configuration?: object}>} codecs
 * @returns {string}
 */
function formatCodecs(codecs) {
  return codecs
    .map((c) => {
      const cfg = c.configuration || {};
      const details = [];
      // Show key configuration values for common codecs
      if ("endian" in cfg) details.push(cfg.endian);
      if ("cname" in cfg) details.push(cfg.cname);
      if ("clevel" in cfg) details.push(`level ${cfg.clevel}`);
      else if ("level" in cfg) details.push(`level ${cfg.level}`);
      if ("shuffle" in cfg && cfg.shuffle !== "noshuffle")
        details.push(cfg.shuffle);
      if ("order" in cfg) details.push(cfg.order);
      return details.length > 0
        ? `${c.name} (${details.join(", ")})`
        : c.name;
    })
    .join(" \u2192 ");
}

/**
 * Format a v2 compressor or filter codec for display.
 * @param {{id: string, [key: string]: any}} codec
 * @returns {string}
 */
function formatV2Codec(codec) {
  if (!codec) return "none";
  const { id, ...config } = codec;
  const details = [];
  if ("cname" in config) details.push(config.cname);
  if ("clevel" in config) details.push(`level ${config.clevel}`);
  else if ("level" in config) details.push(`level ${config.level}`);
  if ("shuffle" in config && config.shuffle !== 0)
    details.push(`shuffle ${config.shuffle}`);
  return details.length > 0 ? `${id} (${details.join(", ")})` : id;
}

/**
 * Get the byte size for a data type.
 * Handles v3-style names (float32) and v2-style numpy dtypes (<f4).
 * @param {any} dtype
 * @returns {number|null}
 */
function dtypeByteSize(dtype) {
  const str = typeof dtype === "object" && dtype?.name ? dtype.name : String(dtype);
  /** @type {Record<string, number>} */
  const map = {
    bool: 1,
    int8: 1,
    uint8: 1,
    int16: 2,
    uint16: 2,
    float16: 2,
    int32: 4,
    uint32: 4,
    float32: 4,
    int64: 8,
    uint64: 8,
    float64: 8,
    complex64: 8,
    complex128: 16,
  };
  if (map[str]) return map[str];
  // v2 numpy-style: "<f4", ">i2", "|b1", etc. — last number is byte size
  const m = str.match(/(\d+)$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/**
 * Format a byte count as human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
}

/**
 * Extract the chunk shape array from a TreeNode's chunks property.
 * Handles v2 format (plain array) and v3 format (chunk_grid object).
 * @param {import("../src/hierarchy.js").TreeNode} node
 * @returns {number[]|null}
 */
function getChunkShape(node) {
  if (Array.isArray(node.chunks)) return node.chunks;
  if (node.chunks?.configuration?.chunk_shape)
    return node.chunks.configuration.chunk_shape;
  return null;
}

/**
 * @param {Record<string, any>} attrs
 * @returns {HTMLElement}
 */
function createAttrsSection(attrs) {
  const section = document.createElement("div");
  section.className = "attrs-section";

  const h3 = document.createElement("h3");
  h3.textContent = "Attributes";
  h3.addEventListener("click", () => {
    h3.classList.toggle("expanded");
    pre.hidden = !pre.hidden;
  });
  section.appendChild(h3);

  const pre = document.createElement("pre");
  pre.className = "attrs-json";
  pre.textContent = JSON.stringify(attrs, null, 2);
  pre.hidden = true;
  section.appendChild(pre);

  return section;
}

/**
 * @param {import("../src/hierarchy.js").TreeNode} node
 * @param {import("../src/conventions.js").ConventionInfo[]} conventions
 * @returns {HTMLElement}
 */
function createConventionsSection(node, conventions) {
  const section = document.createElement("div");
  section.className = "conventions-section";

  const h3 = document.createElement("h3");
  h3.textContent = `Conventions (${conventions.length})`;
  section.appendChild(h3);

  if (conventions.length === 0) {
    const msg = document.createElement("div");
    msg.className = "no-conventions";
    msg.textContent = "No GeoZarr conventions detected on this node.";
    section.appendChild(msg);
    return section;
  }

  for (const conv of conventions) {
    const card = createConventionCard(node, conv);
    section.appendChild(card);
  }

  return section;
}

/**
 * @param {import("../src/hierarchy.js").TreeNode} node
 * @param {import("../src/conventions.js").ConventionInfo} conv
 * @returns {HTMLElement}
 */
function createConventionCard(node, conv) {
  const card = document.createElement("div");
  card.className = "convention-card";

  // Header
  const header = document.createElement("div");
  header.className = "convention-header";

  const swatch = document.createElement("span");
  swatch.className = "conv-swatch";
  swatch.style.background = conv.color;
  header.appendChild(swatch);

  const h4 = document.createElement("h4");
  h4.textContent = conv.display;
  header.appendChild(h4);

  card.appendChild(header);

  // Metadata
  const meta = document.createElement("div");
  meta.className = "convention-meta";

  if (conv.uuid) {
    const uuidEl = document.createElement("div");
    uuidEl.innerHTML = `UUID: <code>${escapeHtml(conv.uuid)}</code>`;
    meta.appendChild(uuidEl);
  }

  if (conv.specUrl) {
    const specEl = document.createElement("div");
    const a = document.createElement("a");
    a.href = conv.specUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Specification";
    specEl.appendChild(a);
    meta.appendChild(specEl);
  }

  if (conv.schemaUrl) {
    const schemaEl = document.createElement("div");
    const a = document.createElement("a");
    a.href = conv.schemaUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "JSON Schema";
    schemaEl.appendChild(a);
    meta.appendChild(schemaEl);
  }

  if (conv.schemaUrl && conv.schemaUrl.includes("refs/heads/main")) {
    const note = document.createElement("div");
    note.className = "convention-note";
    note.textContent = "Note: Spec and schema URLs resolve to the main branch since v1 has not yet been released.";
    meta.appendChild(note);
  }

  card.appendChild(meta);

  // Validate button + results container
  const resultContainer = document.createElement("div");

  if (conv.schemaUrl) {
    const validateBtn = document.createElement("button");
    validateBtn.className = "validate-btn";
    validateBtn.textContent = "Validate";
    validateBtn.addEventListener("click", async () => {
      validateBtn.disabled = true;
      resultContainer.innerHTML =
        '<div class="validation-loading"><span class="spinner"></span> Validating...</div>';

      try {
        const doc = buildNodeDocument(node);
        const result = await validateNode(doc, conv.schemaUrl);
        renderValidationResult(resultContainer, result, conv.name);
      } catch (err) {
        resultContainer.innerHTML = `<div class="validation-fail">Validation error: ${escapeHtml(err.message)}</div>`;
      } finally {
        validateBtn.disabled = false;
      }
    });
    card.appendChild(validateBtn);
  } else {
    const noSchema = document.createElement("div");
    noSchema.className = "convention-meta";
    noSchema.textContent = "No schema URL available for validation.";
    card.appendChild(noSchema);
  }

  card.appendChild(resultContainer);
  return card;
}

/**
 * @param {HTMLElement} container
 * @param {import("../src/validator.js").ValidationResult} result
 * @param {string} conventionName - Convention name (e.g. "spatial:")
 */
function renderValidationResult(container, result, conventionName) {
  container.innerHTML = "";

  if (result.valid) {
    const div = document.createElement("div");
    div.className = "validation-result validation-pass";
    const badge = document.createElement("span");
    badge.className = "badge badge-pass";
    badge.textContent = "PASS";
    div.appendChild(badge);
    container.appendChild(div);
    return;
  }

  // --- Contains failures: errors in zarr_conventions metadata objects ---
  for (const failure of result.containsFailures) {
    const div = document.createElement("div");
    div.className = "validation-result validation-fail";

    const badge = document.createElement("span");
    badge.className = "badge badge-fail";
    badge.textContent = "FAIL";
    div.appendChild(badge);

    const msg = document.createElement("p");
    msg.className = "contains-failure-msg";
    msg.textContent = `No convention metadata object in zarr_conventions matched the "${conventionName}" schema.`;
    div.appendChild(msg);

    const closestLabel = document.createElement("p");
    closestLabel.className = "contains-closest-label";
    closestLabel.textContent = `Closest match (index ${failure.bestMatchIndex}):`;
    div.appendChild(closestLabel);

    const itemPre = document.createElement("pre");
    itemPre.className = "contains-closest-json";
    itemPre.textContent = JSON.stringify(failure.bestMatchItem, null, 2);
    div.appendChild(itemPre);

    if (failure.itemErrors.length > 0) {
      const errLabel = document.createElement("p");
      errLabel.className = "contains-errors-label";
      errLabel.textContent = "Errors:";
      div.appendChild(errLabel);

      const ul = document.createElement("ul");
      ul.className = "error-list";
      for (const err of failure.itemErrors) {
        const li = document.createElement("li");
        li.textContent = `${err.path}: ${err.message}`;
        ul.appendChild(li);
      }
      div.appendChild(ul);
    }

    container.appendChild(div);
  }

  // --- Attribute errors: convention properties outside zarr_conventions ---
  if (result.errors.length > 0) {
    const div = document.createElement("div");
    div.className = "validation-result validation-fail";

    if (result.containsFailures.length === 0) {
      const badge = document.createElement("span");
      badge.className = "badge badge-fail";
      badge.textContent = "FAIL";
      div.appendChild(badge);
    }

    const label = document.createElement("p");
    label.className = "attribute-errors-label";
    label.textContent = result.containsFailures.length > 0
      ? "Additional attribute errors:"
      : "Attribute errors:";
    div.appendChild(label);

    const ul = document.createElement("ul");
    ul.className = "error-list";
    for (const err of result.errors) {
      const li = document.createElement("li");
      li.textContent = `${err.path}: ${err.message}`;
      ul.appendChild(li);
    }
    div.appendChild(ul);

    container.appendChild(div);
  }
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
