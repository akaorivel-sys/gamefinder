import fs from 'node:fs';
const articles=JSON.parse(fs.readFileSync('editorial/registry/articles.json','utf8'));
const games=JSON.parse(fs.readFileSync('editorial/registry/games.json','utf8'));
const gameBySlug=new Map(games.map(g=>[g.slug,g]));
const tasks=[];
for (const a of articles) {
  if (!a.gameSlug) continue;
  const g=gameBySlug.get(a.gameSlug);
  if (!g) continue;
  if (a.depth==='deep' && !a.deepQualified) {
    tasks.push({
      task_id:`upgrade-${a.slug}-deep-v1`,game_id:g.id,appid:g.appid,slug:g.slug,
      task_type:'article_upgrade',article_slug:a.slug,article_type:'existing-deep',priority:100,
      required_depth:'deep',min_visible_chars:8000,research_required:true,status:'queued',depends_on:[],assigned_worker:null
    });
  } else if (a.depth==='thin') {
    tasks.push({
      task_id:`upgrade-${a.slug}-deep-v1`,game_id:g.id,appid:g.appid,slug:g.slug,
      task_type:'article_upgrade',article_slug:a.slug,article_type:'legacy-thin',priority:60+(g.editorialStatus==='deep'?10:0),
      required_depth:'deep',min_visible_chars:8000,research_required:true,status:'queued',depends_on:[],assigned_worker:null
    });
  }
}
tasks.sort((a,b)=>b.priority-a.priority || a.task_id.localeCompare(b.task_id));
fs.mkdirSync('editorial/queue',{recursive:true});
fs.writeFileSync('editorial/queue/tasks.json',JSON.stringify(tasks,null,2)+'\n');
console.log(`created ${tasks.length} queued tasks`);
