// Generate an OpenAlex-focused RSS feed (feed.xml) with abstracts and topics.
// Usage: node scripts/generate-feed.cjs
//
// Reads: data/works.csv (for OpenAlex IDs/DOIs to fetch)
// Writes: public/feed.xml

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const worksPath = path.join(ROOT, "data", "works.csv");
const outPath = path.join(ROOT, "public", "feed.xml");
const MAILTO = process.env.OPENALEX_MAILTO || "research@example.com";
const MAX_ITEMS = Number(process.env.FEED_LIMIT || 100);
const REQUEST_DELAY_MS = Number(process.env.FEED_REQUEST_DELAY || 200);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line).map((v) => v.trim());
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] ?? "";
    });
    return record;
  });

  return { headers, rows };
};

const escapeXml = (str) => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const pickKey = (headers, target) => {
  return headers.find((h) => h.toLowerCase() === target) || target;
};

const toDoiUrl = (raw) => {
  if (!raw) return "";
  const normalized = raw.replace(/^doi:/i, "").trim();
  if (!normalized) return "";
  return normalized.toLowerCase().startsWith("http")
    ? normalized
    : `https://doi.org/${normalized}`;
};

const reconstructAbstract = (abstractInvertedIndex, fallback = "") => {
  if (!abstractInvertedIndex || typeof abstractInvertedIndex !== "object") {
    return fallback;
  }

  const positions = Object.entries(abstractInvertedIndex);
  if (positions.length === 0) return fallback;

  let maxPos = 0;
  for (const [, posArr] of positions) {
    const localMax = Math.max(...posArr);
    if (localMax > maxPos) maxPos = localMax;
  }

  const words = Array.from({ length: maxPos + 1 }, () => "");
  for (const [word, posArr] of positions) {
    for (const p of posArr) {
      words[p] = word;
    }
  }

  return words.join(" ").replace(/\s+/g, " ").trim() || fallback;
};

const normalizeWorkId = (workIdOrUrl) => {
  if (!workIdOrUrl) return "";
  const trimmed = workIdOrUrl.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http")) {
    const parts = trimmed.split("/");
    return parts[parts.length - 1] || trimmed;
  }
  return trimmed;
};

const toOpenAlexWorkUrl = (workIdOrUrl) => {
  const normalized = normalizeWorkId(workIdOrUrl);
  if (!normalized) return "";
  return `https://api.openalex.org/works/${normalized}`;
};

const buildLookupUrl = (row, headers) => {
  const workIdKey = pickKey(headers, "work_id");
  const doiKey = pickKey(headers, "doi");

  const workIdRaw = row[workIdKey] || "";
  const doiRaw = row[doiKey] || "";

  if (workIdRaw) {
    return toOpenAlexWorkUrl(workIdRaw);
  }
  if (doiRaw) {
    const normalized = doiRaw.replace(/^doi:/i, "").trim();
    if (normalized) {
      return `https://api.openalex.org/works/doi:${normalized}`;
    }
  }
  return "";
};

const fetchWork = async (url) => {
  if (!url) return null;
  const withMailto = url.includes("?")
    ? `${url}&mailto=${encodeURIComponent(MAILTO)}`
    : `${url}?mailto=${encodeURIComponent(MAILTO)}`;
  const res = await fetch(withMailto);
  if (!res.ok) {
    console.warn(`Failed to fetch ${url}: HTTP ${res.status}`);
    return null;
  }
  return res.json();
};

const main = async () => {
  const { headers, rows } = readCsv(worksPath);
  if (!headers.length) {
    console.error("No data/works.csv found or file is empty. Skipping feed generation.");
    process.exit(0);
  }

  const titleKey = pickKey(headers, "title");
  const publicationDateKey = pickKey(headers, "publication_date");
  const yearKey = pickKey(headers, "year");

  // Sort newest first by publication_date (fallback: year)
  const sorted = [...rows].sort((a, b) => {
    const ad = Date.parse(a[publicationDateKey] || "");
    const bd = Date.parse(b[publicationDateKey] || "");
    if (!Number.isNaN(ad) && !Number.isNaN(bd)) return bd - ad;
    const ay = Number(a[yearKey] || 0);
    const by = Number(b[yearKey] || 0);
    return by - ay;
  });

  const items = sorted.slice(0, MAX_ITEMS);

  const siteUrl =
    process.env.RSS_SITE_URL ||
    "https://digitalgeosciences.github.io/dashboard3.2/";
  const nowRfc822 = new Date().toUTCString();

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">',
  );
  lines.push("  <channel>");
  lines.push("    <title>Integrative Dashboard</title>");
  lines.push(`    <link>${escapeXml(siteUrl)}</link>`);
  lines.push(
    "    <description>Recent publications with OpenAlex abstracts and topics.</description>",
  );
  lines.push(`    <lastBuildDate>${escapeXml(nowRfc822)}</lastBuildDate>`);
  lines.push("    <ttl>60</ttl>");

  for (const row of items) {
    const lookupUrl = buildLookupUrl(row, headers);
    if (!lookupUrl) continue;

    // Be polite to OpenAlex.
    await delay(REQUEST_DELAY_MS);
    const work = await fetchWork(lookupUrl);
    if (!work) continue;

    const title = work.title || row[titleKey] || "Untitled publication";
    const doiUrl = toDoiUrl(work.doi || (work.ids && work.ids.doi) || "");
    const openAlexId = work.id || toOpenAlexWorkUrl(lookupUrl);
    const openAlexLink =
      openAlexId && openAlexId.startsWith("http") ? openAlexId : "";

    const pubDate = work.publication_date || row[publicationDateKey] || "";
    const pubYear = work.publication_year || row[yearKey] || "";
    const citations = work.cited_by_count ?? "";
    const venue =
      (work.host_venue && work.host_venue.display_name) ||
      row[pickKey(headers, "venue")] ||
      "";

    const authors =
      (work.authorships || [])
        .map((a) => a.author && a.author.display_name)
        .filter(Boolean)
        .join(", ") || "";

    const concepts = (work.concepts || [])
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5)
      .map((c) => c.display_name)
      .filter(Boolean);

    const abstractText = reconstructAbstract(
      work.abstract_inverted_index,
      work.abstract || "",
    );
    const abstractTrimmed =
      abstractText.length > 1500
        ? `${abstractText.slice(0, 1500)}…`
        : abstractText;

    const link = doiUrl || openAlexLink || siteUrl;

    const descriptionLines = [];
    if (abstractTrimmed) descriptionLines.push(`Abstract: ${abstractTrimmed}`);
    if (concepts.length) descriptionLines.push(`Topics: ${concepts.join(", ")}`);
    if (venue) descriptionLines.push(`Venue: ${venue}`);
    if (pubYear) descriptionLines.push(`Year: ${pubYear}`);
    if (citations !== "") descriptionLines.push(`Citations: ${citations}`);
    const description = descriptionLines.join("\n");

    lines.push("    <item>");
    lines.push(`      <title>${escapeXml(title)}</title>`);
    lines.push(`      <link>${escapeXml(link)}</link>`);
    if (pubDate) {
      lines.push(`      <pubDate>${escapeXml(new Date(pubDate).toUTCString())}</pubDate>`);
    }
    if (openAlexId) {
      lines.push(
        `      <guid isPermaLink="false">${escapeXml(openAlexId)}</guid>`,
      );
    }
    if (authors) {
      lines.push(`      <dc:creator>${escapeXml(authors)}</dc:creator>`);
    }
    if (venue) {
      lines.push(`      <dc:publisher>${escapeXml(venue)}</dc:publisher>`);
    }
    for (const concept of concepts) {
      lines.push(`      <category>${escapeXml(concept)}</category>`);
    }
    if (description) {
      lines.push(
        `      <description>${escapeXml(description).replace(/\n/g, "&#10;")}</description>`,
      );
    }
    lines.push("    </item>");
  }

  lines.push("  </channel>");
  lines.push("</rss>");

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Feed written to ${outPath}`);
};

main().catch((err) => {
  console.error("Unexpected error generating feed:", err);
  process.exit(1);
});
