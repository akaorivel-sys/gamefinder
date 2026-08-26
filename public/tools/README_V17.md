# GameFinder v17 Rich Metadata Import

v17の検索UIは `/data/catalog-rich-10000.json` が存在すると自動的にそれを利用します。

## Recommended sources

### Steam Dataset 2025
- 134k+ successful application metadata
- release date / price / platform / primary genre / reviews / RAM columns
- CC BY 4.0 dataset
- Source snapshot is 2025, so price and review counts are not real-time.

### SteamSpy bulk snapshots
- `request=all&page=N`
- developer / publisher / owner estimate / playtime / price / languages / genre / tags / reviews
- SteamSpy documents 1,000 entries per page and a strict `all` rate limit; cache the results and do not poll repeatedly.

## Build

```bash
python tools/build_rich_catalog.py \
  --seed data/catalog-rich-seed.json \
  --steam-dataset /path/to/steam_games.csv \
  --steamspy-dir /path/to/steamspy-pages \
  --out data/catalog-rich-10000.json \
  --limit 10000
```

Unknown fields remain null. Adult/sexual and gambling-related titles are filtered from the teen-facing catalog by available title fields.
