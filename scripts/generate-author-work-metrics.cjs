// Generate a minimal per-work record for each author for use in the UI.
// This is used to compute per-author publications, citations, and h-index
// from the offline works dataset (data/works.csv).
//
// Usage:
//   node scripts/generate-author-work-metrics.cjs
//
// Writes:
//   src/data/authorWorkMetrics.generated.ts

const fs = require("fs");
const path = require("path");
const { repairUtf8 } = require("./lib/textRepair.cjs");

const ROOT = path.resolve(__dirname, "..");
const worksPath = path.join(ROOT, "data", "works.csv");
const outPath = path.join(ROOT, "src", "data", "authorWorkMetrics.generated.ts");

const readCsv = (filePath) => {
  if (!fs.existsSync(filePath)) return { headers: [], rows: [] };

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => repairUtf8(h.trim()));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => repairUtf8(v.trim()));
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = repairUtf8(values[idx] ?? "");
    });
    return record;
  });

  return { headers, rows };
};

const main = () => {
  const { headers, rows } = readCsv(worksPath);
  if (!headers.length) {
    console.error("No data/works.csv found or file is empty.");
    process.exit(1);
  }

  const lower = headers.map((h) => h.toLowerCase());
  const idxAuthor = lower.indexOf("author_openalex_id");
  const idxYear = lower.indexOf("year");
  const idxCitations = lower.indexOf("citations");

  if (idxAuthor === -1 || idxYear === -1 || idxCitations === -1) {
    console.error("data/works.csv must have author_openalex_id, year, and citations columns.");
    process.exit(1);
  }

  const metrics = [];

  for (const row of rows) {
    const authorId = row[headers[idxAuthor]] || "";
    const yearNum = Number(row[headers[idxYear]] || "0");
    const citationsNum = Number(row[headers[idxCitations]] || "0");
    if (!authorId || !Number.isFinite(yearNum) || yearNum <= 0) continue;

    metrics.push({
      authorId,
      year: yearNum,
      citations: Number.isFinite(citationsNum) ? citationsNum : 0,
    });
  }

  const fileContents =
    "// AUTO-GENERATED FILE. DO NOT EDIT.\n" +
    "// Generated from data/works.csv by scripts/generate-author-work-metrics.cjs\n\n" +
    "export interface AuthorWorkMetric {\n" +
    "  authorId: string;\n" +
    "  year: number;\n" +
    "  citations: number;\n" +
    "}\n\n" +
    `export const authorWorkMetrics: AuthorWorkMetric[] = ${JSON.stringify(metrics, null, 2)};\n`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, fileContents, "utf8");

  console.log("Generated", path.relative(ROOT, outPath), "from", path.relative(ROOT, worksPath));
};

main();
