# GameFinder v18 — Discovery Engine

- Target catalog: 10,000 games
- Combined filters: title/text, multiple genres, multiple tags, review score, price/free, Japanese, platform, average playtime, metadata completeness, play style, Editorial Plus only
- Sorts: smart, review, popularity/review volume, playtime, price asc/desc, metadata completeness, name
- Presets: 6
- Saved filter state: localStorage
- Random pick from current filter: added
- Compare shortlist: up to 4 games
- Unknown metadata policy: unknown values do not match positive filter conditions
- Metadata-level badges: Editorial Plus / Enriched Core

## Discovery examples
- Co-op × 80%+ × $20 or less
- Linux × Strategy
- 30h+ average playtime × 80%+
- Japanese × 85%+
- Free × 80%+
- Editorial Plus only

## Integrity rule
- A game with unknown Linux support does not appear in a Linux-only result.
- A game with unknown review score does not appear in an 85%+ result.
- This keeps discovery precision higher than filling unknown fields with guesses.
- Internal root-relative link errors: 0
