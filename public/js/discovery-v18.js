
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const PAGE_SIZE=48;
  const SAVE_KEY="gamefinder-v18-saved-filter";
  const COMPARE_KEY="gamefinder-v18-compare";
  let all=[], filtered=[], page=1, currentPreset="";

  const state={
    q:"", genres:[], tags:[], review:0, maxPrice:null, freeOnly:false,
    japanese:false, platform:"", minPlaytime:0, minCompleteness:0,
    multiplayer:"", editorialOnly:false, sort:"smart"
  };

  const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const known=(x)=>x!==null&&x!==undefined&&x!=="";

  function score(x){
    let s=0;
    if(known(x.review_score)) s += x.review_score*45;
    if(known(x.metadata_completeness)) s += Math.min(25,Number(x.metadata_completeness)/4);
    if(known(x.discoveryScore)) s += Math.min(20,Number(x.discoveryScore)*2);
    if(x.metadata_level==="editorial-plus" || x.enrichment==="editorial-plus") s+=12;
    if(known(x.positive)) s+=Math.min(12,Math.log10(Number(x.positive)+1)*2);
    if(known(x.average_forever_min)) s+=Math.min(8,Math.log10(Number(x.average_forever_min)+1));
    return s;
  }

  function hasGenre(x,g){ return (x.genres||[]).some(v=>String(v).toLowerCase()===String(g).toLowerCase());}
  function hasTag(x,t){ return (x.tags||[]).some(v=>String(v).toLowerCase()===String(t).toLowerCase());}
  function multiText(x){return String(x.multiplayer_editorial||x.multiplayer||"").toLowerCase();}

  function matches(x){
    const q=state.q.trim().toLowerCase();
    if(q){
      const blob=[x.name, ...(x.genres||[]), ...(x.tags||[]), x.developer, x.publisher, x.summary, x.best_for, x.bestFor].filter(Boolean).join(" ").toLowerCase();
      if(!blob.includes(q)) return false;
    }
    if(state.genres.length && !state.genres.every(g=>hasGenre(x,g))) return false;
    if(state.tags.length && !state.tags.every(t=>hasTag(x,t))) return false;
    if(state.review && !(known(x.review_score) && x.review_score*100>=state.review)) return false;
    if(state.freeOnly && !(known(x.price_cents) && Number(x.price_cents)===0)) return false;
    if(state.maxPrice!==null && !(known(x.price_cents) && Number(x.price_cents)<=state.maxPrice)) return false;
    if(state.japanese && x.japanese!==true) return false;
    if(state.platform && x["platform_"+state.platform]!==true) return false;
    if(state.minPlaytime && !(known(x.average_forever_min) && Number(x.average_forever_min)>=state.minPlaytime)) return false;
    if(state.minCompleteness && Number(x.metadata_completeness||0)<state.minCompleteness) return false;
    if(state.editorialOnly && !(x.metadata_level==="editorial-plus" || x.enrichment==="editorial-plus")) return false;
    if(state.multiplayer){
      const m=multiText(x);
      if(state.multiplayer==="solo" && !m.includes("solo")) return false;
      if(state.multiplayer==="coop" && !(m.includes("coop")||m.includes("co-op")||m.includes("協力"))) return false;
      if(state.multiplayer==="multi" && !(m.includes("multi")||m.includes("対戦")||m.includes("協力")||m.includes("coop"))) return false;
    }
    return true;
  }

  function sortItems(items){
    const a=[...items];
    const sort=state.sort;
    if(sort==="smart") a.sort((x,y)=>score(y)-score(x));
    else if(sort==="review") a.sort((x,y)=>(y.review_score??-1)-(x.review_score??-1));
    else if(sort==="popular") a.sort((x,y)=>(y.positive??-1)-(x.positive??-1));
    else if(sort==="playtime") a.sort((x,y)=>(y.average_forever_min??-1)-(x.average_forever_min??-1));
    else if(sort==="price-asc") a.sort((x,y)=>(x.price_cents??9999999)-(y.price_cents??9999999));
    else if(sort==="price-desc") a.sort((x,y)=>(y.price_cents??-1)-(x.price_cents??-1));
    else if(sort==="complete") a.sort((x,y)=>(y.metadata_completeness??0)-(x.metadata_completeness??0));
    else if(sort==="name") a.sort((x,y)=>String(x.name).localeCompare(String(y.name)));
    return a;
  }

  function refresh(){
    filtered=sortItems(all.filter(matches));
    page=1;
    render();
    renderActive();
  }

  function fmtPrice(x){
    if(!known(x.price_cents)) return "価格不明";
    if(Number(x.price_cents)===0) return "Free";
    return "$"+(Number(x.price_cents)/100).toFixed(2);
  }
  function fmtReview(x){
    return known(x.review_score)?Math.round(Number(x.review_score)*100)+"%":"評価不明";
  }
  function fmtPlay(x){
    if(!known(x.average_forever_min)) return "Playtime不明";
    const h=Number(x.average_forever_min)/60;
    return h>=10?Math.round(h)+"h avg":h.toFixed(1)+"h avg";
  }

  function compareList(){
    try{return JSON.parse(localStorage.getItem(COMPARE_KEY)||"[]")}catch{return[]}
  }
  function saveCompare(list){localStorage.setItem(COMPARE_KEY,JSON.stringify(list.slice(0,4)));renderCompare();}
  function toggleCompare(appid){
    const x=all.find(g=>Number(g.appid)===Number(appid)); if(!x)return;
    let list=compareList();
    const i=list.findIndex(v=>Number(v.appid)===Number(appid));
    if(i>=0) list.splice(i,1);
    else if(list.length<4) list.push({appid:x.appid,name:x.name,image:x.image||""});
    saveCompare(list);
    render();
  }

  function card(x){
    const plus=(x.metadata_level==="editorial-plus"||x.enrichment==="editorial-plus");
    const checked=compareList().some(v=>Number(v.appid)===Number(x.appid));
    const store=x.official_store_url||x.officialStoreUrl||`https://store.steampowered.com/app/${x.appid}/`;
    const gameLink=x.slug?`/games/${safe(x.slug)}.html`:`/game/?appid=${x.appid}`;
    const chips=[
      ...(x.genres||[]).slice(0,2),
      fmtReview(x),
      fmtPrice(x)
    ].filter(Boolean);
    return `<article class="v18-card">
      <div class="v18-cover"><img loading="lazy" src="${safe(x.image||"/assets/og.svg")}" onerror="this.src='/assets/og.svg'" alt=""></div>
      <div class="v18-card-body">
        <div class="v18-card-top"><span class="v18-level ${plus?"plus":"core"}">${plus?"EDITORIAL PLUS":"ENRICHED CORE"}</span><span>${Number(x.metadata_completeness||0)}%</span></div>
        <h2>${safe(x.name)}</h2>
        <div class="v18-chips">${chips.map(c=>`<span>${safe(c)}</span>`).join("")}</div>
        <p>${safe(x.summary||x.best_for||x.bestFor||("Verified identity + metadata source: "+(x.metadata_source||x.source||"Steam")))}</p>
        <div class="v18-card-actions">
          <a href="${gameLink}">${x.slug?"Dossier":"Game page"}</a>
          <a href="${safe(store)}" target="_blank" rel="noopener nofollow">Steam</a>
          <button data-favorite="${x.appid}" data-appid="${x.appid}" data-title="${safe(x.name)}" data-image="${safe(x.image||"")}" data-slug="${x.slug?`/games/${safe(x.slug)}.html`:""}">☆</button>
          <button data-wishlist="${x.appid}" data-appid="${x.appid}" data-title="${safe(x.name)}" data-image="${safe(x.image||"")}" data-slug="${x.slug?`/games/${safe(x.slug)}.html`:""}">＋</button>
          <button data-compare="${x.appid}" class="${checked?"active":""}">${checked?"比較から外す":"比較へ"}</button>
        </div>
      </div>
    </article>`;
  }

  function render(){
    const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
    page=Math.max(1,Math.min(page,pages));
    const slice=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
    $("#v18-results").innerHTML=slice.map(card).join("") || `<div class="v18-empty"><b>条件に一致するゲームがありません。</b><p>Metadata未取得の作品は、値を推測して一致扱いにしていません。条件を一つ外して試してください。</p></div>`;
    $("#v18-count").textContent=filtered.length.toLocaleString();
    $("#v18-page").textContent=`${page} / ${pages}`;
    $("#v18-prev").disabled=page<=1;
    $("#v18-next").disabled=page>=pages;
    $$("[data-compare]").forEach(b=>b.onclick=()=>toggleCompare(b.dataset.compare));
  }

  function renderCompare(){
    const list=compareList();
    const box=$("#v18-compare-bar");
    box.classList.toggle("show",list.length>0);
    $("#v18-compare-items").innerHTML=list.map(x=>`<span>${safe(x.name)}</span>`).join("");
    $("#v18-compare-count").textContent=list.length;
  }

  function renderActive(){
    const chips=[];
    if(state.q) chips.push(["q",`検索: ${state.q}`]);
    state.genres.forEach(g=>chips.push(["genre:"+g,g]));
    state.tags.forEach(t=>chips.push(["tag:"+t,t]));
    if(state.review) chips.push(["review",`評価 ${state.review}%+`]);
    if(state.freeOnly) chips.push(["free","無料"]);
    if(state.maxPrice!==null) chips.push(["price",`$${state.maxPrice/100}以下`]);
    if(state.japanese) chips.push(["ja","日本語"]);
    if(state.platform) chips.push(["platform",state.platform]);
    if(state.minPlaytime) chips.push(["play",`${state.minPlaytime/60}h+`]);
    if(state.minCompleteness) chips.push(["complete",`Metadata ${state.minCompleteness}%+`]);
    if(state.multiplayer) chips.push(["multi",state.multiplayer]);
    if(state.editorialOnly) chips.push(["editorial","Editorial Plus"]);
    $("#v18-active").innerHTML=chips.map(([k,v])=>`<button data-remove="${safe(k)}">${safe(v)} ×</button>`).join("");
    $$("[data-remove]").forEach(b=>b.onclick=()=>removeFilter(b.dataset.remove));
  }

  function removeFilter(k){
    if(k==="q"){state.q="";$("#v18-q").value="";}
    else if(k.startsWith("genre:")) state.genres=state.genres.filter(x=>x!==k.slice(6));
    else if(k.startsWith("tag:")) state.tags=state.tags.filter(x=>x!==k.slice(4));
    else if(k==="review") state.review=0;
    else if(k==="free") state.freeOnly=false;
    else if(k==="price") state.maxPrice=null;
    else if(k==="ja") state.japanese=false;
    else if(k==="platform") state.platform="";
    else if(k==="play") state.minPlaytime=0;
    else if(k==="complete") state.minCompleteness=0;
    else if(k==="multi") state.multiplayer="";
    else if(k==="editorial") state.editorialOnly=false;
    syncInputs();refresh();
  }

  function syncInputs(){
    $("#v18-q").value=state.q;
    $("#v18-review").value=state.review||"";
    $("#v18-price").value=state.freeOnly?"free":state.maxPrice===null?"":String(state.maxPrice);
    $("#v18-ja").checked=state.japanese;
    $("#v18-platform").value=state.platform;
    $("#v18-playtime").value=state.minPlaytime||"";
    $("#v18-complete").value=state.minCompleteness||"";
    $("#v18-multi").value=state.multiplayer;
    $("#v18-editorial").checked=state.editorialOnly;
    $("#v18-sort").value=state.sort;
    $$(".v18-genre-btn").forEach(b=>b.classList.toggle("active",state.genres.includes(b.dataset.genre)));
    $$(".v18-tag-btn").forEach(b=>b.classList.toggle("active",state.tags.includes(b.dataset.tag)));
  }

  const presets={
    "coop-cheap":{genres:[],tags:[],review:80,maxPrice:2000,freeOnly:false,japanese:false,platform:"",minPlaytime:0,minCompleteness:50,multiplayer:"coop",editorialOnly:false,sort:"smart"},
    "linux-strategy":{genres:["Strategy"],tags:[],review:75,maxPrice:null,freeOnly:false,japanese:false,platform:"linux",minPlaytime:0,minCompleteness:50,multiplayer:"",editorialOnly:false,sort:"review"},
    "long-play":{genres:[],tags:[],review:80,maxPrice:null,freeOnly:false,japanese:false,platform:"",minPlaytime:1800,minCompleteness:50,multiplayer:"",editorialOnly:false,sort:"playtime"},
    "japanese-high":{genres:[],tags:[],review:85,maxPrice:null,freeOnly:false,japanese:true,platform:"",minPlaytime:0,minCompleteness:50,multiplayer:"",editorialOnly:false,sort:"review"},
    "free-popular":{genres:[],tags:[],review:80,maxPrice:null,freeOnly:true,japanese:false,platform:"",minPlaytime:0,minCompleteness:50,multiplayer:"",editorialOnly:false,sort:"popular"},
    "editor-picks":{genres:[],tags:[],review:0,maxPrice:null,freeOnly:false,japanese:false,platform:"",minPlaytime:0,minCompleteness:0,multiplayer:"",editorialOnly:true,sort:"smart"}
  };

  function applyPreset(k){
    if(!presets[k])return;
    Object.assign(state,presets[k],{q:""});
    currentPreset=k;syncInputs();refresh();
  }

  function saveFilter(){
    localStorage.setItem(SAVE_KEY,JSON.stringify(state));
    const b=$("#v18-save");b.textContent="保存しました";setTimeout(()=>b.textContent="条件を保存",1200);
  }
  function loadFilter(){
    try{
      const x=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");
      if(x){Object.assign(state,x);syncInputs();refresh();}
    }catch{}
  }
  function reset(){
    Object.assign(state,{q:"",genres:[],tags:[],review:0,maxPrice:null,freeOnly:false,japanese:false,platform:"",minPlaytime:0,minCompleteness:0,multiplayer:"",editorialOnly:false,sort:"smart"});
    syncInputs();refresh();
  }

  function randomPick(){
    if(!filtered.length)return;
    const x=filtered[Math.floor(Math.random()*filtered.length)];
    const url=x.slug?`/games/${x.slug}.html`:(x.official_store_url||x.officialStoreUrl||`https://store.steampowered.com/app/${x.appid}/`);
    if(url.startsWith("http")) window.open(url,"_blank","noopener");
    else location.href=url;
  }

  function setupTaxonomy(items){
    const gc=new Map(),tc=new Map();
    for(const x of items){
      for(const g of (x.genres||[])) gc.set(g,(gc.get(g)||0)+1);
      for(const t of (x.tags||[])) tc.set(t,(tc.get(t)||0)+1);
    }
    const genres=[...gc].sort((a,b)=>b[1]-a[1]).slice(0,18);
    const tags=[...tc].sort((a,b)=>b[1]-a[1]).slice(0,18);
    $("#v18-genres").innerHTML=genres.map(([g,n])=>`<button class="v18-genre-btn" data-genre="${safe(g)}">${safe(g)} <small>${n}</small></button>`).join("");
    $("#v18-tags").innerHTML=tags.map(([t,n])=>`<button class="v18-tag-btn" data-tag="${safe(t)}">${safe(t)} <small>${n}</small></button>`).join("");
    $$(".v18-genre-btn").forEach(b=>b.onclick=()=>{const g=b.dataset.genre;state.genres=state.genres.includes(g)?state.genres.filter(x=>x!==g):[...state.genres,g];syncInputs();refresh();});
    $$(".v18-tag-btn").forEach(b=>b.onclick=()=>{const t=b.dataset.tag;state.tags=state.tags.includes(t)?state.tags.filter(x=>x!==t):[...state.tags,t];syncInputs();refresh();});
  }

  function wire(){
    $("#v18-q").addEventListener("input",e=>{state.q=e.target.value;refresh();});
    $("#v18-review").onchange=e=>{state.review=Number(e.target.value||0);refresh();};
    $("#v18-price").onchange=e=>{state.freeOnly=e.target.value==="free";state.maxPrice=(!e.target.value||e.target.value==="free")?null:Number(e.target.value);refresh();};
    $("#v18-ja").onchange=e=>{state.japanese=e.target.checked;refresh();};
    $("#v18-platform").onchange=e=>{state.platform=e.target.value;refresh();};
    $("#v18-playtime").onchange=e=>{state.minPlaytime=Number(e.target.value||0);refresh();};
    $("#v18-complete").onchange=e=>{state.minCompleteness=Number(e.target.value||0);refresh();};
    $("#v18-multi").onchange=e=>{state.multiplayer=e.target.value;refresh();};
    $("#v18-editorial").onchange=e=>{state.editorialOnly=e.target.checked;refresh();};
    $("#v18-sort").onchange=e=>{state.sort=e.target.value;refresh();};
    $("#v18-reset").onclick=reset;
    $("#v18-save").onclick=saveFilter;
    $("#v18-load").onclick=loadFilter;
    $("#v18-random").onclick=randomPick;
    $("#v18-prev").onclick=()=>{page--;render();scrollTo({top:520,behavior:"smooth"});};
    $("#v18-next").onclick=()=>{page++;render();scrollTo({top:520,behavior:"smooth"});};
    $$("[data-preset]").forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));
    $("#v18-clear-compare").onclick=()=>saveCompare([]);
  }

  async function init(){
    all=await window.GameFinderRichCatalog;
    setupTaxonomy(all);
    wire();
    filtered=sortItems(all);
    render();renderCompare();syncInputs();renderActive();
    $("#v18-total").textContent=all.length.toLocaleString();
  }
  init();
})();
