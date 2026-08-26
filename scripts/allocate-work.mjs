import fs from 'node:fs';
import path from 'node:path';
import { allocateTasks } from './lib/allocation.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.split('=')));
const batch=String(args['--batch'] ?? '0001').padStart(4,'0');
const budget=Number(args['--budget'] ?? 15);
const tasks=JSON.parse(fs.readFileSync('editorial/queue/tasks.json','utf8'));
const all=allocateTasks(tasks,['a','b','c','d','e']);
for (const bin of all) {
  let load=0; const chosen=[];
  for (const task of bin.tasks) {
    if (chosen.length && load+task.workload_units>budget) continue;
    if (!chosen.length && task.workload_units>budget) continue;
    chosen.push(task); load+=task.workload_units;
  }
  const payload={batch:`batch-${batch}`,worker:bin.worker,workload:load,tasks:chosen};
  const target=path.join('editorial','queue','assignments',`batch-${batch}-worker-${bin.worker}.json`);
  fs.writeFileSync(target,JSON.stringify(payload,null,2)+'\n');
  console.log(`${bin.worker}: tasks=${chosen.length} workload=${load}`);
}
