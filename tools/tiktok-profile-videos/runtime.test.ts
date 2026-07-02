import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeTiktokProfileVideos,
  type TiktokProfileVideosFetch,
} from "./runtime";

const PROFILE_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Better Fetch (@betterfetch) | TikTok" />
    <meta property="og:description" content="12.5K Followers, 42 Following, 91.2K Likes, 37 Videos - Browser data for builders" />
    <script id="SIGI_STATE" type="application/json">
      {
        "UserModule": {
          "users": {
            "betterfetch": {
              "id": "u1",
              "uniqueId": "betterfetch",
              "nickname": "Better Fetch",
              "signature": "Browser data for builders #webscraping @operators",
              "avatarLarger": "https://tiktok.test/avatar.jpg",
              "verified": true
            }
          },
          "stats": {
            "betterfetch": {
              "followerCount": 12500,
              "followingCount": 42,
              "heart": 91200,
              "videoCount": 37
            }
          }
        },
        "ItemModule": {
          "7340011111111111111": {
            "id": "7340011111111111111",
            "desc": "Launch notes #scraping @founders",
            "createTime": 1782907200,
            "author": {
              "uniqueId": "betterfetch",
              "nickname": "Better Fetch"
            },
            "stats": {
              "diggCount": 1400,
              "commentCount": 32,
              "shareCount": 18,
              "playCount": 41000,
              "collectCount": 95
            },
            "video": {
              "duration": 21,
              "cover": "https://tiktok.test/cover-one.jpg",
              "playAddr": "https://tiktok.test/video-one.mp4"
            },
            "music": {
              "title": "Original sound",
              "authorName": "Better Fetch",
              "original": true
            },
            "challenges": [{ "title": "scraping" }],
            "textExtra": [
              { "hashtagName": "scraping" },
              { "userUniqueId": "founders" }
            ]
          },
          "7340022222222222222": {
            "id": "7340022222222222222",
            "desc": "Render demo #mcp",
            "createTime": 1782993600,
            "author": { "uniqueId": "betterfetch" },
            "stats": {
              "diggCount": "2.4K",
              "commentCount": 107,
              "shareCount": 44,
              "playCount": 17000,
              "collectCount": 600
            },
            "video": {
              "duration": 13.5,
              "cover": "https://tiktok.test/cover-two.jpg"
            },
            "music": {
              "title": "Browser loop",
              "authorName": "Research Desk",
              "original": false
            }
          }
        }
      }
    </script>
  </head>
  <body></body>
</html>`;

const VIDEO_HTML = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "url": "https://www.tiktok.com/@researchdesk/video/7350000000000000000",
        "description": "Behind the scenes with public data #research @analyst",
        "datePublished": "2026-07-01T08:00:00Z",
        "author": { "name": "Research Desk", "url": "https://www.tiktok.com/@researchdesk" },
        "thumbnailUrl": "https://tiktok.test/video-cover.jpg",
        "contentUrl": "https://tiktok.test/video.mp4",
        "duration": "PT22S"
      }
    </script>
    <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
      {
        "__DEFAULT_SCOPE__": {
          "webapp.video-detail": {
            "itemInfo": {
              "itemStruct": {
                "id": "7350000000000000000",
                "desc": "Behind the scenes with public data #research @analyst",
                "createTime": 1782950400,
                "author": {
                  "uniqueId": "researchdesk",
                  "nickname": "Research Desk"
                },
                "stats": {
                  "diggCount": "2.4K",
                  "commentCount": 107,
                  "shareCount": 22,
                  "playCount": 17000,
                  "collectCount": 301
                },
                "video": {
                  "duration": 22,
                  "cover": "https://tiktok.test/video-cover.jpg",
                  "playAddr": "https://tiktok.test/video.mp4"
                },
                "music": {
                  "title": "Trend sound",
                  "authorName": "Research Desk",
                  "original": true
                },
                "textExtra": [
                  { "hashtagName": "research" },
                  { "userUniqueId": "analyst" }
                ]
              }
            }
          }
        }
      }
    </script>
  </head>
  <body></body>
</html>`;

test("extracts profile metadata and videos from a TikTok handle", async () => {
  const seenUrls: string[] = [];
  const fetcher: TiktokProfileVideosFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    return { ok: true, status: 200, final_url: url, html: PROFILE_HTML };
  };

  const result = await scrapeTiktokProfileVideos(
    {
      targets: ["@betterfetch"],
      countryCode: "AU",
      maxVideosPerTarget: 10,
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, "tiktok_profile_videos");
  assert.equal(result.profile_count, 1);
  assert.equal(result.video_count, 2);
  assert.equal(seenUrls[0], "https://www.tiktok.com/@betterfetch?lang=en");
  assert.deepEqual(result.results[0].profile, {
    username: "betterfetch",
    displayName: "Better Fetch",
    bio: "Browser data for builders #webscraping @operators",
    followerCount: 12500,
    followingCount: 42,
    heartCount: 91200,
    videoCount: 37,
    isVerified: true,
    avatarUrl: "https://tiktok.test/avatar.jpg",
    profileUrl: "https://www.tiktok.com/@betterfetch",
  });
  assert.deepEqual(result.results[0].videos[0], {
    position: 1,
    id: "7340011111111111111",
    description: "Launch notes #scraping @founders",
    authorUsername: "betterfetch",
    authorDisplayName: "Better Fetch",
    timestamp: "2026-07-01T12:00:00.000Z",
    durationSeconds: 21,
    likeCount: 1400,
    commentCount: 32,
    shareCount: 18,
    viewCount: 41000,
    saveCount: 95,
    coverUrl: "https://tiktok.test/cover-one.jpg",
    playUrl: "https://tiktok.test/video-one.mp4",
    mediaUrls: ["https://tiktok.test/cover-one.jpg", "https://tiktok.test/video-one.mp4"],
    permalink: "https://www.tiktok.com/@betterfetch/video/7340011111111111111",
    hashtags: ["scraping"],
    mentions: ["founders"],
    musicTitle: "Original sound",
    musicAuthor: "Better Fetch",
    musicOriginal: true,
  });
  assert.equal(result.results[0].videos[1].likeCount, 2400);
  assert.equal(result.results[0].videos[1].durationSeconds, 13.5);
});

test("supports direct TikTok video URLs and hydration JSON fallback", async () => {
  const result = await scrapeTiktokProfileVideos(
    {
      targets: ["https://www.tiktok.com/@researchdesk/video/7350000000000000000?is_copy_url=1"],
      maxVideosPerTarget: 1,
    },
    async ({ url, languageCode }) => {
      assert.equal(languageCode, "en");
      assert.equal(
        url,
        "https://www.tiktok.com/@researchdesk/video/7350000000000000000?lang=en",
      );
      return { ok: true, status: 200, final_url: url, html: VIDEO_HTML };
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.results[0].target.type, "VIDEO");
  assert.equal(result.video_count, 1);
  assert.deepEqual(result.results[0].videos[0], {
    position: 1,
    id: "7350000000000000000",
    description: "Behind the scenes with public data #research @analyst",
    authorUsername: "researchdesk",
    authorDisplayName: "Research Desk",
    timestamp: "2026-07-02T00:00:00.000Z",
    durationSeconds: 22,
    likeCount: 2400,
    commentCount: 107,
    shareCount: 22,
    viewCount: 17000,
    saveCount: 301,
    coverUrl: "https://tiktok.test/video-cover.jpg",
    playUrl: "https://tiktok.test/video.mp4",
    mediaUrls: ["https://tiktok.test/video-cover.jpg", "https://tiktok.test/video.mp4"],
    permalink: "https://www.tiktok.com/@researchdesk/video/7350000000000000000",
    hashtags: ["research"],
    mentions: ["analyst"],
    musicTitle: "Trend sound",
    musicAuthor: "Research Desk",
    musicOriginal: true,
  });
});

test("records invalid and blocked TikTok targets without throwing the batch", async () => {
  const result = await scrapeTiktokProfileVideos(
    {
      targets: ["https://example.com/@betterfetch", "#marketresearch"],
    },
    async () => ({
      ok: true,
      status: 200,
      html: "<html><body>captcha verify to continue video currently unavailable</body></html>",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.item_count, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(
    result.errors[0].error,
    "Input must be a TikTok username, profile URL, video URL, hashtag URL, or search phrase",
  );
  assert.equal(
    result.errors[1].error,
    "tiktok page appears blocked, unavailable, or login-gated",
  );
});
