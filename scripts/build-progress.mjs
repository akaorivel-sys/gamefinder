import fs from 'node:fs';
import path from 'node:path';
import { deriveProgress } from './lib/progress.mjs';
import { generatedTextMatches, writeJsonAtomic } from './lib/control-plane/io.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const jsonFiles=dir=>fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>n.endsWith('.json')).sort().map(n=>read(path.join(dir,n))):[];
const progress=deriveProgress({
  games:read('editorial/registry/games.json'),
  articles:read('editorial/registry/articles.json'),
  tasks:read('editorial/queue/tasks.json'),
  assignments:jsonFiles('editorial/queue/assignments'),
  results:jsonFiles('editorial/results')
});
progress.generatedAt=new Date().toISOString();
const stable={...progress,generatedAt:'GENERATED_AT_RUNTIME'};
const target='editorial/progress.json';
const check=process.argv.includes('--check');
const next=JSON.stringify(stable,null,2)+'\n';
const prev=fs.existsSync(target)?fs.readFileSync(target,'utf8'):null;
if(check && !generatedTextMatches(prev,next)){console.error('progress manifest differs from generated state');process.exit(1)}
if(!check) writeJsonAtomic(target,stable);
console.log(`games=${progress.current.games} deepQualified=${progress.current.deepQualifiedArticles} assigned=${progress.queue.assigned}`);
