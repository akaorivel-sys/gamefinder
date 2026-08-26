
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const M=window.MyGameFinder;

  function empty(label,action){
    return `<div class="v21-empty"><b>${safe(label)}</b><p>${safe(action)}</p></div>`;
  }

  function gameCards(items,kind){
    if(!items.length)return empty(
      kind==="fav"?"お気に入りはまだありません。":"遊びたいゲームはまだありません。",
      "ゲームページやDiscovery Engineから追加できます。"
    );
    return `<div class="v21-card-grid">${items.map(x=>`
      <article class="v21-game-card">
        <a href="${safe(x.url||"#")}"><img src="${safe(x.image||"/assets/og.svg")}" onerror="this.src='/assets/og.svg'" alt=""></a>
        <div><span>${kind==="fav"?"FAVORITE":"PLAY LATER"}</span><h3>${safe(x.title||x.name||"Game")}</h3>
        <div><a href="${safe(x.url||"#")}">開く →</a><button data-remove-kind="${kind}" data-remove-id="${safe(x.id)}">削除</button></div></div>
      </article>`).join("")}</div>`;
  }

  function readCards(items){
    if(!items.length)return empty("あとで読む記事はありません。","記事ページから「あとで読む」を追加できます。");
    return `<div class="v21-list">${items.map(x=>`
      <article><div><span>READ LATER</span><h3>${safe(x.title)}</h3></div><div><a href="${safe(x.url)}">読む →</a><button data-remove-read="${safe(x.id)}">削除</button></div></article>`).join("")}</div>`;
  }

  function historyCards(items){
    if(!items.length)return empty("閲覧履歴はまだありません。","ゲーム・記事・診断・比較を開くとここに残ります。");
    return `<div class="v21-history">${items.slice(0,30).map(x=>`
      <a href="${safe(x.url||x.id)}"><span>${safe((x.type||"page").toUpperCase())}</span><b>${safe(x.title)}</b><small>${new Date(x.updatedAt||Date.now()).toLocaleDateString("ja-JP")}</small></a>`).join("")}</div>`;
  }

  function diagnosisCards(items){
    if(!items.length)return empty("保存された診断結果はありません。","おすすめ診断を実行すると、上位候補をここに保存できます。");
    return `<div class="v21-diagnosis">${items.map(x=>`
      <article><span>DIAGNOSIS</span><h3>${safe(x.title||"おすすめ診断")}</h3>
      <p>${(x.results||[]).slice(0,4).map(r=>safe(r.name||r.title)).join(" / ")||"保存済み診断"}</p>
      <small>${new Date(x.createdAt||x.updatedAt||Date.now()).toLocaleString("ja-JP")}</small>
      <button data-remove-diag="${safe(x.id)}">削除</button></article>`).join("")}</div>`;
  }

  function compareCards(items){
    if(!items.length)return empty("比較候補はありません。","Discovery・診断から最大4本を比較へ送れます。");
    return `<div class="v21-compare">${items.map(x=>`<span>${safe(x.name||x.title)}</span>`).join("")}<a href="/compare.html">比較画面を開く →</a></div>`;
  }

  function stats(){
    const vals=[
      ["お気に入り",M.favorites().length],
      ["遊びたい",M.wishlist().length],
      ["あとで読む",M.readLater().length],
      ["履歴",M.history().length],
      ["診断",M.diagnosis().length],
      ["比較候補",M.compare().length]
    ];
    $("#v21-stats").innerHTML=vals.map(([a,b])=>`<div><b>${b}</b><span>${a}</span></div>`).join("");
  }

  function render(){
    stats();
    $("#v21-favorites").innerHTML=gameCards(M.favorites(),"fav");
    $("#v21-wishlist").innerHTML=gameCards(M.wishlist(),"wish");
    $("#v21-reading").innerHTML=readCards(M.readLater());
    $("#v21-history").innerHTML=historyCards(M.history());
    $("#v21-diagnosis").innerHTML=diagnosisCards(M.diagnosis());
    $("#v21-compare").innerHTML=compareCards(M.compare());
  }

  document.addEventListener("click",e=>{
    const r=e.target.closest("[data-remove-kind]");
    if(r){
      const key=r.dataset.removeKind==="fav"?"favorites":"wishlist";
      M.remove(M.KEYS[key],r.dataset.removeId);render();return;
    }
    const rr=e.target.closest("[data-remove-read]");
    if(rr){M.remove(M.KEYS.readLater,rr.dataset.removeRead);render();return;}
    const rd=e.target.closest("[data-remove-diag]");
    if(rd){M.remove(M.KEYS.diagnosis,rd.dataset.removeDiag);render();return;}
    const clear=e.target.closest("[data-clear-section]");
    if(clear){
      const k=clear.dataset.clearSection;
      if(confirm("この一覧をすべて消去しますか？")){M.clearSection(k);render();}
    }
  });

  $("#v21-export").onclick=()=>{
    const data={
      version:"v21",
      exportedAt:new Date().toISOString(),
      favorites:M.favorites(),wishlist:M.wishlist(),readLater:M.readLater(),
      history:M.history(),diagnosis:M.diagnosis(),compare:M.compare()
    };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="my-gamefinder.json";
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),500);
  };

  $("#v21-import-file").onchange=async e=>{
    const file=e.target.files?.[0]; if(!file)return;
    try{
      const data=JSON.parse(await file.text());
      const map={favorites:"favorites",wishlist:"wishlist",readLater:"readLater",history:"history",diagnosis:"diagnosis",compare:"compare"};
      Object.entries(map).forEach(([src,dst])=>{
        if(Array.isArray(data[src])) M.save(M.KEYS[dst],data[src]);
      });
      render();
      e.target.value="";
    }catch{
      alert("GameFinderのJSONとして読み込めませんでした。");
    }
  };

  window.addEventListener("gf:my-updated",render);
  render();
})();
