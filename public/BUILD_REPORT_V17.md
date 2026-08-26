# GameFinder v17 — Rich Metadata Search

- Catalog target: 10,000
- Rich metadata schema: added
- Existing 400 normalized into rich seed: yes
- Rich bulk-import pipeline: added
- Browser rich-filter UI: added
- Filters: genre / review score / price / Japanese / platform / metadata completeness
- Metadata completeness bar: added
- Unknown values remain null; title-based guessing is prohibited.
- Firebase static-hosting limitation documented: Steam APIs are not fetched directly from the browser at scale.
- Internal root-relative link errors: 0
- catalog-10000.js present: True
- catalog-rich-v17.js present: True

## Real-data sources supported by the importer
- Steam Dataset-style bulk CSV: release / price / platform / genre / reviews / RAM where available.
- SteamSpy bulk JSON snapshots: developer / publisher / reviews / owners / playtime / price / languages / genres / tags.

## Important limitation
- This build includes the importer and rich search architecture, but does not claim that all 9,600 external records already contain every rich field.
- `/data/catalog-rich-10000.json` becomes authoritative when a real bulk snapshot is imported.
- Until then, v17 falls back to v16 identity data plus the normalized 400-game editorial seed.