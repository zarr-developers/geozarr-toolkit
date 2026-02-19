/**
 * Main application — wires store opening, tree rendering, and detail panel.
 */

import { openStore } from "../src/store.js";
import { buildTree, buildTreeFromV3, buildTreeFromCrawl, openNode, insertNode } from "../src/hierarchy.js";
import { detectConventions } from "../src/conventions.js";
import { renderTree, highlightNode } from "./tree.js";
import { renderDetail } from "./detail-panel.js";

// DOM elements
const form = document.getElementById("open-form");
const urlInput = document.getElementById("url-input");
const openBtn = document.getElementById("open-btn");
const statusEl = document.getElementById("status");
const treeContainer = document.getElementById("tree-container");
const detailPanel = document.getElementById("detail-panel");
const addPathContainer = document.getElementById("add-path-container");
const addPathInput = document.getElementById("add-path-input");
const addPathBtn = document.getElementById("add-path-btn");

// App state
let currentStore = null;
let currentTree = null;

// --- Form submission ---

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  openBtn.disabled = true;
  statusEl.innerHTML = '<span class="spinner"></span> Opening store...';
  treeContainer.innerHTML = "";
  detailPanel.innerHTML =
    '<p class="placeholder-text">Loading hierarchy...</p>';
  addPathContainer.hidden = true;

  try {
    const result = await openStore(url, {
      onProgress(path) {
        statusEl.innerHTML = `<span class="spinner"></span> Crawling... ${escapeHtml(path)}`;
      },
    });
    currentStore = result.store;

    const formatBadge = result.zarrFormat
      ? `<span class="badge badge-format">Zarr v${result.zarrFormat}</span> `
      : "";

    if (result.discovery === "consolidated-v3") {
      statusEl.innerHTML =
        `${formatBadge}<span class="badge badge-info">Consolidated</span> ${result.v3Entries.length} nodes`;
      const tree = buildTreeFromV3(result.v3Entries);
      currentTree = tree;
      renderTree(tree, onNodeSelect, treeContainer);
    } else if (result.discovery === "consolidated-v2") {
      statusEl.innerHTML = `${formatBadge}<span class="badge badge-info">Consolidated</span>`;
      const tree = await buildTree(result.store);
      currentTree = tree;
      renderTree(tree, onNodeSelect, treeContainer);
    } else if (result.discovery === "crawled") {
      statusEl.innerHTML =
        `${formatBadge}<span class="badge badge-info">Directory crawl</span> ${result.crawledEntries.length} nodes`;
      const tree = await buildTreeFromCrawl(result.store, result.crawledEntries);
      currentTree = tree;
      renderTree(tree, onNodeSelect, treeContainer);
      // Still show add-path in case crawling missed something
      addPathContainer.hidden = false;
    } else {
      statusEl.innerHTML =
        '<span class="badge badge-warn">Manual</span> Add paths manually';
      const root = await openNode(result.store, "/");
      currentTree = root;
      renderTree(root, onNodeSelect, treeContainer);
      addPathContainer.hidden = false;
    }

    detailPanel.innerHTML =
      '<p class="placeholder-text">Select a node from the tree to view its metadata and conventions.</p>';
  } catch (err) {
    statusEl.textContent = "";
    treeContainer.innerHTML = `<div class="error-banner" style="margin: 0.5rem;">Failed to open store: ${escapeHtml(err.message)}</div>`;
    detailPanel.innerHTML = "";
  } finally {
    openBtn.disabled = false;
  }
});

// --- Node selection ---

function onNodeSelect(node) {
  highlightNode(treeContainer, node.path);
  const conventions = detectConventions(node.attrs);
  renderDetail(node, conventions, detailPanel);
}

// --- Manual path addition ---

addPathBtn.addEventListener("click", addPath);
addPathInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addPath();
  }
});

async function addPath() {
  const path = addPathInput.value.trim();
  if (!path || !currentStore || !currentTree) return;

  addPathBtn.disabled = true;
  try {
    const node = await openNode(currentStore, path);
    insertNode(currentTree, node);
    renderTree(currentTree, onNodeSelect, treeContainer);
    addPathInput.value = "";
    // Auto-select the new node
    onNodeSelect(node);
    highlightNode(treeContainer, node.path);
  } catch (err) {
    detailPanel.innerHTML = `<div class="error-banner">Failed to open path: ${escapeHtml(err.message)}</div>`;
  } finally {
    addPathBtn.disabled = false;
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
