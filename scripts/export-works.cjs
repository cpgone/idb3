// Export all cached OpenAlex works into a flat CSV for downstream analysis
// (e.g. classifying titles into themes and areas).
//
// Usage:
//   node scripts/export-works.cjs
//
// This script:
//   - Reads data/config/authors-source.csv to get program and affiliation info per author
//   - Scans public/author-data/*.json (written by cache-openalex-works.cjs)
//   - For each work in each author file, writes a row to data/works.csv with:
//       work_id, author_openalex_id, author_display_name,
//       author_first_name, author_last_name,
//       program, affiliate1, affiliate2, affiliate3,
//       title, year, type, venue, citations

const fs = require("fs");
const path = require("path");
const { readAuthorsSourceRaw, normalizeOpenAlexId } = require("./lib/readAuthorsSource.cjs");

const ROOT = path.resolve(__dirname, "..");
const authorDataDir = path.join(ROOT, "public", "author-data");
const worksOutCsvPath = path.join(ROOT, "data", "works.csv");
const workTopicsOutCsvPath = path.join(ROOT, "data", "work_topics.csv");
const workInstitutionsOutCsvPath = path.join(ROOT, "data", "work_institutions.csv");

const escapeCsv = (value) => {
  const str = value == null ? "" : String(value);
  if (str === "") return "";
  // Replace newlines to keep one record per line
  const cleaned = str.replace(/\r?\n/g, " ");
  if (/[",]/.test(cleaned)) {
    return `"${cleaned.replace(/"/g, '""')}"`;
  }
  return cleaned;
};

const normalizeDoi = (doi) => {
  if (!doi) return "";
  return String(doi)
    .trim()
    .replace(/^https?:\/\/(www\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .toLowerCase();
};

const normalizeTitle = (title) => {
  if (!title) return "";
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const makeWorkKey = (work) => {
  if (!work) return "";
  const id = work.id || "";
  if (id) return id;
  const doi = normalizeDoi(work.doi);
  if (doi) return `doi:${doi}`;
  const title = normalizeTitle(work.title);
  const year = work.publication_year || "";
  if (title && year) return `title:${title}|${year}`;
  if (title) return `title:${title}`;
  return "";
};

const main = () => {
  const { rows: authorRows } = readAuthorsSourceRaw();
  if (!authorRows.length) {
    console.error("No authors found in data/config/authors-source.csv");
    process.exit(1);
  }

  if (!fs.existsSync(authorDataDir)) {
    console.error(`No author-data directory at ${authorDataDir}. Run cache-openalex-works.cjs first.`);
    process.exit(1);
  }

  const authorsByOpenAlexId = new Map();
  const canonicalOpenAlexId = (row) =>
    normalizeOpenAlexId(row.openalex_id1) ||
    normalizeOpenAlexId(row.openalex_id) ||
    normalizeOpenAlexId(row.openalex_id2) ||
    normalizeOpenAlexId(row.openalex_id3);
  for (const row of authorRows) {
    const ids = [
      normalizeOpenAlexId(row.openalex_id1),
      normalizeOpenAlexId(row.openalex_id2),
      normalizeOpenAlexId(row.openalex_id3),
      normalizeOpenAlexId(row.openalex_id),
    ].filter(Boolean);
    const primary = canonicalOpenAlexId(row);
    for (const id of ids) {
      authorsByOpenAlexId.set(id, { row, primary });
    }
  }

  const workHeaders = [
    "work_id",
    "doi",
    "author_openalex_id",
    "program",
    "first_author_last_name",
    "all_authors",
    "title",
    "publication_date",
    "year",
    "venue",
    "citations",
    "coauthor_openalex_ids",
  ];

  const topicHeaders = ["work_id", "topic_id", "topic_name"];
  const institutionHeaders = ["work_id", "institution_id", "institution_name"];

  const files = fs.readdirSync(authorDataDir).filter((f) => f.toLowerCase().endsWith(".json"));

  const seenWorkKeys = new Set();

  const workLines = [];
  workLines.push(workHeaders.join(","));

  const topicLines = [];
  topicLines.push(topicHeaders.join(","));

  const institutionLines = [];
  institutionLines.push(institutionHeaders.join(","));

  let totalWorks = 0;
  let totalTopicLinks = 0;
  let totalInstitutionLinks = 0;

  for (const file of files) {
    const fullPath = path.join(authorDataDir, file);
    const idFromFile = path.basename(file, ".json");

    let payload;
    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      payload = JSON.parse(raw);
    } catch (err) {
      console.warn(`Skipping invalid JSON file ${file}:`, err && err.message ? err.message : err);
      continue;
    }

    const details = payload.details || {};
    const works = Array.isArray(payload.works) ? payload.works : [];

    const openAlexId = normalizeOpenAlexId(details.id || idFromFile);
    const authorInfo = authorsByOpenAlexId.get(openAlexId) || {};
    const authorRow = authorInfo.row || {};
    const canonicalAuthorOpenAlexId = authorInfo.primary || openAlexId;

    const program = authorRow.program || authorRow.groupId || "";

    for (const work of works) {
      const workId = work.id || "";
      const workKey = makeWorkKey(work) || `fallback:${openAlexId}:${workId || work.title || ""}`;
      if (seenWorkKeys.has(workKey)) continue;
      seenWorkKeys.add(workKey);
      const authorships = Array.isArray(work.authorships) ? work.authorships : [];

      // Topics per work (using OpenAlex topics array when present)
      const topics = Array.isArray(work.topics) ? work.topics : [];
      const topicIdsForWork = new Set();
      for (const topic of topics) {
        const topicId = topic.id || "";
        if (!topicId || topicIdsForWork.has(topicId)) continue;
        topicIdsForWork.add(topicId);
        const topicRow = [
          workId,
          topicId,
          topic.display_name || "",
        ];
        topicLines.push(topicRow.map(escapeCsv).join(","));
        totalTopicLinks += 1;
      }

      // Institutions per work (flatten authorships[].institutions[])
      const institutionKeysForWork = new Set();
      for (const auth of authorships) {
        const institutions = Array.isArray(auth.institutions) ? auth.institutions : [];
        for (const inst of institutions) {
          const instId = inst.id || "";
          if (!instId) continue;
          const key = `${workId}|${instId}`;
          if (institutionKeysForWork.has(key)) continue;
          institutionKeysForWork.add(key);
          const instRow = [
            workId,
            instId,
            inst.display_name || "",
          ];
          institutionLines.push(instRow.map(escapeCsv).join(","));
          totalInstitutionLinks += 1;
        }
      }
      const coauthorIds = Array.from(
        new Set(
          authorships
            .map((a) => normalizeOpenAlexId(a.author && a.author.id))
            .filter((id) => id && id !== canonicalAuthorOpenAlexId),
        ),
      );

      const doi = work.doi || "";

      const authorNames = authorships
        .map((a) => (a.author && a.author.display_name) || "")
        .filter(Boolean);

      const firstAuthorLastName = (() => {
        const first = authorNames[0] || "";
        if (!first) return "";
        const parts = first.split(/\s+/);
        return parts[parts.length - 1];
      })();

      const workRow = [
        workId,
        doi,
        canonicalAuthorOpenAlexId,
        program,
        firstAuthorLastName,
        authorNames.join("; "),
        work.title || "",
        work.publication_date || "",
        work.publication_year ?? "",
        work.primary_location?.source?.display_name || "",
        work.cited_by_count ?? "",
        coauthorIds.join("|"),
      ];


      workLines.push(workRow.map(escapeCsv).join(","));
      totalWorks += 1;
    }
  }

  fs.writeFileSync(worksOutCsvPath, workLines.join("\n"), "utf8");
  fs.writeFileSync(workTopicsOutCsvPath, topicLines.join("\n"), "utf8");
  fs.writeFileSync(workInstitutionsOutCsvPath, institutionLines.join("\n"), "utf8");

  console.log(`Exported ${totalWorks} works to ${path.relative(ROOT, worksOutCsvPath)}`);
  console.log(
    `Exported ${totalTopicLinks} work-topic links to ${path.relative(
      ROOT,
      workTopicsOutCsvPath,
    )}`,
  );
  console.log(
    `Exported ${totalInstitutionLinks} work-institution links to ${path.relative(
      ROOT,
      workInstitutionsOutCsvPath,
    )}`,
  );
};

main();
