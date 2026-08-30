import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const at='2026-08-28T01:00:00.000Z';
const git=(repo,args)=>{
  const result=spawnSync('git',args,{cwd:repo,encoding:'utf8',shell:false,windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  return result.stdout.trim();
};

const fixture=({empty=false}={})=>{
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-review-'));
  git(repo,['init','--quiet','-b','main']);
  git(repo,['config','user.name','Control Plane Test']);
  git(repo,['config','user.email','control-plane@example.invalid']);
  fs.mkdirSync(path.join(repo,'scripts'),{recursive:true});
  fs.writeFileSync(path.join(repo,'scripts/example.mjs'),'export const value = 1;\n');
  git(repo,['add','scripts/example.mjs']);
  git(repo,['commit','--quiet','-m','base']);
  const baseSha=git(repo,['rev-parse','HEAD']);
  git(repo,['switch','--quiet','-c','workers/batch-0002/a-wave-001']);
  if (empty) {
    git(repo,['commit','--quiet','--allow-empty','-m','empty worker change']);
  } else {
    fs.writeFileSync(path.join(repo,'scripts/example.mjs'),'export const value = 2;\n');
    git(repo,['add','scripts/example.mjs']);
    git(repo,['commit','--quiet','-m','worker change']);
  }
  const commitSha=git(repo,['rev-parse','HEAD']);
  return {repo,baseSha,commitSha};
};

const assignment=(baseSha,overrides={})=>({
  schema_version:2,
  assignment_id:'assignment-0002-a-001-01',
  batch_id:'batch-0002',
  wave:1,
  worker_id:'a',
  attempt:1,
  state:'RESULT_READY',
  task_ids:['code-task-1'],
  expected_paths:['scripts/example.mjs'],
  base_sha:baseSha,
  branch:'workers/batch-0002/a-wave-001',
  worktree_path:'worktrees/batch-0002/a-wave-001',
  result_path:'editorial/results/v2/result-0002-a-001-01.json',
  classification:'parallel_code_change',
  execution_route:'codex-worker-wave',
  worker_count:1,
  dispatch_reason:'one independent code unit benefits from delegation',
  created_at:at,
  updated_at:at,
  history:[],
  ...overrides
});

const result=(baseSha,commitSha,overrides={})=>({
  schema_version:2,
  result_id:'result-0002-a-001-01',
  batch_id:'batch-0002',
  wave:1,
  assignment_id:'assignment-0002-a-001-01',
  worker_id:'a',
  base_sha:baseSha,
  commit_sha:commitSha,
  task_outcomes:[{task_id:'code-task-1',status:'COMPLETED'}],
  changed_paths:['scripts/example.mjs'],
  validation:[{command:'node --test tests/example.test.mjs',exit_code:0}],
  classification:'parallel_code_change',
  execution_route:'codex-worker-wave',
  worker_count:1,
  dispatch_reason:'one independent code unit benefits from delegation',
  created_at:at,
  completed_at:at,
  notes:'',
  ...overrides
});

test('Master passes a Result only after independently verifying the actual commit diff', async () => {
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=fixture();
  try {
    assert.deepEqual(reviewWorkerResult({
      repo:state.repo,
      assignment:assignment(state.baseSha),
      result:result(state.baseSha,state.commitSha),
      reviewed_at:at
    }),{
      schema_version:2,
      decision_id:'review-assignment-0002-a-001-01',
      batch_id:'batch-0002',
      wave:1,
      assignment_id:'assignment-0002-a-001-01',
      worker_id:'a',
      commit_sha:state.commitSha,
      status:'REVIEW_PASSED',
      actual_changed_paths:['scripts/example.mjs'],
      reviewed_at:at,
      reasons:[]
    });
  } finally {
    fs.rmSync(state.repo,{recursive:true,force:true});
  }
});

test('Master rejects forged paths, identity, ancestry, failed commands, and incomplete outcomes', async () => {
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=fixture();
  try {
    const unrelatedCommit=git(state.repo,['commit-tree',git(state.repo,['rev-parse',`${state.commitSha}^{tree}`]),'-m','unrelated root']);
    const cases=[
      [result(state.baseSha,state.commitSha,{changed_paths:['scripts/forged.mjs']}),'RESULT_DIFF_MISMATCH'],
      [result(state.baseSha,state.commitSha,{worker_id:'b'}),'IDENTITY_MISMATCH'],
      [result('c'.repeat(40),state.commitSha),'IDENTITY_MISMATCH'],
      [result(state.baseSha,state.commitSha,{validation:[{command:'node --test',exit_code:1}]}),'VALIDATION_FAILED'],
      [result(state.baseSha,state.commitSha,{task_outcomes:[{task_id:'other-task',status:'COMPLETED'}]}),'TASK_OUTCOME_MISMATCH'],
      [result(state.baseSha,'d'.repeat(40)),'COMMIT_MISSING'],
      [result(state.baseSha,unrelatedCommit),'COMMIT_NOT_DESCENDANT']
    ];
    for (const [candidate,reason] of cases) {
      const decision=reviewWorkerResult({repo:state.repo,assignment:assignment(state.baseSha),result:candidate,reviewed_at:at});
      assert.equal(decision.status,'REVIEW_REJECTED');
      assert.ok(decision.reasons.includes(reason),`${reason}: ${decision.reasons.join(',')}`);
    }
  } finally {
    fs.rmSync(state.repo,{recursive:true,force:true});
  }
});

test('Master rejects a Result when any assigned task outcome is BLOCKED or FAILED', async () => {
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=fixture();
  try {
    for (const status of ['BLOCKED','FAILED']) {
      const candidate=result(state.baseSha,state.commitSha,{task_outcomes:[{task_id:'code-task-1',status}]});
      const decision=reviewWorkerResult({repo:state.repo,assignment:assignment(state.baseSha),result:candidate,reviewed_at:at});
      assert.equal(decision.status,'REVIEW_REJECTED',status);
      assert.ok(decision.reasons.includes('TASK_OUTCOME_NOT_COMPLETED'),`${status}: ${decision.reasons.join(',')}`);
    }
  } finally {
    fs.rmSync(state.repo,{recursive:true,force:true});
  }
});

test('Master checks the cumulative base-to-Result diff and rejects a multi-commit Worker Result', async () => {
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=fixture();
  try {
    fs.writeFileSync(path.join(state.repo,'scripts/second.mjs'),'export const second = true;\n');
    git(state.repo,['add','scripts/second.mjs']);
    git(state.repo,['commit','--quiet','-m','second worker change']);
    const secondCommit=git(state.repo,['rev-parse','HEAD']);
    const candidate=result(state.baseSha,secondCommit,{changed_paths:['scripts/second.mjs']});
    const decision=reviewWorkerResult({
      repo:state.repo,
      assignment:assignment(state.baseSha,{expected_paths:['scripts/example.mjs','scripts/second.mjs']}),
      result:candidate,
      reviewed_at:at
    });

    assert.equal(decision.status,'REVIEW_REJECTED');
    assert.deepEqual(decision.actual_changed_paths,['scripts/example.mjs','scripts/second.mjs']);
    assert.ok(decision.reasons.includes('RESULT_NOT_SINGLE_COMMIT'));
    assert.ok(decision.reasons.includes('RESULT_DIFF_MISMATCH'));
  } finally {
    fs.rmSync(state.repo,{recursive:true,force:true});
  }
});

test('Master rejects an empty Worker commit that completes no owned code change', async () => {
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=fixture({empty:true});
  try {
    const decision=reviewWorkerResult({repo:state.repo,assignment:assignment(state.baseSha),result:result(state.baseSha,state.commitSha,{changed_paths:[]}),reviewed_at:at});
    assert.equal(decision.status,'REVIEW_REJECTED');
    assert.ok(decision.reasons.includes('NO_CHANGED_PATHS'));
  } finally {
    fs.rmSync(state.repo,{recursive:true,force:true});
  }
});

test('Master refuses review unless the assignment is RESULT_READY', async () => {
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=fixture();
  try {
    const decision=reviewWorkerResult({repo:state.repo,assignment:assignment(state.baseSha,{state:'RUNNING'}),result:result(state.baseSha,state.commitSha),reviewed_at:at});
    assert.equal(decision.status,'REVIEW_REJECTED');
    assert.ok(decision.reasons.includes('ASSIGNMENT_NOT_REVIEWABLE'));
  } finally {
    fs.rmSync(state.repo,{recursive:true,force:true});
  }
});

test('Master records malformed review input as rejection instead of crashing', async () => {
  const { reviewWorkerResult }=await import('../../scripts/lib/control-plane/review.mjs');
  const state=fixture();
  try {
    const decision=reviewWorkerResult({repo:state.repo,assignment:null,result:result(state.baseSha,state.commitSha),reviewed_at:at});
    assert.equal(decision.status,'REVIEW_REJECTED');
    assert.ok(decision.reasons.includes('SCHEMA_INVALID'));
  } finally {
    fs.rmSync(state.repo,{recursive:true,force:true});
  }
});
