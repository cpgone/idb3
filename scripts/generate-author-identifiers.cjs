const fs = require("fs");
const path = require("path");
const {
  readAuthorsSourceRaw,
  normalizeAuthorRow,
} = require("./lib/readAuthorsSource.cjs");

const ROOT = path.resolve(__dirname, "..");
const outPath = path.join(ROOT, "src", "data", "authorIdentifiers.generated.ts");

const { rows: rawRows } = readAuthorsSourceRaw();

const identifiers = rawRows.reduce((acc, row) => {
  const normalized = normalizeAuthorRow(row);
  const key = normalized.internalId || normalized.email || normalized.primaryOpenAlexId;
  if (!key) return acc;
  if (!normalized.scopusId) return acc;
  acc[key] = { scopusId: normalized.scopusId };
  return acc;
}, {});

const fileContents = `// AUTO-GENERATED FILE. DO NOT EDIT.
// Generated from data/config/authors-source.csv by scripts/generate-author-identifiers.cjs

export interface AuthorIdentifiers {
  scopusId?: string;
}

export const authorIdentifiers: Record<string, AuthorIdentifiers> = ${JSON.stringify(
  identifiers,
  null,
  2,
)};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, fileContents, "utf8");

console.log(`Generated ${path.relative(ROOT, outPath)}`);
