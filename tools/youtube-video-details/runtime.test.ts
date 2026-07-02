import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeYoutubeVideoDetails,
  type YoutubeVideoDetailsFetch,
} from "./runtime";

const WATCH_HTML = `<!doctype html>
<html>
  <head>
    <link rel="canonical" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
    <meta property="og:title" content="Sample Video - YouTube" />
    <meta property="og:description" content="Fallback description" />
    <meta property="og:image" content="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" />
    <meta name="keywords" content="demo, music, video" />
  </head>
  <body>
    <script>
      var ytInitialPlayerResponse = {
        "videoDetails": {
          "videoId": "dQw4w9WgXcQ",
          "title": "Sample Video",
          "author": "Example Channel",
          "channelId": "UC1234567890",
          "shortDescription": "A useful sample video.",
          "lengthSeconds": "213",
          "viewCount": "1234567",
          "keywords": ["demo", "sample"],
          "isLiveContent": false,
          "thumbnail": {
            "thumbnails": [
              {"url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg", "width": 120, "height": 90},
              {"url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", "width": 480, "height": 360}
            ]
          }
        },
        "microformat": {
          "playerMicroformatRenderer": {
            "publishDate": "2024-05-01",
            "uploadDate": "2024-05-02",
            "category": "Music",
            "ownerChannelName": "Example Channel",
            "ownerProfileUrl": "https://www.youtube.com/channel/UC1234567890",
            "externalChannelId": "UC1234567890",
            "description": {"simpleText": "Microformat description."}
          }
        }
      };
      var ytInitialData = {
        "contents": [
          {"label": "1,234 likes"},
          {"simpleText": "56 Comments"},
          {"simpleText": "1,234,567 views"}
        ]
      };
    </script>
  </body>
</html>`;

const META_FALLBACK_HTML = `<!doctype html>
<html>
  <head>
    <link rel="canonical" href="https://www.youtube.com/watch?v=abcDEF12345" />
    <meta property="og:title" content="Fallback Video - YouTube" />
    <meta property="og:description" content="Meta-only description" />
    <meta property="og:image" content="https://i.ytimg.com/vi/abcDEF12345/maxresdefault.jpg" />
    <meta itemprop="duration" content="PT1H2M3S" />
    <meta itemprop="uploadDate" content="2023-03-04" />
    <meta itemprop="interactionCount" content="98765" />
  </head>
  <body>
    <script>
      var ytInitialData = {"engagement": [{"label": "2.5K likes"}, {"label": "101 comments"}]};
    </script>
  </body>
</html>`;

test("extracts structured details from YouTube watch pages", async () => {
  const seenUrls: string[] = [];
  const fetcher: YoutubeVideoDetailsFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    return { ok: true, status: 200, final_url: url, html: WATCH_HTML };
  };

  const result = await scrapeYoutubeVideoDetails(
    {
      videos: ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"],
      countryCode: "AU",
      languageCode: "en-US",
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, "youtube_video_details");
  assert.equal(result.video_count, 1);
  assert.equal(seenUrls[0], "https://www.youtube.com/watch?v=dQw4w9WgXcQ&hl=en-us&gl=AU");
  assert.deepEqual(result.results[0].video, {
    videoId: "dQw4w9WgXcQ",
    title: "Sample Video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    channelName: "Example Channel",
    channelId: "UC1234567890",
    channelUrl: "https://www.youtube.com/channel/UC1234567890",
    description: "A useful sample video.",
    durationSeconds: 213,
    viewCount: 1234567,
    likeCount: 1234,
    commentCount: 56,
    publishDate: "2024-05-01",
    uploadDate: "2024-05-02",
    category: "Music",
    keywords: ["demo", "sample", "music", "video"],
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
    thumbnails: [
      {
        url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
        width: 120,
        height: 90,
      },
      {
        url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        width: 480,
        height: 360,
      },
    ],
    isLiveContent: false,
    isShort: false,
  });
});

test("supports video IDs, short URLs, and HTML metadata fallbacks", async () => {
  const result = await scrapeYoutubeVideoDetails(
    {
      videos: ["abcDEF12345", "https://youtu.be/abcDEF12345"],
      languageCode: "en",
    },
    async ({ url }) => ({ ok: true, status: 200, final_url: url, html: META_FALLBACK_HTML }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.video_count, 2);
  assert.equal(result.results[0].url, "https://www.youtube.com/watch?v=abcDEF12345&hl=en&gl=US");
  assert.equal(result.results[0].video.title, "Fallback Video");
  assert.equal(result.results[0].video.durationSeconds, 3723);
  assert.equal(result.results[0].video.viewCount, 98765);
  assert.equal(result.results[0].video.likeCount, 2500);
  assert.equal(result.results[0].video.commentCount, 101);
  assert.equal(result.results[0].video.uploadDate, "2023-03-04");
  assert.equal(
    result.results[0].video.thumbnailUrl,
    "https://i.ytimg.com/vi/abcDEF12345/maxresdefault.jpg",
  );
});

test("records blocked and invalid video inputs without throwing the batch", async () => {
  const result = await scrapeYoutubeVideoDetails(
    {
      videos: ["https://example.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    },
    async () => ({
      ok: true,
      status: 200,
      html: "<html><body>Our systems have detected unusual traffic captcha</body></html>",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.video_count, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].error, "Input must be a YouTube video URL or 11-character video ID");
  assert.equal(result.errors[1].error, "youtube page appears blocked");
});
