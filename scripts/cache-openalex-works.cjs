// Cache OpenAlex author details + works into static JSON files.
// Usage:
//   node scripts/cache-openalex-works.cjs
//
// For every row in data/config/authors-source.csv with one or more OpenAlex IDs:
//   - Fetches author details and works from OpenAlex
//   - Writes public/author-data/<openalex_id>.json with:
//       { details: OpenAlexAuthor, works: OpenAlexWork[] }

const fs = require("fs");
const path = require("path");
const {
  readAuthorsSourceRaw,
  normalizeAuthorRow,
} = require("./lib/readAuthorsSource.cjs");

const ROOT = path.resolve(__dirname, "..");
const outDir = path.join(ROOT, "public", "author-data");
const BASE_URL = "https://api.openalex.org";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAILTO = process.env.OPENALEX_MAILTO || "research@example.com";

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
};

const fetchAllWorksForAuthor = async (openAlexId) => {
  const results = [];
  let cursor = "*";

  while (cursor) {
    const url = `${BASE_URL}/works?filter=author.id:${openAlexId}&per-page=200&cursor=${encodeURIComponent(
      cursor,
    )}&mailto=${encodeURIComponent(MAILTO)}`;
    const page = await fetchJson(url);
    results.push(...(page.results || []));
    const nextCursor =
      (page.meta && (page.meta.next_cursor || page.meta.next)) || null;
    cursor = nextCursor && nextCursor !== cursor ? nextCursor : null;

    // Be polite to the API between pages
    if (cursor) await delay(200);
  }

  return results;
};

const run = async () => {
  const { rows } = readAuthorsSourceRaw();
  if (!rows.length) {
    console.error("No authors found in data/config/authors-source.csv");
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  let processed = 0;

  for (const row of rows) {
    const normalized = normalizeAuthorRow(row);
    if (!normalized.openAlexIds.length) continue;

    for (const openAlexId of normalized.openAlexIds) {
      const outFile = path.join(outDir, `${openAlexId}.json`);

      try {
        const detailsUrl = `${BASE_URL}/authors/${openAlexId}?mailto=${encodeURIComponent(MAILTO)}`;

        const [details, works] = await Promise.all([
          fetchJson(detailsUrl),
          fetchAllWorksForAuthor(openAlexId),
        ]);

        const payload = {
          details,
          works,
        };

        fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
        processed += 1;
        console.log(
          `Cached OpenAlex data for ${openAlexId} -> ${path.relative(ROOT, outFile)}`,
        );
      } catch (err) {
        console.warn(
          `Failed to cache data for ${openAlexId}:`,
          err && err.message ? err.message : err,
        );
      }

      // Be polite to the API
      await delay(300);
    }
  }

  console.log(`Done. Cached data for ${processed} authors.`);
};

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
