// Remove cached author JSON files for authors that are no longer in data/config/authors-source.csv
// Usage:
//   node scripts/clean-author-cache.cjs
//
// This script:
//   - Reads all OpenAlex IDs from data/config/authors-source.csv
//   - Lists JSON files in public/author-data
//   - Deletes any JSON file whose base name (e.g. A123456789) is not present in the CSV

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const authorDataDir = path.join(ROOT, "public", "author-data");
const { readAuthorsSourceRaw, normalizeOpenAlexId } = require("./lib/readAuthorsSource.cjs");

const readAuthorIds = () => {
  const { rows } = readAuthorsSourceRaw();
  const ids = new Set();
  for (const row of rows) {
    [
      normalizeOpenAlexId(row.openalex_id1),
      normalizeOpenAlexId(row.openalex_id2),
      normalizeOpenAlexId(row.openalex_id3),
      normalizeOpenAlexId(row.openalex_id),
    ]
      .filter(Boolean)
      .forEach((id) => ids.add(id));
  }
  return ids;
};

const main = () => {
  const validIds = readAuthorIds();

  if (!fs.existsSync(authorDataDir)) {
    console.log(`No author-data directory at ${authorDataDir}, nothing to clean.`);
    return;
  }

  const files = fs.readdirSync(authorDataDir);
  let removed = 0;
  let kept = 0;

  for (const file of files) {
    if (!file.toLowerCase().endsWith(".json")) continue;
    const base = path.basename(file, ".json");
    if (validIds.has(base)) {
      kept += 1;
      continue;
    }

    const fullPath = path.join(authorDataDir, file);
    fs.unlinkSync(fullPath);
    removed += 1;
    console.log(`Removed stale cache file: ${path.relative(ROOT, fullPath)}`);
  }

  console.log(
    `Author cache cleanup complete. Kept ${kept} file(s), removed ${removed} stale file(s).`,
  );
};

main();
