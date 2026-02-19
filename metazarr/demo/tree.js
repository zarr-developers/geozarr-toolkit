/**
 * Tree view component — renders a collapsible hierarchy of Zarr nodes.
 */

import { detectConventions } from "../src/conventions.js";

/**
 * Render the tree into a container element.
 *
 * @param {import("../src/hierarchy.js").TreeNode} root - Root tree node
 * @param {(node: import("../src/hierarchy.js").TreeNode) => void} onSelect - Selection callback
 * @param {HTMLElement} container - DOM container
 */
export function renderTree(root, onSelect, container) {
  container.innerHTML = "";
  const ul = createNodeList([root], onSelect);
  container.appendChild(ul);
}

/**
 * Clear the current selection highlight and highlight a new node.
 *
 * @param {HTMLElement} container
 * @param {string} path
 */
export function highlightNode(container, path) {
  container.querySelectorAll(".tree-node.selected").forEach((el) => {
    el.classList.remove("selected");
  });
  const target = container.querySelector(`[data-path="${CSS.escape(path)}"]`);
  if (target) target.classList.add("selected");
}

/**
 * @param {import("../src/hierarchy.js").TreeNode[]} nodes
 * @param {Function} onSelect
 * @returns {HTMLUListElement}
 */
function createNodeList(nodes, onSelect) {
  const ul = document.createElement("ul");
  ul.className = "tree-list";

  for (const node of nodes) {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "tree-node";
    row.dataset.path = node.path;

    const isGroup = node.kind === "group";
    const hasChildren = node.children && node.children.length > 0;

    // Toggle button for groups
    if (isGroup && hasChildren) {
      const toggle = document.createElement("button");
      toggle.className = "toggle-btn";
      toggle.textContent = "\u25BC"; // down arrow
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const childList = li.querySelector(":scope > .tree-list");
        if (childList) {
          const collapsed = childList.hidden;
          childList.hidden = !collapsed;
          toggle.textContent = collapsed ? "\u25BC" : "\u25B6";
        }
      });
      row.appendChild(toggle);
    } else if (isGroup) {
      // Spacer for alignment
      const spacer = document.createElement("span");
      spacer.style.width = "1rem";
      spacer.style.display = "inline-block";
      row.appendChild(spacer);
    } else {
      const spacer = document.createElement("span");
      spacer.style.width = "1rem";
      spacer.style.display = "inline-block";
      row.appendChild(spacer);
    }

    // Icon
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = isGroup ? "\uD83D\uDCC1" : "\u25A6"; // folder or grid
    row.appendChild(icon);

    // Name
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = getDisplayName(node.path);
    name.title = node.path;
    row.appendChild(name);

    // Convention badges — one per convention, color-coded
    const conventions = detectConventions(node.attrs);
    for (const conv of conventions) {
      const badge = document.createElement("span");
      badge.className = "conv-badge";
      const dot = document.createElement("span");
      dot.className = "conv-dot";
      dot.style.background = conv.color;
      badge.appendChild(dot);
      const label = document.createElement("span");
      label.className = "conv-label";
      label.textContent = conv.name;
      badge.appendChild(label);
      badge.title = conv.display;
      row.appendChild(badge);
    }

    // Kind label
    const kindLabel = document.createElement("span");
    kindLabel.className = "kind-label";
    kindLabel.textContent = isGroup ? "group" : "array";
    row.appendChild(kindLabel);

    // Click handler
    row.addEventListener("click", () => onSelect(node));

    li.appendChild(row);

    // Render children
    if (isGroup && hasChildren) {
      const childList = createNodeList(node.children, onSelect);
      li.appendChild(childList);
    }

    ul.appendChild(li);
  }

  return ul;
}

/**
 * Extract the display name from a path.
 * @param {string} path
 * @returns {string}
 */
function getDisplayName(path) {
  if (path === "/") return "/  (root)";
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1];
}
