import assert from "node:assert/strict";
import test from "node:test";
import {
  crawlWebsiteContent,
  type WebsiteContentCrawlerFetch,
} from "./runtime";

const FIXTURES: Record<string, string> = {
  "https://example.com/docs": `
    <html lang="en-AU">
      <head>
        <title>Docs home</title>
        <link rel="canonical" href="/docs" />
        <meta name="description" content="Knowledge base home" />
      </head>
      <body>
        <nav>Navigation noise</nav>
        <main>
          <h1>Docs home</h1>
          <p>Welcome to the product docs.</p>
          <a href="/docs/install">Install guide</a>
          <a href="/blog/outside">Outside path</a>
          <a href="https://other.example/help">External</a>
        </main>
      </body>
    </html>
  `,
  "https://example.com/docs/install": `
    <html>
      <head><title>Install guide</title></head>
      <body>
        <header>Header noise</header>
        <article>
          <h1>Install guide</h1>
          <p>Run the installer.</p>
          <ul><li>Copy the API key.</li></ul>
        </article>
      </body>
    </html>
  `,
  "https://example.com/blog/outside": `
    <html><body><main><h1>Outside</h1></main></body></html>
  `,
};

function fixtureFetcher(blocked = false): WebsiteContentCrawlerFetch {
  return async ({ url }) => {
    if (blocked) {
      return {
        ok: false,
        error: "blocked",
        message: "target blocked request",
        status: 403,
      };
    }
    return {
      ok: true,
      status: 200,
      final_url: url,
      title: url.includes("install") ? "Install guide" : "Docs home",
      html: FIXTURES[url],
      body_text: "",
    };
  };
}

test("crawls pages under the start path and extracts dataset-shaped records", async () => {
  const result = await crawlWebsiteContent(
    {
      start_urls: ["https://example.com/docs/"],
      max_pages: 5,
      max_depth: 2,
    },
    fixtureFetcher(),
  );

  assert.equal(result.item_count, 2);
  assert.equal(result.error_count, 0);
  assert.deepEqual(
    result.pages.map((page) => page.crawl.loadedUrl),
    ["https://example.com/docs", "https://example.com/docs/install"],
  );
  assert.equal(result.pages[0].metadata.title, "Docs home");
  assert.equal(result.pages[0].metadata.description, "Knowledge base home");
  assert.equal(result.pages[0].metadata.languageCode, "en");
  assert.match(result.pages[0].markdown ?? "", /# Docs home/);
  assert.match(result.pages[0].text ?? "", /Welcome to the product docs/);
  assert.doesNotMatch(result.pages[0].text ?? "", /Navigation noise/);
});

test("respects max_pages and exclude_globs", async () => {
  const result = await crawlWebsiteContent(
    {
      start_urls: ["https://example.com/docs"],
      max_pages: 1,
      max_depth: 2,
      exclude_globs: ["**/install"],
    },
    fixtureFetcher(),
  );

  assert.equal(result.fetched, 1);
  assert.equal(result.item_count, 1);
  assert.equal(result.pages[0].crawl.loadedUrl, "https://example.com/docs");
});

test("returns page errors without throwing the whole crawl", async () => {
  const result = await crawlWebsiteContent(
    {
      start_urls: ["https://example.com/docs"],
    },
    fixtureFetcher(true),
  );

  assert.equal(result.item_count, 0);
  assert.equal(result.error_count, 1);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].statusCode, 403);
});
