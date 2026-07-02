import assert from "node:assert/strict";
import test from "node:test";
import {
  extractWebsiteLogos,
  type WebsiteLogoExtractorFetch,
} from "./runtime";

const HTML = `
  <html>
    <head>
      <link rel="icon" href="/favicon-32.png" sizes="32x32" />
      <link rel="apple-touch-icon" href="https://cdn.example.com/apple.png" sizes="180x180" />
      <link rel="manifest" href="/site.webmanifest" />
      <meta property="og:image" content="/og.png" />
      <meta name="twitter:image" content="/twitter.png" />
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Organization","logo":{"url":"/schema-logo.svg"}}
      </script>
    </head>
    <body>
      <header>
        <svg viewBox="0 0 20 20"><title>Logo</title><path d="M0 0h20v20H0z"/></svg>
      </header>
      <main>
        <img class="brand-logo" src="/img/logo.png" width="200" height="80" alt="Example logo" />
        <img class="brand-logo" src="/img/logo.png" alt="Duplicate logo" />
        <img src="/photos/team.jpg" alt="Team photo" />
      </main>
    </body>
  </html>
`;

const MANIFEST = JSON.stringify({
  icons: [
    { src: "/manifest-192.png", sizes: "192x192" },
    { src: "https://cdn.example.com/manifest-512.png", sizes: "512x512" },
  ],
});

const fetcher: WebsiteLogoExtractorFetch = async ({ url, responseKind }) => {
  if (responseKind === "json" || url.endsWith("site.webmanifest")) {
    return {
      ok: true,
      status: 200,
      final_url: url,
      body_text: MANIFEST,
    };
  }
  return {
    ok: true,
    status: 200,
    final_url: "https://example.com/",
    html: HTML,
  };
};

test("extracts logo dataset records from common logo locations", async () => {
  const result = await extractWebsiteLogos(
    {
      urls: ["https://example.com"],
      maxConcurrency: 2,
      timeoutSecs: 10,
    },
    fetcher,
  );

  assert.equal(result.item_count, 1);
  assert.equal(result.results[0].url, "https://example.com/");
  assert.equal(result.results[0].error, undefined);
  assert.deepEqual(
    result.results[0].logos.map((logo) => logo.type),
    [
      "favicon",
      "favicon",
      "favicon-default",
      "og-image",
      "twitter-image",
      "schema-org",
      "img-logo",
      "svg-inline",
      "manifest-icon",
      "manifest-icon",
    ],
  );
  assert.equal(result.results[0].logoCount, 10);
  assert.equal(
    result.results[0].logos.find((logo) => logo.type === "img-logo")?.size,
    "200x80",
  );
  assert.equal(
    result.results[0].logos.find((logo) => logo.type === "manifest-icon")?.url,
    "https://example.com/manifest-192.png",
  );
});

test("can skip manifest fetching", async () => {
  const result = await extractWebsiteLogos(
    {
      urls: ["https://example.com"],
      includeManifestIcons: false,
    },
    fetcher,
  );

  assert.equal(
    result.results[0].logos.some((logo) => logo.type === "manifest-icon"),
    false,
  );
});

test("returns a zero-logo result with error when a fetch fails", async () => {
  const result = await extractWebsiteLogos(
    { urls: ["https://down.example"] },
    async () => ({ ok: false, error: "fetch failed", status: 502 }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.results[0].logoCount, 0);
  assert.equal(result.results[0].error, "fetch failed");
});
