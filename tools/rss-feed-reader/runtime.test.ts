import assert from "node:assert/strict";
import test from "node:test";
import { readRssFeeds, type RssFeedReaderFetch } from "./runtime";

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Hacker News: Front Page</title>
    <link>https://news.ycombinator.com/</link>
    <item>
      <title>Example feed item</title>
      <link>https://example.com/article</link>
      <guid>https://news.ycombinator.com/item?id=123456</guid>
      <pubDate>Sat, 13 Jun 2026 12:00:00 GMT</pubDate>
      <dc:creator>Example author</dc:creator>
      <category>Technology</category>
      <description><![CDATA[<p>Short item summary.</p>]]></description>
      <content:encoded><![CDATA[<p>Full feed-provided content.</p>]]></content:encoded>
      <media:thumbnail url="https://example.com/image.jpg" />
      <enclosure url="https://example.com/audio.mp3" type="audio/mpeg" length="123" />
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <link rel="alternate" href="https://example.org/blog" />
  <entry>
    <title>Atom post</title>
    <link rel="alternate" href="/posts/atom-post" />
    <link rel="enclosure" href="/cover.jpg" type="image/jpeg" title="Cover" />
    <id>tag:example.org,2026:atom-post</id>
    <published>2026-06-15T00:00:00Z</published>
    <updated>2026-06-16T00:00:00Z</updated>
    <author><name>Ada Atom</name></author>
    <category term="Developer tools" />
    <summary type="html">&lt;p&gt;Atom summary&lt;/p&gt;</summary>
    <content type="html">&lt;p&gt;Atom content&lt;/p&gt;</content>
  </entry>
</feed>`;

const JSON_FEED = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "JSON Feed",
  home_page_url: "https://jsonfeed.org/",
  items: [
    {
      id: "json-1",
      url: "https://jsonfeed.org/item",
      title: "JSON item",
      date_published: "2026-06-20T08:00:00Z",
      authors: [{ name: "Json Author" }],
      tags: ["Feeds"],
      summary: "JSON summary",
      content_html: "<p>JSON content</p>",
      image: "https://jsonfeed.org/image.png",
      attachments: [
        {
          url: "https://jsonfeed.org/audio.mp3",
          mime_type: "audio/mpeg",
          size_in_bytes: 456,
          title: "Audio",
        },
      ],
    },
  ],
});

const LIMIT_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Limit feed</title>
    <link>https://limits.example/</link>
    <item>
      <title>Old item</title>
      <link>https://limits.example/old</link>
      <pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>New item</title>
      <link>https://limits.example/new</link>
      <pubDate>Tue, 02 Jun 2026 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Undated item</title>
      <link>https://limits.example/undated</link>
    </item>
  </channel>
</rss>`;

const FEEDS: Record<string, string> = {
  "https://example.com/rss.xml": RSS_FEED,
  "https://example.org/atom.xml": ATOM_FEED,
  "https://jsonfeed.org/feed.json": JSON_FEED,
  "https://limits.example/rss.xml": LIMIT_FEED,
};

const fetcher: RssFeedReaderFetch = async ({ url }) => {
  const body = FEEDS[url];
  if (!body) return { ok: false, error: "not_found", status: 404 };
  return { ok: true, status: 200, final_url: url, body_text: body };
};

test("returns structured rows from RSS feeds", async () => {
  const result = await readRssFeeds(
    { feedUrls: ["https://example.com/rss.xml"], maxTotalItems: 25 },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.item_count, 1);
  assert.deepEqual(result.items[0], {
    feedUrl: "https://example.com/rss.xml",
    feedIndex: 1,
    feedTitle: "Hacker News: Front Page",
    feedHomeUrl: "https://news.ycombinator.com/",
    feedType: "rss",
    itemIndexInFeed: 1,
    title: "Example feed item",
    url: "https://example.com/article",
    guid: "https://news.ycombinator.com/item?id=123456",
    itemKey:
      "https://example.com/rss.xml|https://news.ycombinator.com/item?id=123456|https://example.com/article|Example feed item|2026-06-13T12:00:00.000Z",
    publishedAt: "2026-06-13T12:00:00.000Z",
    updatedAt: null,
    authors: ["Example author"],
    categories: ["Technology"],
    summaryText: "Short item summary.",
    summaryHtml: "<p>Short item summary.</p>",
    contentText: "Full feed-provided content.",
    contentHtml: "<p>Full feed-provided content.</p>",
    imageUrl: "https://example.com/image.jpg",
    enclosures: [
      {
        url: "https://example.com/audio.mp3",
        type: "audio/mpeg",
        length: "123",
        title: null,
      },
    ],
    rawDateText: "Sat, 13 Jun 2026 12:00:00 GMT",
  });
});

test("normalizes Atom and JSON Feed payloads", async () => {
  const result = await readRssFeeds(
    {
      feedUrls: ["https://example.org/atom.xml", "https://jsonfeed.org/feed.json"],
      maxTotalItems: 25,
    },
    fetcher,
  );

  assert.equal(result.item_count, 2);
  assert.equal(result.items[0].feedType, "atom");
  assert.equal(result.items[0].url, "https://example.org/posts/atom-post");
  assert.equal(result.items[0].imageUrl, "https://example.org/cover.jpg");
  assert.deepEqual(result.items[0].authors, ["Ada Atom"]);
  assert.deepEqual(result.items[0].categories, ["Developer tools"]);
  assert.equal(result.items[1].feedType, "json");
  assert.equal(result.items[1].feedTitle, "JSON Feed");
  assert.equal(result.items[1].contentText, "JSON content");
  assert.deepEqual(result.items[1].enclosures, [
    {
      url: "https://jsonfeed.org/audio.mp3",
      type: "audio/mpeg",
      length: "456",
      title: "Audio",
    },
  ]);
});

test("applies publishedAfter and item limits while keeping undated items", async () => {
  const result = await readRssFeeds(
    {
      feedUrls: ["https://limits.example/rss.xml"],
      publishedAfter: "2026-06-02",
      maxItemsPerFeed: 2,
      maxTotalItems: 2,
    },
    fetcher,
  );

  assert.equal(result.item_count, 2);
  assert.deepEqual(
    result.items.map((item) => item.title),
    ["New item", "Undated item"],
  );
});

test("records failed feeds and continues with successful feeds", async () => {
  const result = await readRssFeeds(
    {
      feedUrls: ["https://example.com/missing.xml", "https://example.com/rss.xml"],
      maxTotalItems: 25,
    },
    fetcher,
  );

  assert.equal(result.ok, false);
  assert.equal(result.item_count, 1);
  assert.equal(result.errors[0].feedIndex, 1);
  assert.equal(result.errors[0].error, "not_found");
  assert.equal(result.errors[0].statusCode, 404);
});
