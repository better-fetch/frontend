import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeGoogleMapsPlaces,
  type GoogleMapsPlacesFetch,
} from "./runtime";

const MAPS_HTML = `<!doctype html>
<html>
  <body>
    <div role="feed">
      <div class="Nv2PK" role="article" data-place-id="place-alpha">
        <a href="/maps/place/Alpha+Coffee/@-27.4698,153.0251,17z/data=!3d-27.4698!4d153.0251">Alpha Coffee</a>
        <div class="qBF1Pd">Alpha Coffee</div>
        <span>4.7 stars</span>
        <span>(128)</span>
        <span>Cafe · 123 Queen St</span>
        <span>Open now</span>
        <span>+61 7 3000 1111</span>
        <a data-value="Website" href="https://alpha.example.com">Website</a>
      </div>
      <div class="Nv2PK" role="article" data-place-id="place-beta">
        <a href="https://www.google.com/maps/place/Beta+Bakery/data=!3d-27.4701!4d153.0260">Beta Bakery</a>
        <div class="fontHeadlineSmall">Beta Bakery</div>
        <span>4.2 stars</span>
        <span>83 reviews</span>
        <span>Bakery · 55 Creek Road</span>
        <span>$$</span>
      </div>
    </div>
  </body>
</html>`;

const JSON_LD_HTML = `<!doctype html>
<html>
  <body>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": "Gamma Repairs",
        "telephone": "+1 555 0100",
        "url": "https://gamma.example.com",
        "priceRange": "$$",
        "identifier": "gamma-id",
        "address": {
          "streetAddress": "10 Market Street",
          "addressLocality": "Seattle",
          "addressRegion": "WA",
          "postalCode": "98101"
        },
        "geo": { "latitude": "47.6097", "longitude": "-122.3331" },
        "aggregateRating": { "ratingValue": "4.9", "reviewCount": "44" },
        "hasMap": "https://www.google.com/maps/place/Gamma+Repairs/@47.6097,-122.3331,17z"
      }
    </script>
  </body>
</html>`;

test("extracts structured place rows from Google Maps cards", async () => {
  const seenUrls: string[] = [];
  const fetcher: GoogleMapsPlacesFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    return { ok: true, status: 200, final_url: url, html: MAPS_HTML };
  };

  const result = await scrapeGoogleMapsPlaces(
    {
      searches: ["cafes brisbane"],
      countryCode: "AU",
      languageCode: "en",
      maxPlacesPerSearch: 10,
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.search_count, 1);
  assert.equal(result.item_count, 2);
  assert.equal(seenUrls[0].startsWith("https://www.google.com/maps/search/cafes+brisbane"), true);
  assert.deepEqual(result.results[0].places[0], {
    position: 1,
    title: "Alpha Coffee",
    category: "Cafe",
    address: "123 Queen St",
    phone: "+61 7 3000 1111",
    website: "https://alpha.example.com/",
    rating: 4.7,
    reviewCount: 128,
    priceLevel: null,
    placeUrl:
      "https://www.google.com/maps/place/Alpha+Coffee/@-27.4698,153.0251,17z/data=!3d-27.4698!4d153.0251",
    placeId: "place-alpha",
    latitude: -27.4698,
    longitude: 153.0251,
  });
  assert.equal(result.results[0].places[1].title, "Beta Bakery");
  assert.equal(result.results[0].places[1].priceLevel, "$$");
  assert.equal(result.results[0].search.countryCode, "AU");
});

test("supports raw Maps URLs, max place limits, and JSON-LD fallback", async () => {
  const result = await scrapeGoogleMapsPlaces(
    {
      searches: ["https://www.google.com/maps/search/plumbers+seattle"],
      maxPlacesPerSearch: 1,
    },
    async ({ url }) => ({ ok: true, status: 200, final_url: url, html: JSON_LD_HTML }),
  );

  assert.equal(result.item_count, 1);
  assert.equal(result.results[0].search.type, "URL");
  assert.deepEqual(result.results[0].places[0], {
    position: 1,
    title: "Gamma Repairs",
    category: "LocalBusiness",
    address: "10 Market Street, Seattle, WA, 98101",
    phone: "+1 555 0100",
    website: "https://gamma.example.com/",
    rating: 4.9,
    reviewCount: 44,
    priceLevel: "$$",
    placeUrl: "https://www.google.com/maps/place/Gamma+Repairs/@47.6097,-122.3331,17z",
    placeId: "gamma-id",
    latitude: 47.6097,
    longitude: -122.3331,
  });
});

test("records blocked and invalid URL inputs without throwing the batch", async () => {
  const result = await scrapeGoogleMapsPlaces(
    {
      searches: ["https://example.com/maps/search/nope", "dentists denver"],
    },
    async () => ({
      ok: true,
      status: 200,
      html: "<html><body>Our systems have detected unusual traffic</body></html>",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.search_count, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].error, "URL input must be a Google Maps URL");
  assert.equal(result.errors[1].error, "maps page appears blocked");
});
