const byTaskId=(tasks)=>new Map(tasks.map(task=>[task.task_id,task]));

const cycleErrors=tasks=>{
  const byId=byTaskId(tasks);
  const visiting=new Set();
  const visited=new Set();
  const cycles=[];
  const seen=new Set();
  const visit=(taskId,trail)=>{
    if (visiting.has(taskId)) {
      const cycle=trail.slice(trail.indexOf(taskId)).sort();
      const key=cycle.join('\u0000');
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push({code:'DEPENDENCY_CYCLE',task_ids:cycle});
      }
      return;
    }
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependencyId of byId.get(taskId).depends_on??[]) if (byId.has(dependencyId)) visit(dependencyId,[...trail,taskId]);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of tasks) visit(task.task_id,[]);
  return cycles.sort((a,b)=>a.task_ids.join('\u0000').localeCompare(b.task_ids.join('\u0000')));
};

export const evaluateDependencies=(tasks,completedIds)=>{
  const completed=new Set(completedIds);
  const byId=byTaskId(tasks);
  const missing=[];
  for (const task of tasks) for (const dependencyId of task.depends_on??[]) {
    if (!byId.has(dependencyId)) missing.push({code:'MISSING_DEPENDENCY',task_id:task.task_id,dependency_id:dependencyId});
  }
  const cycles=cycleErrors(tasks);
  const errors=[...missing,...cycles];
  const cyclicIds=new Set(cycles.flatMap(error=>error.task_ids));
  const blocked=tasks.filter(task=>task.status==='queued' && (
    cyclicIds.has(task.task_id) || (task.depends_on??[]).some(dependencyId=>!completed.has(dependencyId))
  )).map(task=>task.task_id);
  if (errors.length) return {ready_task_ids:[],blocked_task_ids:blocked,errors};
  return {
    ready_task_ids:tasks.filter(task=>task.status==='queued' && !(task.depends_on??[]).some(dependencyId=>!completed.has(dependencyId))).map(task=>task.task_id),
    blocked_task_ids:blocked,
    errors:[]
  };
};
