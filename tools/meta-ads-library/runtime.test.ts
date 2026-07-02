import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeMetaAdsLibrary,
  type MetaAdsLibraryFetch,
} from "./runtime";

const HYDRATION_HTML = `<!doctype html>
<html>
  <head>
    <script type="application/json">
      {
        "data": {
          "ads": [
            {
              "ad_archive_id": "1234567890",
              "page_id": "424242",
              "page_name": "Better Fetch",
              "is_active": true,
              "start_date": 1782907200,
              "publisher_platforms": ["facebook", "instagram"],
              "spend": { "lower_bound": 100, "upper_bound": 499, "currency": "USD" },
              "impressions": { "lower_bound": 10000, "upper_bound": 49999 },
              "reach_estimate": { "lower_bound": 8000, "upper_bound": 25000 },
              "countries": ["US", "AU"],
              "languages": ["en"],
              "categories": ["Technology"],
              "snapshot": {
                "body": { "text": "Launch reliable browser data jobs with Better Fetch." },
                "title": "Browser data API for teams",
                "link_description": "Render, extract, and monitor public web pages.",
                "cta_text": "Learn More",
                "link_url": "https://betterfetch.co/ads",
                "display_url": "betterfetch.co",
                "page_profile_uri": "https://www.facebook.com/betterfetch",
                "images": [
                  { "original_image_url": "https://meta.test/ad-one.jpg" }
                ],
                "videos": [
                  { "video_sd_url": "https://meta.test/ad-one.mp4" }
                ]
              }
            },
            {
              "adArchiveID": "9876543210",
              "pageId": "424242",
              "pageName": "Better Fetch",
              "isActive": false,
              "startDate": "2026-07-01",
              "endDate": "2026-07-02",
              "publisherPlatforms": ["messenger"],
              "snapshot": {
                "body": "Turn messy web pages into clean rows.",
                "title": "Scraper tools over MCP",
                "ctaText": "Sign Up",
                "linkUrl": "https://betterfetch.co/tools",
                "cards": [
                  { "image_url": "https://meta.test/card.jpg" }
                ]
              }
            }
          ]
        }
      }
    </script>
  </head>
  <body></body>
</html>`;

const DOM_HTML = `<!doctype html>
<html>
  <body>
    <article data-testid="ad-library-card" data-ad-archive-id="555777999">
      <a href="https://www.facebook.com/betterfetch">Better Fetch</a>
      <p>Library ID: 555777999</p>
      <p>Page ID: 424242</p>
      <p>Active</p>
      <p>Started running on Jul 1, 2026.</p>
      <p>Platforms: Facebook Instagram</p>
      <p>Ad text: Competitor ad monitoring without brittle scripts. Headline: See every creative. Description: Export rows to your workflow. CTA: Learn More</p>
      <img src="https://meta.test/dom-ad.jpg" />
      <a href="https://betterfetch.co/meta-ads">Learn More</a>
      <a href="/ads/library/?id=555777999">Snapshot</a>
    </article>
  </body>
</html>`;

test("extracts structured Meta ad rows from keyword library searches", async () => {
  const seenUrls: string[] = [];
  const fetcher: MetaAdsLibraryFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    return { ok: true, status: 200, final_url: url, html: HYDRATION_HTML };
  };

  const result = await scrapeMetaAdsLibrary(
    {
      targets: ["browser data api"],
      countryCode: "AU",
      maxAdsPerTarget: 10,
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, "meta_ads_library");
  assert.equal(result.ad_count, 2);
  assert.equal(
    seenUrls[0],
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=AU&media_type=all&q=browser+data+api&search_type=keyword_unordered",
  );
  assert.deepEqual(result.results[0].ads[0], {
    position: 1,
    libraryId: "1234567890",
    pageId: "424242",
    pageName: "Better Fetch",
    pageProfileUrl: "https://www.facebook.com/betterfetch",
    isActive: true,
    startDate: "2026-07-01T12:00:00.000Z",
    endDate: null,
    platforms: ["facebook", "instagram"],
    adText: "Launch reliable browser data jobs with Better Fetch.",
    headline: "Browser data API for teams",
    description: "Render, extract, and monitor public web pages.",
    callToAction: "Learn More",
    destinationUrl: "https://betterfetch.co/ads",
    displayUrl: "betterfetch.co",
    snapshotUrl: null,
    mediaUrls: ["https://meta.test/ad-one.jpg"],
    videoUrls: ["https://meta.test/ad-one.mp4"],
    spend: { lower: 100, upper: 499 },
    impressions: { lower: 10000, upper: 49999 },
    reach: { lower: 8000, upper: 25000 },
    currency: null,
    countries: ["US", "AU"],
    languages: ["en"],
    categories: ["Technology"],
  });
  assert.equal(result.results[0].ads[1].isActive, false);
  assert.equal(result.results[0].ads[1].callToAction, "Sign Up");
});

test("supports Ads Library URLs, existing filters, and DOM fallback", async () => {
  const result = await scrapeMetaAdsLibrary(
    {
      targets: [
        "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&search_type=page&view_all_page_id=424242",
      ],
      maxAdsPerTarget: 1,
      activeStatus: "active",
      countryCode: "AU",
    },
    async ({ url }) => {
      assert.equal(
        url,
        "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&search_type=page&view_all_page_id=424242&media_type=all",
      );
      return { ok: true, status: 200, final_url: url, html: DOM_HTML };
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.results[0].target.type, "LIBRARY_URL");
  assert.deepEqual(result.results[0].ads[0], {
    position: 1,
    libraryId: "555777999",
    pageId: "424242",
    pageName: "Better Fetch",
    pageProfileUrl: "https://www.facebook.com/betterfetch",
    isActive: true,
    startDate: "Jul 1, 2026",
    endDate: null,
    platforms: ["Facebook", "Instagram"],
    adText: "Competitor ad monitoring without brittle scripts.",
    headline: "See every creative.",
    description: "Export rows to your workflow.",
    callToAction: "Learn More",
    destinationUrl: "https://www.facebook.com/betterfetch",
    displayUrl: "facebook.com",
    snapshotUrl: "https://www.facebook.com/ads/library/?id=555777999",
    mediaUrls: ["https://meta.test/dom-ad.jpg"],
    videoUrls: [],
    spend: null,
    impressions: null,
    reach: null,
    currency: null,
    countries: [],
    languages: [],
    categories: [],
  });
});

test("records invalid and blocked Meta Ads Library targets without throwing", async () => {
  const result = await scrapeMetaAdsLibrary(
    {
      targets: ["https://example.com/ads/library", "page:424242"],
    },
    async () => ({
      ok: true,
      status: 200,
      html: "<html><body>captcha checkpoint log in to facebook</body></html>",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.ad_count, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(
    result.errors[0].error,
    "Input must be a Meta Ads Library URL, page ID, or keyword search",
  );
  assert.equal(
    result.errors[1].error,
    "meta ads library page appears blocked, unavailable, or login-gated",
  );
});
