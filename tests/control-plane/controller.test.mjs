import assert from 'node:assert/strict';
import test from 'node:test';

const at='2026-08-29T01:00:00.000Z';
const baseSha='a'.repeat(40);
const commitSha='b'.repeat(40);
const dispatch={classification:'parallel_code_change',execution_route:'codex-worker-wave',worker_count:1,dispatch_reason:'one independent code task'};
const batch=(state='REVIEW')=>({schema_version:2,batch_id:'batch-0002',state,base_sha:baseSha,...dispatch,created_at:at,updated_at:at,history:[]});
const assignment=(state='RESULT_READY')=>({schema_version:2,assignment_id:'assignment-0002-a-001-001',batch_id:'batch-0002',wave:1,worker_id:'a',attempt:1,state,task_ids:['code-task'],expected_paths:['scripts/example.mjs'],base_sha:baseSha,branch:'workers/batch-0002/a-wave-001',worktree_path:'worktrees/batch-0002/a-wave-001',result_path:'editorial/results/v2/result-0002-a-001-001.json',...dispatch,created_at:at,updated_at:at,history:[]});
const result=()=>({schema_version:2,result_id:'result-0002-a-001-001',batch_id:'batch-0002',wave:1,assignment_id:'assignment-0002-a-001-001',worker_id:'a',base_sha:baseSha,commit_sha:commitSha,task_outcomes:[{task_id:'code-task',status:'COMPLETED'}],changed_paths:['scripts/example.mjs'],validation:[{command:'node --test',exit_code:0}],...dispatch,created_at:at,completed_at:at,notes:''});
const decision=()=>({schema_version:2,decision_id:'review-assignment-0002-a-001-001',batch_id:'batch-0002',wave:1,assignment_id:'assignment-0002-a-001-001',worker_id:'a',commit_sha:commitSha,status:'REVIEW_PASSED',actual_changed_paths:['scripts/example.mjs'],reviewed_at:at,reasons:[]});
const state=(overrides={})=>({repository_safe:true,batch:batch(),tasks:[],assignments:[assignment()],results:[result()],review_decisions:[],completed_task_ids:[],locks:{schema_version:2,batch_id:'batch-0002',locks:[],updated_at:at},workers:['a','b','c','d','e'],...overrides});

test('one deterministic control round reviews available Results and transitions assignments', async () => {
  const { advanceControlPlaneRound }=await import('../../scripts/lib/control-plane/controller.mjs');
  let reviews=0;
  const round=advanceControlPlaneRound({state:state(),at,apply:true,services:{review:context=>{ reviews+=1; assert.equal(context.result.assignment_id,context.assignment.assignment_id); return decision(); }}});
  assert.equal(round.action,'RESULTS_REVIEWED');
  assert.equal(round.stop,false);
  assert.equal(reviews,1);
  assert.equal(round.state.assignments[0].state,'REVIEW_PASSED');
  assert.deepEqual(round.state.review_decisions,[decision()]);
});

test('session-continuous control connects review, integration, and explicit PENDING approval', async () => {
  const { runControlPlaneContinuous }=await import('../../scripts/lib/control-plane/controller.mjs');
  const calls=[];
  const completed=runControlPlaneContinuous({state:state(),at,apply:true,services:{
    review:()=>{ calls.push('review'); return decision(); },
    integrate:context=>{ calls.push('integration'); assert.equal(context.assignments[0].assignment_id,context.review_decisions[0].assignment_id); assert.equal(context.results[0].commit_sha,context.review_decisions[0].commit_sha); return {status:'INTEGRATION_PREPARED',batch_id:'batch-0002',branch:'integration/batch-0002',head:'c'.repeat(40),prepared_at:at}; },
    buildApproval:context=>{ calls.push('approval'); return {schema_version:2,batch_id:'batch-0002',status:'PENDING',integration_branch:context.integration_branch,integration_head:context.integration_head,created_at:at,updated_at:at}; }
  }});
  assert.deepEqual(calls,['review','integration','approval']);
  assert.equal(completed.action,'APPROVAL_PENDING');
  assert.equal(completed.stop,true);
  assert.equal(completed.state.batch.state,'APPROVAL_PENDING');
  assert.equal(completed.state.approval.status,'PENDING');
  assert.deepEqual(completed.rounds.map(round=>round.action),['RESULTS_REVIEWED','INTEGRATION_PREPARED','APPROVAL_PENDING']);
});

test('preview never mutates Git integration and reports the required next phase', async () => {
  const { advanceControlPlaneRound }=await import('../../scripts/lib/control-plane/controller.mjs');
  let integrations=0;
  const reviewed=state({assignments:[assignment('REVIEW_PASSED')],review_decisions:[decision()]});
  const preview=advanceControlPlaneRound({state:reviewed,at,apply:false,services:{integrate:()=>{ integrations+=1; }}});
  assert.equal(preview.action,'INTEGRATION_REQUIRED');
  assert.equal(preview.stop,true);
  assert.equal(integrations,0);
  assert.equal(preview.state.batch.state,'REVIEW');
});

test('allocated Wave prepares Worker worktrees only on apply and advances batch ACTIVE', async () => {
  const { advanceControlPlaneRound }=await import('../../scripts/lib/control-plane/controller.mjs');
  let preparations=0;
  const allocated=state({batch:batch('ALLOCATED'),assignments:[assignment('ALLOCATED')],results:[],review_decisions:[]});
  const preview=advanceControlPlaneRound({state:allocated,at,apply:false,services:{prepareWorkers:()=>{ preparations+=1; }}});
  assert.equal(preview.action,'WORKTREE_PREPARATION_REQUIRED');
  assert.equal(preparations,0);
  const applied=advanceControlPlaneRound({state:allocated,at,apply:true,services:{prepareWorkers:context=>{
    preparations+=1;
    return {assignments:context.assignments.map(item=>({...item,state:'DISPATCHED'})),worktree_evidence:{[context.assignments[0].assignment_id]:{status:'READY'}}};
  }}});
  assert.equal(applied.action,'WORKERS_REQUIRED');
  assert.equal(applied.stop,true);
  assert.equal(applied.state.batch.state,'ACTIVE');
  assert.equal(applied.state.assignments[0].state,'DISPATCHED');
  assert.equal(preparations,1);
});

test('reconcile attention stops before review or routing', async () => {
  const { advanceControlPlaneRound }=await import('../../scripts/lib/control-plane/controller.mjs');
  let reviews=0;
  const unsafe=advanceControlPlaneRound({state:state({batch:batch('INTERRUPTED'),assignments:[assignment('INTERRUPTED')]}),at,apply:true,services:{
    reconcile:context=>({...context,batch:context.batch,assignments:context.assignments,locks:context.locks,attention:[{assignment_id:context.assignments[0].assignment_id,status:'DIRTY'}]}),
    review:()=>{ reviews+=1; }
  }});
  assert.equal(unsafe.action,'MASTER_ATTENTION_REQUIRED');
  assert.equal(unsafe.stop,true);
  assert.equal(reviews,0);
});

test('rejects malformed persisted approval before stopping at PENDING', async () => {
  const { advanceControlPlaneRound }=await import('../../scripts/lib/control-plane/controller.mjs');
  const malformed=state({batch:batch('APPROVAL_PENDING'),approval:{schema_version:2,batch_id:'batch-0002',status:'PENDING'}});
  assert.throws(()=>advanceControlPlaneRound({state:malformed,at}),/integration_branch.*required/);
});
