import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeRedditPostsComments,
  type RedditPostsCommentsFetch,
} from "./runtime";

const LISTING_HTML = `<!doctype html>
<html>
  <body>
    <main>
      <shreddit-post
        id="t3_alpha"
        post-id="alpha"
        post-title="Best scraping setup for research?"
        subreddit-name="webscraping"
        author="sample_user"
        permalink="/r/webscraping/comments/alpha/best_scraping_setup/"
        score="1.2k"
        comment-count="45"
        upvote-ratio="0.94"
        created-timestamp="2026-07-01T10:00:00.000Z"
        post-flair="Question"
        content-href="https://example.com/post"
      >
        <div slot="text-body">What stack are people using for large research jobs?</div>
        <img src="https://preview.redd.it/alpha.png" />
      </shreddit-post>
      <shreddit-post
        id="t3_beta"
        post-id="beta"
        post-title="Launch notes for a crawler"
        subreddit-name="SaaS"
        author="builder"
        permalink="https://www.reddit.com/r/SaaS/comments/beta/launch_notes/"
        score="87"
        comment-count="6"
        nsfw="false"
        spoiler="true"
      >
        <div slot="text-body">We wrote up our launch notes.</div>
      </shreddit-post>
    </main>
  </body>
</html>`;

const POST_HTML = `<!doctype html>
<html>
  <body>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "DiscussionForumPosting",
        "headline": "Market research prompt collection",
        "url": "https://www.reddit.com/r/marketing/comments/gamma/market_research_prompt_collection/",
        "author": { "name": "researcher" },
        "articleBody": "A thread collecting useful prompt patterns.",
        "upvoteCount": 321,
        "commentCount": 2,
        "datePublished": "2026-06-30T12:00:00Z",
        "image": "https://preview.redd.it/gamma.jpg",
        "comment": [
          {
            "@type": "Comment",
            "text": "This was useful.",
            "author": { "name": "analyst" },
            "upvoteCount": 12,
            "datePublished": "2026-06-30T13:00:00Z",
            "url": "https://www.reddit.com/r/marketing/comments/gamma/-/comment1/"
          },
          {
            "@type": "Comment",
            "text": "Saving this.",
            "author": { "name": "operator" },
            "upvoteCount": 5,
            "datePublished": "2026-06-30T14:00:00Z",
            "url": "https://www.reddit.com/r/marketing/comments/gamma/-/comment2/"
          }
        ]
      }
    </script>
    <shreddit-comment
      thingid="t1_dom"
      author="dom_user"
      score="9"
      created-timestamp="2026-06-30T15:00:00Z"
      permalink="/r/marketing/comments/gamma/-/dom_comment/"
      parentid="t3_gamma"
      depth="1"
    >
      <div slot="comment">Visible DOM comment.</div>
    </shreddit-comment>
  </body>
</html>`;

test("extracts structured Reddit posts from subreddit listings", async () => {
  const seenUrls: string[] = [];
  const fetcher: RedditPostsCommentsFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    return { ok: true, status: 200, final_url: url, html: LISTING_HTML };
  };

  const result = await scrapeRedditPostsComments(
    {
      sources: ["r/webscraping"],
      sort: "top",
      timeRange: "month",
      countryCode: "AU",
      maxPostsPerSource: 10,
      includeComments: false,
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, "reddit_posts_comments");
  assert.equal(result.post_count, 2);
  assert.equal(result.comment_count, 0);
  assert.equal(seenUrls[0], "https://www.reddit.com/r/webscraping/top/?t=month");
  assert.deepEqual(result.results[0].posts[0], {
    position: 1,
    id: "t3_alpha",
    title: "Best scraping setup for research?",
    subreddit: "webscraping",
    author: "sample_user",
    body: "What stack are people using for large research jobs?",
    url: "https://example.com/post",
    permalink: "https://www.reddit.com/r/webscraping/comments/alpha/best_scraping_setup/",
    score: 1200,
    upvoteRatio: 0.94,
    commentCount: 45,
    createdAt: "2026-07-01T10:00:00.000Z",
    flair: "Question",
    isNsfw: null,
    isSpoiler: null,
    mediaUrls: ["https://preview.redd.it/alpha.png"],
    outboundUrl: "https://example.com/post",
    comments: [],
  });
  assert.equal(result.results[0].posts[1].isSpoiler, true);
});

test("supports direct Reddit URLs, visible comments, and JSON-LD fallback", async () => {
  const result = await scrapeRedditPostsComments(
    {
      sources: ["https://www.reddit.com/r/marketing/comments/gamma/thread/"],
      maxPostsPerSource: 5,
      maxCommentsPerPost: 1,
    },
    async ({ url }) => ({ ok: true, status: 200, final_url: url, html: POST_HTML }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.results[0].source.type, "URL");
  assert.equal(result.post_count, 1);
  assert.equal(result.comment_count, 1);
  assert.deepEqual(result.results[0].posts[0], {
    position: 1,
    id: "gamma",
    title: "Market research prompt collection",
    subreddit: "marketing",
    author: "researcher",
    body: "A thread collecting useful prompt patterns.",
    url: "https://www.reddit.com/r/marketing/comments/gamma/market_research_prompt_collection/",
    permalink: "https://www.reddit.com/r/marketing/comments/gamma/market_research_prompt_collection/",
    score: 321,
    upvoteRatio: null,
    commentCount: 2,
    createdAt: "2026-06-30T12:00:00Z",
    flair: null,
    isNsfw: null,
    isSpoiler: null,
    mediaUrls: ["https://preview.redd.it/gamma.jpg"],
    outboundUrl: null,
    comments: [
      {
        id: "gamma",
        author: "analyst",
        body: "This was useful.",
        score: 12,
        createdAt: "2026-06-30T13:00:00Z",
        permalink: "https://www.reddit.com/r/marketing/comments/gamma/-/comment1/",
        parentId: null,
        depth: null,
      },
    ],
  });
});

test("records blocked and invalid source inputs without throwing the batch", async () => {
  const result = await scrapeRedditPostsComments(
    {
      sources: ["https://example.com/r/webscraping", "reddit scraper"],
    },
    async () => ({
      ok: true,
      status: 200,
      html: "<html><body>request has been blocked captcha</body></html>",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.post_count, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].error, "URL input must be a Reddit URL");
  assert.equal(result.errors[1].error, "reddit page appears blocked");
});
