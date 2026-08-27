import assert from 'node:assert/strict';
import test from 'node:test';

const at='2026-08-27T00:00:00.000Z';
const later='2026-08-27T00:01:00.000Z';
const sha='a'.repeat(40);
const batch=state=>({schema_version:2,batch_id:'batch-0002',state,base_sha:sha,created_at:at,updated_at:at,history:[]});
const assignment=state=>({schema_version:2,assignment_id:'assignment-0002-a-001-01',batch_id:'batch-0002',wave:1,worker_id:'a',attempt:1,state,task_ids:['task-1'],expected_paths:['public/articles/example.html'],base_sha:sha,branch:'workers/batch-0002/a-wave-001',worktree_path:'worktrees/batch-0002/a-wave-001',result_path:'editorial/results/v2/result-0002-a-001-01.json',created_at:at,updated_at:at,history:[]});
const context={at:later,reason:'verified evidence'};

test('transitions a batch through its legal history with injected timestamps', async () => {
  const { transitionBatch }=await import('../../scripts/lib/control-plane/state-machine.mjs');
  let current=batch('DRAFT');
  for (const state of ['ALLOCATED','ACTIVE','REVIEW','INTEGRATION_PREPARED','APPROVAL_PENDING']) current=transitionBatch(current,state,context);
  assert.equal(current.state,'APPROVAL_PENDING');
  assert.equal(current.updated_at,later);
  assert.deepEqual(current.history.map(entry=>entry.to),['ALLOCATED','ACTIVE','REVIEW','INTEGRATION_PREPARED','APPROVAL_PENDING']);
  assert.deepEqual(current.history.at(-1),{from:'INTEGRATION_PREPARED',to:'APPROVAL_PENDING',at:later,reason:'verified evidence'});
});

test('rejects an invalid batch transition without mutating the input', async () => {
  const { transitionBatch }=await import('../../scripts/lib/control-plane/state-machine.mjs');
  const original=batch('DRAFT');
  assert.throws(()=>transitionBatch(original,'REVIEW',context),/DRAFT.*REVIEW/);
  assert.deepEqual(original,batch('DRAFT'));
});

test('allows interruption only from active batch states and leaves complete terminal', async () => {
  const { transitionBatch }=await import('../../scripts/lib/control-plane/state-machine.mjs');
  for (const state of ['ACTIVE','REVIEW','INTEGRATION_PREPARED']) assert.equal(transitionBatch(batch(state),'INTERRUPTED',context).state,'INTERRUPTED');
  assert.throws(()=>transitionBatch(batch('ALLOCATED'),'INTERRUPTED',context),/ALLOCATED.*INTERRUPTED/);
  assert.throws(()=>transitionBatch(batch('COMPLETE'),'INTERRUPTED',context),/COMPLETE.*INTERRUPTED/);
});

test('requires an explicit user approval decision before leaving approval pending', async () => {
  const { transitionBatch }=await import('../../scripts/lib/control-plane/state-machine.mjs');
  assert.throws(()=>transitionBatch(batch('APPROVAL_PENDING'),'APPROVED',context),/user_decision/);
  const approved=transitionBatch(batch('APPROVAL_PENDING'),'APPROVED',{...context,user_decision:'APPROVED',actor:'user'});
  assert.equal(approved.state,'APPROVED');
  assert.equal(transitionBatch(approved,'COMPLETE',context).state,'COMPLETE');
});

test('transitions an assignment through result review and integration history', async () => {
  const { transitionAssignment }=await import('../../scripts/lib/control-plane/state-machine.mjs');
  let current=assignment('ALLOCATED');
  for (const state of ['DISPATCHED','RUNNING','RESULT_READY','REVIEW_PASSED','INTEGRATED']) current=transitionAssignment(current,state,context);
  assert.equal(current.state,'INTEGRATED');
  assert.deepEqual(current.history.map(entry=>entry.to),['DISPATCHED','RUNNING','RESULT_READY','REVIEW_PASSED','INTEGRATED']);
  assert.equal(current.updated_at,later);
});

test('keeps rejected and failed assignments terminal and supports interruption', async () => {
  const { transitionAssignment }=await import('../../scripts/lib/control-plane/state-machine.mjs');
  const rejected=transitionAssignment(assignment('RESULT_READY'),'REVIEW_REJECTED',context);
  assert.throws(()=>transitionAssignment(rejected,'INTEGRATED',context),/REVIEW_REJECTED.*INTEGRATED/);
  const failed=transitionAssignment(assignment('RUNNING'),'FAILED',context);
  assert.throws(()=>transitionAssignment(failed,'RESULT_READY',context),/FAILED.*RESULT_READY/);
  for (const state of ['DISPATCHED','RUNNING']) assert.equal(transitionAssignment(assignment(state),'INTERRUPTED',context).state,'INTERRUPTED');
  assert.throws(()=>transitionAssignment(assignment('ALLOCATED'),'INTERRUPTED',context),/ALLOCATED.*INTERRUPTED/);
});

test('requires injected timestamps for immutable transition records', async () => {
  const { transitionAssignment }=await import('../../scripts/lib/control-plane/state-machine.mjs');
  assert.throws(()=>transitionAssignment(assignment('ALLOCATED'),'DISPATCHED',{reason:'dispatch'}),/at/);
});
