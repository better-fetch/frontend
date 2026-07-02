import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeGoogleMapsReviews,
  type GoogleMapsReviewsFetch,
} from "./runtime";

const HYDRATION_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Better Fetch Cafe - Google Maps" />
    <script type="application/json">
      {
        "data": {
          "place": {
            "place_id": "ChIJBetterFetchCafe",
            "name": "Better Fetch Cafe",
            "category": "Cafe",
            "address": "123 Market Street, Brisbane QLD",
            "rating": 4.8,
            "reviewCount": 128,
            "geo": { "latitude": -27.4698, "longitude": 153.0251 }
          },
          "reviews": [
            {
              "review_id": "rev-001",
              "reviewUrl": "https://www.google.com/maps/reviews/rev-001",
              "rating": 5,
              "text": "Fast service and excellent coffee.",
              "language": "en",
              "published_at": "2026-07-01T02:00:00Z",
              "relative_time_description": "2 days ago",
              "likes": 7,
              "reviewer": {
                "name": "Ava Chen",
                "profile_url": "https://www.google.com/maps/contrib/101",
                "review_count": 41,
                "photo_url": "https://lh3.googleusercontent.com/avatar-one"
              },
              "owner_response": {
                "text": "Thanks Ava, see you again soon.",
                "published_at": "2026-07-02T03:00:00Z"
              },
              "images": [
                { "url": "https://lh3.googleusercontent.com/review-one" }
              ]
            },
            {
              "id": "rev-002",
              "rating": 3,
              "comment": "Good location, slower at lunch.",
              "timeAgo": "last week",
              "helpfulCount": 2,
              "author": {
                "displayName": "Noah Smith",
                "url": "https://www.google.com/maps/contrib/202"
              }
            }
          ]
        }
      }
    </script>
  </head>
  <body></body>
</html>`;

const FALLBACK_HTML = `<!doctype html>
<html>
  <head>
    <title>River Tea House - Google Maps</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Review",
        "reviewBody": "Lovely tea and calm space.",
        "reviewRating": { "@type": "Rating", "ratingValue": 4 },
        "datePublished": "2026-06-30",
        "author": {
          "@type": "Person",
          "name": "Mia Park",
          "url": "https://www.google.com/maps/contrib/303",
          "image": "https://lh3.googleusercontent.com/mia"
        },
        "image": "https://lh3.googleusercontent.com/tea"
      }
    </script>
  </head>
  <body>
    <div data-review-id="dom-004">
      <a href="https://www.google.com/maps/contrib/404">Leo Gray</a>
      <span aria-label="2 stars"></span>
      <span class="rsqaWe">3 months ago</span>
      <span>Disappointing wait time.</span>
      <a href="/maps/reviews/dom-004">Review link</a>
      <img src="https://lh3.googleusercontent.com/leo" />
      <p>Response from the owner Sorry about the delay.</p>
    </div>
  </body>
</html>`;

test("extracts Google Maps reviews from hydration data", async () => {
  const seenUrls: string[] = [];
  const fetcher: GoogleMapsReviewsFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    return { ok: true, status: 200, final_url: url, html: HYDRATION_HTML };
  };

  const result = await scrapeGoogleMapsReviews(
    {
      targets: ["cid:1234567890123456789"],
      countryCode: "AU",
      maxReviewsPerTarget: 10,
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, "google_maps_reviews");
  assert.equal(result.target_count, 1);
  assert.equal(result.review_count, 2);
  assert.equal(
    seenUrls[0],
    "https://www.google.com/maps?cid=1234567890123456789&hl=en&gl=au",
  );
  assert.deepEqual(result.results[0].place, {
    title: "Better Fetch Cafe",
    category: "Cafe",
    address: "123 Market Street, Brisbane QLD",
    rating: 4.8,
    reviewCount: 128,
    placeUrl: "https://www.google.com/maps?cid=1234567890123456789&hl=en&gl=au",
    placeId: "1234567890123456789",
    latitude: -27.4698,
    longitude: 153.0251,
  });
  assert.deepEqual(result.results[0].reviews[0], {
    position: 1,
    reviewId: "rev-001",
    reviewUrl: "https://www.google.com/maps/reviews/rev-001",
    rating: 5,
    text: "Fast service and excellent coffee.",
    language: "en",
    publishedAt: "2026-07-01T02:00:00.000Z",
    relativeDate: "2 days ago",
    likeCount: 7,
    reviewerName: "Ava Chen",
    reviewerProfileUrl: "https://www.google.com/maps/contrib/101",
    reviewerReviewCount: 41,
    reviewerPhotoUrl: "https://lh3.googleusercontent.com/avatar-one",
    ownerResponseText: "Thanks Ava, see you again soon.",
    ownerResponseDate: "2026-07-02T03:00:00.000Z",
    imageUrls: ["https://lh3.googleusercontent.com/review-one"],
  });
});

test("supports Maps URLs, rating sort, JSON-LD, and DOM fallback", async () => {
  const result = await scrapeGoogleMapsReviews(
    {
      targets: ["https://www.google.com/maps/place/River+Tea+House"],
      sort: "lowest_rating",
      maxReviewsPerTarget: 2,
    },
    async ({ url }) => {
      assert.equal(
        url,
        "https://www.google.com/maps/place/River+Tea+House?hl=en&gl=us",
      );
      return {
        ok: true,
        status: 200,
        final_url: url,
        html: FALLBACK_HTML,
      };
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.results[0].target.type, "URL");
  assert.deepEqual(
    result.results[0].reviews.map((review) => ({
      reviewId: review.reviewId,
      reviewerName: review.reviewerName,
      rating: review.rating,
      text: review.text,
      ownerResponseText: review.ownerResponseText,
    })),
    [
      {
        reviewId: "dom-004",
        reviewerName: "Leo Gray",
        rating: 2,
        text: "Leo Gray 3 months ago Disappointing wait time. Review link Response from the owner Sorry about the delay.",
        ownerResponseText: "Sorry about the delay.",
      },
      {
        reviewId: null,
        reviewerName: "Mia Park",
        rating: 4,
        text: "Lovely tea and calm space.",
        ownerResponseText: null,
      },
    ],
  );
});

test("records invalid, blocked, and empty review targets without throwing", async () => {
  const result = await scrapeGoogleMapsReviews(
    {
      targets: [
        "https://example.com/maps/place/not-google",
        "cid:111111111111",
        "empty cafe",
      ],
    },
    async ({ url }) => {
      if (url.includes("cid=111111111111")) {
        return {
          ok: true,
          status: 200,
          html: "<html><body>unusual traffic captcha</body></html>",
        };
      }
      return { ok: true, status: 200, html: "<html><body>No reviews here</body></html>" };
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.review_count, 0);
  assert.equal(result.errors.length, 3);
  assert.equal(result.errors[0].error, "URL input must be a Google Maps URL");
  assert.equal(result.errors[1].error, "maps page appears blocked");
  assert.equal(result.errors[2].error, "maps page did not contain public review data");
});
