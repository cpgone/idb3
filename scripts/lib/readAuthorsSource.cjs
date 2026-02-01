const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const AUTHORS_SOURCE_PATH = path.join(ROOT, "data", "config", "authors-source.csv");

const normalizeOpenAlexId = (raw) => {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const parts = trimmed.split("/");
  return parts[parts.length - 1];
};

const readCsv = (filePath) => {
  if (!fs.existsSync(filePath)) return { headers: [], rows: [] };

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] ?? "";
    });
    return record;
  });

  return { headers, rows };
};

const writeCsv = (filePath, headers, rows) => {
  const lines = [];
  lines.push(headers.join(","));
  for (const row of rows) {
    const values = headers.map((h) => (row[h] ?? "").toString());
    lines.push(values.join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
};

const readAuthorsSourceRaw = () => readCsv(AUTHORS_SOURCE_PATH);

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeAuthorRow = (row) => {
  const openAlexIds = [
    normalizeOpenAlexId(row.openalex_id1),
    normalizeOpenAlexId(row.openalex_id2),
    normalizeOpenAlexId(row.openalex_id3),
    normalizeOpenAlexId(row.openalex_id),
  ].filter(Boolean);

  const primaryOpenAlexId = openAlexIds[0] || "";

  const firstName = row.first_name || "";
  const middleName = row.middle_name || "";
  const lastName = row.last_name || "";
  const otherLastName = row.other_last_name || "";
  const name = [firstName, middleName, lastName || otherLastName].filter(Boolean).join(" ").trim();

  return {
    internalId: row.internal_id || "",
    firstName,
    middleName,
    lastName,
    otherLastName,
    email: row.email || "",
    orcid: row.orcid || "",
    scopusId: row.scopus_id || "",
    googleScholarId: row.google_scholar_id || "",
    openAlexIds,
    primaryOpenAlexId,
    notes: row.notes || "",
    program: row.program || row.group || "",
    affiliate1: row.affiliate1 || "",
    affiliate2: row.affiliate2 || "",
    affiliate3: row.affiliate3 || "",
    totalPublications: toNumber(row.total_publications),
    totalCitations: toNumber(row.total_citations),
    hIndex: toNumber(row.h_index),
    raw: row,
  };
};

module.exports = {
  AUTHORS_SOURCE_PATH,
  normalizeOpenAlexId,
  readAuthorsSourceRaw,
  writeCsv,
  normalizeAuthorRow,
};
