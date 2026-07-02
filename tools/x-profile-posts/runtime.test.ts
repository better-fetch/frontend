import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeXProfilePosts,
  type XProfilePostsFetch,
} from "./runtime";

const PROFILE_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Better Fetch (@betterfetch) / X" />
    <script type="application/json">
      {
        "data": {
          "user": {
            "result": {
              "rest_id": "42",
              "legacy": {
                "screen_name": "betterfetch",
                "name": "Better Fetch",
                "description": "Browser data for builders #webscraping @operators",
                "followers_count": 12500,
                "friends_count": 42,
                "statuses_count": 88,
                "location": "Brisbane, Queensland",
                "url": "https://betterfetch.co",
                "profile_image_url_https": "https://x.test/profile.jpg",
                "verified": true,
                "created_at": "Mon Jul 01 12:00:00 +0000 2024"
              },
              "timeline_v2": {
                "timeline": {
                  "instructions": [
                    {
                      "entries": [
                        {
                          "content": {
                            "itemContent": {
                              "tweet_results": {
                                "result": {
                                  "rest_id": "1800011111111111111",
                                  "core": {
                                    "user_results": {
                                      "result": {
                                        "legacy": {
                                          "screen_name": "betterfetch",
                                          "name": "Better Fetch"
                                        }
                                      }
                                    }
                                  },
                                  "views": { "count": "41000" },
                                  "legacy": {
                                    "id_str": "1800011111111111111",
                                    "full_text": "Launch notes #scraping @founders https://example.com",
                                    "created_at": "Wed Jul 01 12:00:00 +0000 2026",
                                    "favorite_count": 1400,
                                    "retweet_count": 18,
                                    "reply_count": 32,
                                    "quote_count": 4,
                                    "bookmark_count": 95,
                                    "lang": "en",
                                    "entities": {
                                      "hashtags": [{ "text": "scraping" }],
                                      "user_mentions": [{ "screen_name": "founders" }],
                                      "urls": [{ "expanded_url": "https://example.com" }],
                                      "media": [{ "media_url_https": "https://x.test/post-one.jpg" }]
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        {
                          "content": {
                            "itemContent": {
                              "tweet_results": {
                                "result": {
                                  "rest_id": "1800022222222222222",
                                  "core": {
                                    "user_results": {
                                      "result": {
                                        "legacy": {
                                          "screen_name": "betterfetch",
                                          "name": "Better Fetch"
                                        }
                                      }
                                    }
                                  },
                                  "views": { "count": "17000" },
                                  "legacy": {
                                    "id_str": "1800022222222222222",
                                    "full_text": "Render demo #mcp",
                                    "created_at": "Thu Jul 02 00:00:00 +0000 2026",
                                    "favorite_count": "2.4K",
                                    "retweet_count": 44,
                                    "reply_count": 107,
                                    "quote_count": 8,
                                    "lang": "en",
                                    "entities": {
                                      "hashtags": [{ "text": "mcp" }]
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            }
          }
        }
      }
    </script>
  </head>
  <body></body>
</html>`;

const POST_HTML = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "SocialMediaPosting",
        "url": "https://x.com/researchdesk/status/1800033333333333333",
        "text": "Behind the scenes with public data #research @analyst",
        "datePublished": "2026-07-01T08:00:00Z",
        "author": { "name": "Research Desk", "screen_name": "researchdesk" },
        "image": "https://x.test/post-image.jpg"
      }
    </script>
    <script type="application/json">
      {
        "tweet": {
          "rest_id": "1800033333333333333",
          "core": {
            "user_results": {
              "result": {
                "legacy": {
                  "screen_name": "researchdesk",
                  "name": "Research Desk"
                }
              }
            }
          },
          "views": { "count": "17000" },
          "legacy": {
            "id_str": "1800033333333333333",
            "full_text": "Behind the scenes with public data #research @analyst",
            "created_at": "Thu Jul 02 00:00:00 +0000 2026",
            "favorite_count": "2.4K",
            "retweet_count": 22,
            "reply_count": 107,
            "quote_count": 6,
            "bookmark_count": 301,
            "lang": "en",
            "entities": {
              "hashtags": [{ "text": "research" }],
              "user_mentions": [{ "screen_name": "analyst" }],
              "media": [{ "media_url_https": "https://x.test/post-image.jpg" }]
            },
            "is_quote_status": true
          },
          "quoted_status_permalink": "https://x.com/example/status/1800000000000000000"
        }
      }
    </script>
  </head>
  <body></body>
</html>`;

test("extracts profile metadata and posts from an X handle", async () => {
  const seenUrls: string[] = [];
  const fetcher: XProfilePostsFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    return { ok: true, status: 200, final_url: url, html: PROFILE_HTML };
  };

  const result = await scrapeXProfilePosts(
    {
      targets: ["@betterfetch"],
      countryCode: "AU",
      maxPostsPerTarget: 10,
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, "x_profile_posts");
  assert.equal(result.profile_count, 1);
  assert.equal(result.post_count, 2);
  assert.equal(seenUrls[0], "https://x.com/betterfetch?lang=en");
  assert.deepEqual(result.results[0].profile, {
    username: "betterfetch",
    displayName: "Better Fetch",
    bio: "Browser data for builders #webscraping @operators",
    followerCount: 12500,
    followingCount: 42,
    postCount: 88,
    location: "Brisbane, Queensland",
    websiteUrl: "https://betterfetch.co",
    profileImageUrl: "https://x.test/profile.jpg",
    isVerified: true,
    joinedAt: "2024-07-01T12:00:00.000Z",
  });
  assert.deepEqual(result.results[0].posts[0], {
    position: 1,
    id: "1800011111111111111",
    text: "Launch notes #scraping @founders https://example.com",
    authorUsername: "betterfetch",
    authorDisplayName: "Better Fetch",
    timestamp: "2026-07-01T12:00:00.000Z",
    likeCount: 1400,
    repostCount: 18,
    replyCount: 32,
    quoteCount: 4,
    bookmarkCount: 95,
    viewCount: 41000,
    mediaUrls: ["https://x.test/post-one.jpg"],
    permalink: "https://x.com/betterfetch/status/1800011111111111111",
    hashtags: ["scraping"],
    mentions: ["founders"],
    urls: ["https://example.com"],
    language: "en",
    isReply: false,
    isQuote: false,
    inReplyToId: null,
    quotedPostId: null,
  });
  assert.equal(result.results[0].posts[1].likeCount, 2400);
});

test("supports direct post URLs, JSON-LD, and hydration fallback", async () => {
  const result = await scrapeXProfilePosts(
    {
      targets: ["https://twitter.com/researchdesk/status/1800033333333333333?s=20"],
      maxPostsPerTarget: 1,
    },
    async ({ url, languageCode }) => {
      assert.equal(languageCode, "en");
      assert.equal(url, "https://x.com/researchdesk/status/1800033333333333333?lang=en");
      return { ok: true, status: 200, final_url: url, html: POST_HTML };
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.results[0].target.type, "POST");
  assert.equal(result.post_count, 1);
  assert.deepEqual(result.results[0].posts[0], {
    position: 1,
    id: "1800033333333333333",
    text: "Behind the scenes with public data #research @analyst",
    authorUsername: "researchdesk",
    authorDisplayName: "Research Desk",
    timestamp: "2026-07-02T00:00:00.000Z",
    likeCount: 2400,
    repostCount: 22,
    replyCount: 107,
    quoteCount: 6,
    bookmarkCount: 301,
    viewCount: 17000,
    mediaUrls: ["https://x.test/post-image.jpg"],
    permalink: "https://x.com/researchdesk/status/1800033333333333333",
    hashtags: ["research"],
    mentions: ["analyst"],
    urls: [],
    language: "en",
    isReply: false,
    isQuote: true,
    inReplyToId: null,
    quotedPostId: "1800000000000000000",
  });
});

test("records invalid and blocked X targets without throwing the batch", async () => {
  const result = await scrapeXProfilePosts(
    {
      targets: ["https://example.com/betterfetch", "#marketresearch"],
    },
    async () => ({
      ok: true,
      status: 200,
      html: "<html><body>captcha sign in to x this post is unavailable</body></html>",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.item_count, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(
    result.errors[0].error,
    "Input must be an X profile/post URL, handle, hashtag, or search query",
  );
  assert.equal(result.errors[1].error, "x page appears blocked, unavailable, or login-gated");
});
