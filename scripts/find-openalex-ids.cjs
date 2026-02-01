// Try to automatically find OpenAlex author IDs for rows in data/config/authors-source.csv
// Usage:
//   node scripts/find-openalex-ids.cjs
//
// For each author with an empty `openalex_id1`, this script:
//   - searches OpenAlex by the author's name
//   - if it finds a confident name match, writes the OpenAlex ID into `openalex_id1`
//
// After running this script you can run:
//   npm run update:authors:openalex
// to pull publications / citations / h-index for those authors.

const fs = require("fs");
const path = require("path");
const {
  readAuthorsSourceRaw,
  writeCsv,
  normalizeOpenAlexId,
} = require("./lib/readAuthorsSource.cjs");

const ROOT = path.resolve(__dirname, "..");
const csvPath = path.join(ROOT, "data", "config", "authors-source.csv");
const BASE_URL = "https://api.openalex.org";

const normalizeName = (name) =>
  (name || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const findBestMatch = async (fullName) => {
  const query = encodeURIComponent(fullName);
  const url = `${BASE_URL}/authors?search=${query}&per-page=5&mailto=research@example.com`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Search failed for "${fullName}": HTTP ${res.status}`);
    return null;
  }

  const data = await res.json();
  const results = data.results || [];
  if (results.length === 0) return null;

  const target = normalizeName(fullName);

  for (const candidate of results) {
    const candName = normalizeName(candidate.display_name);
    if (!candName) continue;

    if (candName === target) {
      return candidate;
    }
  }

  // Fallback: accept first result if the last name matches exactly
  const [lastPart] = target.split(" ").slice(-1);
  const first = results[0];
  if (first) {
    const candName = normalizeName(first.display_name);
    const candLast = candName.split(" ").slice(-1)[0];
    if (candLast && candLast === lastPart) {
      return first;
    }
  }

  return null;
};

const run = async () => {
  const { headers, rows } = readAuthorsSourceRaw();
  if (headers.length === 0) {
    console.error("No data/config/authors-source.csv found or file is empty.");
    process.exit(1);
  }

  if (!headers.includes("openalex_id1")) {
    headers.splice(1, 0, "openalex_id1");
    rows.forEach((row) => {
      if (row.openalex_id1 === undefined) row.openalex_id1 = "";
    });
  }

  let updated = 0;

  for (const row of rows) {
    if (row.openalex_id1 && row.openalex_id1.trim()) continue;

    const firstName = row.first_name || row.firstName || "";
    const lastName = row.last_name || row.lastName || "";
    const fallbackName = row.name || "";

    const fullName = `${firstName} ${lastName}`.trim() || fallbackName;
    if (!fullName) continue;

    try {
      const match = await findBestMatch(fullName);
      if (!match) {
        console.log(`No confident OpenAlex match for "${fullName}"`);
      } else {
        const parts = (match.id || "").split("/");
        const idPart = parts[parts.length - 1];
        if (idPart) {
          row.openalex_id1 = idPart;
          updated += 1;
          console.log(`Matched "${fullName}" -> ${idPart}`);
        }
      }
    } catch (err) {
      console.warn(`Error searching for "${fullName}":`, err.message || err);
    }

    // Be polite to the API
    await delay(300);
  }

  writeCsv(csvPath, headers, rows);
  console.log(`Finished. Updated OpenAlex IDs for ${updated} authors.`);
};

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
