export const TASK_WEIGHTS={
  source_refresh:1,
  internal_link_pass:1,
  editorial_rewrite:2,
  article_upgrade:3,
  article_create:3,
  dossier_upgrade:3,
  game_enrichment:4
};
export const ALLOWED_TASK_TYPES=new Set(Object.keys(TASK_WEIGHTS));

export function allocateTasks(tasks,workers=['a','b','c','d','e']) {
  const eligible=tasks.filter(t=>t.status==='queued' && ALLOWED_TASK_TYPES.has(t.task_type))
    .sort((a,b)=>(b.priority??0)-(a.priority??0) || String(a.task_id).localeCompare(String(b.task_id)));
  const bins=workers.map(worker=>({worker,workload:0,tasks:[]}));
  const usedGames=new Map();
  for (const task of eligible) {
    const weight=TASK_WEIGHTS[task.task_type] ?? 1;
    let choices=[...bins].sort((a,b)=>a.workload-b.workload || a.worker.localeCompare(b.worker));
    if (task.slug && usedGames.has(task.slug)) {
      const owner=usedGames.get(task.slug);
      choices.sort((a,b)=> (a.worker===owner?-1:0)-(b.worker===owner?-1:0) || a.workload-b.workload);
    }
    const bin=choices[0];
    bin.tasks.push({...task,assigned_worker:bin.worker,workload_units:weight});
    bin.workload+=weight;
    if (task.slug && !usedGames.has(task.slug)) usedGames.set(task.slug,bin.worker);
  }
  return bins;
}
