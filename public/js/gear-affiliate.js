
document.addEventListener('DOMContentLoaded',async()=>{let c;try{c=await fetch('/data/gear-affiliate.json',{cache:'no-store'}).then(r=>r.json())}catch{return}
document.querySelectorAll('[data-gear-affiliate]').forEach(b=>{const k=b.dataset.gearAffiliate,u=c?.enabled&&c.links?c.links[k]:'';if(!u)return;b.hidden=false;const a=b.querySelector('a');a.href=u;a.target='_blank';a.rel='sponsored nofollow noopener noreferrer'})});
