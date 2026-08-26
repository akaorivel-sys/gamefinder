
document.addEventListener('DOMContentLoaded',async()=>{try{const a=await fetch('/data/search-index.json').then(r=>r.json());const n=a.filter(x=>x.kind!=='game').length;const e=document.querySelector('#v8ArticleCount');if(e)e.textContent=n}catch{}});
