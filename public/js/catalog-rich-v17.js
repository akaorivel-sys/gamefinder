
(() => {
  const TARGET=10000;
  const RICH="/data/catalog-rich-10000.json";
  const SEED="/data/catalog-rich-seed.json";

  async function json(url){
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok) throw new Error(url+" "+r.status);
    return r.json();
  }
  function titleSafe(name){
    const t=String(name||"").toLowerCase();
    const bad=["hentai","porn","porno","erotic","erotica","nsfw","sex simulator","sex game","adult only","18+","xxx","casino","roulette","blackjack","poker","slot machine","slots casino","sports betting","betting","gambling"];
    return !bad.some(x=>t.includes(x));
  }
  function normalize(g){
    const pos=Number(g.positive), neg=Number(g.negative);
    if(g.review_score==null && Number.isFinite(pos)&&Number.isFinite(neg)&&pos+neg>0) g.review_score=pos/(pos+neg);
    if(g.languages && g.japanese==null) g.japanese=g.languages.some(x=>String(x).toLowerCase()==="japanese");
    g.metadata_completeness=Number(g.metadata_completeness||0);
    g.image=g.image||(`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`);
    g.official_store_url=g.official_store_url||g.officialStoreUrl||(`https://store.steampowered.com/app/${g.appid}/`);
    return g;
  }

  async function build(){
    let rich=[];
    try { rich=await json(RICH); } catch {}
    if(Array.isArray(rich) && rich.length>=1000){
      return rich.filter(x=>titleSafe(x.name)).map(normalize).slice(0,TARGET);
    }

    // fallback to the existing v16 identity catalog plus 400 normalized seed rows
    let identity=[];
    if(window.GameFinderCatalogV16) identity=await window.GameFinderCatalogV16;
    else if(window.GameFinderCatalog) {
      try { identity=await window.GameFinderCatalog; } catch {}
    }
    let seed=[];
    try { seed=await json(SEED); } catch {}
    const sm=new Map(seed.filter(x=>x.appid).map(x=>[Number(x.appid),x]));
    return (identity||[]).filter(x=>titleSafe(x.name)).map(x=>normalize({...x,...(sm.get(Number(x.appid))||{})})).slice(0,TARGET);
  }

  window.GameFinderRichCatalog=build();
  window.GameFinderRichCatalog.then(items=>{
    window.dispatchEvent(new CustomEvent("gf:rich-ready",{detail:{items,count:items.length}}));
  });
})();
