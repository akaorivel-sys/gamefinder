export const CLASSIFICATIONS=Object.freeze([
  'local_script',
  'repository_change',
  'parallel_code_change',
  'content_generation',
  'article_writing',
  'content_application'
]);

export const EXECUTION_ROUTES=Object.freeze([
  'local-script',
  'codex-master',
  'codex-worker-wave',
  'external-content-input'
]);

const CLASSIFICATION_SET=new Set(CLASSIFICATIONS);
const EXECUTION_ROUTE_SET=new Set(EXECUTION_ROUTES);
const ARTICLE_TASK_TYPES=new Set([
  'article_writing',
  'article_create',
  'article_upgrade',
  'editorial_rewrite',
  'dossier_upgrade'
]);
const CONTENT_TASK_TYPES=new Set([
  'content_generation',
  'source_refresh',
  'game_enrichment'
]);
const CONTENT_APPLICATION_TASK_TYPES=new Set(['content_batch_apply','content_application']);
const LOCAL_TASK_TYPES=new Set([
  'validation_run',
  'registry_build',
  'progress_build',
  'control_plane_validation'
]);

const assertTask=task=>{
  if (!task || typeof task!=='object' || Array.isArray(task)) throw new TypeError('task must be an object');
};

export const classifyTask=task=>{
  assertTask(task);

  if (task.completed_content_batch===true || task.content_batch_ready===true || CONTENT_APPLICATION_TASK_TYPES.has(task.task_type)) return 'content_application';
  if (ARTICLE_TASK_TYPES.has(task.task_type)) return 'article_writing';
  if (CONTENT_TASK_TYPES.has(task.task_type)) return 'content_generation';

  if (task.classification!==undefined) {
    if (!CLASSIFICATION_SET.has(task.classification)) throw new Error('classification is invalid');
    return task.classification;
  }

  if (LOCAL_TASK_TYPES.has(task.task_type) || task.local_scripts_only===true) return 'local_script';
  if (task.task_type==='parallel_code_change') return 'parallel_code_change';
  return 'repository_change';
};

const independentUnitCount=task=>{
  if (Array.isArray(task.independent_units)) {
    return new Set(task.independent_units.filter(unit=>typeof unit==='string' && unit.length>0)).size;
  }
  return Number.isInteger(task.independent_unit_count) && task.independent_unit_count>0
    ? task.independent_unit_count
    : 0;
};

export const selectExecutionRoute=task=>{
  const classification=classifyTask(task);

  if (classification==='content_generation' || classification==='article_writing') {
    return {
      classification,
      execution_route:'external-content-input',
      worker_count:0,
      dispatch_reason:'GPT Content Workers must provide a completed Content Batch'
    };
  }

  if (classification==='content_application') {
    return {
      classification,
      execution_route:'codex-master',
      worker_count:0,
      dispatch_reason:'Codex Master applies the completed Content Batch to the repository'
    };
  }

  if (classification==='local_script') {
    return {
      classification,
      execution_route:'local-script',
      worker_count:0,
      dispatch_reason:'deterministic local scripts can complete this task'
    };
  }

  if (classification==='parallel_code_change' && task.parallelizable===true) {
    const unitCount=independentUnitCount(task);
    const requested=Number.isInteger(task.requested_worker_count) && task.requested_worker_count>0
      ? task.requested_worker_count
      : unitCount;
    const workerCount=Math.min(3,unitCount,requested);
    if (workerCount>0) {
      return {
        classification,
        execution_route:'codex-worker-wave',
        worker_count:workerCount,
        dispatch_reason:`${workerCount} independent code units benefit from parallel execution`
      };
    }
  }

  return {
    classification,
    execution_route:'codex-master',
    worker_count:0,
    dispatch_reason:'Codex Master can complete this repository task without parallel Workers'
  };
};

export const planResources=tasks=>{
  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
  const taskPlans=[];
  const deferredTaskIds=[];
  let remainingWorkers=3;
  for (const task of tasks) {
    const plan=selectExecutionRoute(task);
    if (plan.execution_route!=='codex-worker-wave') {
      taskPlans.push({task_id:task.task_id,...plan});
      continue;
    }
    if (remainingWorkers===0) {
      deferredTaskIds.push(task.task_id);
      continue;
    }
    const workerCount=Math.min(plan.worker_count,remainingWorkers);
    taskPlans.push({
      task_id:task.task_id,
      ...plan,
      worker_count:workerCount,
      dispatch_reason:`${workerCount} independent code units fit the current optional Worker pool`
    });
    remainingWorkers-=workerCount;
  }
  return {
    task_plans:taskPlans,
    deferred_task_ids:deferredTaskIds,
    worker_count:taskPlans.reduce((total,plan)=>total+plan.worker_count,0),
    dispatch_reason:taskPlans.some(plan=>plan.worker_count>0)
      ? 'optional Codex Worker pool is limited to three concurrent Workers'
      : 'this round requires no Codex Workers'
  };
};

const invalid=field=>{ throw new Error(`${field} is invalid`); };

export const validateDispatchMetadata=value=>{
  if (!value || typeof value!=='object' || Array.isArray(value)) invalid('dispatch metadata');
  if (!CLASSIFICATION_SET.has(value.classification)) invalid('classification');
  if (!EXECUTION_ROUTE_SET.has(value.execution_route)) invalid('execution_route');
  if (!Number.isInteger(value.worker_count) || value.worker_count<0 || value.worker_count>3) invalid('worker_count');
  if (typeof value.dispatch_reason!=='string' || value.dispatch_reason.trim()==='') invalid('dispatch_reason');

  if (value.execution_route==='codex-worker-wave') {
    if (value.classification!=='parallel_code_change') invalid('execution_route');
    if (value.worker_count<1) invalid('worker_count');
  } else if (value.worker_count!==0) {
    invalid('worker_count');
  }

  if (value.classification==='content_generation' || value.classification==='article_writing') {
    if (value.execution_route!=='external-content-input') invalid('execution_route');
  }
  if (value.classification==='content_application' && value.execution_route!=='codex-master') invalid('execution_route');
  if (value.classification==='local_script' && value.execution_route!=='local-script') invalid('execution_route');
  if (value.classification==='repository_change' && value.execution_route!=='codex-master') invalid('execution_route');
  if (value.execution_route==='external-content-input' && !['content_generation','article_writing'].includes(value.classification)) invalid('execution_route');

  return value;
};
