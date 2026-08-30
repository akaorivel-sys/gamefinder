import assert from 'node:assert/strict';
import test from 'node:test';

test('routes deterministic script work locally with zero Codex Workers', async () => {
  const { selectExecutionRoute }=await import('../../scripts/lib/control-plane/resource-routing.mjs');
  assert.deepEqual(selectExecutionRoute({
    task_id:'validate-control-plane',
    task_type:'validation_run',
    classification:'local_script'
  }),{
    classification:'local_script',
    execution_route:'local-script',
    worker_count:0,
    dispatch_reason:'deterministic local scripts can complete this task'
  });
});

test('routes a single repository change to Codex Master with zero Workers', async () => {
  const { selectExecutionRoute }=await import('../../scripts/lib/control-plane/resource-routing.mjs');
  const plan=selectExecutionRoute({
    task_id:'fix-registry-code',
    task_type:'repository_change',
    classification:'repository_change'
  });
  assert.equal(plan.execution_route,'codex-master');
  assert.equal(plan.worker_count,0);
  assert.equal(plan.classification,'repository_change');
  assert.match(plan.dispatch_reason,/Master/);
});

test('defaults unclassified repository work to Codex Master and zero Workers', async () => {
  const { classifyTask, selectExecutionRoute }=await import('../../scripts/lib/control-plane/resource-routing.mjs');
  const task={task_id:'unknown-repository-task',task_type:'repository_change'};
  assert.equal(classifyTask(task),'repository_change');
  assert.equal(selectExecutionRoute(task).worker_count,0);
  assert.equal(selectExecutionRoute(task).execution_route,'codex-master');
});

test('uses only the useful number of optional Workers for independent parallel code', async () => {
  const { selectExecutionRoute }=await import('../../scripts/lib/control-plane/resource-routing.mjs');
  const two=selectExecutionRoute({
    task_id:'parallel-two',
    task_type:'parallel_code_change',
    classification:'parallel_code_change',
    parallelizable:true,
    requested_worker_count:3,
    independent_units:['schema','cli']
  });
  assert.equal(two.execution_route,'codex-worker-wave');
  assert.equal(two.worker_count,2);
  assert.match(two.dispatch_reason,/2 independent code units/);

  const capped=selectExecutionRoute({
    task_id:'parallel-five',
    task_type:'parallel_code_change',
    classification:'parallel_code_change',
    parallelizable:true,
    requested_worker_count:5,
    independent_units:['a','b','c','d','e']
  });
  assert.equal(capped.worker_count,3);
});

test('falls back to Codex Master when parallel work has no independent units', async () => {
  const { selectExecutionRoute }=await import('../../scripts/lib/control-plane/resource-routing.mjs');
  const plan=selectExecutionRoute({
    task_id:'not-actually-parallel',
    task_type:'parallel_code_change',
    classification:'parallel_code_change',
    parallelizable:true,
    requested_worker_count:3,
    independent_units:[]
  });
  assert.equal(plan.execution_route,'codex-master');
  assert.equal(plan.worker_count,0);
});

test('never dispatches content generation or article writing to Codex Workers', async () => {
  const { selectExecutionRoute }=await import('../../scripts/lib/control-plane/resource-routing.mjs');
  for (const classification of ['content_generation','article_writing']) {
    const plan=selectExecutionRoute({
      task_id:`negative-${classification}`,
      task_type:classification,
      classification,
      parallelizable:true,
      requested_worker_count:3,
      independent_units:['research','outline','prose']
    });
    assert.equal(plan.execution_route,'external-content-input');
    assert.equal(plan.worker_count,0);
    assert.match(plan.dispatch_reason,/GPT Content Workers/);
  }
});

test('content task type overrides an unsafe parallel-code classification', async () => {
  const { selectExecutionRoute }=await import('../../scripts/lib/control-plane/resource-routing.mjs');
  const plan=selectExecutionRoute({
    task_id:'misclassified-article',
    task_type:'article_writing',
    classification:'parallel_code_change',
    parallelizable:true,
    independent_units:['one','two']
  });
  assert.equal(plan.classification,'article_writing');
  assert.equal(plan.execution_route,'external-content-input');
  assert.equal(plan.worker_count,0);
});

test('routes application of a completed Content Batch to Codex Master', async () => {
  const { selectExecutionRoute }=await import('../../scripts/lib/control-plane/resource-routing.mjs');
  const plan=selectExecutionRoute({
    task_id:'apply-completed-content',
    task_type:'article_writing',
    completed_content_batch:true
  });
  assert.equal(plan.classification,'content_application');
  assert.equal(plan.execution_route,'codex-master');
  assert.equal(plan.worker_count,0);
  const typed=selectExecutionRoute({task_id:'apply-by-type',task_type:'content_batch_apply'});
  assert.equal(typed.classification,'content_application');
  assert.equal(typed.execution_route,'codex-master');
  assert.equal(typed.worker_count,0);
});

test('plans a round without exceeding the shared three-Worker pool', async () => {
  const { planResources }=await import('../../scripts/lib/control-plane/resource-routing.mjs');
  const planned=planResources([
    {task_id:'parallel-1',classification:'parallel_code_change',parallelizable:true,independent_units:['a','b']},
    {task_id:'local-1',classification:'local_script'},
    {task_id:'parallel-2',classification:'parallel_code_change',parallelizable:true,independent_units:['c','d']}
  ]);
  assert.equal(planned.worker_count,3);
  assert.equal(planned.task_plans.length,3);
  assert.deepEqual(planned.task_plans.map(item=>item.execution_route),['codex-worker-wave','local-script','codex-worker-wave']);
  assert.equal(planned.task_plans.reduce((total,item)=>total+item.worker_count,0),3);
  assert.deepEqual(planned.deferred_task_ids,[]);

  const exhausted=planResources([
    {task_id:'parallel-a',classification:'parallel_code_change',parallelizable:true,independent_units:['a1','a2']},
    {task_id:'parallel-b',classification:'parallel_code_change',parallelizable:true,independent_units:['b1','b2']},
    {task_id:'parallel-c',classification:'parallel_code_change',parallelizable:true,independent_units:['c1','c2']}
  ]);
  assert.equal(exhausted.task_plans.reduce((total,item)=>total+item.worker_count,0),3);
  assert.deepEqual(exhausted.deferred_task_ids,['parallel-c']);
});
