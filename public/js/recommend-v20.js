
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let all=[], answers={}, results=[];

  const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const known=x=>x!==null&&x!==undefined&&x!=="";
  const isPlus=x=>(x.metadata_level==="editorial-plus"||x.enrichment==="editorial-plus");

  const questions=[
    {
      id:"mood", title:"今いちばんやりたいことは？", note:"ゲームの中心となる遊び方を選びます。",
      options:[
        ["build","作る・育てる","工場、都市、基地、コロニーなど"],
        ["explore","探索する","未知の場所、世界、宇宙、ダンジョン"],
        ["survive","生き延びる","資源、危機、サバイバル"],
        ["fight","戦う","アクション、戦闘、対戦"],
        ["relax","ゆっくり遊ぶ","落ち着いた進行、自由度、生活"],
        ["think","考える","戦略、最適化、パズル、管理"]
      ]
    },
    {
      id:"social", title:"誰と遊ぶ？", note:"ソロ・協力・対戦の優先度です。",
      options:[
        ["solo","基本ソロ","一人で完結したい"],
        ["coop","友達と協力","一緒に進めたい"],
        ["multi","オンライン中心","対戦・大人数も含む"],
        ["either","どちらでも","ここは重要ではない"]
      ]
    },
    {
      id:"complexity", title:"複雑さはどこまで欲しい？", note:"学習量や管理量の目安です。",
      options:[
        ["light","軽め","説明を読みすぎず遊びたい"],
        ["mid","ほどほど","覚えることがあっても大丈夫"],
        ["deep","かなり深く","複雑なSystemを理解したい"]
      ]
    },
    {
      id:"commitment", title:"1本をどれくらい遊びたい？", note:"平均Playtimeがあるゲームでは直接使います。",
      options:[
        ["short","10時間前後でもOK","短く満足したい"],
        ["medium","30時間くらい","ほどよく遊びたい"],
        ["long","100時間以上でもいい","長く育てたい"],
        ["endless","何百時間でも","終わらない趣味にしたい"]
      ]
    },
    {
      id:"budget", title:"価格はどこまで？", note:"価格Metadataがある作品だけ厳密に絞ります。",
      options:[
        ["free","無料だけ","まず試したい"],
        ["10","$10以下","安い作品中心"],
        ["20","$20以下","比較的安く"],
        ["40","$40以下","中価格帯まで"],
        ["any","気にしない","内容優先"]
      ]
    },
    {
      id:"platform", title:"遊ぶ環境は？", note:"対応Platformが確認できる作品だけ一致扱いにします。",
      options:[
        ["windows","Windows","PC Windows"],
        ["linux","Linux / Steam Deck","Proton含む詳細は個別確認"],
        ["mac","Mac","macOS"],
        ["any","特に指定なし","Platformは絞らない"]
      ]
    },
    {
      id:"japanese", title:"日本語対応は必須？", note:"言語Metadataが不明な作品は必須条件に入りません。",
      options:[
        ["required","必須","日本語対応確認済みのみ"],
        ["prefer","できれば欲しい","一致すると加点"],
        ["any","なくてもOK","言語は重視しない"]
      ]
    },
    {
      id:"pc", title:"PC負荷はどこまで許容？", note:"GameFinder独自PC負荷情報がある作品では直接使います。",
      options:[
        ["low","軽い方がいい","低スペック優先"],
        ["mid","普通","中程度まで"],
        ["high","重くてもOK","内容優先"],
        ["any","気にしない","PC負荷は評価しない"]
      ]
    },
    {
      id:"mods", title:"MODは重要？", note:"MOD情報がある作品では優先度に反映します。",
      options:[
        ["yes","かなり重要","長く改造して遊びたい"],
        ["nice","あると嬉しい","追加要素として欲しい"],
        ["no","なくてもいい","Vanilla重視"]
      ]
    },
    {
      id:"certainty", title:"情報の確実さをどこまで優先する？", note:"Metadataが少ないEnriched Coreを候補に残すか決めます。",
      options:[
        ["high","かなり重視","情報が揃った作品中心"],
        ["mid","ほどほど","多少不明でも候補に残す"],
        ["wide","幅広く見たい","情報が少なくても発見したい"]
      ]
    }
  ];

  const moodMap={
    build:{genres:["Simulation","Strategy","Building","Management"],tags:["Base Building","City Builder","Automation","Colony Sim","Crafting"]},
    explore:{genres:["Adventure","RPG","Open World"],tags:["Exploration","Open World","Space","Survival"]},
    survive:{genres:["Survival","Simulation"],tags:["Survival","Crafting","Base Building","Zombies"]},
    fight:{genres:["Action","Shooter","Fighting"],tags:["Action","FPS","Combat","Multiplayer"]},
    relax:{genres:["Casual","Simulation","Adventure"],tags:["Relaxing","Cozy","Life Sim","Farming"]},
    think:{genres:["Strategy","Simulation","Puzzle"],tags:["Automation","Management","Strategy","Puzzle"]}
  };

  function buildQuestions(){
    $("#v20-questions").innerHTML=questions.map((q,qi)=>`
      <section class="v20-question" data-q="${q.id}">
        <div class="v20-qnum">${String(qi+1).padStart(2,"0")}</div>
        <div class="v20-qbody"><span>QUESTION ${qi+1}/${questions.length}</span><h2>${safe(q.title)}</h2><p>${safe(q.note)}</p>
        <div class="v20-options">${q.options.map(([v,t,n])=>`<button data-value="${safe(v)}"><b>${safe(t)}</b><small>${safe(n)}</small></button>`).join("")}</div></div>
      </section>`).join("");
    $$(".v20-question").forEach(sec=>{
      $$("[data-value]",sec).forEach(b=>b.onclick=()=>{
        answers[sec.dataset.q]=b.dataset.value;
        $$("[data-value]",sec).forEach(x=>x.classList.toggle("active",x===b));
        updateProgress();
      });
    });
  }

  function updateProgress(){
    const n=Object.keys(answers).length;
    $("#v20-progress span").style.width=(n/questions.length*100)+"%";
    $("#v20-progress-text").textContent=`${n}/${questions.length} 回答`;
    $("#v20-run").disabled=n<7;
  }

  function arr(x){return Array.isArray(x)?x:[]}
  function text(x){return String(x||"").toLowerCase()}
  function hasAny(values, needles){
    const vals=arr(values).map(x=>text(x));
    return needles.some(n=>vals.some(v=>v.includes(text(n))));
  }
  function multiText(x){return text(x.multiplayer_editorial||x.multiplayer)}
  function pcText(x){return text(x.pc_load_editorial||x.pcLoadEditorial)}
  function modText(x){
    return [x.summary,x.best_for,x.bestFor,...arr(x.tags),...arr(x.genres)].filter(Boolean).join(" ").toLowerCase();
  }

  function hardFilter(x){
    if(!x || !x.name) return false;

    // Social hard constraints only when explicitly selected.
    if(answers.social==="coop"){
      const m=multiText(x);
      if(m && !(m.includes("coop")||m.includes("co-op")||m.includes("協力"))) return false;
      if(!m && answers.certainty==="high") return false;
    }
    if(answers.social==="solo"){
      const m=multiText(x);
      if(m && !(m.includes("solo")||m.includes("single"))) return false;
    }

    // Budget.
    if(answers.budget==="free"){
      if(x.price_cents!==0) return false;
    } else if(["10","20","40"].includes(answers.budget)){
      const cap=Number(answers.budget)*100;
      if(!known(x.price_cents)){
        if(answers.certainty==="high") return false;
      } else if(Number(x.price_cents)>cap) return false;
    }

    // Platform.
    if(["windows","linux","mac"].includes(answers.platform)){
      const v=x["platform_"+answers.platform];
      if(v!==true){
        if(answers.certainty!=="wide") return false;
      }
    }

    // Japanese required.
    if(answers.japanese==="required" && x.japanese!==true) return false;

    // Metadata certainty.
    const c=Number(x.metadata_completeness||0);
    if(answers.certainty==="high" && c<60 && !isPlus(x)) return false;
    if(answers.certainty==="mid" && c<25 && !isPlus(x)) return false;

    return true;
  }

  function evaluate(x){
    let score=0, evidence=0, possible=0;
    const reasons=[], cautions=[];

    const mood=moodMap[answers.mood];
    if(mood){
      possible+=26;
      if(hasAny(x.genres,mood.genres) || hasAny(x.tags,mood.tags)){
        score+=26; evidence+=1;
        const matches=[...arr(x.genres),...arr(x.tags)].filter(v=>[...mood.genres,...mood.tags].some(n=>text(v).includes(text(n)))).slice(0,3);
        reasons.push(`${answers.mood==="build"?"作る・育てる":answers.mood==="explore"?"探索":answers.mood==="survive"?"サバイバル":answers.mood==="fight"?"戦闘":answers.mood==="relax"?"ゆっくり":"考える"}系の要素${matches.length?`（${matches.join(" / ")}）`:""}が一致`);
      }
    }

    // social
    if(answers.social && answers.social!=="either"){
      possible+=18;
      const m=multiText(x);
      let ok=false;
      if(answers.social==="coop") ok=m.includes("coop")||m.includes("co-op")||m.includes("協力");
      if(answers.social==="solo") ok=m.includes("solo")||m.includes("single");
      if(answers.social==="multi") ok=m.includes("multi")||m.includes("対戦")||m.includes("coop")||m.includes("協力");
      if(ok){score+=18;evidence+=1;reasons.push(`希望するプレイ形態（${answers.social}）と一致`);}
      else if(!m)cautions.push("Play style情報が不足");
    }

    // complexity (editorial proxy only)
    if(answers.complexity){
      possible+=12;
      const blob=[...arr(x.genres),...arr(x.tags),x.summary,x.best_for,x.bestFor].filter(Boolean).join(" ").toLowerCase();
      const deepWords=["strategy","simulation","management","automation","colony","grand strategy","工場","管理","シミュレーション","複雑","最適化"];
      const lightWords=["casual","relaxing","cozy","party","simple","casual"];
      const deep=deepWords.some(w=>blob.includes(w)), light=lightWords.some(w=>blob.includes(w));
      if(answers.complexity==="deep" && deep){score+=12;evidence+=1;reasons.push("複雑なSystem・管理系の要素が一致");}
      if(answers.complexity==="light" && light){score+=12;evidence+=1;reasons.push("比較的軽く入りやすい要素が一致");}
      if(answers.complexity==="mid" && (deep||light)){score+=7;evidence+=1;}
    }

    // commitment / playtime
    if(answers.commitment){
      possible+=16;
      const min=Number(x.average_forever_min);
      const target={short:0,medium:600,long:1800,endless:6000}[answers.commitment];
      if(known(x.average_forever_min)){
        if(answers.commitment==="short"){
          if(min<=1800){score+=12;reasons.push(`平均Playtime ${Math.round(min/60)}時間`);}
        } else if(min>=target){score+=16;reasons.push(`平均Playtime ${Math.round(min/60)}時間で長期向き`);}
        evidence+=1;
      } else cautions.push("平均Playtime不明");
    }

    // price evidence
    if(answers.budget && answers.budget!=="any"){
      possible+=10;
      if(known(x.price_cents)){
        score+=10;evidence+=1;
        reasons.push(x.price_cents===0?"無料":"予算内");
      } else cautions.push("価格不明");
    }

    // language
    if(answers.japanese==="required"||answers.japanese==="prefer"){
      possible+=12;
      if(x.japanese===true){score+=12;evidence+=1;reasons.push("日本語対応確認済み");}
      else if(x.japanese==null)cautions.push("日本語対応不明");
    }

    // platform
    if(["windows","linux","mac"].includes(answers.platform)){
      possible+=12;
      if(x["platform_"+answers.platform]===true){score+=12;evidence+=1;reasons.push(`${answers.platform}対応確認済み`);}
      else cautions.push(`${answers.platform}対応不明`);
    }

    // PC load
    if(answers.pc && answers.pc!=="any"){
      possible+=9;
      const p=pcText(x);
      if(p){
        evidence+=1;
        const low=p.includes("軽")||p.includes("low");
        const high=p.includes("重")||p.includes("high");
        if(answers.pc==="low" && low){score+=9;reasons.push("PC負荷が軽め");}
        else if(answers.pc==="mid" && !high){score+=7;}
        else if(answers.pc==="high"){score+=5;}
      } else cautions.push("PC負荷情報なし");
    }

    // Mods
    if(answers.mods==="yes"||answers.mods==="nice"){
      possible+=9;
      const m=modText(x);
      if(m.includes("mod")||m.includes("workshop")){
        score+=answers.mods==="yes"?9:6;evidence+=1;reasons.push("MOD/Workshopとの相性情報あり");
      } else if(isPlus(x)) cautions.push("MOD適性は強く確認できず");
    }

    // Quality / review
    possible+=12;
    if(known(x.review_score)){
      const r=Number(x.review_score);
      score+=Math.max(0,(r-.55))*20;
      evidence+=1;
      if(r>=.85)reasons.push(`高いReview率（${Math.round(r*100)}%）`);
    } else cautions.push("Review率不明");

    // Metadata confidence
    possible+=12;
    const comp=Number(x.metadata_completeness||0);
    score += Math.min(12,comp*.12);
    if(comp>=60)evidence+=1;
    if(isPlus(x)){score+=8;reasons.push("GameFinder Editorial Plus");possible+=8;}

    const raw=possible?score/possible:0;
    const confidence=Math.min(100,Math.round((comp*.55)+(evidence/10*45)+(isPlus(x)?10:0)));
    const match=Math.max(0,Math.min(99,Math.round(raw*100)));
    return {x,score,match,confidence,reasons:[...new Set(reasons)].slice(0,6),cautions:[...new Set(cautions)].slice(0,4)};
  }

  function run(){
    if(Object.keys(answers).length<7)return;
    results=all.filter(hardFilter).map(evaluate)
      .filter(r=>r.match>=25)
      .sort((a,b)=>(b.match+a.confidence*.15)-(a.match+b.confidence*.15))
      .slice(0,24);
    renderResults();
    $("#v20-results-section").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function reasonHTML(r){
    return r.reasons.map(x=>`<li>${safe(x)}</li>`).join("");
  }
  function cautionHTML(r){
    if(!r.cautions.length)return "";
    return `<div class="v20-cautions"><span>確認したい点</span>${r.cautions.map(x=>`<i>${safe(x)}</i>`).join("")}</div>`;
  }
  function level(x){return isPlus(x)?"EDITORIAL PLUS":"ENRICHED CORE"}

  function resultCard(r,idx){
    const x=r.x;
    const store=x.official_store_url||x.officialStoreUrl||`https://store.steampowered.com/app/${x.appid}/`;
    return `<article class="v20-result-card ${idx<3?"top":""}">
      <div class="v20-result-image"><img src="${safe(x.image||"/assets/og.svg")}" onerror="this.src='/assets/og.svg'" alt=""><span>#${idx+1}</span></div>
      <div class="v20-result-body">
        <div class="v20-result-meta"><span>${level(x)}</span><b>${r.match}% MATCH</b><i>${r.confidence}% confidence</i></div>
        <h2>${safe(x.name)}</h2>
        <p>${safe(x.summary||x.best_for||x.bestFor||"Verified metadataを基に診断しています。")}</p>
        <ul>${reasonHTML(r)}</ul>
        ${cautionHTML(r)}
        <div class="v20-result-actions">
          <a href="${x.slug?`/games/${safe(x.slug)}.html`:`/game/?appid=${x.appid}`}">${x.slug?"Dossier":"Game page"} →</a>
          <a href="${safe(store)}" target="_blank" rel="noopener nofollow">Steam →</a>
          <button data-compare="${x.appid}">比較へ追加</button>
        </div>
      </div>
    </article>`;
  }

  function renderResults(){
    $("#v20-result-count").textContent=results.length;
    if(!results.length){
      $("#v20-results").innerHTML=`<div class="v20-noresult"><b>十分な根拠を持つ候補が見つかりませんでした。</b><p>条件を少し緩めるか、「情報の確実さ」を幅広くへ変更してください。Metadata不明の作品を無理に候補へ入れない設計です。</p></div>`;
    } else {
      $("#v20-results").innerHTML=results.map(resultCard).join("");
    }
    $$("[data-compare]").forEach(b=>b.onclick=()=>addCompare(b.dataset.compare,b));
    renderAnswerSummary();
  }

  function addCompare(appid,button){
    const x=all.find(g=>Number(g.appid)===Number(appid)); if(!x)return;
    let list=[];
    try{list=JSON.parse(localStorage.getItem("gamefinder-v18-compare")||"[]")}catch{}
    if(!list.some(v=>Number(v.appid)===Number(appid))){
      if(list.length>=4)list.shift();
      list.push({appid:x.appid,name:x.name,image:x.image||""});
      localStorage.setItem("gamefinder-v18-compare",JSON.stringify(list));
    }
    button.textContent="比較に追加済み";
    button.classList.add("active");
  }

  function renderAnswerSummary(){
    const labels={};
    questions.forEach(q=>q.options.forEach(([v,t])=>labels[q.id+":"+v]=t));
    $("#v20-answer-summary").innerHTML=Object.entries(answers).map(([k,v])=>`<span>${safe(labels[k+":"+v]||v)}</span>`).join("");
  }

  function reset(){
    answers={};
    $$(".v20-options button").forEach(b=>b.classList.remove("active"));
    updateProgress();
    $("#v20-results").innerHTML="";
    $("#v20-answer-summary").innerHTML="";
    scrollTo({top:0,behavior:"smooth"});
  }


  function saveCurrentDiagnosis(){
    if(!results.length || !window.MyGameFinder)return;
    const top=results.slice(0,6).map(r=>({
      appid:r.x.appid,
      name:r.x.name,
      image:r.x.image||"",
      match:r.match,
      confidence:r.confidence
    }));
    window.MyGameFinder.saveDiagnosis({
      title:"おすすめ診断 "+new Date().toLocaleDateString("ja-JP"),
      answers:{...answers},
      results:top
    });
    const b=document.getElementById("v20-save-diagnosis");
    if(b){b.textContent="保存しました";setTimeout(()=>b.textContent="この診断結果をMy GameFinderへ保存",1300);}
  }

  async function init(){
    all=await window.GameFinderRichCatalog;
    buildQuestions();
    $("#v20-run").onclick=run;
    const sb=$("#v20-save-diagnosis"); if(sb) sb.onclick=saveCurrentDiagnosis;
    $("#v20-reset").onclick=reset;
    updateProgress();
  }
  init();
})();
