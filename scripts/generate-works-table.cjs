// Generate a TypeScript table of works for use in the UI, using the
// offline OpenAlex-derived CSVs (works, topics, institutions).
//
// Usage:
//   node scripts/generate-works-table.cjs
//
// Reads:
//   data/works.csv
//   data/work_topics.csv
//   data/work_institutions.csv
// Writes:
//   src/data/worksTable.generated.ts

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const worksPath = path.join(ROOT, "data", "works.csv");
const workTopicsPath = path.join(ROOT, "data", "work_topics.csv");
const workInstitutionsPath = path.join(ROOT, "data", "work_institutions.csv");
const outPath = path.join(ROOT, "src", "data", "worksTable.generated.ts");
const { repairUtf8 } = require("./lib/textRepair.cjs");

const parseCsvLine = (line) => {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result;
};

const readCsv = (filePath) => {
  if (!fs.existsSync(filePath)) return { headers: [], rows: [] };

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => repairUtf8(h.trim()));
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line).map((v) => repairUtf8(v.trim()));
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] ?? "";
    });
    return record;
  });

  return { headers, rows };
};

const main = () => {
  const { headers: workHeaders, rows: workRows } = readCsv(worksPath);
  if (!workHeaders.length) {
    console.error("No data/works.csv found or file is empty.");
    process.exit(1);
  }

  const { headers: topicHeaders, rows: topicRows } = readCsv(workTopicsPath);
  const { headers: institutionHeaders, rows: institutionRows } = readCsv(workInstitutionsPath);

   const workIdKey = workHeaders.find((h) => h.toLowerCase() === "work_id") || "work_id";
  const doiKey = workHeaders.find((h) => h.toLowerCase() === "doi") || "doi";
  const programKey = workHeaders.find((h) => h.toLowerCase() === "program") || "program";
  const authorOpenAlexIdKey =
    workHeaders.find((h) => h.toLowerCase() === "author_openalex_id") ||
    "author_openalex_id";
  const coauthorOpenAlexIdsKey =
    workHeaders.find((h) => h.toLowerCase() === "coauthor_openalex_ids") ||
    "coauthor_openalex_ids";
  const firstAuthorKey =
    workHeaders.find((h) => h.toLowerCase() === "first_author_last_name") ||
    "first_author_last_name";
  const publicationDateKey =
    workHeaders.find((h) => h.toLowerCase() === "publication_date") ||
    "publication_date";
  const allAuthorsKey =
    workHeaders.find((h) => h.toLowerCase() === "all_authors") || "all_authors";
  const titleKey = workHeaders.find((h) => h.toLowerCase() === "title") || "title";
  const yearKey = workHeaders.find((h) => h.toLowerCase() === "year") || "year";
  const venueKey = workHeaders.find((h) => h.toLowerCase() === "venue") || "venue";
  const citationsKey =
    workHeaders.find((h) => h.toLowerCase() === "citations") || "citations";

  const topicWorkIdKey =
    topicHeaders.find((h) => h.toLowerCase() === "work_id") || "work_id";
  const topicNameKey =
    topicHeaders.find((h) => h.toLowerCase() === "topic_name") || "topic_name";

  const instWorkIdKey =
    institutionHeaders.find((h) => h.toLowerCase() === "work_id") || "work_id";
  const instNameKey =
    institutionHeaders.find((h) => h.toLowerCase() === "institution_name") ||
    "institution_name";

  const topicsByWorkId = new Map();
  for (const row of topicRows) {
    const workId = row[topicWorkIdKey];
    const topicName = row[topicNameKey];
    if (!workId || !topicName) continue;
    const list = topicsByWorkId.get(workId) ?? new Set();
    list.add(topicName);
    topicsByWorkId.set(workId, list);
  }

  const institutionsByWorkId = new Map();
  for (const row of institutionRows) {
    const workId = row[instWorkIdKey];
    const instName = row[instNameKey];
    if (!workId || !instName) continue;
    const list = institutionsByWorkId.get(workId) ?? new Set();
    list.add(instName);
    institutionsByWorkId.set(workId, list);
  }

  const seen = new Set();
  const records = [];

  for (const row of workRows) {
    const workId = row[workIdKey];
    const program = row[programKey] || "";
    const key = `${workId}|${program}`;
    if (!workId || seen.has(key)) continue;
    seen.add(key);

    const doi = row[doiKey] || "";
    const publicationDate = row[publicationDateKey] || "";
    const title = row[titleKey] || "";
    const year = Number(row[yearKey] || "0");
    const venue = row[venueKey] || "";
    const citations = Number(row[citationsKey] || "0");
    const primaryAuthorOpenAlexId = (row[authorOpenAlexIdKey] || "").trim();
    const coauthorIdsRaw = row[coauthorOpenAlexIdsKey] || "";
    const coauthorOpenAlexIds = coauthorIdsRaw
      ? coauthorIdsRaw
          .split("|")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [];
    const allAuthorOpenAlexIds = [
      primaryAuthorOpenAlexId,
      ...coauthorOpenAlexIds,
    ].filter((s) => s.length > 0);
    const firstAuthorLastName = row[firstAuthorKey] || "";
    const allAuthorsRaw = row[allAuthorsKey] || "";

    const topicsSet = topicsByWorkId.get(workId) || new Set();
    const institutionsSet = institutionsByWorkId.get(workId) || new Set();

    records.push({
      workId,
      doi,
      program,
      primaryAuthorOpenAlexId,
      allAuthorOpenAlexIds,
      firstAuthorLastName,
      allAuthors: allAuthorsRaw
        ? allAuthorsRaw.split(";").map((s) => s.trim()).filter(Boolean)
        : [],
      title,
      publicationDate,
      year,
      venue,
      citations,
      topics: Array.from(topicsSet),
      institutions: Array.from(institutionsSet),
    });
  }


    const fileContents =
    "// AUTO-GENERATED FILE. DO NOT EDIT.\n" +
    "// Generated from data/works.csv, data/work_topics.csv, and data/work_institutions.csv by scripts/generate-works-table.cjs\n\n" +
    "export interface WorkTableRecord {\n" +
    "  workId: string;\n" +
    "  doi: string;\n" +
    "  program: string;\n" +
    "  primaryAuthorOpenAlexId: string;\n" +
    "  allAuthorOpenAlexIds: string[];\n" +
    "  firstAuthorLastName: string;\n" +
    "  allAuthors: string[];\n" +
    "  title: string;\n" +
    "  publicationDate: string;\n" +
    "  year: number;\n" +
    "  venue: string;\n" +
    "  citations: number;\n" +
    "  topics: string[];\n" +
    "  institutions: string[];\n" +
    "}\n\n" +
    `export const worksTable: WorkTableRecord[] = ${JSON.stringify(records, null, 2)};\n`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, fileContents, "utf8");

  console.log(
    "Generated",
    path.relative(ROOT, outPath),
    "from",
    `${path.relative(ROOT, worksPath)}, ${path.relative(
      ROOT,
      workTopicsPath,
    )}, ${path.relative(ROOT, workInstitutionsPath)}`,
  );
};

main();
