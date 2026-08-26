
(() => {
  window.GameFinderRouteFor = g => g.slug ? `/games/${g.slug}.html` : `/game/?appid=${g.appid}`;
  window.GameFinderBuildRouteManifest = async () => {
    const all=await window.GameFinderRichCatalog;
    return all.map(g=>({
      appid:g.appid,
      name:g.name,
      url:window.GameFinderRouteFor(g),
      level:(g.metadata_level==="editorial-plus"||g.enrichment==="editorial-plus")?"editorial-plus":"enriched-core",
      metadata_completeness:Number(g.metadata_completeness||0)
    }));
  };
})();
