
(() => {
  const TARGET = 10000;
  const SOURCE = "https://raw.githubusercontent.com/jsnli/steamappidlist/master/data/games_appid.json";
  const CACHE_KEY = "gamefinder-steam-catalog-v16";
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const SOURCE_CHECKED = "2026-08-26";

  // Teen-facing exclusion based on the fields available from the title/AppID list.
  // We do not attempt to guess other metadata that is not present.
  const RESTRICTED_TITLE_TERMS = [
    "hentai","porn","porno","erotic","erotica","nsfw","sex simulator","sex game",
    "adult only","18+","xxx","nude","nudity",
    "casino","roulette","blackjack","poker","slot machine","slots casino",
    "sports betting","betting","gambling"
  ];
  const isSafeTitle = name => {
    const t = String(name || "").toLowerCase();
    return !RESTRICTED_TITLE_TERMS.some(x => t.includes(x));
  };

  const normalize = (x) => {
    if (!x || typeof x !== "object") return null;
    const appid = Number(x.appid ?? x.app_id ?? x.id ?? x.appId);
    const name = String(x.name ?? x.title ?? x.app_name ?? "").trim();
    if (!Number.isFinite(appid) || !name || !isSafeTitle(name)) return null;
    return { appid, name };
  };

  function extract(payload) {
    const out = [];
    const seenObj = new Set();
    const walk = (value, depth=0) => {
      if (depth > 6 || value == null) return;
      if (Array.isArray(value)) {
        for (const v of value) walk(v, depth+1);
        return;
      }
      if (typeof value !== "object") return;
      const n = normalize(value);
      if (n) out.push(n);
      if (seenObj.has(value)) return;
      seenObj.add(value);
      for (const [k,v] of Object.entries(value)) {
        if (["appid","app_id","id","appId","name","title","app_name"].includes(k)) continue;
        if (Array.isArray(v) || (v && typeof v === "object")) walk(v, depth+1);
      }
    };
    walk(payload);
    const unique = new Map();
    for (const x of out) if (!unique.has(x.appid)) unique.set(x.appid, x);
    return [...unique.values()];
  }

  async function getExternal() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c && Date.now() - c.time < CACHE_TTL && Array.isArray(c.items) && c.items.length >= 10000) {
        return c.items;
      }
    } catch {}

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const res = await fetch(SOURCE, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error("catalog HTTP " + res.status);
      const payload = await res.json();
      const items = extract(payload);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), items }));
      } catch {}
      return items;
    } finally {
      clearTimeout(timer);
    }
  }

  async function buildCatalog() {
    const localRes = await fetch("/data/games.json", { cache: "no-store" });
    const local = await localRes.json();

    const merged = [];
    const usedApp = new Set();
    const usedName = new Set();

    for (const g of local) {
      const item = {
        appid: Number(g.appid) || null,
        name: g.title,
        slug: g.slug,
        image: g.image || g.fallbackImage || "/assets/og.svg",
        officialStoreUrl: g.appid ? `https://store.steampowered.com/app/${g.appid}/` : "",
        genres: g.genres || [],
        multiplayer: g.multiplayer || "",
        priceLabel: g.priceLabel || "",
        japanese: g.japanese ?? null,
        pcLoadEditorial: g.pcLoadEditorial || "",
        discoveryScore: Number(g.discoveryScore || 0),
        summary: g.summary || "",
        bestFor: g.bestFor || "",
        editorialStatus: g.editorialStatus || "catalog",
        enrichment: "editorial-plus",
        source: "GameFinder local editorial dataset",
        sourceChecked: SOURCE_CHECKED
      };
      merged.push(item);
      if (item.appid) usedApp.add(item.appid);
      usedName.add(item.name.toLowerCase());
    }

    let external = [];
    try { external = await getExternal(); }
    catch (e) { console.warn("GameFinder external catalog unavailable:", e); }

    for (const x of external) {
      if (merged.length >= TARGET) break;
      if (usedApp.has(x.appid) || usedName.has(x.name.toLowerCase())) continue;
      usedApp.add(x.appid);
      usedName.add(x.name.toLowerCase());

      merged.push({
        appid: x.appid,
        name: x.name,
        slug: "",
        image: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${x.appid}/header.jpg`,
        officialStoreUrl: `https://store.steampowered.com/app/${x.appid}/`,
        genres: null,
        multiplayer: null,
        priceLabel: null,
        japanese: null,
        pcLoadEditorial: null,
        discoveryScore: null,
        summary: null,
        bestFor: null,
        editorialStatus: "external-enriched",
        enrichment: "enriched-core",
        source: "jsnli/steamappidlist (Steam AppID/title list)",
        sourceChecked: SOURCE_CHECKED
      });
    }

    return merged.slice(0, TARGET);
  }

  window.GameFinderCatalogV16 = buildCatalog();
window.GameFinderCatalog = window.GameFinderCatalogV16;
  window.GameFinderCatalog.then(items => {
    window.dispatchEvent(new CustomEvent("gf:catalog-ready", { detail: { items, count: items.length } }));
  });
})();
