import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeFacebookPages,
  type FacebookPagesFetch,
} from "./runtime";

const HYDRATION_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Better Fetch | Facebook" />
    <meta property="og:description" content="Browser data for builders." />
    <meta property="og:url" content="https://www.facebook.com/betterfetch" />
    <meta property="og:image" content="https://fb.test/profile-og.jpg" />
    <script type="application/json">
      {
        "data": {
          "page": {
            "page_id": "424242",
            "pageName": "betterfetch",
            "name": "Better Fetch",
            "category_list": ["Software Company", "Internet Company"],
            "intro": "Browser data for builders.",
            "about_me": {
              "text": "Better Fetch turns messy public pages into structured rows."
            },
            "websites": ["https://betterfetch.co"],
            "email": "hello@betterfetch.co",
            "phone_number": "+1 415 555 0199",
            "single_line_address": "123 Market St, San Francisco, CA",
            "messenger_link": "https://m.me/betterfetch",
            "likes": 1148094,
            "followers_count": 1219522,
            "talking_about_count": 68836,
            "checkins": 42,
            "were_here_count": 177,
            "rating": "94% recommend (839 Reviews)",
            "creation_date": "October 7, 2012",
            "ad_status": "This Page is not currently running ads.",
            "pageAdLibrary": { "is_business_page_active": false, "id": "290072384435404" },
            "profilePictureUrl": "https://fb.test/profile.jpg",
            "coverPhotoUrl": "https://fb.test/cover.jpg"
          }
        }
      }
    </script>
  </head>
  <body></body>
</html>`;

const FALLBACK_HTML = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "NASA Earth",
        "description": "Explore and learn more about our home planet.",
        "url": "https://www.facebook.com/nasaearth",
        "sameAs": ["https://science.nasa.gov/earth/"],
        "email": "earth@example.gov",
        "telephone": "+1 202 358 0001",
        "address": {
          "streetAddress": "300 E Street SW",
          "addressLocality": "Washington",
          "addressRegion": "DC",
          "postalCode": "20546",
          "addressCountry": "US"
        },
        "image": "https://fb.test/nasa-profile.jpg"
      }
    </script>
  </head>
  <body>
    <main>
      <h1>NASA Earth</h1>
      <p>10,505,363 likes</p>
      <p>10.9M followers</p>
      <p>6,420 talking about this</p>
      <p>2,177 were here</p>
      <p>This Page is currently running ads.</p>
      <a href="https://science.nasa.gov/earth/">Website</a>
      <a href="https://www.facebook.com/messages/t/nasaearth">Message</a>
      <img alt="NASA Earth cover photo" src="https://fb.test/nasa-cover.jpg" />
    </main>
  </body>
</html>`;

test("extracts structured public page rows from hydration data", async () => {
  const seenUrls: string[] = [];
  const fetcher: FacebookPagesFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    return { ok: true, status: 200, final_url: url, html: HYDRATION_HTML };
  };

  const result = await scrapeFacebookPages(
    {
      pages: ["@betterfetch"],
      countryCode: "AU",
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, "facebook_pages");
  assert.equal(result.page_count, 1);
  assert.equal(seenUrls[0], "https://www.facebook.com/betterfetch/about");
  assert.deepEqual(result.results[0].page, {
    pageId: "424242",
    username: "betterfetch",
    title: "Better Fetch",
    canonicalUrl: "https://www.facebook.com/betterfetch",
    categories: ["Software Company", "Internet Company"],
    intro: "Browser data for builders.",
    aboutText: "Better Fetch turns messy public pages into structured rows.",
    websites: ["https://betterfetch.co/"],
    websiteUrl: "https://betterfetch.co/",
    email: "hello@betterfetch.co",
    phone: "+1 415 555 0199",
    address: "123 Market St, San Francisco, CA",
    messengerUrl: "https://m.me/betterfetch",
    likeCount: 1148094,
    followerCount: 1219522,
    talkingAboutCount: 68836,
    checkInCount: 42,
    wereHereCount: 177,
    ratingText: "94% recommend (839 Reviews)",
    ratingValue: 94,
    ratingCount: 839,
    pageCreationDate: "October 7, 2012",
    adStatus: "This Page is not currently running ads.",
    adLibraryId: "290072384435404",
    isRunningAds: false,
    profileImageUrl: "https://fb.test/profile-og.jpg",
    coverImageUrl: "https://fb.test/cover.jpg",
    externalLinks: ["https://betterfetch.co/"],
  });
});

test("supports Facebook URLs, home section, JSON-LD, and visible text fallback", async () => {
  const result = await scrapeFacebookPages(
    {
      pages: ["https://facebook.com/nasaearth"],
      section: "home",
      maxPages: 1,
    },
    async ({ url }) => {
      assert.equal(url, "https://www.facebook.com/nasaearth");
      return {
        ok: true,
        status: 200,
        final_url: "https://www.facebook.com/nasaearth/",
        html: FALLBACK_HTML,
      };
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.results[0].target.type, "URL");
  assert.deepEqual(result.results[0].page, {
    pageId: null,
    username: "nasaearth",
    title: "NASA Earth",
    canonicalUrl: "https://www.facebook.com/nasaearth/",
    categories: [],
    intro: "Explore and learn more about our home planet.",
    aboutText: null,
    websites: ["https://science.nasa.gov/earth/"],
    websiteUrl: "https://science.nasa.gov/earth/",
    email: "earth@example.gov",
    phone: "+1 202 358 0001",
    address: "300 E Street SW, Washington, DC, 20546, US",
    messengerUrl: "https://www.facebook.com/messages/t/nasaearth",
    likeCount: 10505363,
    followerCount: 10900000,
    talkingAboutCount: 6420,
    checkInCount: null,
    wereHereCount: 2177,
    ratingText: null,
    ratingValue: null,
    ratingCount: null,
    pageCreationDate: null,
    adStatus: "This Page is currently running ads.",
    adLibraryId: null,
    isRunningAds: true,
    profileImageUrl: "https://fb.test/nasa-profile.jpg",
    coverImageUrl: "https://fb.test/nasa-cover.jpg",
    externalLinks: ["https://science.nasa.gov/earth/"],
  });
});

test("records invalid and blocked Facebook page targets without throwing", async () => {
  const result = await scrapeFacebookPages(
    {
      pages: ["https://example.com/not-facebook", "123456789"],
    },
    async () => ({
      ok: true,
      status: 200,
      html: "<html><body>captcha checkpoint log in to Facebook</body></html>",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.page_count, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(
    result.errors[0].error,
    "Input must be a Facebook Page/Profile URL, page ID, or handle",
  );
  assert.equal(
    result.errors[1].error,
    "facebook page appears blocked, unavailable, or login-gated",
  );
});
