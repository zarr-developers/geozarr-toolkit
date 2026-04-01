/**
 * Store-wide validation — validate all nodes against all detected conventions.
 *
 * @typedef {Object} NodeValidationEntry
 * @property {string} path - Tree node path
 * @property {"pass"|"fail"|"skip"} status
 * @property {import("./validator.js").ValidationResult|null} result
 * @property {import("./hierarchy.js").TreeNode} node
 *
 * @typedef {Object} ConventionReport
 * @property {string} uuid
 * @property {string} name
 * @property {string} display
 * @property {string} color
 * @property {NodeValidationEntry[]} nodes
 * @property {number} passCount
 * @property {number} failCount
 * @property {number} skipCount
 *
 * @typedef {Object} StoreValidationReport
 * @property {Map<string, ConventionReport>} byConvention - Keyed by convention UUID
 * @property {number} totalNodes
 * @property {number} nodesWithConventions
 * @property {number} duration - Wall-clock milliseconds
 */

import { detectConventions } from "./conventions.js";
import { validateNode, buildNodeDocument } from "./validator.js";

const BATCH_SIZE = 50;

/**
 * Collect all nodes from a tree into a flat array.
 *
 * @param {import("./hierarchy.js").TreeNode} root
 * @returns {import("./hierarchy.js").TreeNode[]}
 */
export function collectNodes(root) {
  const nodes = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    nodes.push(node);
    // Push children in reverse so we visit them in order
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]);
    }
  }
  return nodes;
}

/**
 * Group nodes by their detected conventions.
 *
 * @param {import("./hierarchy.js").TreeNode[]} nodes
 * @returns {Map<string, { convention: import("./conventions.js").ConventionInfo, nodes: import("./hierarchy.js").TreeNode[] }>}
 */
export function groupByConvention(nodes) {
  /** @type {Map<string, { convention: import("./conventions.js").ConventionInfo, nodes: import("./hierarchy.js").TreeNode[] }>} */
  const groups = new Map();

  for (const node of nodes) {
    const conventions = detectConventions(node.attrs);
    for (const conv of conventions) {
      const key = conv.uuid || conv.name;
      if (!groups.has(key)) {
        groups.set(key, { convention: conv, nodes: [] });
      }
      groups.get(key).nodes.push(node);
    }
  }

  return groups;
}

/**
 * Validate all nodes in a tree against all their detected conventions.
 *
 * @param {import("./hierarchy.js").TreeNode} rootTreeNode
 * @param {Object} [options]
 * @param {(progress: { completed: number, total: number }) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<StoreValidationReport>}
 */
export async function validateStore(rootTreeNode, options = {}) {
  const { onProgress, signal } = options;
  const start = performance.now();

  const allNodes = collectNodes(rootTreeNode);
  const groups = groupByConvention(allNodes);

  // Build the list of all (node, convention) pairs to validate
  const tasks = [];
  for (const [key, { convention, nodes }] of groups) {
    for (const node of nodes) {
      tasks.push({ key, convention, node });
    }
  }

  const total = tasks.length;

  // Initialize convention reports
  /** @type {Map<string, ConventionReport>} */
  const byConvention = new Map();
  for (const [key, { convention }] of groups) {
    byConvention.set(key, {
      uuid: convention.uuid,
      name: convention.name,
      display: convention.display,
      color: convention.color,
      nodes: [],
      passCount: 0,
      failCount: 0,
      skipCount: 0,
    });
  }

  // Validate in batches to keep the UI responsive
  for (let i = 0; i < tasks.length; i++) {
    if (signal?.aborted) break;

    const { key, convention, node } = tasks[i];
    const report = byConvention.get(key);

    if (!convention.schemaUrl) {
      report.nodes.push({ path: node.path, status: "skip", result: null, node });
      report.skipCount++;
    } else {
      try {
        const doc = buildNodeDocument(node);
        const result = await validateNode(doc, convention.schemaUrl);
        const status = result.valid ? "pass" : "fail";
        report.nodes.push({ path: node.path, status, result, node });
        if (result.valid) {
          report.passCount++;
        } else {
          report.failCount++;
        }
      } catch {
        report.nodes.push({ path: node.path, status: "skip", result: null, node });
        report.skipCount++;
      }
    }

    // Yield to UI thread every BATCH_SIZE validations
    if ((i + 1) % BATCH_SIZE === 0) {
      onProgress?.({ completed: i + 1, total });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Sort entries within each convention: failures first, then passes, then skips
  const statusOrder = { fail: 0, pass: 1, skip: 2 };
  for (const report of byConvention.values()) {
    report.nodes.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }

  const nodesWithConventions = new Set(tasks.map((t) => t.node.path)).size;
  const duration = performance.now() - start;

  onProgress?.({ completed: total, total });

  return {
    byConvention,
    totalNodes: allNodes.length,
    nodesWithConventions,
    duration,
  };
}
