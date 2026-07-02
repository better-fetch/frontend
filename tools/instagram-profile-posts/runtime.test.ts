import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeInstagramProfilePosts,
  type InstagramProfilePostsFetch,
} from "./runtime";

const PROFILE_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Better Fetch (@betterfetch) • Instagram photos and videos" />
    <meta property="og:description" content="12.5K Followers, 42 Following, 88 Posts - See Instagram photos and videos from Better Fetch (@betterfetch)" />
    <meta property="og:image" content="https://instagram.test/profile.jpg" />
    <script>
      window._sharedData = {
        "entry_data": {
          "ProfilePage": [{
            "graphql": {
              "user": {
                "username": "betterfetch",
                "full_name": "Better Fetch",
                "biography": "Browser data for builders #webscraping @operators",
                "external_url": "https://betterfetch.co",
                "profile_pic_url_hd": "https://instagram.test/profile-hd.jpg",
                "is_verified": true,
                "is_private": false,
                "edge_followed_by": { "count": 12500 },
                "edge_follow": { "count": 42 },
                "edge_owner_to_timeline_media": {
                  "count": 88,
                  "edges": [
                    {
                      "node": {
                        "id": "one",
                        "shortcode": "ABC123def45",
                        "__typename": "GraphImage",
                        "edge_media_to_caption": {
                          "edges": [{ "node": { "text": "Launch notes #scraping @founders" } }]
                        },
                        "owner": { "username": "betterfetch", "full_name": "Better Fetch" },
                        "taken_at_timestamp": 1782907200,
                        "edge_liked_by": { "count": 1400 },
                        "edge_media_to_comment": { "count": 32 },
                        "display_url": "https://instagram.test/post-one.jpg",
                        "location": { "name": "Brisbane, Queensland" },
                        "is_paid_partnership": false
                      }
                    },
                    {
                      "node": {
                        "id": "two",
                        "shortcode": "REEL987zyx",
                        "__typename": "GraphVideo",
                        "product_type": "clips",
                        "edge_media_to_caption": {
                          "edges": [{ "node": { "text": "A quick browser render demo #mcp" } }]
                        },
                        "owner": { "username": "betterfetch" },
                        "taken_at_timestamp": 1782993600,
                        "video_view_count": 9200,
                        "video_duration": 13.5,
                        "display_url": "https://instagram.test/reel-cover.jpg",
                        "video_url": "https://instagram.test/reel.mp4"
                      }
                    }
                  ]
                }
              }
            }
          }]
        }
      };
    </script>
  </head>
  <body></body>
</html>`;

const REEL_HTML = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "SocialMediaPosting",
        "url": "https://www.instagram.com/reel/XYZ987abc/",
        "caption": "Behind the scenes with public data #research @analyst",
        "datePublished": "2026-07-01T08:00:00Z",
        "author": { "name": "Research Desk", "username": "researchdesk" },
        "image": "https://instagram.test/reel-image.jpg",
        "contentUrl": "https://instagram.test/reel-video.mp4",
        "duration": "PT22S"
      }
    </script>
    <script>
      window.__additionalDataLoaded("/reel/XYZ987abc/", {
        "shortcode_media": {
          "id": "xyz",
          "shortcode": "XYZ987abc",
          "__typename": "GraphVideo",
          "product_type": "clips",
          "edge_media_to_caption": {
            "edges": [{ "node": { "text": "Behind the scenes with public data #research @analyst" } }]
          },
          "owner": { "username": "researchdesk", "full_name": "Research Desk" },
          "taken_at_timestamp": 1782950400,
          "edge_liked_by": { "count": "2.4K" },
          "edge_media_to_comment": { "count": 107 },
          "video_play_count": 17000,
          "video_duration": 22,
          "display_url": "https://instagram.test/reel-image.jpg",
          "video_url": "https://instagram.test/reel-video.mp4"
        }
      });
    </script>
  </head>
  <body></body>
</html>`;

test("extracts profile metadata and timeline posts from an Instagram username", async () => {
  const seenUrls: string[] = [];
  const fetcher: InstagramProfilePostsFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    return { ok: true, status: 200, final_url: url, html: PROFILE_HTML };
  };

  const result = await scrapeInstagramProfilePosts(
    {
      targets: ["betterfetch"],
      countryCode: "AU",
      maxPostsPerTarget: 10,
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, "instagram_profile_posts");
  assert.equal(result.profile_count, 1);
  assert.equal(result.post_count, 2);
  assert.equal(seenUrls[0], "https://www.instagram.com/betterfetch/?hl=en");
  assert.deepEqual(result.results[0].profile, {
    username: "betterfetch",
    fullName: "Better Fetch",
    biography: "Browser data for builders #webscraping @operators",
    followerCount: 12500,
    followingCount: 42,
    postCount: 88,
    externalUrl: "https://betterfetch.co",
    profileImageUrl: "https://instagram.test/profile-hd.jpg",
    isVerified: true,
    isPrivate: false,
  });
  assert.deepEqual(result.results[0].posts[0], {
    position: 1,
    id: "one",
    shortcode: "ABC123def45",
    type: "IMAGE",
    caption: "Launch notes #scraping @founders",
    authorUsername: "betterfetch",
    authorFullName: "Better Fetch",
    timestamp: "2026-07-01T12:00:00.000Z",
    likeCount: 1400,
    commentCount: 32,
    viewCount: null,
    videoDurationSeconds: null,
    displayUrl: "https://instagram.test/post-one.jpg",
    mediaUrls: ["https://instagram.test/post-one.jpg"],
    permalink: "https://www.instagram.com/p/ABC123def45/",
    hashtags: ["scraping"],
    mentions: ["founders"],
    locationName: "Brisbane, Queensland",
    isSponsored: false,
  });
  assert.equal(result.results[0].posts[1].type, "REEL");
  assert.equal(result.results[0].posts[1].videoDurationSeconds, 13.5);
});

test("supports direct reel URLs and JSON-LD fallback", async () => {
  const result = await scrapeInstagramProfilePosts(
    {
      targets: ["https://www.instagram.com/reel/XYZ987abc/?utm_source=ig_web_copy_link"],
      maxPostsPerTarget: 1,
    },
    async ({ url, languageCode }) => {
      assert.equal(languageCode, "en");
      assert.equal(url, "https://www.instagram.com/reel/XYZ987abc/?hl=en");
      return { ok: true, status: 200, final_url: url, html: REEL_HTML };
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.results[0].target.type, "POST");
  assert.equal(result.post_count, 1);
  assert.deepEqual(result.results[0].posts[0], {
    position: 1,
    id: "xyz",
    shortcode: "XYZ987abc",
    type: "REEL",
    caption: "Behind the scenes with public data #research @analyst",
    authorUsername: "researchdesk",
    authorFullName: "Research Desk",
    timestamp: "2026-07-02T00:00:00.000Z",
    likeCount: 2400,
    commentCount: 107,
    viewCount: 17000,
    videoDurationSeconds: 22,
    displayUrl: "https://instagram.test/reel-image.jpg",
    mediaUrls: [
      "https://instagram.test/reel-image.jpg",
      "https://instagram.test/reel-video.mp4",
    ],
    permalink: "https://www.instagram.com/reel/XYZ987abc/",
    hashtags: ["research"],
    mentions: ["analyst"],
    locationName: null,
    isSponsored: null,
  });
});

test("records invalid and unavailable targets without throwing the batch", async () => {
  const result = await scrapeInstagramProfilePosts(
    {
      targets: ["https://example.com/betterfetch", "#marketresearch"],
    },
    async () => ({
      ok: true,
      status: 200,
      html: "<html><body>this account is private page isn't available captcha</body></html>",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.item_count, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(
    result.errors[0].error,
    "Input must be an Instagram profile/post/reel/hashtag URL, username, or hashtag",
  );
  assert.equal(
    result.errors[1].error,
    "instagram page appears blocked, private, or unavailable",
  );
});
