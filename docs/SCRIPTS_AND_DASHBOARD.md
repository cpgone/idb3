# Scripts and Dashboard Flow

This doc explains each script under `scripts/` and how data moves through the dashboard.

## Scripts (one by one)

### `update-authors-from-openalex.cjs`
- Purpose: Update `data/config/authors-source.csv` with OpenAlex totals.
- Inputs: `data/config/authors-source.csv`
- Outputs: same CSV (updates `total_publications`, `total_citations`, `h_index`)
- Network: Yes (OpenAlex API)
- Env:
  - `OPENALEX_MAILTO` is not used here; it hardcodes `research@example.com`

### `generate-authors.cjs`
- Purpose: Build `src/data/authors.generated.ts` for the app.
- Inputs: `data/config/authors-source.csv`
- Outputs: `src/data/authors.generated.ts`

### `generate-author-identifiers.cjs`
- Purpose: Export identifiers (e.g., Scopus) for authors.
- Inputs: `data/config/authors-source.csv`
- Outputs: `src/data/authorIdentifiers.generated.ts`

### `cache-openalex-works.cjs`
- Purpose: Cache OpenAlex author details + all works locally.
- Inputs: `data/config/authors-source.csv`
- Outputs: `public/author-data/<openalex_id>.json`
- Network: Yes (OpenAlex API, paginated)
- Env:
  - `OPENALEX_MAILTO` (optional; defaults to `research@example.com`)

### `clean-author-cache.cjs`
- Purpose: Remove stale `public/author-data/*.json` not in the current author CSV.
- Inputs: `data/config/authors-source.csv`, `public/author-data/`
- Outputs: deletes stale JSON files

### `export-works.cjs`
- Purpose: Flatten cached OpenAlex works into CSVs.
- Inputs: `public/author-data/*.json`, `data/config/authors-source.csv`
- Outputs:
  - `data/works.csv`
  - `data/work_topics.csv`
  - `data/work_institutions.csv`

### `generate-works-table.cjs`
- Purpose: Build the main UI dataset from CSVs.
- Inputs: `data/works.csv`, `data/work_topics.csv`, `data/work_institutions.csv`
- Outputs: `src/data/worksTable.generated.ts`

### `generate-topic-institution-stats.cjs`
- Purpose: Aggregate topic/institution totals for listing pages.
- Inputs: `data/works.csv`, `data/work_topics.csv`, `data/work_institutions.csv`
- Outputs: `src/data/topicInstitutionStats.generated.ts`

### `generate-author-work-metrics.cjs`
- Purpose: Minimal per-author per-year citations for charts/metrics.
- Inputs: `data/works.csv`
- Outputs: `src/data/authorWorkMetrics.generated.ts`

### `generate-rss.cjs`
- Purpose: Create a basic RSS feed from `data/works.csv`.
- Inputs: `data/works.csv`
- Outputs: `public/rss.xml`
- Env:
  - `RSS_SITE_URL` (optional; default points to GitHub Pages)

### `generate-feed.cjs`
- Purpose: Create a richer feed with OpenAlex abstracts/topics.
- Inputs: `data/works.csv`
- Outputs: `public/feed.xml`
- Network: Yes (OpenAlex API per work)
- Env:
  - `OPENALEX_MAILTO` (optional)
  - `FEED_LIMIT` (optional, default 100)
  - `FEED_REQUEST_DELAY` (optional, default 200ms)
  - `RSS_SITE_URL` (optional)

## Standard refresh pipeline

The `npm run refresh:data` script runs:
1) `update:authors:openalex`
2) `generate:authors`
3) `clean:author-cache`
4) `cache:openalex-works`
5) `generate:works` (which chains `export-works`, `generate-works-table`, `generate-topic-institution-stats`, `generate-author-work-metrics`, `generate-rss`)
6) `generate:feed`

## Dashboard data flow (high level)

1) **Source config**
   - `data/config/authors-source.csv` is the source of truth.
   - Other config lives in `data/config/*.json` (siteinfo, announcement, etc.).

2) **Cache OpenAlex**
   - `cache-openalex-works.cjs` writes `public/author-data/*.json`.

3) **Flatten to CSV**
   - `export-works.cjs` produces `data/works.csv` plus topic/institution link tables.

4) **Generate TS tables**
   - `generate-works-table.cjs` → `src/data/worksTable.generated.ts`
   - `generate-topic-institution-stats.cjs` → `src/data/topicInstitutionStats.generated.ts`
   - `generate-author-work-metrics.cjs` → `src/data/authorWorkMetrics.generated.ts`
   - `generate-authors.cjs` → `src/data/authors.generated.ts`
   - `generate-author-identifiers.cjs` → `src/data/authorIdentifiers.generated.ts`

5) **UI pages consume generated tables**
- `src/pages/Index.tsx` (dashboard)
- `src/pages/Authors.tsx` / `AuthorDetail.tsx`
- `src/pages/Publications.tsx`, `Topics.tsx`, `Institutions.tsx`
- `src/pages/AuthorNetwork.tsx` (co-author network uses `worksTable` snapshot)
- `src/pages/Insights.tsx` (topic insights)

## How the dashboard works (summary)

- The app runs **offline** once generated tables exist.
- Filters/search/sort operate on `worksTable` or `topicInstitutionStats` in memory.
- The author detail page combines:
  - cached author details (`public/author-data/*.json`),
  - generated works table,
  - derived summaries (publications, citations, topics, institutions, h-index).
