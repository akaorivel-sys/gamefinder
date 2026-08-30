import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const at='2026-08-28T02:00:00.000Z';
const runGit=(repo,args,{allowFailure=false}={})=>{
  const result=spawnSync('git',args,{cwd:repo,encoding:'utf8',shell:false,windowsHide:true});
  if (!allowFailure) assert.equal(result.status,0,result.stderr);
  return result;
};
const git=(repo,args)=>runGit(repo,args).stdout.trim();

const setup=({conflict=false}={})=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-integration-'));
  const repo=path.join(temporary,'repo');
  const worktreeRoot=path.join(temporary,'worktrees');
  const worktreePath=path.join(worktreeRoot,'integration-batch-9001');
  fs.mkdirSync(repo,{recursive:true});
  git(repo,['init','--quiet','-b','main']);
  git(repo,['config','user.name','Control Plane Test']);
  git(repo,['config','user.email','control-plane@example.invalid']);
  fs.writeFileSync(path.join(repo,'base.txt'),conflict ? 'base\n' : 'base\n');
  git(repo,['add','base.txt']);
  git(repo,['commit','--quiet','-m','base']);
  const baseSha=git(repo,['rev-parse','HEAD']);

  git(repo,['switch','--quiet','-c','workers/batch-9001/a-wave-001']);
  if (conflict) fs.writeFileSync(path.join(repo,'base.txt'),'worker a\n');
  else fs.writeFileSync(path.join(repo,'a.txt'),'a\n');
  git(repo,['add','.']);
  git(repo,['commit','--quiet','-m','worker a']);
  const commitA=git(repo,['rev-parse','HEAD']);

  git(repo,['switch','--quiet','main']);
  git(repo,['switch','--quiet','-c','workers/batch-9001/b-wave-001']);
  if (conflict) fs.writeFileSync(path.join(repo,'base.txt'),'worker b\n');
  else fs.writeFileSync(path.join(repo,'b.txt'),'b\n');
  git(repo,['add','.']);
  git(repo,['commit','--quiet','-m','worker b']);
  const commitB=git(repo,['rev-parse','HEAD']);
  git(repo,['switch','--quiet','main']);
  return {temporary,repo,worktreeRoot,worktreePath,baseSha,commitA,commitB};
};

const batch=baseSha=>({
  schema_version:2,
  batch_id:'batch-9001',
  state:'REVIEW',
  base_sha:baseSha,
  classification:'parallel_code_change',
  execution_route:'codex-worker-wave',
  worker_count:2,
  dispatch_reason:'two independent code units benefit from parallel execution',
  created_at:at,
  updated_at:at,
  history:[]
});
const assignment=(worker_id,base_sha,changedPath)=>({
  schema_version:2,
  assignment_id:`assignment-9001-${worker_id}-001-01`,
  batch_id:'batch-9001',
  wave:1,
  worker_id,
  attempt:1,
  state:'REVIEW_PASSED',
  task_ids:[`code-${worker_id}`],
  expected_paths:[changedPath],
  base_sha,
  branch:`workers/batch-9001/${worker_id}-wave-001`,
  worktree_path:`worktrees/batch-9001/${worker_id}-wave-001`,
  result_path:`editorial/results/v2/result-9001-${worker_id}-001-01.json`,
  classification:'parallel_code_change',
  execution_route:'codex-worker-wave',
  worker_count:2,
  dispatch_reason:'two independent code units benefit from parallel execution',
  created_at:at,
  updated_at:at,
  history:[]
});

const workerResult=(item,commit_sha)=>({
  schema_version:2,
  result_id:`result-9001-${item.worker_id}-001-01`,
  batch_id:item.batch_id,
  wave:item.wave,
  assignment_id:item.assignment_id,
  worker_id:item.worker_id,
  base_sha:item.base_sha,
  commit_sha,
  task_outcomes:item.task_ids.map(task_id=>({task_id,status:'COMPLETED'})),
  changed_paths:[...item.expected_paths],
  validation:[{command:'synthetic integration validation',exit_code:0}],
  classification:item.classification,
  execution_route:item.execution_route,
  worker_count:item.worker_count,
  dispatch_reason:item.dispatch_reason,
  created_at:at,
  completed_at:at,
  notes:''
});

const boundEvidence=(state,reviewWorkerResult,{conflict=false}={})=>{
  const assignments=[];
  const worker_results=[];
  const review_decisions=[];
  for (const worker_id of ['a','b']) {
    const item=assignment(worker_id,state.baseSha,conflict ? 'base.txt' : `${worker_id}.txt`);
    const result=workerResult(item,worker_id==='a' ? state.commitA : state.commitB);
    const reviewed=reviewWorkerResult({repo:state.repo,assignment:{...item,state:'RESULT_READY'},result,reviewed_at:at});
    assert.equal(reviewed.status,'REVIEW_PASSED');
    assignments.push(item);
    worker_results.push(result);
    review_decisions.push(reviewed);
  }
  return {assignments,worker_results,review_decisions};
};

const cleanup=state=>{
  if (fs.existsSync(state.worktreePath)) {
    runGit(state.worktreePath,['cherry-pick','--abort'],{allowFailure:true});
    runGit(state.repo,['worktree','remove',state.worktreePath],{allowFailure:true});
  }
  fs.rmSync(state.temporary,{recursive:true,force:true});
};

test('prepares integration/batch branch from base in deterministic Wave/Worker order', async () => {
  const { prepareIntegration }=await import('../../scripts/lib/control-plane/integration.mjs');
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=setup();
  try {
    const evidence=boundEvidence(state,reviewWorkerResult);
    const prepared=prepareIntegration({
      repo:state.repo,
      worktreeRoot:state.worktreeRoot,
      worktreePath:state.worktreePath,
      batch:batch(state.baseSha),
      assignments:evidence.assignments,
      worker_results:evidence.worker_results,
      review_decisions:[evidence.review_decisions[1],evidence.review_decisions[0]],
      prepared_at:at
    });
    assert.equal(prepared.status,'INTEGRATION_PREPARED');
    assert.equal(prepared.branch,'integration/batch-9001');
    assert.deepEqual(prepared.commit_order,[state.commitA,state.commitB]);
    assert.equal(git(state.worktreePath,['rev-parse','HEAD']),prepared.head);
    assert.deepEqual(git(state.worktreePath,['log','--format=%s','--reverse',`${state.baseSha}..HEAD`]).split(/\r?\n/),['worker a','worker b']);
  } finally {
    cleanup(state);
  }
});

test('refuses rejected or duplicate review decisions before creating integration state', async () => {
  const { prepareIntegration }=await import('../../scripts/lib/control-plane/integration.mjs');
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=setup();
  try {
    const evidence=boundEvidence(state,reviewWorkerResult);
    const rejected={...evidence.review_decisions[0],status:'REVIEW_REJECTED',reasons:['REJECTED_FOR_TEST']};
    assert.throws(()=>prepareIntegration({repo:state.repo,worktreeRoot:state.worktreeRoot,worktreePath:state.worktreePath,batch:batch(state.baseSha),assignments:evidence.assignments,worker_results:evidence.worker_results,review_decisions:[rejected,evidence.review_decisions[1]],prepared_at:at}),/REVIEW_PASSED/);
    assert.equal(fs.existsSync(state.worktreePath),false);
    assert.throws(()=>prepareIntegration({repo:state.repo,worktreeRoot:state.worktreeRoot,worktreePath:state.worktreePath,batch:batch(state.baseSha),assignments:evidence.assignments,worker_results:evidence.worker_results,review_decisions:[evidence.review_decisions[0],evidence.review_decisions[0]],prepared_at:at}),/duplicate/);
    assert.equal(fs.existsSync(state.worktreePath),false);
  } finally {
    cleanup(state);
  }
});

test('stops on cherry-pick conflict and preserves the integration worktree evidence', async () => {
  const { prepareIntegration }=await import('../../scripts/lib/control-plane/integration.mjs');
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=setup({conflict:true});
  try {
    const evidence=boundEvidence(state,reviewWorkerResult,{conflict:true});
    const prepared=prepareIntegration({
      repo:state.repo,
      worktreeRoot:state.worktreeRoot,
      worktreePath:state.worktreePath,
      batch:batch(state.baseSha),
      assignments:evidence.assignments,
      worker_results:evidence.worker_results,
      review_decisions:evidence.review_decisions,
      prepared_at:at
    });
    assert.equal(prepared.status,'CONFLICT');
    assert.equal(prepared.conflict_commit,state.commitB);
    assert.deepEqual(prepared.commit_order,[state.commitA]);
    assert.equal(fs.existsSync(state.worktreePath),true);
    assert.notEqual(git(state.worktreePath,['status','--porcelain']),'');
  } finally {
    cleanup(state);
  }
});

test('refuses a forged REVIEW_PASSED decision unless it matches Assignment, Result, and Master review evidence', async () => {
  const { prepareIntegration }=await import('../../scripts/lib/control-plane/integration.mjs');
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=setup();
  try {
    const evidence=boundEvidence(state,reviewWorkerResult);
    const forged={...evidence.review_decisions[0],actual_changed_paths:[]};
    assert.throws(()=>prepareIntegration({
      repo:state.repo,
      worktreeRoot:state.worktreeRoot,
      worktreePath:state.worktreePath,
      batch:batch(state.baseSha),
      assignments:evidence.assignments,
      worker_results:evidence.worker_results,
      review_decisions:[forged,evidence.review_decisions[1]],
      prepared_at:at
    }),/Master review output/);
    assert.equal(fs.existsSync(state.worktreePath),false);
  } finally {
    cleanup(state);
  }
});

test('refuses a reviewed single Commit whose Assignment base differs from the Batch base', async () => {
  const { prepareIntegration }=await import('../../scripts/lib/control-plane/integration.mjs');
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=setup();
  try {
    fs.writeFileSync(path.join(state.repo,'intermediate.txt'),'must not be omitted\n');
    git(state.repo,['add','intermediate.txt']);
    git(state.repo,['commit','--quiet','-m','intermediate base']);
    const laterBase=git(state.repo,['rev-parse','HEAD']);
    git(state.repo,['switch','--quiet','-c','workers/batch-9001/c-wave-001']);
    fs.writeFileSync(path.join(state.repo,'c.txt'),'c\n');
    git(state.repo,['add','c.txt']);
    git(state.repo,['commit','--quiet','-m','worker c']);
    const commit=git(state.repo,['rev-parse','HEAD']);
    const item=assignment('c',laterBase,'c.txt');
    const result=workerResult(item,commit);
    const reviewed=reviewWorkerResult({repo:state.repo,assignment:{...item,state:'RESULT_READY'},result,reviewed_at:at});
    assert.equal(reviewed.status,'REVIEW_PASSED');

    assert.throws(()=>prepareIntegration({
      repo:state.repo,
      worktreeRoot:state.worktreeRoot,
      worktreePath:state.worktreePath,
      batch:batch(state.baseSha),
      assignments:[item],
      worker_results:[result],
      review_decisions:[reviewed],
      prepared_at:at
    }),/Assignment base_sha must match Batch base_sha/);
    assert.equal(fs.existsSync(state.worktreePath),false);
  } finally {
    cleanup(state);
  }
});
