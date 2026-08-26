
(() => {
  const root=document.getElementById("v22-game-root");
  const qs=new URLSearchParams(location.search);
  const appid=Number(qs.get("appid")||0);
  const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const known=x=>x!==null&&x!==undefined&&x!==""&&!(Array.isArray(x)&&x.length===0);
  const plus=x=>(x.metadata_level==="editorial-plus"||x.enrichment==="editorial-plus");

  const fmtPrice=x=>{
    if(!known(x.price_cents)) return "不明";
    return Number(x.price_cents)===0?"Free":"$"+(Number(x.price_cents)/100).toFixed(2);
  };
  const fmtReview=x=>known(x.review_score)?Math.round(Number(x.review_score)*100)+"%":"不明";
  const fmtPlay=x=>{
    if(!known(x.average_forever_min)) return "不明";
    const h=Number(x.average_forever_min)/60;
    return h>=10?Math.round(h)+"時間":h.toFixed(1)+"時間";
  };
  const yesNo=v=>v===true?"対応":v===false?"非対応":"不明";
  const platform=x=>{
    const a=[];
    if(x.platform_windows===true)a.push("Windows");
    if(x.platform_mac===true)a.push("Mac");
    if(x.platform_linux===true)a.push("Linux");
    return a.length?a.join(" / "):"不明";
  };
  const store=x=>x.official_store_url||x.officialStoreUrl||`https://store.steampowered.com/app/${x.appid}/`;

  function field(label,value,note=""){
    return `<div class="v22-field"><span>${safe(label)}</span><b>${safe(known(value)?value:"不明")}</b>${note?`<small>${safe(note)}</small>`:""}</div>`;
  }

  function related(all,x){
    const gs=new Set((x.genres||[]).map(v=>String(v).toLowerCase()));
    const ts=new Set((x.tags||[]).map(v=>String(v).toLowerCase()));
    const arr=all.filter(g=>Number(g.appid)!==Number(x.appid)).map(g=>{
      let score=0;
      for(const v of (g.genres||[])) if(gs.has(String(v).toLowerCase())) score+=3;
      for(const v of (g.tags||[])) if(ts.has(String(v).toLowerCase())) score+=1;
      if(g.japanese===true && x.japanese===true) score+=.5;
      return {g,score};
    }).filter(o=>o.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
    return arr.map(({g})=>{
      const url=g.slug?`/games/${safe(g.slug)}.html`:`/game/?appid=${g.appid}`;
      return `<a href="${url}"><img loading="lazy" src="${safe(g.image||"/assets/og.svg")}" onerror="this.src='/assets/og.svg'" alt=""><span><b>${safe(g.name)}</b><small>${safe((g.genres||[]).slice(0,2).join(" / ")||"Metadata Core")}</small></span></a>`;
    }).join("");
  }

  function completenessFields(x){
    const checks=[
      ["Genre",known(x.genres)],["Tags",known(x.tags)],["Language",known(x.languages)||x.japanese!==null&&x.japanese!==undefined],
      ["Price",known(x.price_cents)],["Review",known(x.review_score)],["Playtime",known(x.average_forever_min)],
      ["Platform",x.platform_windows!==undefined||x.platform_mac!==undefined||x.platform_linux!==undefined],
      ["Developer",known(x.developer)],["Publisher",known(x.publisher)],["Release",known(x.release_date)]
    ];
    return checks.map(([a,b])=>`<span class="${b?"known":"unknown"}">${b?"✓":"—"} ${a}</span>`).join("");
  }

  function render(all,x){
    const image=x.image||`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${x.appid}/header.jpg`;
    const level=plus(x)?"EDITORIAL PLUS":"ENRICHED CORE";
    const comp=Number(x.metadata_completeness||0);
    const canonical=x.slug?`${location.origin}/games/${x.slug}.html`:`${location.origin}/game/?appid=${x.appid}`;

    document.title=`${x.name} | GameFinder`;
    const desc=x.summary||`${x.name}のSteam AppID・価格・レビュー・Platformなど、取得済みMetadataを表示。`;
    let md=document.querySelector('meta[name="description"]'); if(md) md.content=desc;
    let ca=document.querySelector('link[rel="canonical"]'); if(ca) ca.href=canonical;

    root.innerHTML=`
      <section class="v22-hero"><div class="v9-wrap v22-hero-grid">
        <div class="v22-cover"><img src="${safe(image)}" onerror="this.src='/assets/og.svg'" alt="${safe(x.name)}"><span>${level}</span></div>
        <div class="v22-hero-copy">
          <span class="v13-label">STRUCTURED GAME PAGE / APPID ${x.appid}</span>
          <h1>${safe(x.name)}</h1>
          <p>${safe(x.summary||"このページは、取得済みの実Metadataだけで構成しています。未確認項目は推測せず「不明」と表示します。")}</p>
          <div class="v22-actions">
            ${x.slug?`<a class="v11-primary-cta" href="/games/${safe(x.slug)}.html">Expert Dossier</a>`:""}
            <a class="v11-secondary-cta" href="${safe(store(x))}" target="_blank" rel="noopener nofollow">Steam</a>
            <button data-favorite="${x.appid}" data-appid="${x.appid}" data-title="${safe(x.name)}" data-image="${safe(image)}" data-slug="${x.slug?`/games/${safe(x.slug)}.html`:`/game/?appid=${x.appid}`}" data-label>☆ お気に入り</button>
            <button data-wishlist="${x.appid}" data-appid="${x.appid}" data-title="${safe(x.name)}" data-image="${safe(image)}" data-slug="${x.slug?`/games/${safe(x.slug)}.html`:`/game/?appid=${x.appid}`}" data-label>＋ 遊びたい</button>
          </div>
        </div>
      </div></section>

      <section class="v22-snapshot"><div class="v9-wrap">
        <div class="v22-section-head"><span>AT A GLANCE</span><h2>まず確認できる数字だけを見る。</h2></div>
        <div class="v22-snapshot-grid">
          ${field("価格",fmtPrice(x))}
          ${field("Review",fmtReview(x),known(x.positive)?`${Number(x.positive).toLocaleString()} positive`:"")}
          ${field("平均Playtime",fmtPlay(x))}
          ${field("日本語",yesNo(x.japanese))}
          ${field("Platform",platform(x))}
          ${field("Metadata",comp+"%",level)}
        </div>
      </div></section>

      <section class="v22-metadata"><div class="v9-wrap v22-meta-layout">
        <div>
          <div class="v22-section-head"><span>VERIFIED METADATA</span><h2>確認できた属性</h2></div>
          <div class="v22-meta-table">
            ${field("ジャンル",(x.genres||[]).join(" / "))}
            ${field("タグ",(x.tags||[]).slice(0,12).join(" / "))}
            ${field("Developer",x.developer)}
            ${field("Publisher",x.publisher)}
            ${field("Release",x.release_date)}
            ${field("Owners",x.owners)}
            ${field("Median Playtime",known(x.median_forever_min)?Math.round(Number(x.median_forever_min)/60)+"時間":"不明")}
            ${field("CCU",x.ccu)}
            ${field("Play style",x.multiplayer_editorial||x.multiplayer)}
            ${field("PC負荷",x.pc_load_editorial||x.pcLoadEditorial)}
          </div>
        </div>
        <aside>
          <span>METADATA COVERAGE</span><b>${comp}%</b>
          <div class="v22-meter"><i style="width:${Math.max(2,comp)}%"></i></div>
          <div class="v22-coverage-list">${completenessFields(x)}</div>
          <p>空欄はAIで補完しません。新しいBulk snapshotで確認できた項目だけ増えていきます。</p>
          <a href="/metadata/">Metadata方針 →</a>
        </aside>
      </div></section>

      ${x.best_for?`<section class="v22-editorial"><div class="v9-wrap"><span>GAMEFINDER CONTEXT</span><h2>どんな人向け？</h2><p>${safe(x.best_for||x.bestFor)}</p></div></section>`:""}

      <section class="v22-related"><div class="v9-wrap">
        <div class="v22-section-head"><span>RELATED</span><h2>取得済みGenre / Tagが近いゲーム</h2></div>
        <div class="v22-related-grid">${related(all,x)||'<p class="v22-related-empty">関連付けに必要なGenre / Tagがまだ不足しています。</p>'}</div>
      </div></section>

      <section class="v22-source"><div class="v9-wrap">
        <span>DATA SOURCE</span>
        <p>${safe(x.metadata_source||x.source||"Steam identity catalog")} · checked ${safe(x.metadata_checked||x.sourceChecked||"source snapshot")}</p>
        <p>価格・Review件数・Player数などは取得時点のSnapshotです。購入前の最終確認はSteam公式Storeで行ってください。</p>
      </div></section>
    `;

    window.MyGameFinder?.syncButtons?.();
  }

  async function init(){
    if(!appid){
      root.innerHTML=`<section class="v22-error"><div class="v9-wrap"><h1>AppIDが指定されていません。</h1><p>10,000ゲームカタログからゲームを選んでください。</p><a href="/catalog/">カタログへ →</a></div></section>`;
      return;
    }
    const all=await window.GameFinderRichCatalog;
    const x=all.find(g=>Number(g.appid)===appid);
    if(!x){
      root.innerHTML=`<section class="v22-error"><div class="v9-wrap"><h1>このAppIDは現在の10,000本Catalogにありません。</h1><p>Catalog更新後に追加される可能性があります。</p><a href="/catalog/">カタログへ →</a></div></section>`;
      return;
    }
    render(all,x);
  }
  init();
})();
