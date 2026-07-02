import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSitemapUrls,
  type SitemapUrlExtractorFetch,
} from "./runtime";

const INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
  <sitemap><loc>https://example.com/media.xml</loc></sitemap>
</sitemapindex>`;

const PAGES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-02-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <lastmod>2026-03-01</lastmod>
  </url>
</urlset>`;

const MEDIA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>https://example.com/gallery</loc>
    <image:image>
      <image:loc>https://example.com/image.jpg</image:loc>
    </image:image>
  </url>
  <url>
    <loc>https://example.com/video.mp4</loc>
    <video:video>
      <video:content_loc>https://example.com/video.mp4</video:content_loc>
    </video:video>
  </url>
</urlset>`;

const fetcher: SitemapUrlExtractorFetch = async ({ url }) => {
  const body: Record<string, string> = {
    "https://example.com/sitemap.xml": INDEX_XML,
    "https://example.com/pages.xml": PAGES_XML,
    "https://example.com/media.xml": MEDIA_XML,
  };
  return {
    ok: true,
    status: 200,
    final_url: url,
    body_text: body[url] ?? "",
  };
};

test("follows sitemap indexes and returns structured URL rows", async () => {
  const result = await extractSitemapUrls(
    {
      sitemapUrls: ["https://example.com/sitemap.xml"],
      maxUrls: 10,
    },
    fetcher,
  );

  assert.equal(result.item_count, 4);
  assert.deepEqual(result.items[0], {
    url: "https://example.com/",
    sitemapSource: "https://example.com/pages.xml",
    lastModified: "2026-02-15",
    changeFrequency: "weekly",
    priority: 0.8,
    isImage: false,
    isVideo: false,
    imageCount: 0,
  });
  assert.equal(result.items[2].isImage, true);
  assert.equal(result.items[2].imageCount, 1);
  assert.equal(result.items[3].isVideo, true);
});

test("respects maxUrls across child sitemaps", async () => {
  const result = await extractSitemapUrls(
    {
      sitemapUrls: ["https://example.com/sitemap.xml"],
      maxUrls: 2,
    },
    fetcher,
  );

  assert.equal(result.item_count, 2);
  assert.deepEqual(
    result.items.map((item) => item.url),
    ["https://example.com/", "https://example.com/about"],
  );
});

test("records sitemap fetch and parse errors without throwing", async () => {
  const result = await extractSitemapUrls(
    {
      sitemapUrls: ["https://example.com/broken.xml"],
    },
    async () => ({ ok: false, error: "fetch failed", status: 502 }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.item_count, 0);
  assert.equal(result.errors[0].error, "fetch failed");
  assert.equal(result.errors[0].statusCode, 502);
});
