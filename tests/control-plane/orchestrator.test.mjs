import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const at='2026-08-28T05:00:00.000Z';
const sha='a'.repeat(40);
const batch=(overrides={})=>({schema_version:2,batch_id:'batch-0002',state:'DRAFT',base_sha:sha,classification:'repository_change',execution_route:'codex-master',worker_count:0,dispatch_reason:'initial Master route',created_at:at,updated_at:at,history:[],...overrides});
const state=(tasks,overrides={})=>({
  repository_safe:true,
  batch:batch(),
  tasks,
  assignments:[],
  completed_task_ids:[],
  locks:{schema_version:2,batch_id:'batch-0002',locks:[],updated_at:at},
  workers:['a','b','c','d','e'],
  ...overrides
});
const task=(task_id,classification,overrides={})=>({task_id,task_type:classification,classification,priority:10,status:'queued',depends_on:[],expected_paths:[`scripts/${task_id}.mjs`],...overrides});

test('t advances one local-script round with zero Workers', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  let localCalls=0;
  let waveCalls=0;
  const round=runRound({state:state([task('validate','local_script',{task_type:'validation_run'})]),at,services:{
    executeLocal:()=>{ localCalls+=1; return {completed:true}; },
    createWorkerWave:()=>{ waveCalls+=1; }
  }});
  assert.equal(round.action,'LOCAL_SCRIPT_COMPLETED');
  assert.equal(round.execution_route,'local-script');
  assert.equal(round.worker_count,0);
  assert.equal(round.stop,false);
  assert.equal(round.state.tasks[0].status,'completed');
  assert.equal(localCalls,1);
  assert.equal(waveCalls,0);
});

test('t advances one Codex Master round with zero Workers', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  let masterCalls=0;
  const round=runRound({state:state([task('master-code','repository_change')]),at,services:{executeMaster:()=>{ masterCalls+=1; return {completed:true}; }}});
  assert.equal(round.action,'CODEX_MASTER_COMPLETED');
  assert.equal(round.execution_route,'codex-master');
  assert.equal(round.worker_count,0);
  assert.equal(masterCalls,1);
});

test('dispatches only the needed optional Workers and never more than three', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  const observed=[];
  const parallel=task('parallel','parallel_code_change',{parallelizable:true,requested_worker_count:3,independent_units:['schema','cli']});
  const round=runRound({state:state([parallel]),at,services:{createWorkerWave:context=>{
    observed.push(context.maxWorkers);
    return {assignments:[{assignment_id:'synthetic-a'},{assignment_id:'synthetic-b'}],locks:context.locks};
  }}});
  assert.equal(round.action,'WORKERS_REQUIRED');
  assert.equal(round.stop,true);
  assert.equal(round.execution_route,'codex-worker-wave');
  assert.equal(round.worker_count,2);
  assert.deepEqual(observed,[2]);

  const capped=runRound({state:state([task('parallel-five','parallel_code_change',{parallelizable:true,requested_worker_count:5,independent_units:['a','b','c','d','e']})]),at,services:{createWorkerWave:context=>({assignments:Array.from({length:context.maxWorkers},(_,index)=>({assignment_id:`synthetic-${index}`})),locks:context.locks})}});
  assert.equal(capped.worker_count,3);
  assert.equal(capped.state.assignments.length,3);
});

test('persists selected Worker count across distinct attempt groups', async () => {
  const { createWorkerWave }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  const retry=task('retry','parallel_code_change',{priority:20});
  const fresh=task('fresh','parallel_code_change',{priority:10});
  const created=createWorkerWave({
    tasks:[retry,fresh],
    batch:batch({allow_reassignment_task_ids:['retry']}),
    assignments:[{worker_id:'a',task_ids:['retry'],attempt:1,state:'FAILED',wave:1}],
    completed_task_ids:[],
    workers:['a','b'],
    locks:state([]).locks,
    maxWorkers:2,
    at
  });
  assert.equal(created.assignments.length,2);
  assert.deepEqual(created.assignments.map(assignment=>assignment.worker_count),[2,2]);
  assert.ok(created.assignments.every(assignment=>assignment.dispatch_reason.startsWith('2 optional Codex Workers ')));
});

test('honors dependencies before selecting local, Master, and Worker routes', async () => {
  const { runContinuous }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  const ordered=runContinuous({state:state([
    task('worker-after-local','parallel_code_change',{priority:30,parallelizable:true,requested_worker_count:1,independent_units:['worker-unit'],depends_on:['local-after-master']}),
    task('local-after-master','local_script',{task_type:'validation_run',priority:20,depends_on:['master-first']}),
    task('master-first','repository_change',{priority:10})
  ]),at,services:{executeLocal:()=>({completed:true}),executeMaster:()=>({completed:true})}});

  assert.deepEqual(ordered.rounds.map(round=>round.execution_route),['codex-master','local-script','codex-worker-wave']);
  assert.deepEqual(ordered.state.completed_task_ids,['master-first','local-after-master']);
  assert.deepEqual(ordered.state.assignments.flatMap(assignment=>assignment.task_ids),['worker-after-local']);
});

test('stops safely when the task graph has missing dependencies or a cycle', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  let executionCalls=0;
  const service=()=>{ executionCalls+=1; return {completed:true}; };
  const missing=runRound({state:state([
    task('orphan','local_script',{task_type:'validation_run',depends_on:['absent']})
  ]),at,services:{executeLocal:service,executeMaster:service,createWorkerWave:service}});
  const cyclic=runRound({state:state([
    task('cycle-a','repository_change',{depends_on:['cycle-b']}),
    task('cycle-b','parallel_code_change',{parallelizable:true,requested_worker_count:1,independent_units:['b'],depends_on:['cycle-a']})
  ]),at,services:{executeLocal:service,executeMaster:service,createWorkerWave:service}});

  assert.equal(missing.action,'DEPENDENCY_ERROR');
  assert.deepEqual(missing.dependency_errors,[{code:'MISSING_DEPENDENCY',task_id:'orphan',dependency_id:'absent'}]);
  assert.equal(cyclic.action,'DEPENDENCY_ERROR');
  assert.deepEqual(cyclic.dependency_errors,[{code:'DEPENDENCY_CYCLE',task_ids:['cycle-a','cycle-b']}]);
  assert.equal(executionCalls,0);
});

test('default Worker Wave allocates independent parallel tasks to at most three distinct Workers', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  const parallelTasks=['one','two','three','four'].map((id,index)=>task(`parallel-${id}`,'parallel_code_change',{
    priority:40-index,
    parallelizable:true,
    requested_worker_count:1,
    independent_units:[id]
  }));
  const round=runRound({state:state(parallelTasks),at});

  assert.equal(round.action,'WORKERS_REQUIRED');
  assert.equal(round.worker_count,3);
  assert.equal(round.state.assignments.length,3);
  assert.deepEqual([...new Set(round.state.assignments.map(assignment=>assignment.worker_id))],['a','b','c']);
  assert.deepEqual(round.state.assignments.flatMap(assignment=>assignment.task_ids).sort(),['parallel-one','parallel-three','parallel-two']);
});

test('allows an explicitly approved task to be reassigned after a terminal assignment', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  const retry=task('retry-terminal','parallel_code_change',{parallelizable:true,requested_worker_count:1,independent_units:['retry']});
  const previous={assignment_id:'assignment-0002-a-001-001',worker_id:'a',task_ids:['retry-terminal'],attempt:1,state:'FAILED',wave:1};
  const round=runRound({state:state([retry],{
    batch:batch({allow_reassignment_task_ids:['retry-terminal']}),
    assignments:[previous]
  }),at});

  assert.equal(round.action,'WORKERS_REQUIRED');
  assert.equal(round.state.assignments.length,2);
  assert.deepEqual(round.state.assignments[1].task_ids,['retry-terminal']);
  assert.equal(round.state.assignments[1].attempt,2);
});

test('reports only distinct active assignments as outstanding Workers and caps the count at three', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  const assignments=[
    {worker_id:'a',task_ids:['a-running'],state:'RUNNING'},
    {worker_id:'a',task_ids:['a-result'],state:'RESULT_READY'},
    {worker_id:'b',task_ids:['b-passed'],state:'REVIEW_PASSED'},
    {worker_id:'c',task_ids:['c-dispatched'],state:'DISPATCHED'},
    {worker_id:'d',task_ids:['d-allocated'],state:'ALLOCATED'},
    {worker_id:'e',task_ids:['e-failed'],state:'FAILED'}
  ];
  const round=runRound({state:state([],{assignments}),at});

  assert.equal(round.action,'WORKERS_REQUIRED');
  assert.equal(round.worker_count,3);
});

test('transitions a DRAFT batch to ALLOCATED when creating its first assignment', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  const round=runRound({state:state([
    task('first-worker','parallel_code_change',{parallelizable:true,requested_worker_count:1,independent_units:['first']})
  ]),at});

  assert.equal(round.state.batch.state,'ALLOCATED');
  assert.deepEqual(round.state.batch.history,[{from:'DRAFT',to:'ALLOCATED',at,reason:'optional Codex Worker assignments were allocated'}]);
});

test('never dispatches article prose even when unsafe parallel flags are present', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  let waveCalls=0;
  const content=task('article','article_writing',{parallelizable:true,requested_worker_count:3,independent_units:['research','outline','prose']});
  const round=runRound({state:state([content]),at,services:{createWorkerWave:()=>{ waveCalls+=1; }}});
  assert.equal(round.action,'EXTERNAL_CONTENT_REQUIRED');
  assert.equal(round.execution_route,'external-content-input');
  assert.equal(round.worker_count,0);
  assert.equal(round.stop,true);
  assert.equal(waveCalls,0);
  assert.equal(round.state.assignments.length,0);
});

test('never invents local or Master completion without executor evidence', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  const local=runRound({state:state([task('local-required','local_script',{task_type:'validation_run'})]),at});
  assert.equal(local.action,'LOCAL_SCRIPT_REQUIRED');
  assert.equal(local.stop,true);
  assert.equal(local.state.tasks[0].status,'queued');
  const master=runRound({state:state([task('master-required','repository_change')]),at});
  assert.equal(master.action,'CODEX_MASTER_REQUIRED');
  assert.equal(master.stop,true);
  assert.equal(master.state.tasks[0].status,'queued');
});

test('a reclassifies each round, completes zero-Worker routes, then stops for external content', async () => {
  const { runContinuous }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  const continuous=runContinuous({state:state([
    task('local','local_script',{task_type:'validation_run',priority:30}),
    task('master','repository_change',{priority:20}),
    task('content','content_generation',{priority:10})
  ]),at,services:{executeLocal:()=>({completed:true}),executeMaster:()=>({completed:true})}});
  assert.deepEqual(continuous.rounds.map(round=>round.execution_route),['local-script','codex-master','external-content-input']);
  assert.deepEqual(continuous.rounds.map(round=>round.worker_count),[0,0,0]);
  assert.equal(continuous.action,'EXTERNAL_CONTENT_REQUIRED');
  assert.equal(continuous.stop,true);
});

test('refuses Batch 0001, unsafe repositories, invalid state, and stops at approval PENDING', async () => {
  const { runRound }=await import('../../scripts/lib/control-plane/orchestrator.mjs');
  assert.throws(()=>runRound({state:state([],{batch:batch({batch_id:'batch-0001'})}),at}),/Batch 0001/);
  assert.throws(()=>runRound({state:state([],{repository_safe:false}),at}),/repository/);
  assert.throws(()=>runRound({state:state([],{batch:{...batch(),state:'INVALID'}}),at}),/state/);
  const pending={schema_version:2,batch_id:'batch-0002',status:'PENDING',integration_branch:'integration/batch-0002',integration_head:'b'.repeat(40),created_at:at,updated_at:at};
  const stopped=runRound({state:state([],{approval:pending}),at});
  assert.equal(stopped.action,'APPROVAL_PENDING');
  assert.equal(stopped.stop,true);
});

test('t and a CLI aliases preview by default and persist only with explicit --apply', () => {
  const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(packageJson.scripts.t,'node scripts/control-plane.mjs t');
  assert.equal(packageJson.scripts.a,'node scripts/control-plane.mjs a');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-orchestrator-cli-'));
  try {
    const statePath=path.join(temporary,'state.json');
    const initial=state([task('validate','local_script',{task_type:'validation_run'})]);
    fs.writeFileSync(statePath,JSON.stringify(initial,null,2));
    const preview=spawnSync(process.execPath,[path.join(root,'scripts/control-plane.mjs'),'t','--state',statePath],{encoding:'utf8'});
    assert.equal(preview.status,0,preview.stderr);
    assert.equal(JSON.parse(preview.stdout).action,'LOCAL_SCRIPT_REQUIRED');
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath,'utf8')),initial);

    const applied=spawnSync(process.execPath,[path.join(root,'scripts/control-plane.mjs'),'a','--state',statePath,'--apply'],{encoding:'utf8'});
    assert.equal(applied.status,0,applied.stderr);
    const saved=JSON.parse(fs.readFileSync(statePath,'utf8'));
    assert.equal(saved.tasks[0].status,'queued');
    assert.equal(saved.session.mode,'a');
    assert.equal(saved.session.worker_count,0);
  } finally {
    fs.rmSync(temporary,{recursive:true,force:true});
  }
});
