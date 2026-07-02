import assert from "node:assert/strict";
import test from "node:test";
import {
  scrapeGoogleSearchResults,
  type GoogleSearchResultsFetch,
} from "./runtime";

const SERP_HTML = `<!doctype html>
<html>
  <body>
    <div id="result-stats">About 1,230,000 results</div>
    <div id="tads">
      <div class="uEierd">
        <span>Sponsored</span>
        <a href="/url?q=https%3A%2F%2Fads.example.com%2Foffer&amp;sa=U">
          <div role="heading">Example sponsored result</div>
        </a>
        <cite>ads.example.com</cite>
        <div class="MUxGbd">Ad copy for the sponsored result.</div>
      </div>
    </div>
    <div id="search">
      <div class="g">
        <a href="/url?q=https%3A%2F%2Fexample.com%2Falpha&amp;sa=U">
          <h3>Alpha result</h3>
        </a>
        <cite>example.com › alpha</cite>
        <div class="VwiC3b">Alpha snippet text from the result page.</div>
      </div>
      <div class="g">
        <a href="https://example.org/beta">
          <h3>Beta result</h3>
        </a>
        <cite>example.org</cite>
        <div data-sncf="1">Beta snippet text.</div>
      </div>
    </div>
    <div jsname="N760b">
      <div role="heading">What is Alpha?</div>
      <div class="hgKElc">Alpha is a fixture value.</div>
    </div>
    <div id="bres">
      <a href="/search?q=alpha+pricing"><span>alpha pricing</span></a>
      <a href="/search?q=alpha+reviews"><span>alpha reviews</span></a>
    </div>
  </body>
</html>`;

const MINIMAL_SERP_HTML = `<!doctype html>
<html>
  <body>
    <div id="search">
      <div class="g">
        <a href="/url?q=https%3A%2F%2Fexample.net%2Fresult&amp;sa=U">
          <h3>Page result</h3>
        </a>
        <div class="VwiC3b">Result on another page.</div>
      </div>
    </div>
  </body>
</html>`;

test("fetches keyword SERPs and returns structured result sections", async () => {
  const seenUrls: string[] = [];
  const fetcher: GoogleSearchResultsFetch = async ({ url, strategy, countryCode }) => {
    seenUrls.push(url);
    assert.equal(strategy, "browser");
    assert.equal(countryCode, "us");
    return { ok: true, status: 200, final_url: url, html: SERP_HTML };
  };

  const result = await scrapeGoogleSearchResults(
    {
      queries: ["best crm software"],
      countryCode: "US",
      languageCode: "en",
      maxPagesPerQuery: 1,
      resultsPerPage: 10,
    },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.page_count, 1);
  assert.equal(result.item_count, 3);
  assert.equal(new URL(seenUrls[0]).searchParams.get("q"), "best crm software");
  assert.equal(new URL(seenUrls[0]).searchParams.get("gl"), "us");
  assert.deepEqual(result.results[0].searchQuery, {
    term: "best crm software",
    url: seenUrls[0],
    device: "DESKTOP",
    page: 1,
    type: "SEARCH",
    domain: "google.com",
    countryCode: "US",
    languageCode: "en",
  });
  assert.equal(result.results[0].resultsTotal, "About 1,230,000 results");
  assert.deepEqual(result.results[0].organicResults, [
    {
      position: 1,
      title: "Alpha result",
      url: "https://example.com/alpha",
      displayedUrl: "example.com › alpha",
      description: "Alpha snippet text from the result page.",
    },
    {
      position: 2,
      title: "Beta result",
      url: "https://example.org/beta",
      displayedUrl: "example.org",
      description: "Beta snippet text.",
    },
  ]);
  assert.deepEqual(result.results[0].paidResults, [
    {
      position: 1,
      title: "Example sponsored result",
      url: "https://ads.example.com/offer",
      displayedUrl: "ads.example.com",
      description: "Ad copy for the sponsored result.",
    },
  ]);
  assert.deepEqual(result.results[0].peopleAlsoAsk, [
    { question: "What is Alpha?", answer: "Alpha is a fixture value." },
  ]);
  assert.deepEqual(result.results[0].relatedQueries, [
    {
      title: "alpha pricing",
      url: "https://www.google.com/search?q=alpha+pricing",
    },
    {
      title: "alpha reviews",
      url: "https://www.google.com/search?q=alpha+reviews",
    },
  ]);
});

test("supports raw Google search URLs and pagination", async () => {
  const seenUrls: string[] = [];
  const fetcher: GoogleSearchResultsFetch = async ({ url }) => {
    seenUrls.push(url);
    return { ok: true, status: 200, final_url: url, html: MINIMAL_SERP_HTML };
  };

  const result = await scrapeGoogleSearchResults(
    {
      queries: ["https://www.google.com/search?q=hotels+seattle"],
      maxPagesPerQuery: 2,
      resultsPerPage: 10,
      mobileResults: true,
    },
    fetcher,
  );

  assert.equal(result.page_count, 2);
  assert.equal(new URL(seenUrls[0]).searchParams.get("start"), null);
  assert.equal(new URL(seenUrls[1]).searchParams.get("start"), "10");
  assert.equal(result.results[0].searchQuery.type, "URL");
  assert.equal(result.results[0].searchQuery.term, "hotels seattle");
  assert.equal(result.results[0].searchQuery.device, "MOBILE");
});

test("records blocked and invalid URL inputs without throwing the batch", async () => {
  const result = await scrapeGoogleSearchResults(
    {
      queries: ["https://example.com/search?q=nope", "blocked query"],
    },
    async () => ({
      ok: true,
      status: 200,
      html: "<html><body>Our systems have detected unusual traffic</body></html>",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.page_count, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].error, "URL input must be a Google search URL");
  assert.equal(result.errors[1].error, "search page appears blocked");
});
