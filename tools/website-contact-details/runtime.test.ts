import assert from "node:assert/strict";
import test from "node:test";
import {
  extractWebsiteContactDetails,
  type WebsiteContactDetailsFetch,
} from "./runtime";

const HOME_HTML = `<!doctype html>
<html>
  <head>
    <title>Better Fetch Labs - Official Site</title>
    <meta property="og:site_name" content="Better Fetch Labs" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Better Fetch Labs",
        "address": {
          "streetAddress": "123 Market Street",
          "addressLocality": "San Francisco",
          "addressRegion": "CA",
          "postalCode": "94105",
          "addressCountry": "US"
        }
      }
    </script>
  </head>
  <body>
    <a href="/contact">Contact sales</a>
    <a href="/about-us">About</a>
    <a href="https://www.linkedin.com/company/better-fetch">LinkedIn</a>
    <a href="https://x.com/betterfetch">X</a>
    <p>General inquiries: hello [at] betterfetch.co</p>
    <p>Call +1 (415) 555-0199</p>
  </body>
</html>`;

const CONTACT_HTML = `<!doctype html>
<html>
  <head>
    <title>Contact Better Fetch Labs</title>
  </head>
  <body>
    <address>123 Market Street, San Francisco, CA 94105</address>
    <a href="mailto:sales@betterfetch.co?subject=Demo">Email sales</a>
    <a href="tel:+14155550100">Phone</a>
    <a href="https://www.instagram.com/betterfetch/">Instagram</a>
    <a href="https://www.youtube.com/@betterfetch">YouTube</a>
    <form method="post" action="/contact/submit">
      <input name="name" />
      <input name="email" />
      <textarea name="message"></textarea>
    </form>
  </body>
</html>`;

test("extracts contact details and follows likely contact pages", async () => {
  const seenUrls: string[] = [];
  const fetcher: WebsiteContactDetailsFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "au");
    if (url === "https://betterfetch.co/") {
      return { ok: true, status: 200, final_url: url, html: HOME_HTML };
    }
    if (url === "https://betterfetch.co/contact") {
      return { ok: true, status: 200, final_url: url, html: CONTACT_HTML };
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await extractWebsiteContactDetails(
    {
      sites: ["betterfetch.co"],
      maxPagesPerSite: 2,
      strategy: "browser",
      countryCode: "AU",
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, "website_contact_details");
  assert.deepEqual(seenUrls, ["https://betterfetch.co/", "https://betterfetch.co/contact"]);
  assert.equal(result.site_count, 1);
  assert.equal(result.page_count, 2);
  assert.equal(result.email_count, 2);
  assert.equal(result.phone_count, 2);
  assert.equal(result.social_profile_count, 4);
  assert.equal(result.contact_form_count, 1);
  assert.deepEqual(result.results[0].site, {
    input: "betterfetch.co",
    inputIndex: 1,
    url: "https://betterfetch.co/",
    finalUrl: "https://betterfetch.co/",
    domain: "betterfetch.co",
  });
  assert.equal(result.results[0].companyName, "Better Fetch Labs");
  assert.deepEqual(result.results[0].emails, [
    { value: "hello@betterfetch.co", pageUrl: "https://betterfetch.co/" },
    { value: "sales@betterfetch.co", pageUrl: "https://betterfetch.co/contact" },
  ]);
  assert.deepEqual(result.results[0].phones, [
    { value: "+1 (415) 555-0199", pageUrl: "https://betterfetch.co/" },
    { value: "+14155550100", pageUrl: "https://betterfetch.co/contact" },
  ]);
  assert.deepEqual(
    result.results[0].socialProfiles.map((profile) => ({
      platform: profile.platform,
      handle: profile.handle,
      url: profile.url,
    })),
    [
      {
        platform: "linkedin",
        handle: "company",
        url: "https://www.linkedin.com/company/better-fetch",
      },
      { platform: "x", handle: "betterfetch", url: "https://x.com/betterfetch" },
      {
        platform: "instagram",
        handle: "betterfetch",
        url: "https://www.instagram.com/betterfetch/",
      },
      {
        platform: "youtube",
        handle: "betterfetch",
        url: "https://www.youtube.com/@betterfetch",
      },
    ],
  );
  assert.deepEqual(result.results[0].contactForms, [
    {
      pageUrl: "https://betterfetch.co/contact",
      actionUrl: "https://betterfetch.co/contact/submit",
      method: "POST",
      fieldNames: ["name", "email", "message"],
    },
  ]);
  assert.deepEqual(result.results[0].addresses, [
    {
      value: "123 Market Street, San Francisco, CA, 94105, US",
      pageUrl: "https://betterfetch.co/",
    },
    {
      value: "123 Market Street, San Francisco, CA 94105",
      pageUrl: "https://betterfetch.co/contact",
    },
  ]);
  assert.deepEqual(result.results[0].discoveredContactPages, [
    "https://betterfetch.co/contact",
  ]);
});

test("can limit processing to the start page", async () => {
  const seenUrls: string[] = [];
  const result = await extractWebsiteContactDetails(
    {
      sites: ["https://betterfetch.co"],
      maxPagesPerSite: 5,
      includeContactPages: false,
    },
    async ({ url }) => {
      seenUrls.push(url);
      return { ok: true, status: 200, final_url: url, html: HOME_HTML };
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(seenUrls, ["https://betterfetch.co/"]);
  assert.equal(result.page_count, 1);
  assert.deepEqual(result.results[0].discoveredContactPages, []);
});

test("records invalid, blocked, and empty sites without stopping the batch", async () => {
  const result = await extractWebsiteContactDetails(
    {
      sites: ["nota url ???", "https://blocked.test", "https://empty.test"],
      maxPagesPerSite: 1,
    },
    async ({ url }) => {
      if (url.includes("blocked")) {
        return {
          ok: true,
          status: 200,
          html: "<html><body>captcha checking your browser</body></html>",
        };
      }
      return { ok: true, status: 200, final_url: url, html: "<html><body>No contacts here</body></html>" };
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.site_count, 1);
  assert.equal(result.item_count, 0);
  assert.equal(result.errors.length, 3);
  assert.equal(result.errors[0].error, "Input must be a website URL or domain");
  assert.equal(
    result.errors[1].error,
    "website page appears blocked, unavailable, or login-gated",
  );
  assert.equal(result.errors[2].error, "site did not contain contact data");
});
