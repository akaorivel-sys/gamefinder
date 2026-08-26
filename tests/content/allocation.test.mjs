import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateTasks } from '../../scripts/lib/allocation.mjs';

test('task is assigned to only one worker', () => {
  const tasks=[
    {task_id:'t1',task_type:'article_create',priority:90,status:'queued'},
    {task_id:'t2',task_type:'source_refresh',priority:80,status:'queued'}
  ];
  const out=allocateTasks(tasks,['a','b']);
  const ids=out.flatMap(x=>x.tasks.map(t=>t.task_id));
  assert.equal(ids.length,new Set(ids).size);
});

test('allocator balances workload units rather than raw task count', () => {
  const tasks=[
    {task_id:'heavy',task_type:'game_enrichment',priority:100,status:'queued'},
    {task_id:'l1',task_type:'source_refresh',priority:90,status:'queued'},
    {task_id:'l2',task_type:'source_refresh',priority:80,status:'queued'},
    {task_id:'l3',task_type:'source_refresh',priority:70,status:'queued'},
    {task_id:'l4',task_type:'source_refresh',priority:60,status:'queued'}
  ];
  const out=allocateTasks(tasks,['a','b']);
  const loads=out.map(x=>x.workload);
  assert.ok(Math.max(...loads)-Math.min(...loads) <= 1, `loads=${loads}`);
});
