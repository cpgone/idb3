// Batch-update author publication metrics from OpenAlex into data/config/authors-source.csv
// Usage:
//   node scripts/update-authors-from-openalex.cjs
//
// For each row in data/config/authors-source.csv with one or more OpenAlex IDs, this script:
//   - fetches the author from https://api.openalex.org/authors/{id}
//   - updates total_publications, total_citations, and h_index
// All other columns are preserved as-is.

const path = require("path");
const {
  readAuthorsSourceRaw,
  writeCsv,
  normalizeAuthorRow,
  AUTHORS_SOURCE_PATH,
} = require("./lib/readAuthorsSource.cjs");

const BASE_URL = "https://api.openalex.org";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const updateFromOpenAlex = async () => {
  const { headers, rows } = readAuthorsSourceRaw();
  if (headers.length === 0) {
    console.error("No data/config/authors-source.csv found or file is empty.");
    process.exit(1);
  }

  // Ensure required columns exist
  const required = ["total_publications", "total_citations", "h_index"];
  for (const col of required) {
    if (!headers.includes(col)) {
      headers.push(col);
    }
  }

  let updatedCount = 0;

  for (const row of rows) {
    const normalized = normalizeAuthorRow(row);
    const openAlexIds = normalized.openAlexIds;
    if (!openAlexIds.length) continue;

    let totalPublications = 0;
    let totalCitations = 0;
    let hIndex = 0;

    for (const openAlexId of openAlexIds) {
      try {
        const url = `${BASE_URL}/authors/${openAlexId}?mailto=research@example.com`;
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`Failed to fetch ${openAlexId}: HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();

        totalPublications += Number(data.works_count || 0);
        totalCitations += Number(data.cited_by_count || 0);

        const summaryStats = data.summary_stats || {};
        const hVal = summaryStats.h_index ?? data.h_index;
        if (typeof hVal === "number" && hVal > hIndex) {
          hIndex = hVal;
        }

        updatedCount += 1;
        // Be polite to the API
        await delay(200);
      } catch (err) {
        console.warn(`Error updating ${openAlexId}:`, err.message || err);
      }
    }

    row.total_publications = String(totalPublications);
    row.total_citations = String(totalCitations);
    row.h_index = String(hIndex);
  }

  writeCsv(AUTHORS_SOURCE_PATH, headers, rows);
  console.log(
    `Updated ${updatedCount} OpenAlex profiles across authors in data/config/authors-source.csv.`,
  );
};

updateFromOpenAlex().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
