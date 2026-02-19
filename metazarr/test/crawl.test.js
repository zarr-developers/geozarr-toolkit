import { describe, it, expect, vi, beforeEach } from "vitest";
import { crawlDirectory, tryCrawlDirectory } from "../src/crawl.js";

// Sample HTML directory listing (mimics S3/MinIO HTML index)
const ROOT_HTML = `<!DOCTYPE html><html><body>
<h1>Index of /</h1>
<table>
<tr><td><a href="/group1/">group1/</a></td></tr>
<tr><td><a href="/group2/">group2/</a></td></tr>
<tr><td><a href="/zarr.json">zarr.json</a></td></tr>
</table></body></html>`;

const GROUP1_HTML = `<!DOCTYPE html><html><body>
<h1>Index of /group1/</h1>
<table>
<tr><td><a href="../">..</a></td></tr>
<tr><td><a href="/group1/array_a/">array_a/</a></td></tr>
<tr><td><a href="/group1/zarr.json">zarr.json</a></td></tr>
</table></body></html>`;

const ARRAY_A_HTML = `<!DOCTYPE html><html><body>
<h1>Index of /group1/array_a/</h1>
<table>
<tr><td><a href="../">..</a></td></tr>
<tr><td><a href="/group1/array_a/zarr.json">zarr.json</a></td></tr>
<tr><td><a href="/group1/array_a/c/">c/</a></td></tr>
</table></body></html>`;

const CHUNKS_HTML = `<!DOCTYPE html><html><body>
<h1>Index of /group1/array_a/c/</h1>
<table>
<tr><td><a href="../">..</a></td></tr>
<tr><td><a href="/group1/array_a/c/0.0">0.0</a></td></tr>
</table></body></html>`;

const GROUP2_HTML = `<!DOCTYPE html><html><body>
<h1>Index of /group2/</h1>
<table>
<tr><td><a href="../">..</a></td></tr>
<tr><td><a href="/group2/.zgroup">.zgroup</a></td></tr>
<tr><td><a href="/group2/.zattrs">.zattrs</a></td></tr>
</table></body></html>`;

function mockFetch(urlMap) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const body = urlMap[url];
    if (body !== undefined) {
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("Not Found", { status: 404 });
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("crawlDirectory", () => {
  it("discovers zarr nodes from HTML directory listings", async () => {
    mockFetch({
      "https://example.com/data.zarr/": ROOT_HTML,
      "https://example.com/data.zarr/group1/": GROUP1_HTML,
      "https://example.com/data.zarr/group1/array_a/": ARRAY_A_HTML,
      "https://example.com/data.zarr/group1/array_a/c/": CHUNKS_HTML,
      "https://example.com/data.zarr/group2/": GROUP2_HTML,
    });

    const entries = await crawlDirectory("https://example.com/data.zarr");

    const paths = entries.map((e) => e.path).sort();
    expect(paths).toContain("/");
    expect(paths).toContain("/group1");
    expect(paths).toContain("/group1/array_a");
    expect(paths).toContain("/group2");

    // Root and group1 have zarr.json → kind "unknown" (could be group or array)
    const root = entries.find((e) => e.path === "/");
    expect(root.kind).toBe("unknown");

    // group2 has .zgroup → kind "group"
    const group2 = entries.find((e) => e.path === "/group2");
    expect(group2.kind).toBe("group");

    // Chunk directories (c/) should NOT appear as nodes since they have no zarr metadata
    expect(paths).not.toContain("/group1/array_a/c");
  });

  it("calls onProgress for each discovered path", async () => {
    mockFetch({
      "https://example.com/store/": ROOT_HTML,
      "https://example.com/store/group1/": GROUP1_HTML,
      "https://example.com/store/group1/array_a/": ARRAY_A_HTML,
      "https://example.com/store/group1/array_a/c/": CHUNKS_HTML,
      "https://example.com/store/group2/": GROUP2_HTML,
    });

    const discovered = [];
    await crawlDirectory("https://example.com/store", {
      onProgress: (path) => discovered.push(path),
    });

    expect(discovered.length).toBeGreaterThan(0);
    expect(discovered).toContain("/");
  });

  it("respects maxDepth", async () => {
    mockFetch({
      "https://example.com/deep/": ROOT_HTML,
      "https://example.com/deep/group1/": GROUP1_HTML,
      // array_a would be depth 2 — won't be reached with maxDepth=1
    });

    const entries = await crawlDirectory("https://example.com/deep", {
      maxDepth: 1,
    });

    const paths = entries.map((e) => e.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/group1");
    expect(paths).not.toContain("/group1/array_a");
  });
});

describe("tryCrawlDirectory", () => {
  it("returns entries when crawling succeeds", async () => {
    mockFetch({
      "https://example.com/store/": ROOT_HTML,
      "https://example.com/store/group1/": GROUP1_HTML,
      "https://example.com/store/group1/array_a/": ARRAY_A_HTML,
      "https://example.com/store/group1/array_a/c/": CHUNKS_HTML,
      "https://example.com/store/group2/": GROUP2_HTML,
    });

    const result = await tryCrawlDirectory("https://example.com/store");
    expect(result).not.toBeNull();
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns null when endpoint returns non-HTML", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"zarr_format": 3}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await tryCrawlDirectory("https://example.com/store");
    expect(result).toBeNull();
  });

  it("returns null when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const result = await tryCrawlDirectory("https://example.com/store");
    expect(result).toBeNull();
  });
});
