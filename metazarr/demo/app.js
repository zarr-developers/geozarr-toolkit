/**
 * Main application — wires store opening, tree rendering, and detail panel.
 */

import { openStore, CorsError } from "../src/store.js";
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

// --- URL state ---

function updateUrlParams(storeUrl, nodePath) {
  const params = new URLSearchParams();
  if (storeUrl) params.set("url", storeUrl);
  if (nodePath) params.set("node", nodePath);
  const qs = params.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

function getUrlParams() {
  const params = new URLSearchParams(location.search);
  return { url: params.get("url"), node: params.get("node") };
}

// --- Form submission ---

async function openStoreFromUrl(url, autoSelectNode) {
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
      const tree = await buildTree(result.store, result.zarrFormat);
      currentTree = tree;
      renderTree(tree, onNodeSelect, treeContainer);
    } else if (result.discovery === "crawled" || result.discovery === "s3-list") {
      const label = result.discovery === "s3-list" ? "S3 listing" : "Directory crawl";
      const truncBadge = result.truncated
        ? ` <span class="badge badge-warn">Truncated</span>`
        : "";
      statusEl.innerHTML =
        `${formatBadge}<span class="badge badge-info">${label}</span> ${result.crawledEntries.length} nodes${truncBadge}`;
      const tree = await buildTreeFromCrawl(result.store, result.crawledEntries);
      currentTree = tree;
      renderTree(tree, onNodeSelect, treeContainer);
      // Show add-path so users can manually add nodes not discovered (or beyond limit)
      addPathContainer.hidden = false;
    } else {
      statusEl.innerHTML =
        '<span class="badge badge-warn">Manual</span> Add paths manually';
      const root = await openNode(result.store, "/");
      currentTree = root;
      renderTree(root, onNodeSelect, treeContainer);
      addPathContainer.hidden = false;
    }

    updateUrlParams(url, null);

    // Auto-select node from URL if provided
    if (autoSelectNode && currentTree) {
      const { findNode } = await import("../src/hierarchy.js");
      const target = findNode(currentTree, autoSelectNode);
      if (target) {
        onNodeSelect(target);
        highlightNode(treeContainer, target.path);
      } else {
        detailPanel.innerHTML =
          '<p class="placeholder-text">Select a node from the tree to view its metadata and conventions.</p>';
      }
    } else {
      detailPanel.innerHTML =
        '<p class="placeholder-text">Select a node from the tree to view its metadata and conventions.</p>';
    }
  } catch (err) {
    statusEl.textContent = "";
    if (err instanceof CorsError) {
      const hostname = new URL(err.url).hostname;
      treeContainer.innerHTML = `<div class="error-banner error-banner--cors" style="margin: 0.5rem;">
        <strong>CORS Error</strong>
        <p>The server at <code>${escapeHtml(hostname)}</code> does not allow requests from this site.</p>
        <p>This is a restriction set by the remote server, not a problem with the URL itself. The server needs to include an <code>Access-Control-Allow-Origin</code> header in its responses.</p>
        <details>
          <summary>What can I do?</summary>
          <ul>
            <li>Ask the data provider to enable CORS on their server</li>
            <li>Use a store hosted on a CORS-enabled server (e.g. S3 with public access)</li>
            <li>Run metazarr locally where CORS restrictions don't apply</li>
          </ul>
        </details>
      </div>`;
    } else {
      treeContainer.innerHTML = `<div class="error-banner" style="margin: 0.5rem;">Failed to open store: ${escapeHtml(err.message)}</div>`;
    }
    detailPanel.innerHTML = "";
  } finally {
    openBtn.disabled = false;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  openStoreFromUrl(url, null);
});

// --- Example chips ---

document.querySelectorAll(".example-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const url = chip.dataset.url;
    urlInput.value = url;
    openStoreFromUrl(url, null);
  });
});

// --- Mobile panel switching ---

const backBtn = document.getElementById("back-btn");
const mobileQuery = window.matchMedia("(max-width: 768px)");

function showDetailView() {
  if (mobileQuery.matches) {
    document.body.classList.add("mobile-detail-view");
  }
}

function showTreeView() {
  document.body.classList.remove("mobile-detail-view");
}

backBtn.addEventListener("click", showTreeView);

// --- Node selection ---

function onNodeSelect(node) {
  highlightNode(treeContainer, node.path);
  const conventions = detectConventions(node.attrs);
  renderDetail(node, conventions, detailPanel);
  updateUrlParams(urlInput.value.trim(), node.path);
  showDetailView();
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

// --- Restore from URL on load ---

{
  const { url, node } = getUrlParams();
  if (url) {
    urlInput.value = url;
    openStoreFromUrl(url, node);
  }
}
