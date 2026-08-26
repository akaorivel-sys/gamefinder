
(() => {
  const NS="gamefinder-v21";
  const KEYS={
    favorites:NS+"-favorites",
    wishlist:NS+"-wishlist",
    readLater:NS+"-read-later",
    history:NS+"-history",
    diagnosis:NS+"-diagnosis",
    compare:"gamefinder-v18-compare"
  };
  const MAX_HISTORY=60, MAX_DIAG=12;

  const parse=(k,def=[])=>{
    try{
      const v=JSON.parse(localStorage.getItem(k)||"null");
      return v??def;
    }catch{return def;}
  };
  const save=(k,v)=>{
    try{localStorage.setItem(k,JSON.stringify(v));}catch{}
    window.dispatchEvent(new CustomEvent("gf:my-updated"));
  };

  function upsert(key,item,max=100){
    let list=parse(key,[]);
    const id=String(item.id||item.appid||item.url||item.title);
    list=list.filter(x=>String(x.id||x.appid||x.url||x.title)!==id);
    list.unshift({...item,id,updatedAt:Date.now()});
    save(key,list.slice(0,max));
    return list;
  }
  function remove(key,id){
    let list=parse(key,[]);
    list=list.filter(x=>String(x.id||x.appid||x.url||x.title)!==String(id));
    save(key,list);
  }
  function has(key,id){
    return parse(key,[]).some(x=>String(x.id||x.appid||x.url||x.title)===String(id));
  }

  function pageType(){
    const p=location.pathname;
    if(p.startsWith("/games/") && p!=="/games/") return "game";
    if(p.startsWith("/articles/") && p!=="/articles/" && !p.endsWith("/data-guides/")) return "article";
    if(p==="/recommend/"||p==="/recommend/index.html") return "recommend";
    if(p==="/compare.html") return "compare";
    if(p.startsWith("/discover/")) return "discover";
    return "page";
  }

  function currentMeta(){
    const h1=document.querySelector("h1");
    const og=document.querySelector('meta[property="og:image"]');
    const cover=document.querySelector(".v13-hero-image img,.v9-article-cover,.v12-visual-image img,.v20-result-image img");
    return {
      id:location.pathname,
      url:location.pathname+location.search,
      title:(h1?.textContent||document.title||"").trim(),
      image:og?.content||cover?.src||"",
      type:pageType()
    };
  }

  function recordHistory(){
    const t=pageType();
    if(!["game","article","recommend","compare","discover"].includes(t))return;
    const m=currentMeta();
    if(!m.title)return;
    upsert(KEYS.history,m,MAX_HISTORY);
  }

  function gameItemFromEl(el){
    const card=el.closest("[data-appid],.v18-card,.v20-result-card,.v19-selected-card");
    const appid=el.dataset.appid||el.dataset.favorite||el.dataset.wishlist||
      card?.dataset.appid||el.closest("[data-compare]")?.dataset.compare||"";
    const title=el.dataset.title||
      card?.querySelector("h2")?.textContent?.trim()||
      document.querySelector(".v13-hero h1")?.textContent?.trim()||
      document.querySelector("h1")?.textContent?.trim()||"";
    const img=el.dataset.image||
      card?.querySelector("img")?.src||
      document.querySelector(".v13-hero-image img")?.src||"";
    const slug=el.dataset.slug||
      card?.querySelector('a[href^="/games/"],a[href^="/game/"]')?.getAttribute("href")||
      (location.pathname.startsWith("/games/")||location.pathname.startsWith("/game/"))?(location.pathname+location.search):"";
    return {id:appid||slug||title,appid:appid||null,title,image:img,url:slug||""};
  }

  function toggleFavorite(item){
    if(has(KEYS.favorites,item.id)) remove(KEYS.favorites,item.id);
    else upsert(KEYS.favorites,item,100);
  }
  function toggleWishlist(item){
    if(has(KEYS.wishlist,item.id)) remove(KEYS.wishlist,item.id);
    else upsert(KEYS.wishlist,item,100);
  }
  function toggleReadLater(item){
    if(has(KEYS.readLater,item.id)) remove(KEYS.readLater,item.id);
    else upsert(KEYS.readLater,item,100);
  }

  function syncButtons(){
    document.querySelectorAll("[data-favorite]").forEach(b=>{
      const item=gameItemFromEl(b);
      const on=has(KEYS.favorites,item.id);
      b.classList.toggle("active",on);
      if(b.dataset.label!==undefined) b.textContent=on?"★ お気に入り済み":"☆ お気に入り";
      b.setAttribute("aria-pressed",String(on));
    });
    document.querySelectorAll("[data-wishlist]").forEach(b=>{
      const item=gameItemFromEl(b);
      const on=has(KEYS.wishlist,item.id);
      b.classList.toggle("active",on);
      if(b.dataset.label!==undefined) b.textContent=on?"✓ 遊びたい":"＋ 遊びたい";
      b.setAttribute("aria-pressed",String(on));
    });
    document.querySelectorAll("[data-read-later]").forEach(b=>{
      const item={
        id:b.dataset.url||location.pathname,
        url:b.dataset.url||location.pathname,
        title:b.dataset.title||document.querySelector("h1")?.textContent?.trim()||document.title,
        image:b.dataset.image||document.querySelector(".v9-article-cover")?.src||"",
        type:"article"
      };
      const on=has(KEYS.readLater,item.id);
      b.classList.toggle("active",on);
      if(b.dataset.label!==undefined) b.textContent=on?"✓ あとで読む":"＋ あとで読む";
      b.setAttribute("aria-pressed",String(on));
    });
  }

  document.addEventListener("click",e=>{
    const fav=e.target.closest("[data-favorite]");
    if(fav){e.preventDefault();toggleFavorite(gameItemFromEl(fav));syncButtons();return;}
    const wish=e.target.closest("[data-wishlist]");
    if(wish){e.preventDefault();toggleWishlist(gameItemFromEl(wish));syncButtons();return;}
    const read=e.target.closest("[data-read-later]");
    if(read){
      e.preventDefault();
      const item={
        id:read.dataset.url||location.pathname,
        url:read.dataset.url||location.pathname,
        title:read.dataset.title||document.querySelector("h1")?.textContent?.trim()||document.title,
        image:read.dataset.image||document.querySelector(".v9-article-cover")?.src||"",
        type:"article"
      };
      toggleReadLater(item);syncButtons();return;
    }
  });

  function saveDiagnosis(payload){
    if(!payload)return;
    upsert(KEYS.diagnosis,{
      id:"diag-"+Date.now(),
      title:payload.title||"おすすめ診断",
      answers:payload.answers||{},
      results:payload.results||[],
      createdAt:Date.now(),
      type:"diagnosis"
    },MAX_DIAG);
  }

  function clearSection(name){
    if(KEYS[name]) save(KEYS[name],[]);
  }

  window.MyGameFinder={
    KEYS,parse,save,upsert,remove,has,
    favorites:()=>parse(KEYS.favorites,[]),
    wishlist:()=>parse(KEYS.wishlist,[]),
    readLater:()=>parse(KEYS.readLater,[]),
    history:()=>parse(KEYS.history,[]),
    diagnosis:()=>parse(KEYS.diagnosis,[]),
    compare:()=>parse(KEYS.compare,[]),
    saveDiagnosis,clearSection,syncButtons
  };

  document.addEventListener("DOMContentLoaded",()=>{
    recordHistory();
    syncButtons();
  });
  window.addEventListener("gf:my-updated",syncButtons);
})();
