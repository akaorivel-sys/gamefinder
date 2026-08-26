
const GF={
games:[],
selected:JSON.parse(localStorage.getItem("gf_compare")||"[]"),
favs:JSON.parse(localStorage.getItem("gf_favorites")||"[]"),
async load(){this.games=await fetch("/data/games.json").then(r=>r.json())},
safe(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))},
toggleFav(s){this.favs=this.favs.includes(s)?this.favs.filter(x=>x!==s):[...this.favs,s];localStorage.setItem("gf_favorites",JSON.stringify(this.favs))},
toggleCmp(s){if(this.selected.includes(s))this.selected=this.selected.filter(x=>x!==s);else if(this.selected.length<3)this.selected.push(s);else return false;localStorage.setItem("gf_compare",JSON.stringify(this.selected));return true},
card(g){
 const img=g.image||g.fallbackImage||"/assets/og.svg";
 const deep=g.editorialStatus==="deep";
 const status=deep?'<span class="v91-status deep">深掘り</span>':'<span class="v91-status catalog">カタログ</span>';
 return `<article class="game-card ${deep?'is-deep':''}">
 <a class="cover" href="/games/${g.slug}.html">
 <img loading="lazy" decoding="async" src="${this.safe(img)}" alt="${this.safe(g.title)}" data-fallback="${this.safe(g.fallbackImage||'/assets/og.svg')}" onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback}">
 <span class="cover-badge">${this.safe(g.platform||"PC")} / ${this.safe(g.priceLabel||"")}</span></a>
 <div class="card-body">${status}<h3>${this.safe(g.title)}</h3>
 <p class="desc">${this.safe(g.bestFor||g.summary||"")}</p>
 <div class="tags">${[...(g.genres||[]).slice(0,3),...(g.flags||[]).slice(0,1)].map(t=>`<span class="tag">${this.safe(t)}</span>`).join("")}</div>
 <div class="card-actions"><a class="small-btn primary" href="/games/${g.slug}.html">見る</a>
 <button class="small-btn ${this.favs.includes(g.slug)?"active":""}" data-fav="${g.slug}" aria-label="お気に入り">♥</button>
 <button class="small-btn ${this.selected.includes(g.slug)?"active":""}" data-cmp="${g.slug}" aria-label="比較">⇄</button></div></div></article>`;
}};
document.addEventListener("DOMContentLoaded",async()=>{
 await GF.load();
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 const els={q:$("#search"),p:$("#platform"),g:$("#genre"),price:$("#price"),play:$("#play"),ja:$("#ja"),sort:$("#sort")};
 if(!els.q||!$("#gameGrid")) return;
 if(els.g)[...new Set(GF.games.flatMap(g=>g.genres||[]))].sort((a,b)=>a.localeCompare(b,"ja")).forEach(v=>els.g.insertAdjacentHTML("beforeend",`<option>${v}</option>`));
 const hc=$("#heroCount"); if(hc) hc.textContent=GF.games.length;
 let mode="all",page=1; const per=36;
 function filtered(){
  let xs=GF.games.filter(g=>{
   const h=[g.title,g.summary,g.bestFor,...(g.genres||[]),...(g.flags||[]),g.multiplayer,g.editorialLabel].join(" ").toLowerCase();
   return(!els.q.value||h.includes(els.q.value.toLowerCase()))&&(!els.p?.value||String(g.platform).includes(els.p.value))&&(!els.g?.value||(g.genres||[]).includes(els.g.value))&&(!els.price?.value||g.priceType===els.price.value)&&(!els.play?.value||String(g.multiplayer).includes(els.play.value))&&(!els.ja?.checked||g.japanese);
  });
  if(mode==="free")xs=xs.filter(g=>g.priceType==="free");
  if(mode==="coop")xs=xs.filter(g=>String(g.multiplayer).includes("協力"));
  if(mode==="builder")xs=xs.filter(g=>(g.genres||[]).some(x=>["街づくり","建築","自動化","コロニー","経営"].includes(x)));
  if(mode==="low")xs=xs.filter(g=>(g.flags||[]).includes("低スペック向け"));
  if(mode==="long")xs=xs.filter(g=>(g.flags||[]).includes("長く遊べる"));
  if(mode==="survival")xs=xs.filter(g=>(g.genres||[]).includes("サバイバル"));
  if(mode==="rpg")xs=xs.filter(g=>(g.genres||[]).some(x=>["RPG","ARPG"].includes(x)));
  if(mode==="fps")xs=xs.filter(g=>(g.genres||[]).some(x=>["FPS","TPS"].includes(x)));
  if(mode==="mod")xs=xs.filter(g=>(g.flags||[]).includes("MOD")||g.guide?.mods);
  if(mode==="deep")xs=xs.filter(g=>g.editorialStatus==="deep");
  if(els.sort?.value==="score")xs.sort((a,b)=>(b.discoveryScore||0)-(a.discoveryScore||0));
  else xs.sort((a,b)=>a.title.localeCompare(b.title,"ja"));
  return xs;
 }
 function pager(total){
  const root=$("#pagination"); if(!root)return;
  const pages=Math.max(1,Math.ceil(total/per)); page=Math.min(page,pages);
  let h=`<button data-page="${page-1}" ${page<=1?'disabled':''}>‹</button>`;
  const start=Math.max(1,page-2),end=Math.min(pages,page+2);
  if(start>1)h+=`<button data-page="1">1</button>${start>2?'<span>…</span>':''}`;
  for(let i=start;i<=end;i++)h+=`<button data-page="${i}" class="${i===page?'active':''}">${i}</button>`;
  if(end<pages)h+=`${end<pages-1?'<span>…</span>':''}<button data-page="${pages}">${pages}</button>`;
  h+=`<button data-page="${page+1}" ${page>=pages?'disabled':''}>›</button>`; root.innerHTML=h;
 }
 function render(){
  const xs=filtered(),slice=xs.slice((page-1)*per,page*per);
  const rc=$("#resultCount"); if(rc)rc.textContent=`${xs.length}件 / 全${GF.games.length}件`;
  $("#gameGrid").innerHTML=slice.length?slice.map(g=>GF.card(g)).join(""):`<div class="empty">条件に一致するゲームがありません。</div>`;
  pager(xs.length);
  const names=GF.selected.map(s=>GF.games.find(g=>g.slug===s)?.title).filter(Boolean);
  const cb=$("#compareBar"); if(cb)cb.classList.toggle("show",names.length>0);
  const cn=$("#compareNames"); if(cn)cn.textContent=names.join(" / ");
  const cc=$("#compareCount"); if(cc)cc.textContent=names.length;
  const cg=$("#compareGo"); if(cg)cg.href=`/compare.html?games=${encodeURIComponent(GF.selected.join(","))}`;
 }
 Object.values(els).filter(Boolean).forEach(e=>e.addEventListener("input",()=>{page=1;render()}));
 $$('.quick-chip').forEach(b=>b.onclick=()=>{$$('.quick-chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.mode||"all";page=1;render()});
 const reset=$("#reset"); if(reset)reset.onclick=()=>{[els.q,els.p,els.g,els.price,els.play].filter(Boolean).forEach(x=>x.value="");if(els.ja)els.ja.checked=false;mode="all";page=1;$$('.quick-chip').forEach(x=>x.classList.toggle('active',x.dataset.mode==='all'));render()};
 const random=$("#random"); if(random)random.onclick=()=>{const xs=filtered();if(xs.length)location.href=`/games/${xs[Math.floor(Math.random()*xs.length)].slug}.html`};
 $("#gameGrid").onclick=e=>{const f=e.target.closest('[data-fav]'),c=e.target.closest('[data-cmp]');if(f){GF.toggleFav(f.dataset.fav);render()}if(c){if(!GF.toggleCmp(c.dataset.cmp))alert('比較できるのは3本までです。');render()}};
 const pg=$("#pagination"); if(pg)pg.onclick=e=>{const b=e.target.closest('[data-page]');if(!b||b.disabled)return;page=Number(b.dataset.page);render();document.querySelector('#games')?.scrollIntoView({behavior:'smooth'})};
 const clear=$("#compareClear"); if(clear)clear.onclick=()=>{GF.selected=[];localStorage.setItem('gf_compare','[]');render()};
 render();
});
