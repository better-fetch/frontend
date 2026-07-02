import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeAmazonProductDetails,
  type AmazonProductDetailsFetch,
} from "./runtime";

const PRODUCT_HTML = `<!doctype html>
<html>
  <head>
    <link rel="canonical" href="https://www.amazon.com/dp/B0ACME1234" />
    <meta property="og:image" content="https://images.example.com/og.jpg" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Acme Noise Cancelling Headphones",
        "sku": "B0ACME1234",
        "brand": { "name": "Acme" },
        "description": "Wireless over-ear headphones with long battery life.",
        "image": ["https://images.example.com/json-main.jpg"],
        "aggregateRating": { "ratingValue": "4.6", "reviewCount": "1234" },
        "offers": {
          "@type": "Offer",
          "price": "39.99",
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock"
        }
      }
    </script>
  </head>
  <body>
    <input name="ASIN" value="B0ACME1234" />
    <h1 id="productTitle">Acme Noise Cancelling Headphones</h1>
    <a id="bylineInfo">Visit the Acme Store</a>
    <div id="corePrice_feature_div">
      <span class="a-price"><span class="a-offscreen">$39.99</span></span>
    </div>
    <span class="basisPrice"><span class="a-offscreen">$49.99</span></span>
    <div id="availability">In Stock</div>
    <a id="acrPopover" title="4.6 out of 5 stars"></a>
    <span id="acrCustomerReviewText">1,234 ratings</span>
    <a id="sellerProfileTriggerId">Acme Direct</a>
    <div id="wayfinding-breadcrumbs_feature_div">
      <li><a>Electronics</a></li>
      <li><a>Headphones</a></li>
    </div>
    <div id="feature-bullets">
      <li><span class="a-list-item">40 hours of battery life</span></li>
      <li><span class="a-list-item">Active noise cancellation</span></li>
    </div>
    <img
      id="landingImage"
      src="https://images.example.com/main-low.jpg"
      data-old-hires="https://images.example.com/main.jpg"
      data-a-dynamic-image='{"https://images.example.com/main.jpg":[1000,1000],"https://images.example.com/alt.jpg":[800,800]}'
    />
    <table id="productDetails_techSpec_section_1">
      <tr><th>Brand</th><td>Acme</td></tr>
      <tr><th>Color</th><td>Black</td></tr>
    </table>
    <div id="productDescription">
      <p>Wireless over-ear headphones for travel and work.</p>
    </div>
  </body>
</html>`;

const JSON_LD_ONLY_HTML = `<!doctype html>
<html>
  <body>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Beta Kitchen Scale",
        "sku": "B09TEST123",
        "brand": "Beta Home",
        "description": "A compact digital scale.",
        "image": "https://images.example.com/scale.jpg",
        "aggregateRating": { "ratingValue": 4.8, "reviewCount": 88 },
        "offers": {
          "@type": "Offer",
          "price": 24.5,
          "priceCurrency": "GBP",
          "availability": "https://schema.org/InStock"
        }
      }
    </script>
  </body>
</html>`;

test("extracts structured product rows from Amazon detail pages", async () => {
  const seenUrls: string[] = [];
  const fetcher: AmazonProductDetailsFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "us");
    return { ok: true, status: 200, final_url: url, html: PRODUCT_HTML };
  };

  const result = await scrapeAmazonProductDetails(
    {
      products: ["https://www.amazon.com/Acme-Headphones/dp/B0ACME1234?th=1"],
      languageCode: "en-US",
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.product_count, 1);
  assert.equal(seenUrls[0].includes("language=en_US"), true);
  assert.deepEqual(result.results[0].product, {
    asin: "B0ACME1234",
    title: "Acme Noise Cancelling Headphones",
    brand: "Acme",
    priceText: "$39.99",
    price: 39.99,
    currency: "USD",
    listPriceText: "$49.99",
    listPrice: 49.99,
    availability: "In Stock",
    rating: 4.6,
    reviewCount: 1234,
    seller: "Acme Direct",
    description: "Wireless over-ear headphones for travel and work.",
    bulletPoints: ["40 hours of battery life", "Active noise cancellation"],
    categories: ["Electronics", "Headphones"],
    mainImage: "https://images.example.com/main.jpg",
    images: [
      "https://images.example.com/main.jpg",
      "https://images.example.com/alt.jpg",
      "https://images.example.com/main-low.jpg",
      "https://images.example.com/og.jpg",
      "https://images.example.com/json-main.jpg",
    ],
    specifications: { Brand: "Acme", Color: "Black" },
    canonicalUrl: "https://www.amazon.com/dp/B0ACME1234",
    productUrl: "https://www.amazon.com/dp/B0ACME1234",
  });
});

test("supports ASIN inputs and JSON-LD product fallback", async () => {
  const result = await scrapeAmazonProductDetails(
    {
      products: ["B09TEST123"],
      amazonDomain: "amazon.co.uk",
      countryCode: "GB",
      languageCode: "en-GB",
    },
    async ({ url }) => ({
      ok: true,
      status: 200,
      final_url: url,
      html: JSON_LD_ONLY_HTML,
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.results[0].url, "https://www.amazon.co.uk/dp/B09TEST123?language=en_GB");
  assert.equal(result.results[0].product.asin, "B09TEST123");
  assert.equal(result.results[0].product.title, "Beta Kitchen Scale");
  assert.equal(result.results[0].product.brand, "Beta Home");
  assert.equal(result.results[0].product.price, 24.5);
  assert.equal(result.results[0].product.currency, "GBP");
  assert.equal(result.results[0].product.reviewCount, 88);
  assert.equal(result.results[0].product.mainImage, "https://images.example.com/scale.jpg");
});

test("records blocked and invalid product inputs without throwing the batch", async () => {
  const result = await scrapeAmazonProductDetails(
    {
      products: ["https://example.com/dp/B0ACME1234", "B00BLOCKED"],
    },
    async () => ({
      ok: true,
      status: 200,
      html: "<html><body>Robot Check: enter the characters you see</body></html>",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.product_count, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].error, "URL input must be an Amazon product URL");
  assert.equal(result.errors[1].error, "amazon page appears blocked");
});
