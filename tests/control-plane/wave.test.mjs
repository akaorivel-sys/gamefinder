import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateWave } from '../../scripts/lib/allocation.mjs';

const sha='a'.repeat(40);
const task=(task_id,priority,task_type='source_refresh',overrides={})=>({task_id,priority,task_type,status:'queued',depends_on:[],expected_paths:[`scripts/synthetic/${task_id}.mjs`],...overrides});
const batch=(overrides={})=>({batch_id:'batch-0002',wave:1,base_sha:sha,created_at:'2026-08-27T00:00:00.000Z',assignments:[],completed_task_ids:[],allow_reassignment_task_ids:[],...overrides});
const locks=(entries=[])=>({schema_version:2,batch_id:'batch-0002',locks:entries,updated_at:'2026-08-27T00:00:00.000Z'});

test('uses no more than three Workers and balances task weights deterministically', () => {
  const result=allocateWave({
    tasks:[task('heavy',100,'game_enrichment'),task('light-1',90),task('light-2',80),task('light-3',70)],
    batch:batch(), workers:['a','b','c','d','e'], locks:locks(), maxWorkers:5
  });
  assert.deepEqual(result.assignments.map(assignment=>[assignment.worker_id,assignment.task_ids,assignment.workload_units]),[
    ['a',['heavy'],4],['b',['light-1','light-3'],2],['c',['light-2'],1]
  ]);
  assert.equal(new Set(result.assignments.map(assignment=>assignment.worker_id)).size,3);
});

test('does not allocate a task or worker already occupied by a nonterminal assignment', () => {
  const result=allocateWave({
    tasks:[task('already-assigned',100),task('new-task',90)],
    batch:batch({assignments:[{assignment_id:'assignment-0002-a-001-01',worker_id:'a',task_ids:['already-assigned'],attempt:1,state:'RUNNING'}],allow_reassignment_task_ids:['already-assigned']}),
    workers:['a','b','c'], locks:locks(), maxWorkers:3
  });
  assert.deepEqual(result.assignments.map(assignment=>[assignment.worker_id,assignment.task_ids]),[['b',['new-task']]]);
});

test('requires explicit approved reassignment and increments its attempt', () => {
  const history=[{assignment_id:'assignment-0002-a-001-01',worker_id:'a',task_ids:['retry'],attempt:1,state:'FAILED'}];
  const denied=allocateWave({tasks:[task('retry',100)],batch:batch({assignments:history}),workers:['a','b'],locks:locks(),maxWorkers:3});
  const approved=allocateWave({tasks:[task('retry',100)],batch:batch({assignments:history,allow_reassignment_task_ids:['retry']}),workers:['a','b'],locks:locks(),maxWorkers:3});
  assert.deepEqual(denied.assignments,[]);
  assert.deepEqual(approved.assignments.map(assignment=>[assignment.worker_id,assignment.task_ids,assignment.attempt]),[['a',['retry'],2]]);
});

test('keeps separate attempt groups on distinct Workers and never shares one worktree', () => {
  const result=allocateWave({
    tasks:[task('retry',100),task('fresh',90)],
    batch:batch({assignments:[{assignment_id:'assignment-0002-a-001-01',worker_id:'a',task_ids:['retry'],attempt:1,state:'FAILED'}],allow_reassignment_task_ids:['retry']}),
    workers:['a','b'],locks:locks(),maxWorkers:2
  });
  assert.deepEqual(result.assignments.map(assignment=>[assignment.worker_id,assignment.task_ids,assignment.attempt]),[['a',['retry'],2],['b',['fresh'],1]]);

  const oneWorker=allocateWave({
    tasks:[task('retry',100),task('fresh',90)],
    batch:batch({assignments:[{assignment_id:'assignment-0002-a-001-01',worker_id:'a',task_ids:['retry'],attempt:1,state:'FAILED'}],allow_reassignment_task_ids:['retry']}),
    workers:['a'],locks:locks(),maxWorkers:1
  });
  assert.deepEqual(oneWorker.assignments.map(assignment=>[assignment.worker_id,assignment.task_ids,assignment.attempt]),[['a',['retry'],2]]);
  assert.deepEqual(oneWorker.blocked_task_ids,['fresh']);
});

test('deduplicates worker IDs before selecting a Wave', () => {
  const result=allocateWave({tasks:[task('first',100),task('second',90)],batch:batch(),workers:['a','a','b'],locks:locks(),maxWorkers:3});
  assert.deepEqual(result.assignments.map(assignment=>[assignment.worker_id,assignment.task_ids]),[['a',['first']],['b',['second']]]);
});

test('excludes an active Worker ID across mixed Worker representations', () => {
  const result=allocateWave({
    tasks:[task('first',100)],batch:batch(),workers:[{worker_id:'a',state:'RUNNING'},'a','b'],locks:locks(),maxWorkers:3
  });
  assert.deepEqual(result.assignments.map(assignment=>[assignment.worker_id,assignment.task_ids]),[['b',['first']]]);
});

test('filters unfinished dependencies and locked or conflicting owned paths', () => {
  const result=allocateWave({
    tasks:[
      task('blocked-dependency',100,'source_refresh',{depends_on:['done']}),
      task('done',1,'source_refresh',{status:'blocked'}),
      task('locked-path',90,'source_refresh',{expected_paths:['scripts/synthetic/locked.mjs']}),
      task('free-path',80,'source_refresh',{expected_paths:['scripts/synthetic/free.mjs']}),
      task('same-free-path',70,'source_refresh',{expected_paths:['scripts/synthetic/free.mjs']})
    ],
    batch:batch(), workers:['a','b','c'],
    locks:locks([{assignment_id:'assignment-0002-e-001-01',worker_id:'e',wave:1,path:'scripts/synthetic/locked.mjs',state:'HELD',acquired_at:'2026-08-27T00:00:00.000Z',updated_at:'2026-08-27T00:00:00.000Z'}]), maxWorkers:3
  });
  assert.deepEqual(result.assignments.map(assignment=>assignment.task_ids),[['free-path']]);
  assert.deepEqual(result.blocked_task_ids,['blocked-dependency','locked-path','same-free-path']);
});

test('uses completed task IDs when evaluating Wave dependencies', () => {
  const result=allocateWave({
    tasks:[task('dependent',100,'source_refresh',{depends_on:['done']}),task('done',1,'source_refresh',{status:'completed'})],
    batch:batch({completed_task_ids:['done']}),workers:['a'],locks:locks(),maxWorkers:1
  });
  assert.deepEqual(result.assignments.map(assignment=>assignment.task_ids),[['dependent']]);
});
