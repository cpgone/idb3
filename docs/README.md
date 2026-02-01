## Integrative Dashboard (IDB) Template Docs

This doc is for operators who maintain data/config files and regenerate the dashboard data.

### Key config files (`data/config/`)
- `authors-source.csv` — source of truth for authors (program, affiliation, OpenAlex IDs). Edit this first when adding/removing authors; all generated tables depend on it.
- `siteinfo.json` — shell branding and metadata (title, shortTitle, tagline, logoSrc, faviconSrc, description, author). Controls document title/meta/favicon.
- `announcement.json` — banner toggle/message/link and optional classes; set `enabled` to `false` to hide.
- `blacklist.csv` — works to hide (schema below). Loaded at runtime by `src/lib/blacklist.ts`.

#### Blacklist schema
Header (do not change):
```
scope,author_id,work_id,doi,title_slug,reason
```
- `scope`: `global` (applies everywhere) or `per-author` (only when viewing that author).
- Match by any of `work_id`, `doi`, or `title_slug` (lowercase slug of `title + year`; see slug logic in `src/lib/blacklist.ts`).
- Leave unused columns blank; `reason` is optional.

Examples:
```
global,,,10.1234/xyz123,,Duplicate record
per-author,jane-doe,work-abc-123,,contact-morphology-of-sand-particles-in-dunes-2020,Belongs to another author
```

### Add or update authors
1) Edit `data/config/authors-source.csv` (add/remove/update rows).
2) Regenerate data (see below) so generated tables pick up changes.

### Regenerate data
Runs the full pipeline end-to-end:
```bash
npm run refresh:data
```
This calls, in order:
- `npm run update:authors:openalex`
- `npm run generate:authors`
- `npm run clean:author-cache`
- `npm run cache:openalex-works`
- `npm run generate:works`

Notes:
- Requires network access while updating caches; the app runs offline afterward.
- Generated TS tables live under `src/data/*.generated.ts`.

### Feeds (RSS / enhanced feed)
- `npm run generate:rss` — builds `public/rss.xml` from `data/works.csv` (no external requests). Set `RSS_SITE_URL` to override the site link.
- `npm run generate:feed` — builds `public/feed.xml` with abstracts/topics. Reads `data/works.csv` for DOIs/OpenAlex IDs and may call OpenAlex; set `OPENALEX_MAILTO` (recommended), `FEED_LIMIT`, and `FEED_REQUEST_DELAY` as needed.
- Regenerate feeds after `data/works.csv` changes or before releasing.

### GitHub Pages deployment (static hosting)
- Build locally: `npm install && npm run build` (outputs to `dist/`).
- Publish the `dist/` folder to your GitHub Pages branch (e.g., `gh-pages`) or any static host.
- The Vite `base` is set to `/idb/` for production (see `vite.config.ts`). If you deploy under a different path, update `base` accordingly so assets resolve.
- CI auto-refresh (if enabled): `.github/workflows/refresh-data.yml` runs nightly (and on manual dispatch) to execute `npm run refresh:data`, regenerate feeds, and commit/push updates. If you disable that workflow, you must run the pipeline locally before deploying.
- Enable/disable the refresh workflow: in GitHub, go to **Actions** → **refresh data** → **…** menu → **Disable workflow** (or **Enable workflow** to re-activate). You can also edit `.github/workflows/refresh-data.yml` or delete it to remove automation; deleting/disabling stops automatic commits.

### Quick troubleshooting
- Missing authors or works: confirm they’re in `data/config/authors-source.csv`, rerun `npm run refresh:data`.
- Blacklist not applied: verify `data/config/blacklist.csv` header and values; slugs must be lowercase and match the title+year pattern.
- Branding/meta issues: check `data/config/siteinfo.json` and `data/config/announcement.json`. Run `npm run build` if static assets change.
