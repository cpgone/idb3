import blacklistCsv from "../../data/config/blacklist.csv?raw";
import { worksTable } from "@/data/worksTable.generated";

type Work = (typeof worksTable)[number];

type BlacklistEntry = {
  scope: "global" | "per-author";
  authorId?: string;
  workId?: string;
  doi?: string;
  titleSlug?: string;
};

const normalizeId = (value: string | undefined | null) =>
  (value || "").trim().toLowerCase();

const canonicalWorkId = (value: string | undefined | null) => {
  const normalized = normalizeId(value);
  return normalized.replace(/^https?:\/\/(www\.)?openalex\.org\//, "");
};

const canonicalDoi = (value: string | undefined | null) => {
  const normalized = normalizeId(value);
  return normalized.replace(/^https?:\/\/(www\.)?doi\.org\//, "").replace(/^doi:/, "");
};

const slugify = (raw: string) => {
  if (!raw) return "";
  let s = raw.trim().toLowerCase();
  s = s.normalize("NFD").replace(/\p{M}+/gu, "");
  s = s.replace(/[\u2010-\u2015]/g, "-");
  s = s.replace(/[^\w\s-]/g, " ");
  s = s.replace(/\s+/g, " ");
  s = s.trim().replace(/\s+/g, "-");
  return s;
};

const parseCsv = () => {
  const lines = blacklistCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const entries: BlacklistEntry[] = [];
  if (lines.length <= 1) return entries; // header only or empty

  // Expect header: scope,author_id,work_id,doi,title_slug,reason
  const unquote = (s: string) => s.replace(/^"(.*)"$/, "$1");

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 5) continue;
    const [scopeRaw, authorId, workId, doi, titleSlug] = cols.map(unquote);
    const scope = scopeRaw === "per-author" ? "per-author" : "global";
    entries.push({
      scope,
      authorId: normalizeId(authorId) || undefined,
      workId: canonicalWorkId(workId) || undefined,
      doi: canonicalDoi(doi) || undefined,
      titleSlug: normalizeId(titleSlug) || undefined,
    });
  }
  return entries;
};

const blacklistEntries = parseCsv();

const globalIds = new Set<string>();
const globalDois = new Set<string>();
const globalSlugs = new Set<string>();

const perAuthorIds = new Map<string, Set<string>>();
const perAuthorDois = new Map<string, Set<string>>();
const perAuthorSlugs = new Map<string, Set<string>>();

const addToMap = (map: Map<string, Set<string>>, key: string, value: string) => {
  const existing = map.get(key) ?? new Set<string>();
  existing.add(value);
  map.set(key, existing);
};

for (const entry of blacklistEntries) {
  if (entry.scope === "global") {
    if (entry.workId) globalIds.add(entry.workId);
    if (entry.doi) globalDois.add(entry.doi);
    if (entry.titleSlug) globalSlugs.add(entry.titleSlug);
  } else if (entry.scope === "per-author" && entry.authorId) {
    if (entry.workId) addToMap(perAuthorIds, entry.authorId, entry.workId);
    if (entry.doi) addToMap(perAuthorDois, entry.authorId, entry.doi);
    if (entry.titleSlug) addToMap(perAuthorSlugs, entry.authorId, entry.titleSlug);
  }
}

const normalizeWorkId = (work: Work) => canonicalWorkId(work.workId);
const normalizeDoiValue = (work: Work) => canonicalDoi(work.doi);
const workSlug = (work: Work) =>
  slugify(`${work.title || ""} ${work.year != null ? work.year : ""}`);

const isMatch = (work: Work, authorId?: string) => {
  const id = normalizeWorkId(work);
  const doi = normalizeDoiValue(work);
  const slug = normalizeId(workSlug(work));

  if (id && globalIds.has(id)) return true;
  if (doi && globalDois.has(doi)) return true;
  if (slug && globalSlugs.has(slug)) return true;

  const authorKey = normalizeId(authorId);
  if (authorKey) {
    if (id && (perAuthorIds.get(authorKey)?.has(id) ?? false)) return true;
    if (doi && (perAuthorDois.get(authorKey)?.has(doi) ?? false)) return true;
    if (slug && (perAuthorSlugs.get(authorKey)?.has(slug) ?? false)) return true;
  }

  return false;
};

export const isBlacklisted = (work: Work, authorId?: string) =>
  isMatch(work, authorId);

export const filterWorks = (works: Work[], authorId?: string) =>
  works.filter((w) => !isBlacklisted(w, authorId));
