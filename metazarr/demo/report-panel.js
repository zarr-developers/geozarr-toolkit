/**
 * Report panel — renders store-wide validation results grouped by convention.
 */

/**
 * Render the progress UI while validation is running.
 *
 * @param {HTMLElement} container
 * @returns {{ update(completed: number, total: number): void, cancel(): void }}
 */
export function renderProgressUI(container) {
  container.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "report-summary";

  const heading = document.createElement("h2");
  heading.textContent = "Validating store...";
  wrapper.appendChild(heading);

  const progressContainer = document.createElement("div");
  progressContainer.className = "progress-container";

  const bar = document.createElement("div");
  bar.className = "progress-bar";
  const fill = document.createElement("div");
  fill.className = "progress-fill";
  fill.style.width = "0%";
  bar.appendChild(fill);
  progressContainer.appendChild(bar);

  const text = document.createElement("div");
  text.className = "progress-text";
  text.textContent = "0 / 0";
  progressContainer.appendChild(text);

  wrapper.appendChild(progressContainer);
  container.appendChild(wrapper);

  return {
    update(completed, total) {
      const pct = total > 0 ? (completed / total) * 100 : 0;
      fill.style.width = `${pct}%`;
      text.textContent = `${completed} / ${total}`;
    },
    cancel() {
      text.textContent += " (cancelled)";
    },
  };
}

/**
 * Render the full validation report.
 *
 * @param {import("../src/report.js").StoreValidationReport} report
 * @param {(node: import("../src/hierarchy.js").TreeNode) => void} onNodeClick
 * @param {HTMLElement} container
 */
export function renderReport(report, onNodeClick, container) {
  container.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "report-summary";

  // Header
  const heading = document.createElement("h2");
  heading.textContent = "Store Validation Report";
  wrapper.appendChild(heading);

  const conventionCount = report.byConvention.size;
  const totalPass = [...report.byConvention.values()].reduce((s, r) => s + r.passCount, 0);
  const totalFail = [...report.byConvention.values()].reduce((s, r) => s + r.failCount, 0);
  const totalSkip = [...report.byConvention.values()].reduce((s, r) => s + r.skipCount, 0);

  const summary = document.createElement("p");
  summary.className = "report-header";
  const durationStr = report.duration < 1000
    ? `${Math.round(report.duration)}ms`
    : `${(report.duration / 1000).toFixed(1)}s`;
  summary.textContent =
    `${report.nodesWithConventions} of ${report.totalNodes} nodes checked across ${conventionCount} convention${conventionCount !== 1 ? "s" : ""} (${durationStr})`;
  wrapper.appendChild(summary);

  // Overall stats
  const statsLine = document.createElement("p");
  statsLine.className = "report-stats";
  const parts = [];
  if (totalPass > 0) parts.push(`${totalPass} pass`);
  if (totalFail > 0) parts.push(`${totalFail} fail`);
  if (totalSkip > 0) parts.push(`${totalSkip} skip`);
  statsLine.textContent = parts.join(", ");
  wrapper.appendChild(statsLine);

  // Convention sections
  for (const convReport of report.byConvention.values()) {
    wrapper.appendChild(renderConventionSection(convReport, onNodeClick));
  }

  container.appendChild(wrapper);
}

/**
 * @param {import("../src/report.js").ConventionReport} convReport
 * @param {(node: import("../src/hierarchy.js").TreeNode) => void} onNodeClick
 * @returns {HTMLElement}
 */
function renderConventionSection(convReport, onNodeClick) {
  const section = document.createElement("div");
  section.className = "report-convention";

  const hasFailures = convReport.failCount > 0;
  const total = convReport.nodes.length;
  const passRatio = total > 0 ? convReport.passCount / total : 0;

  // Header with progress bar
  const header = document.createElement("div");
  header.className = "report-convention-header";
  header.style.cursor = "pointer";

  const swatch = document.createElement("span");
  swatch.className = "conv-swatch";
  swatch.style.background = convReport.color;
  header.appendChild(swatch);

  const title = document.createElement("span");
  title.className = "report-convention-title";
  title.textContent = `${convReport.display}: ${convReport.passCount}/${total} pass`;
  header.appendChild(title);

  // Inline progress bar
  const bar = document.createElement("span");
  bar.className = "report-inline-bar";
  const fill = document.createElement("span");
  fill.className = "report-inline-fill";
  fill.style.width = `${passRatio * 100}%`;
  fill.style.background = hasFailures ? "#dc3545" : convReport.color;
  if (!hasFailures) fill.style.background = convReport.color;
  else {
    // Show pass portion in convention color, rest in red
    fill.style.background = convReport.color;
  }
  bar.appendChild(fill);
  header.appendChild(bar);

  section.appendChild(header);

  // Node list (collapsible)
  const nodeList = document.createElement("div");
  nodeList.className = "report-node-list";
  // Default: expanded if failures, collapsed if all pass
  nodeList.hidden = !hasFailures;

  header.addEventListener("click", () => {
    nodeList.hidden = !nodeList.hidden;
    header.classList.toggle("expanded", !nodeList.hidden);
  });

  if (hasFailures) {
    header.classList.add("expanded");
  }

  for (const entry of convReport.nodes) {
    const rowContainer = document.createElement("div");
    rowContainer.className = "report-node-entry";

    const row = document.createElement("div");
    row.className = `report-node-row report-node-${entry.status}`;

    const badge = document.createElement("span");
    badge.className = `badge badge-${entry.status === "pass" ? "pass" : entry.status === "fail" ? "fail" : "warn"}`;
    badge.textContent = entry.status.toUpperCase();
    row.appendChild(badge);

    const pathEl = document.createElement("span");
    pathEl.className = "report-node-path";
    pathEl.textContent = entry.path;
    row.appendChild(pathEl);

    if (entry.status === "fail" && entry.result) {
      const errorCount =
        entry.result.errors.length +
        entry.result.containsFailures.reduce((s, f) => s + f.itemErrors.length, 0);
      if (errorCount > 0) {
        const count = document.createElement("span");
        count.className = "report-error-count";
        count.textContent = `${errorCount} error${errorCount !== 1 ? "s" : ""}`;
        row.appendChild(count);

        const chevron = document.createElement("span");
        chevron.className = "report-node-chevron";
        chevron.textContent = "\u25B6";
        row.appendChild(chevron);
      }
    }

    rowContainer.appendChild(row);

    // Expandable error details for failing nodes
    if (entry.status === "fail" && entry.result) {
      const details = renderNodeErrors(entry.result, convReport.name);
      if (details) {
        details.hidden = true;
        rowContainer.appendChild(details);

        row.addEventListener("click", (e) => {
          details.hidden = !details.hidden;
          row.classList.toggle("expanded", !details.hidden);
        });
      }
    }

    // Link to full node detail view
    const viewLink = document.createElement("button");
    viewLink.className = "report-view-node-link";
    viewLink.textContent = "View full node detail \u2192";
    viewLink.addEventListener("click", (e) => {
      e.stopPropagation();
      onNodeClick(entry.node);
    });

    if (entry.status === "fail" && entry.result) {
      // Append view link inside the error details block
      const details = rowContainer.querySelector(".report-node-errors");
      if (details) {
        details.appendChild(viewLink);
      }
    } else {
      row.addEventListener("click", () => onNodeClick(entry.node));
    }

    nodeList.appendChild(rowContainer);
  }

  section.appendChild(nodeList);
  return section;
}

/**
 * Render validation errors inline for a failing node.
 *
 * @param {import("../src/validator.js").ValidationResult} result
 * @param {string} conventionName
 * @returns {HTMLElement|null}
 */
function renderNodeErrors(result, conventionName) {
  const allErrors = [];

  // Collect contains failures
  for (const failure of result.containsFailures) {
    for (const err of failure.itemErrors) {
      allErrors.push(`zarr_conventions[${failure.bestMatchIndex}]${err.path}: ${err.message}`);
    }
  }

  // Collect attribute errors
  for (const err of result.errors) {
    allErrors.push(`${err.path}: ${err.message}`);
  }

  if (allErrors.length === 0) return null;

  const container = document.createElement("div");
  container.className = "report-node-errors";

  const ul = document.createElement("ul");
  ul.className = "error-list";
  for (const msg of allErrors) {
    const li = document.createElement("li");
    li.textContent = msg;
    ul.appendChild(li);
  }
  container.appendChild(ul);

  return container;
}
