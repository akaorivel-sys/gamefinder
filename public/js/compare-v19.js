
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const KEY="gamefinder-v18-compare";
  let all=[], selected=[];

  const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const known=x=>x!==null&&x!==undefined&&x!=="";
  const isPlus=x=>(x.metadata_level==="editorial-plus"||x.enrichment==="editorial-plus");

  function fmtPrice(x){
    if(!known(x.price_cents)) return "不明";
    if(Number(x.price_cents)===0) return "Free";
    return "$"+(Number(x.price_cents)/100).toFixed(2);
  }
  function fmtReview(x){return known(x.review_score)?Math.round(Number(x.review_score)*100)+"%":"不明"}
  function fmtPlay(x){
    if(!known(x.average_forever_min)) return "不明";
    const h=Number(x.average_forever_min)/60;
    return h>=10?Math.round(h)+"h":h.toFixed(1)+"h";
  }
  function yesNo(v){return v===true?"✓":v===false?"—":"不明"}
  function platformList(x){
    const a=[];
    if(x.platform_windows===true)a.push("Windows");
    if(x.platform_mac===true)a.push("Mac");
    if(x.platform_linux===true)a.push("Linux");
    return a.length?a.join(" / "):"不明";
  }
  function multi(x){
    return x.multiplayer_editorial||x.multiplayer||"不明";
  }
  function load(x){
    return x.pc_load_editorial||x.pcLoadEditorial||"不明";
  }
  function level(x){return isPlus(x)?"Editorial Plus":"Enriched Core"}

  function loadSaved(){
    try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return[]}
  }
  function save(){
    localStorage.setItem(KEY,JSON.stringify(selected.map(x=>({appid:x.appid,name:x.name,image:x.image||""})).slice(0,4)));
  }

  function ensureFromSaved(){
    const saved=loadSaved();
    selected=saved.map(s=>all.find(x=>Number(x.appid)===Number(s.appid))).filter(Boolean).slice(0,4);
  }

  function findGame(q){
    q=q.trim().toLowerCase();
    if(!q)return [];
    return all.filter(x=>{
      const blob=[x.name,...(x.genres||[]),...(x.tags||[]),x.developer,x.publisher].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    }).slice(0,12);
  }

  function renderSearch(items){
    const box=$("#v19-suggest");
    box.innerHTML=items.map(x=>`<button data-add="${x.appid}">
      <img src="${safe(x.image||"/assets/og.svg")}" onerror="this.src='/assets/og.svg'" alt="">
      <span><b>${safe(x.name)}</b><small>${safe((x.genres||[]).slice(0,2).join(" / ")||level(x))}</small></span>
    </button>`).join("");
    box.classList.toggle("show",items.length>0);
    $$("[data-add]",box).forEach(b=>b.onclick=()=>{
      const g=all.find(x=>Number(x.appid)===Number(b.dataset.add));
      if(g && !selected.some(x=>Number(x.appid)===Number(g.appid)) && selected.length<4){
        selected.push(g);save();render();box.innerHTML="";box.classList.remove("show");$("#v19-search").value="";
      }
    });
  }

  function metricWinner(metric, mode="max"){
    const vals=selected.map((x,i)=>({i,v:x[metric]})).filter(o=>known(o.v));
    if(!vals.length)return new Set();
    let best=mode==="min"?Math.min(...vals.map(o=>Number(o.v))):Math.max(...vals.map(o=>Number(o.v)));
    return new Set(vals.filter(o=>Number(o.v)===best).map(o=>o.i));
  }

  function cell(v, win=false, sub=""){
    return `<td class="${win?"win":""}"><b>${safe(v)}</b>${sub?`<small>${safe(sub)}</small>`:""}</td>`;
  }

  function table(){
    if(selected.length<2)return `<div class="v19-empty"><b>2本以上選ぶと比較表が表示されます。</b><p>Discovery Engineの「比較へ」から追加するか、上の検索欄でゲームを選んでください。</p></div>`;

    const reviewW=metricWinner("review_score");
    const playW=metricWinner("average_forever_min");
    const compW=metricWinner("metadata_completeness");
    const priceVals=selected.map(x=>x.price_cents).filter(known);
    const priceW=priceVals.length?metricWinner("price_cents","min"):new Set();

    const head=`<thead><tr><th>比較項目</th>${selected.map((x,i)=>`<th><img src="${safe(x.image||"/assets/og.svg")}" onerror="this.src='/assets/og.svg'" alt=""><span>${safe(x.name)}</span></th>`).join("")}</tr></thead>`;

    const rows=[];
    rows.push(`<tr><th>価格</th>${selected.map((x,i)=>cell(fmtPrice(x),priceW.has(i))).join("")}</tr>`);
    rows.push(`<tr><th>レビュー</th>${selected.map((x,i)=>cell(fmtReview(x),reviewW.has(i),known(x.positive)?`${Number(x.positive).toLocaleString()} positive`:"")).join("")}</tr>`);
    rows.push(`<tr><th>平均Playtime</th>${selected.map((x,i)=>cell(fmtPlay(x),playW.has(i))).join("")}</tr>`);
    rows.push(`<tr><th>日本語</th>${selected.map(x=>cell(yesNo(x.japanese))).join("")}</tr>`);
    rows.push(`<tr><th>Platform</th>${selected.map(x=>cell(platformList(x))).join("")}</tr>`);
    rows.push(`<tr><th>Play style</th>${selected.map(x=>cell(multi(x))).join("")}</tr>`);
    rows.push(`<tr><th>PC負荷</th>${selected.map(x=>cell(load(x))).join("")}</tr>`);
    rows.push(`<tr><th>Metadata</th>${selected.map((x,i)=>cell((x.metadata_completeness||0)+"%",compW.has(i),level(x))).join("")}</tr>`);
    rows.push(`<tr><th>ジャンル</th>${selected.map(x=>cell((x.genres||[]).slice(0,4).join(" / ")||"不明")).join("")}</tr>`);
    rows.push(`<tr><th>タグ</th>${selected.map(x=>cell((x.tags||[]).slice(0,5).join(" / ")||"不明")).join("")}</tr>`);
    rows.push(`<tr><th>開発</th>${selected.map(x=>cell(x.developer||"不明")).join("")}</tr>`);
    rows.push(`<tr><th>販売</th>${selected.map(x=>cell(x.publisher||"不明")).join("")}</tr>`);
    return `<div class="v19-table-wrap"><table>${head}<tbody>${rows.join("")}</tbody></table></div>`;
  }

  function profileScore(x, profile){
    let s=0, reasons=[];
    if(profile==="budget"){
      if(known(x.price_cents)){s+=Math.max(0,30-Math.min(30,Number(x.price_cents)/100)); reasons.push(fmtPrice(x));}
      if(known(x.review_score)){s+=Number(x.review_score)*25; reasons.push(fmtReview(x));}
    } else if(profile==="long"){
      if(known(x.average_forever_min)){s+=Math.min(45,Math.log10(Number(x.average_forever_min)+1)*12);reasons.push(fmtPlay(x));}
      if(known(x.review_score)){s+=Number(x.review_score)*25;}
      if(isPlus(x))s+=8;
    } else if(profile==="linux"){
      if(x.platform_linux===true){s+=50; reasons.push("Linux対応");}
      if(known(x.review_score))s+=Number(x.review_score)*25;
      s+=Number(x.metadata_completeness||0)/10;
    } else if(profile==="japanese"){
      if(x.japanese===true){s+=50; reasons.push("日本語");}
      if(known(x.review_score))s+=Number(x.review_score)*25;
      if(isPlus(x))s+=10;
    } else if(profile==="safe"){
      s+=Number(x.metadata_completeness||0)*.45;
      if(isPlus(x)){s+=25;reasons.push("Editorial Plus");}
      if(known(x.review_score))s+=Number(x.review_score)*15;
    }
    return {s,reasons};
  }

  function profileCards(){
    if(selected.length<2)return "";
    const profiles=[
      ["budget","予算を抑えたい"],
      ["long","長く遊びたい"],
      ["linux","Linuxで遊びたい"],
      ["japanese","日本語を優先"],
      ["safe","情報が揃った作品を選びたい"]
    ];
    return profiles.map(([key,label])=>{
      const ranked=selected.map(x=>({x,...profileScore(x,key)})).sort((a,b)=>b.s-a.s);
      const top=ranked[0];
      return `<article><span>BEST FOR</span><h3>${safe(label)}</h3><b>${safe(top.x.name)}</b><p>${safe(top.reasons.join(" / ")||"比較可能なMetadataを総合")}</p></article>`;
    }).join("");
  }

  function editorialSummary(){
    if(selected.length<2)return "";
    const names=selected.map(x=>x.name);
    const plus=selected.filter(isPlus);
    const knownReview=selected.filter(x=>known(x.review_score)).sort((a,b)=>b.review_score-a.review_score);
    const knownPlay=selected.filter(x=>known(x.average_forever_min)).sort((a,b)=>b.average_forever_min-a.average_forever_min);
    const free=selected.filter(x=>x.price_cents===0);
    const bullets=[];
    if(knownReview.length) bullets.push(`レビュー率だけを見るなら ${knownReview[0].name} が最上位です。`);
    if(knownPlay.length) bullets.push(`平均Playtimeでは ${knownPlay[0].name} が最も長いデータです。`);
    if(free.length) bullets.push(`${free.map(x=>x.name).join("、")} は無料枠です。`);
    if(plus.length) bullets.push(`${plus.map(x=>x.name).join("、")} はEditorial Plusで、GameFinder側の独自情報が多い作品です。`);
    bullets.push("ただし、Review率やPlaytimeだけで『面白さ』を断定しません。最終的にはPlay loopと自分の目的が合うかを優先してください。");
    return `<ul>${bullets.map(x=>`<li>${safe(x)}</li>`).join("")}</ul>`;
  }

  function cards(){
    return selected.map(x=>{
      const store=x.official_store_url||x.officialStoreUrl||`https://store.steampowered.com/app/${x.appid}/`;
      return `<article class="v19-selected-card">
        <img src="${safe(x.image||"/assets/og.svg")}" onerror="this.src='/assets/og.svg'" alt="">
        <div><span>${safe(level(x))}</span><h2>${safe(x.name)}</h2><p>${safe((x.genres||[]).slice(0,3).join(" / ")||"Genre unknown")}</p>
        <div><a href="${x.slug?`/games/${safe(x.slug)}.html`:`/game/?appid=${x.appid}`}">${x.slug?"Dossier":"Game page"}</a><a href="${safe(store)}" target="_blank" rel="noopener nofollow">Steam</a><button data-remove="${x.appid}">外す</button></div></div>
      </article>`;
    }).join("");
  }

  function render(){
    $("#v19-selected").innerHTML=cards();
    $("#v19-count").textContent=selected.length;
    $("#v19-table").innerHTML=table();
    $("#v19-profiles").innerHTML=profileCards();
    $("#v19-summary").innerHTML=editorialSummary();
    $("#v19-clear").disabled=!selected.length;
    $$("[data-remove]").forEach(b=>b.onclick=()=>{selected=selected.filter(x=>Number(x.appid)!==Number(b.dataset.remove));save();render();});
  }

  async function init(){
    all=await window.GameFinderRichCatalog;
    ensureFromSaved();
    $("#v19-search").addEventListener("input",e=>renderSearch(findGame(e.target.value)));
    $("#v19-clear").onclick=()=>{selected=[];save();render();};
    $("#v19-swap").onclick=()=>{selected.reverse();save();render();};
    render();
  }
  init();
})();
