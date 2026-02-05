const fs = require('fs');
const path = require('path');
const root = 'd:/GitHub/CPGOne.com/idb3';

const worksText = fs.readFileSync(path.join(root, 'src/data/worksTable.generated.ts'), 'utf8');
const start = worksText.indexOf('export const worksTable');
const eqIdx = worksText.indexOf('= [', start);
const arrStart = worksText.indexOf('[', eqIdx);
const arrEnd = worksText.lastIndexOf('\n];');
const works = JSON.parse(worksText.slice(arrStart, arrEnd + 2));

const blacklistCsv = fs.readFileSync(path.join(root, 'data/config/blacklist.csv'), 'utf8');
const lines = blacklistCsv
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

const entries = [];
if (lines.length > 1) {
  const unquote = (s) => s.replace(/^"(.*)"$/, '$1');
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < 5) continue;
    const [scopeRaw, authorId, workId, doi, titleSlug] = cols.map(unquote);
    const scope = scopeRaw === 'per-author' ? 'per-author' : 'global';
    entries.push({
      scope,
      authorId: authorId?.trim().toLowerCase() || undefined,
      workId: workId || undefined,
      doi: doi || undefined,
      titleSlug: titleSlug?.trim().toLowerCase() || undefined,
    });
  }
}

const normalizeId = (value) => (value || '').trim().toLowerCase();
const canonicalWorkId = (value) =>
  normalizeId(value).replace(/^https?:\/\/(www\.)?openalex\.org\//, '');
const canonicalDoi = (value) =>
  normalizeId(value)
    .replace(/^https?:\/\/(www\.)?doi\.org\//, '')
    .replace(/^doi:/, '');
const slugify = (raw) => {
  if (!raw) return '';
  let s = raw.trim().toLowerCase();
  s = s.normalize('NFD').replace(/\p{M}+/gu, '');
  s = s.replace(/[\u2010-\u2015]/g, '-');
  s = s.replace(/[^\w\s-]/g, ' ');
  s = s.replace(/\s+/g, ' ');
  s = s.trim().replace(/\s+/g, '-');
  return s;
};

const globalIds = new Set();
const globalDois = new Set();
const globalSlugs = new Set();

const perAuthorIds = new Map();
const perAuthorDois = new Map();
const perAuthorSlugs = new Map();

const addToMap = (map, key, value) => {
  const existing = map.get(key) || new Set();
  existing.add(value);
  map.set(key, existing);
};

for (const entry of entries) {
  if (entry.scope === 'global') {
    if (entry.workId) globalIds.add(canonicalWorkId(entry.workId));
    if (entry.doi) globalDois.add(canonicalDoi(entry.doi));
    if (entry.titleSlug) globalSlugs.add(entry.titleSlug);
  } else if (entry.scope === 'per-author' && entry.authorId) {
    const authorKey = normalizeId(entry.authorId);
    if (entry.workId) addToMap(perAuthorIds, authorKey, canonicalWorkId(entry.workId));
    if (entry.doi) addToMap(perAuthorDois, authorKey, canonicalDoi(entry.doi));
    if (entry.titleSlug) addToMap(perAuthorSlugs, authorKey, entry.titleSlug);
  }
}

const normalizeWorkId = (work) => canonicalWorkId(work.workId);
const normalizeDoiValue = (work) => canonicalDoi(work.doi);
const workSlug = (work) => slugify(`${work.title || ''} ${work.year != null ? work.year : ''}`);

const isBlacklisted = (work, authorId) => {
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

const cleanWorks = works.filter((w) => !isBlacklisted(w));
const allTopics = new Set();
const topicsAorB = new Set();
const topicsOnlyAfter2025 = new Set();
const topicsOnlyBefore1970 = new Set();
const topicsOnlyOutsideAB = new Set();

const A_FROM = 1970;
const A_TO = 2014;
const B_FROM = 2015;
const B_TO = 2025;

for (const work of cleanWorks) {
  const year = work.year;
  const topics = work.topics || [];
  for (const topic of topics) {
    if (!topic) continue;
    allTopics.add(topic);
    const inA = typeof year === 'number' && year >= A_FROM && year <= A_TO;
    const inB = typeof year === 'number' && year >= B_FROM && year <= B_TO;
    if (inA || inB) topicsAorB.add(topic);
  }
}

for (const topic of allTopics) {
  if (!topicsAorB.has(topic)) topicsOnlyOutsideAB.add(topic);
}

// find which of those are only in 2026 (or outside)
const topicYears = new Map();
for (const work of cleanWorks) {
  if (typeof work.year !== 'number') continue;
  for (const topic of work.topics || []) {
    if (!topic) continue;
    const set = topicYears.get(topic) || new Set();
    set.add(work.year);
    topicYears.set(topic, set);
  }
}

let only2026 = 0;
let onlyAfter2025 = 0;
let onlyBefore1970 = 0;
let onlyOutside = 0;
for (const topic of topicsOnlyOutsideAB) {
  const years = topicYears.get(topic) || new Set();
  const ys = [...years];
  const max = Math.max(...ys);
  const min = Math.min(...ys);
  if (ys.length === 1 && ys[0] === 2026) only2026 += 1;
  if (min > 2025) onlyAfter2025 += 1;
  if (max < 1970) onlyBefore1970 += 1;
  if (!(max >= 1970 && min <= 2025)) onlyOutside += 1;
}

console.log(
  JSON.stringify(
    {
      allTopics: allTopics.size,
      topicsInAorB: topicsAorB.size,
      diff: allTopics.size - topicsAorB.size,
      only2026,
      onlyAfter2025,
      onlyBefore1970,
      onlyOutside,
    },
    null,
    2,
  ),
);
