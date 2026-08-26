import fs from 'node:fs';
import path from 'node:path';
const errors=[];
function walk(dir){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory()) walk(p);
    else if(e.isFile() && p.endsWith('.html')){
      const s=fs.readFileSync(p,'utf8');
      if(!/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']/i.test(s) &&
         !/<meta\s+content=["'][^"']*noindex[^"']*["']\s+name=["']robots["']/i.test(s)) {
        errors.push(`missing noindex: ${p}`);
      }
    }
  }
}
walk('public');
const robots=fs.readFileSync('public/robots.txt','utf8');
if(!/User-agent:\s*\*/i.test(robots) || !/Disallow:\s*\/\s*$/im.test(robots)) errors.push('robots.txt must disallow all crawling in current phase');
if(errors.length){console.error(errors.slice(0,100).join('\n'));process.exit(1)}
console.log('indexing gate OK: live site remains noindex');
