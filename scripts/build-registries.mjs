import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistries } from './lib/registry.mjs';
import { generatedTextMatches, writeJsonAtomic } from './lib/control-plane/io.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicDir=path.join(root,'public');
const outDir=path.join(root,'editorial','registry');
const check=process.argv.includes('--check');
const data=buildRegistries(publicDir);
fs.mkdirSync(outDir,{recursive:true});
const files={
  'games.json':data.games,
  'articles.json':data.articles,
  'sources.json':data.sources
};
let changed=false;
for (const [name,value] of Object.entries(files)) {
  const target=path.join(outDir,name);
  const next=JSON.stringify(value,null,2)+'\n';
  const prev=fs.existsSync(target)?fs.readFileSync(target,'utf8'):null;
  if (!generatedTextMatches(prev,next)) changed=true;
  if (!check) writeJsonAtomic(target,value);
}
if (check && changed) {
  console.error('Registry files differ from generated state. Run npm run build:registries.');
  process.exit(1);
}
console.log(`games=${data.games.length} articles=${data.articles.length} sources=${data.sources.length} changed=${changed}`);
