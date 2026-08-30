import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const at='2026-08-28T04:00:00.000Z';
const later='2026-08-28T04:05:00.000Z';
const baseSha='a'.repeat(40);
const commitSha='b'.repeat(40);
const dispatch={classification:'parallel_code_change',execution_route:'codex-worker-wave',worker_count:1,dispatch_reason:'one independent code unit benefits from delegation'};
const batch=(state='ACTIVE')=>({schema_version:2,batch_id:'batch-0002',state,base_sha:baseSha,...dispatch,created_at:at,updated_at:at,history:[]});
const assignment=(state='RUNNING')=>({schema_version:2,assignment_id:'assignment-0002-a-001-01',batch_id:'batch-0002',wave:1,worker_id:'a',attempt:1,state,task_ids:['code-task-1'],expected_paths:['scripts/example.mjs'],base_sha:baseSha,branch:'workers/batch-0002/a-wave-001',worktree_path:'worktrees/batch-0002/a-wave-001',result_path:'editorial/results/v2/result-0002-a-001-01.json',...dispatch,created_at:at,updated_at:at,history:[]});
const result=()=>({schema_version:2,result_id:'result-0002-a-001-01',batch_id:'batch-0002',wave:1,assignment_id:'assignment-0002-a-001-01',worker_id:'a',base_sha:baseSha,commit_sha:commitSha,task_outcomes:[{task_id:'code-task-1',status:'COMPLETED'}],changed_paths:['scripts/example.mjs'],validation:[{command:'node --test',exit_code:0}],...dispatch,created_at:at,completed_at:later,notes:''});
const evidence=(status='READY')=>({status,branch:'workers/batch-0002/a-wave-001',baseSha,head:commitSha,registered:true,baseExists:true,baseIsAncestor:true,clean:status==='READY',changes:status==='DIRTY'?[' M scripts/example.mjs']:[],issues:status==='READY'?[]:[`WORKTREE_${status}`]});
const locks=()=>({schema_version:2,batch_id:'batch-0002',locks:[{assignment_id:'assignment-0002-a-001-01',worker_id:'a',wave:1,path:'scripts/example.mjs',state:'HELD',acquired_at:at,updated_at:at}],updated_at:at});

test('control store writes atomic session checkpoints within its state root', async () => {
  const { createControlStore }=await import('../../scripts/lib/control-plane/store.mjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-control-store-'));
  try {
    const store=createControlStore(temporary);
    const value={schema_version:2,session_id:'session-test'};
    store.write('sessions/session-test.json',value);
    assert.deepEqual(store.read('sessions/session-test.json'),value);
    assert.deepEqual(fs.readdirSync(path.join(temporary,'sessions')),['session-test.json']);
    assert.throws(()=>store.write('../outside.json',value),/outside/);
  } finally {
    fs.rmSync(temporary,{recursive:true,force:true});
  }
});

test('reconciles a proven clean Result to RESULT_READY and batch REVIEW', async () => {
  const { reconcileBatch }=await import('../../scripts/lib/control-plane/reconcile.mjs');
  const originalLocks=locks();
  const reconciled=reconcileBatch({batch:batch(),assignments:[assignment()],results:[result()],worktree_evidence:{'assignment-0002-a-001-01':evidence()},locks:originalLocks,at:later});
  assert.equal(reconciled.assignments[0].state,'RESULT_READY');
  assert.equal(reconciled.batch.state,'REVIEW');
  assert.deepEqual(reconciled.attention,[]);
  assert.deepEqual(reconciled.locks,originalLocks);
  assert.notEqual(reconciled.locks,originalLocks);
  assert.deepEqual(reconcileBatch({...reconciled,results:[result()],worktree_evidence:{'assignment-0002-a-001-01':evidence()},at:later}),reconciled);
});

test('does not invent completion when a Result or clean commit evidence is missing', async () => {
  const { reconcileBatch }=await import('../../scripts/lib/control-plane/reconcile.mjs');
  const noResult=reconcileBatch({batch:batch(),assignments:[assignment()],results:[],worktree_evidence:{'assignment-0002-a-001-01':evidence()},locks:locks(),at:later});
  assert.equal(noResult.assignments[0].state,'RUNNING');
  assert.equal(noResult.batch.state,'ACTIVE');
  const wrongHead=reconcileBatch({batch:batch(),assignments:[assignment()],results:[result()],worktree_evidence:{'assignment-0002-a-001-01':evidence('STALE')},locks:locks(),at:later});
  assert.equal(wrongHead.assignments[0].state,'INTERRUPTED');
  assert.equal(wrongHead.batch.state,'INTERRUPTED');
});

test('preserves locks and reports attention for DIRTY, STALE, and CORRUPTED worktrees', async () => {
  const { reconcileBatch }=await import('../../scripts/lib/control-plane/reconcile.mjs');
  for (const status of ['DIRTY','STALE','CORRUPTED']) {
    const original=locks();
    const reconciled=reconcileBatch({batch:batch(),assignments:[assignment()],results:[result()],worktree_evidence:{'assignment-0002-a-001-01':evidence(status)},locks:original,at:later});
    assert.equal(reconciled.assignments[0].state,'INTERRUPTED');
    assert.equal(reconciled.batch.state,'INTERRUPTED');
    assert.deepEqual(reconciled.attention,[{assignment_id:'assignment-0002-a-001-01',status}]);
    assert.equal(reconciled.locks.locks[0].state,'HELD');
  }
});

test('resumes an interrupted session only when Result and worktree evidence prove completion', async () => {
  const { reconcileBatch }=await import('../../scripts/lib/control-plane/reconcile.mjs');
  const reconciled=reconcileBatch({batch:batch('INTERRUPTED'),assignments:[assignment('INTERRUPTED')],results:[result()],worktree_evidence:{'assignment-0002-a-001-01':evidence()},locks:locks(),at:later});
  assert.equal(reconciled.assignments[0].state,'RESULT_READY');
  assert.equal(reconciled.batch.state,'REVIEW');
  assert.match(reconciled.assignments[0].history.at(-1).reason,/reconcile/i);
  assert.match(reconciled.batch.history.at(-1).reason,/reconcile/i);
});

test('requires attention instead of choosing between duplicate Results', async () => {
  const { reconcileBatch }=await import('../../scripts/lib/control-plane/reconcile.mjs');
  const reconciled=reconcileBatch({batch:batch(),assignments:[assignment()],results:[result(),result()],worktree_evidence:{'assignment-0002-a-001-01':evidence()},locks:locks(),at:later});
  assert.equal(reconciled.assignments[0].state,'RUNNING');
  assert.equal(reconciled.batch.state,'INTERRUPTED');
  assert.deepEqual(reconciled.attention,[{assignment_id:'assignment-0002-a-001-01',status:'RESULT_DUPLICATE'}]);
});

test('keeps a rejected assignment out of the reviewable set', async () => {
  const { reconcileBatch }=await import('../../scripts/lib/control-plane/reconcile.mjs');
  const reconciled=reconcileBatch({batch:batch(),assignments:[assignment('REVIEW_REJECTED')],results:[],worktree_evidence:{},locks:locks(),at:later});
  assert.equal(reconciled.assignments[0].state,'REVIEW_REJECTED');
  assert.equal(reconciled.batch.state,'INTERRUPTED');
  assert.deepEqual(reconciled.attention,[{assignment_id:'assignment-0002-a-001-01',status:'REVIEW_REJECTED'}]);
});

test('removes RESULT_READY from review eligibility when its worktree becomes unsafe', async () => {
  const { reconcileBatch }=await import('../../scripts/lib/control-plane/reconcile.mjs');
  const reconciled=reconcileBatch({batch:batch('REVIEW'),assignments:[assignment('RESULT_READY')],results:[result()],worktree_evidence:{'assignment-0002-a-001-01':evidence('DIRTY')},locks:locks(),at:later});
  assert.equal(reconciled.assignments[0].state,'INTERRUPTED');
  assert.equal(reconciled.batch.state,'INTERRUPTED');
  assert.deepEqual(reconciled.attention,[{assignment_id:'assignment-0002-a-001-01',status:'DIRTY'}]);
  assert.equal(reconciled.locks.locks[0].state,'HELD');
});
