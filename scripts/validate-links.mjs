import fs from 'node:fs';
import path from 'node:path';
const errors=[];
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p,out);else if(e.isFile()&&p.endsWith('.html'))out.push(p)}return out}
for(const file of walk('public')){
  const s=fs.readFileSync(file,'utf8');
  for(const m of s.matchAll(/(?:href|src)=["'](\/[^"'#]*)/gi)){
    let u=m[1];
    if(!u || u==='/' || u.startsWith('//')) continue;
    u=u.split('?')[0];
    if(!u) continue;
    let target=path.join('public',u.replace(/^\//,''));
    if(u.endsWith('/')) target=path.join(target,'index.html');
    if(!fs.existsSync(target)) errors.push(`${file}: ${m[1]}`);
  }
}
if(errors.length){console.error(errors.slice(0,100).join('\n'));process.exit(1)}
console.log('link gate OK');
