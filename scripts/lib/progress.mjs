export function deriveProgress({games=[],articles=[],tasks=[],assignments=[]}) {
  const workers={};
  for (const a of assignments) {
    workers[a.worker] ??={assigned:0,workload:0};
    workers[a.worker].assigned += a.tasks?.length ?? 0;
    workers[a.worker].workload += a.workload ?? 0;
  }
  const countStatus=s=>tasks.filter(t=>t.status===s).length;
  return {
    targets:{games:1000,deepArticles:1000},
    current:{
      games:games.length,
      enrichedOrEditorialGames:games.filter(g=>['deep','editorial-plus','enriched-plus'].includes(String(g.editorialStatus).toLowerCase())).length,
      deepArticles:articles.filter(a=>a.depth==='deep').length,
      totalArticles:articles.length
    },
    queue:{
      queued:countStatus('queued'),
      assigned:countStatus('assigned'),
      prReady:countStatus('pr-ready'),
      failed:countStatus('failed'),
      complete:countStatus('complete')
    },
    workers
  };
}
