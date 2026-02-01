// Simple Node script to turn data/config/authors-source.csv into src/data/authors.generated.ts
// Run with: npm run generate:authors

const fs = require("fs");
const path = require("path");
const {
  readAuthorsSourceRaw,
  normalizeAuthorRow,
  AUTHORS_SOURCE_PATH,
} = require("./lib/readAuthorsSource.cjs");

const ROOT = path.resolve(__dirname, "..");
const outPath = path.join(ROOT, "src", "data", "authors.generated.ts");

const { rows: authorRows } = readAuthorsSourceRaw();

const authors = authorRows.map((row) => {
  const normalized = normalizeAuthorRow(row);
  const nameFromParts = [normalized.firstName, normalized.lastName || normalized.otherLastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    authorId: normalized.internalId || normalized.email || normalized.primaryOpenAlexId,
    openAlexId: normalized.primaryOpenAlexId,
    openAlexIds: normalized.openAlexIds,
    name: nameFromParts,
    groupId: normalized.program || "",
    groupName: normalized.program || "",
    affiliate1: normalized.affiliate1 || "",
    affiliate2: normalized.affiliate2 || "",
    affiliate3: normalized.affiliate3 || "",
    email: normalized.email || "",
    orcid: normalized.orcid || "",
    totalPublications: normalized.totalPublications,
    totalCitations: normalized.totalCitations,
    hIndex: normalized.hIndex,
  };
}).filter((a) => a.authorId && (a.name || a.email || a.openAlexId));

const fileContents = `// AUTO-GENERATED FILE. DO NOT EDIT.
// Generated from data/config/authors-source.csv by scripts/generate-authors.cjs

export interface AuthorRecord {
  authorId: string;
  openAlexId: string;
  openAlexIds: string[];
  name: string;
  groupId: string;
  groupName: string;
  affiliate1: string;
  affiliate2: string;
  affiliate3: string;
  email: string;
  orcid: string;
  totalPublications: number;
  totalCitations: number;
  hIndex: number;
}

export const authors: AuthorRecord[] = ${JSON.stringify(authors, null, 2)};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, fileContents, "utf8");

console.log(
  `Generated ${path.relative(ROOT, outPath)} from ${path.relative(
    ROOT,
    AUTHORS_SOURCE_PATH,
  )}`,
);
