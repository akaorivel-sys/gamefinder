export function deriveProgress({games=[],articles=[],tasks=[],assignments=[],results=[]}) {
  const assignedIds=new Set(assignments.flatMap(a=>(a.tasks??[]).map(t=>t.task_id)));
  const resultByTask=new Map();
  for (const r of results) for (const t of (r.tasks??[])) resultByTask.set(t.task_id,t.status);
  const workers={};
  for (const a of assignments) {
    workers[a.worker] ??={assigned:0,workload:0,complete:0,failed:0,skipped:0};
    workers[a.worker].assigned += a.tasks?.length ?? 0;
    workers[a.worker].workload += a.workload ?? 0;
    for (const t of (a.tasks??[])) {
      const status=resultByTask.get(t.task_id);
      if (status==='complete') workers[a.worker].complete++;
      if (status==='failed') workers[a.worker].failed++;
      if (status==='skipped') workers[a.worker].skipped++;
    }
  }
  const statuses=[...resultByTask.values()];
  return {
    targets:{games:1000,deepArticles:1000},
    current:{
      games:games.length,
      enrichedOrEditorialGames:games.filter(g=>['deep','editorial-plus','enriched-plus'].includes(String(g.editorialStatus).toLowerCase())).length,
      deepMarkedArticles:articles.filter(a=>a.depth==='deep').length,
      deepQualifiedArticles:articles.filter(a=>a.depth==='deep' && a.deepQualified).length,
      totalArticles:articles.length
    },
    queue:{
      total:tasks.length,
      queuedAvailable:tasks.filter(t=>t.status==='queued' && !assignedIds.has(t.task_id)).length,
      assigned:assignedIds.size,
      prReady:statuses.filter(s=>s==='pr-ready').length,
      failed:statuses.filter(s=>s==='failed').length,
      complete:statuses.filter(s=>s==='complete').length
    },
    workers
  };
}
