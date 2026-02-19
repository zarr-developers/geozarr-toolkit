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

  addInfoRow(dl, "Type", node.kind);

  if (node.kind === "array") {
    if (node.shape) addInfoRow(dl, "Shape", `[${node.shape.join(", ")}]`);
    if (node.dtype) addInfoRow(dl, "Dtype", String(node.dtype));
    if (node.chunks) addInfoRow(dl, "Chunks", formatChunks(node.chunks));
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
  if (typeof chunks === "object" && chunks !== null) {
    return JSON.stringify(chunks);
  }
  return String(chunks);
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
