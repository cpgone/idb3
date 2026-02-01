// Aggregate topics and institutions from OpenAlex-derived CSVs into
// TypeScript tables for the UI.
//
// Usage:
//   node scripts/generate-topic-institution-stats.cjs
//
// Reads:
//   data/works.csv
//   data/work_topics.csv
//   data/work_institutions.csv
// Writes:
//   src/data/topicInstitutionStats.generated.ts

const fs = require("fs");
const path = require("path");
const { repairUtf8 } = require("./lib/textRepair.cjs");

const ROOT = path.resolve(__dirname, "..");
const worksCsvPath = path.join(ROOT, "data", "works.csv");
const workTopicsCsvPath = path.join(ROOT, "data", "work_topics.csv");
const workInstitutionsCsvPath = path.join(ROOT, "data", "work_institutions.csv");
const outPath = path.join(ROOT, "src", "data", "topicInstitutionStats.generated.ts");

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
      record[header] = repairUtf8(values[idx] ?? "");
    });
    return record;
  });

  return { headers, rows };
};

const main = () => {
  const { headers: workHeaders, rows: workRows } = readCsv(worksCsvPath);
  if (!workHeaders.length) {
    console.error("No data/works.csv found or file is empty.");
    process.exit(1);
  }

  const { headers: topicHeaders, rows: topicRows } = readCsv(workTopicsCsvPath);
  const { headers: instHeaders, rows: instRows } = readCsv(workInstitutionsCsvPath);

  if (!topicHeaders.length) {
    console.warn("Warning: data/work_topics.csv is empty; topic stats will be empty.");
  }
  if (!instHeaders.length) {
    console.warn(
      "Warning: data/work_institutions.csv is empty; institution stats will be empty.",
    );
  }

  const workLower = workHeaders.map((h) => h.toLowerCase());
  const idxWorkId = workLower.indexOf("work_id");
  const idxCitations = workLower.indexOf("citations");

  if (idxWorkId === -1 || idxCitations === -1) {
    console.error("data/works.csv must have work_id and citations columns.");
    process.exit(1);
  }

  const workCitations = new Map();
  for (const row of workRows) {
    const id = row[workHeaders[idxWorkId]] || "";
    const citationsNum = Number(row[workHeaders[idxCitations]] || "0");
    if (!id) continue;
    workCitations.set(id, Number.isFinite(citationsNum) ? citationsNum : 0);
  }

  const topicStatsMap = new Map();
  if (topicHeaders.length) {
    const topicLower = topicHeaders.map((h) => h.toLowerCase());
    const idxTopicWorkId = topicLower.indexOf("work_id");
    const idxTopicId = topicLower.indexOf("topic_id");
    const idxTopicName = topicLower.indexOf("topic_name");

    if (idxTopicWorkId !== -1 && idxTopicId !== -1) {
      for (const row of topicRows) {
        const workId = row[topicHeaders[idxTopicWorkId]] || "";
        const topicId = row[topicHeaders[idxTopicId]] || "";
        const topicName =
          (idxTopicName !== -1 ? row[topicHeaders[idxTopicName]] : "") || topicId;
        if (!workId || !topicId) continue;

        const citations = workCitations.get(workId) ?? 0;

        const existing = topicStatsMap.get(topicId) || {
          id: topicId,
          name: topicName,
          publications: 0,
          citations: 0,
        };
        existing.publications += 1;
        existing.citations += citations;
        topicStatsMap.set(topicId, existing);
      }
    }
  }

  const institutionStatsMap = new Map();
  if (instHeaders.length) {
    const instLower = instHeaders.map((h) => h.toLowerCase());
    const idxInstWorkId = instLower.indexOf("work_id");
    const idxInstId = instLower.indexOf("institution_id");
    const idxInstName = instLower.indexOf("institution_name");

    if (idxInstWorkId !== -1 && idxInstId !== -1) {
      for (const row of instRows) {
        const workId = row[instHeaders[idxInstWorkId]] || "";
        const instId = row[instHeaders[idxInstId]] || "";
        const instName =
          (idxInstName !== -1 ? row[instHeaders[idxInstName]] : "") || instId;
        if (!workId || !instId) continue;

        const citations = workCitations.get(workId) ?? 0;

        const existing = institutionStatsMap.get(instId) || {
          id: instId,
          name: instName,
          publications: 0,
          citations: 0,
        };
        existing.publications += 1;
        existing.citations += citations;
        institutionStatsMap.set(instId, existing);
      }
    }
  }

  const topicStats = Array.from(topicStatsMap.values()).sort((a, b) => {
    if (b.publications === a.publications) return b.citations - a.citations;
    return b.publications - a.publications;
  });

  const institutionStats = Array.from(institutionStatsMap.values()).sort((a, b) => {
    if (b.publications === a.publications) return b.citations - a.citations;
    return b.publications - a.publications;
  });

  const fileContents =
    "// AUTO-GENERATED FILE. DO NOT EDIT.\n" +
    "// Generated from data/works.csv, data/work_topics.csv, and data/work_institutions.csv by scripts/generate-topic-institution-stats.cjs\n\n" +
    "export interface TopicStats {\n" +
    "  id: string;\n" +
    "  name: string;\n" +
    "  publications: number;\n" +
    "  citations: number;\n" +
    "}\n\n" +
    "export interface InstitutionStats {\n" +
    "  id: string;\n" +
    "  name: string;\n" +
    "  publications: number;\n" +
    "  citations: number;\n" +
    "}\n\n" +
    `export const topicStats: TopicStats[] = ${JSON.stringify(topicStats, null, 2)};\n\n` +
    `export const institutionStats: InstitutionStats[] = ${JSON.stringify(
      institutionStats,
      null,
      2,
    )};\n`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, fileContents, "utf8");

  console.log(
    "Generated",
    path.relative(ROOT, outPath),
    "from",
    path.relative(ROOT, worksCsvPath),
    ",",
    path.relative(ROOT, workTopicsCsvPath),
    "and",
    path.relative(ROOT, workInstitutionsCsvPath),
  );
};

main();
