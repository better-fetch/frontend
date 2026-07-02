import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeTripadvisorReviews,
  type TripadvisorReviewsFetch,
} from "./runtime";

const HYDRATION_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Better Fetch Hotel - Tripadvisor" />
    <script type="application/json">
      {
        "data": {
          "location": {
            "locationId": "424242",
            "name": "Better Fetch Hotel",
            "category": "Hotel",
            "address": {
              "streetAddress": "123 Market Street",
              "addressLocality": "Brisbane",
              "addressRegion": "QLD",
              "postalCode": "4000",
              "addressCountry": "AU"
            },
            "rating": 4.7,
            "reviewCount": 1284,
            "ranking": "#3 of 140 hotels in Brisbane",
            "geo": { "lat": -27.4698, "lng": 153.0251 }
          },
          "reviews": [
            {
              "__typename": "Review",
              "reviewId": "905500001",
              "reviewUrl": "https://www.tripadvisor.com/ShowUserReviews-g255068-d424242-r905500001",
              "title": "Quiet rooms and brilliant breakfast",
              "text": "A calm base close to the river.",
              "rating": 5,
              "publishedDate": "2026-07-01",
              "travelDate": "June 2026",
              "tripType": "Couples",
              "language": "en",
              "helpfulVotes": 12,
              "reviewer": {
                "username": "ava_travels",
                "displayName": "Ava Travels",
                "profileUrl": "https://www.tripadvisor.com/Profile/ava_travels",
                "avatarUrl": "https://media-cdn.tripadvisor.com/avatar-one.jpg",
                "contributionCount": 84,
                "homeLocation": "Melbourne, Australia"
              },
              "ownerResponse": {
                "text": "Thanks Ava, we are delighted you enjoyed the stay.",
                "publishedDate": "2026-07-02"
              },
              "images": [
                { "url": "https://media-cdn.tripadvisor.com/review-one.jpg" }
              ]
            },
            {
              "__typename": "Review",
              "id": "905500002",
              "headline": "Good location",
              "reviewText": "Easy walk to restaurants.",
              "bubbleRating": 4,
              "date": "2026-06-20",
              "travelerType": "Business",
              "helpfulVoteCount": 3,
              "user": {
                "name": "Noah Smith",
                "url": "https://www.tripadvisor.com/Profile/noahsmith"
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
    <title>River Tea House - Tripadvisor</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Review",
        "name": "Lovely tea",
        "reviewBody": "Quiet, friendly, and a beautiful tea list.",
        "reviewRating": { "@type": "Rating", "ratingValue": 5 },
        "datePublished": "2026-06-30",
        "author": {
          "@type": "Person",
          "name": "Mia Park",
          "url": "https://www.tripadvisor.com/Profile/miapark",
          "image": "https://media-cdn.tripadvisor.com/mia.jpg"
        },
        "image": "https://media-cdn.tripadvisor.com/tea.jpg"
      }
    </script>
  </head>
  <body>
    <div data-reviewid="dom-404">
      <a href="/Profile/leogray">Leo Gray</a>
      <span class="ui_bubble_rating bubble_20"></span>
      <a href="/ShowUserReviews-g1-d2-r404">Disappointing wait</a>
      <q>We waited too long for lunch.</q>
      <span>Written July 1, 2026</span>
      <span>Date of visit: May 2026</span>
      <span>Trip type: Family</span>
      <span>6 helpful votes</span>
      <span>42 contributions</span>
      <span class="userLoc">Sydney, Australia</span>
      <img src="https://media-cdn.tripadvisor.com/leo.jpg" />
      <p>Management response Sorry about the delay.</p>
    </div>
  </body>
</html>`;

test("extracts Tripadvisor review rows from hydration data", async () => {
  const seenUrls: string[] = [];
  const fetcher: TripadvisorReviewsFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    return { ok: true, status: 200, final_url: url, html: HYDRATION_HTML };
  };

  const result = await scrapeTripadvisorReviews(
    {
      targets: ["location:424242"],
      countryCode: "AU",
      maxReviewsPerTarget: 10,
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, "tripadvisor_reviews");
  assert.equal(result.target_count, 1);
  assert.equal(result.review_count, 2);
  assert.equal(
    seenUrls[0],
    "https://www.tripadvisor.com/Location_Review-g0-d424242-Reviews.html?filterLang=en&sort=NEWEST",
  );
  assert.deepEqual(result.results[0].place, {
    name: "Better Fetch Hotel",
    category: "Hotel",
    address: "123 Market Street, Brisbane, QLD, 4000, AU",
    rating: 4.7,
    reviewCount: 1284,
    ranking: "#3 of 140 hotels in Brisbane",
    locationId: "424242",
    placeUrl:
      "https://www.tripadvisor.com/Location_Review-g0-d424242-Reviews.html?filterLang=en&sort=NEWEST",
    latitude: -27.4698,
    longitude: 153.0251,
  });
  assert.deepEqual(result.results[0].reviews[0], {
    position: 1,
    reviewId: "905500001",
    reviewUrl:
      "https://www.tripadvisor.com/ShowUserReviews-g255068-d424242-r905500001",
    title: "Quiet rooms and brilliant breakfast",
    text: "A calm base close to the river.",
    rating: 5,
    publishedAt: "2026-07-01T00:00:00.000Z",
    travelDate: "2026-06-01T00:00:00.000Z",
    tripType: "Couples",
    language: "en",
    helpfulVotes: 12,
    reviewer: {
      username: "ava_travels",
      displayName: "Ava Travels",
      profileUrl: "https://www.tripadvisor.com/Profile/ava_travels",
      avatarUrl: "https://media-cdn.tripadvisor.com/avatar-one.jpg",
      contributionCount: 84,
      homeLocation: "Melbourne, Australia",
    },
    ownerResponseText: "Thanks Ava, we are delighted you enjoyed the stay.",
    ownerResponseDate: "2026-07-02T00:00:00.000Z",
    imageUrls: ["https://media-cdn.tripadvisor.com/review-one.jpg"],
  });
});

test("supports URLs, rating sort, JSON-LD, DOM fallback, and owner-response toggle", async () => {
  const result = await scrapeTripadvisorReviews(
    {
      targets: [
        "https://www.tripadvisor.com/Restaurant_Review-g255068-d98765-Reviews-River_Tea_House.html",
      ],
      sort: "lowest_rating",
      includeOwnerResponses: false,
      maxReviewsPerTarget: 2,
    },
    async ({ url }) => {
      assert.equal(
        url,
        "https://www.tripadvisor.com/Restaurant_Review-g255068-d98765-Reviews-River_Tea_House.html?filterLang=en&sort=RATING_LOW",
      );
      return { ok: true, status: 200, final_url: url, html: FALLBACK_HTML };
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.results[0].target.type, "URL");
  assert.deepEqual(
    result.results[0].reviews.map((review) => ({
      reviewId: review.reviewId,
      title: review.title,
      rating: review.rating,
      reviewer: review.reviewer.displayName,
      ownerResponseText: review.ownerResponseText,
    })),
    [
      {
        reviewId: "dom-404",
        title: "Disappointing wait",
        rating: 2,
        reviewer: "Leo Gray",
        ownerResponseText: null,
      },
      {
        reviewId: null,
        title: "Lovely tea",
        rating: 5,
        reviewer: "Mia Park",
        ownerResponseText: null,
      },
    ],
  );
});

test("records invalid, blocked, and empty Tripadvisor review targets without throwing", async () => {
  const result = await scrapeTripadvisorReviews(
    {
      targets: [
        "https://example.com/Restaurant_Review-g1-d2-Reviews.html",
        "location:111111",
        "empty river hotel",
      ],
    },
    async ({ url }) => {
      if (url.includes("d111111")) {
        return {
          ok: true,
          status: 200,
          html: "<html><body>captcha access denied</body></html>",
        };
      }
      return { ok: true, status: 200, html: "<html><body>No reviews here</body></html>" };
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.review_count, 0);
  assert.equal(result.errors.length, 3);
  assert.equal(result.errors[0].error, "URL input must be a Tripadvisor URL");
  assert.equal(result.errors[1].error, "tripadvisor page appears blocked");
  assert.equal(result.errors[2].error, "tripadvisor page did not contain public review data");
});
