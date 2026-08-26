# GameFinder v22 — 10,000 Structured Game Pages

- Catalog target: 10,000
- Editorial Plus Dossier pages: existing enriched static pages retained
- Enriched Core individual URLs: `/game/?appid=<SteamAppID>`
- Dynamic structured page shell: added
- Every catalog result now has a GameFinder-local detail URL
- Structured fields: price, review, playtime, Japanese, platform, genres, tags, developer, publisher, release, owners, CCU, play style, PC load, metadata completeness
- Related games: calculated from verified Genre / Tag overlap
- My GameFinder favorite/wishlist: supported on structured pages
- Steam official link: retained
- Dynamic Core pages: noindex,follow by default and excluded from sitemap
- Unknown attributes: rendered as 不明; no prose inference
- Internal root-relative link errors: 0

## Architecture decision
- We intentionally do not create 9,600 duplicated thin HTML files.
- One structured shell produces a unique URL per AppID and reads the same 10,000-game catalog.
- This reduces stale duplicated metadata and keeps updates centralized.
- The 400 Editorial Plus games keep their richer dedicated Dossier URLs.

## Indexing policy
- Enriched Core dynamic pages are noindex until metadata depth is high enough for an actual editorial promotion.
- This prevents 9,600 low-information query pages from becoming thin indexed pages.