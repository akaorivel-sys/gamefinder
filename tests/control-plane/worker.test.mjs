import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const at='2026-08-28T00:00:00.000Z';
const later='2026-08-28T00:05:00.000Z';
const baseSha='a'.repeat(40);
const commitSha='b'.repeat(40);
const assignment=(overrides={})=>({
  schema_version:2,
  assignment_id:'assignment-0002-a-001-01',
  batch_id:'batch-0002',
  wave:1,
  worker_id:'a',
  attempt:1,
  state:'DISPATCHED',
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
const locks=()=>({
  schema_version:2,
  batch_id:'batch-0002',
  locks:[{
    assignment_id:'assignment-0002-a-001-01',
    worker_id:'a',
    wave:1,
    path:'scripts/example.mjs',
    state:'HELD',
    acquired_at:at,
    updated_at:at
  }],
  updated_at:at
});
const readyWorktree=(overrides={})=>({
  status:'READY',
  branch:'workers/batch-0002/a-wave-001',
  baseSha,
  head:baseSha,
  registered:true,
  baseExists:true,
  baseIsAncestor:true,
  clean:true,
  changes:[],
  issues:[],
  ...overrides
});
const startContext=(overrides={})=>({
  assignment:assignment(),
  worker_id:'a',
  branch:'workers/batch-0002/a-wave-001',
  base_sha:baseSha,
  locks:locks(),
  worktree:readyWorktree(),
  ...overrides
});

test('loads five default-off optional assignment-driven Codex Worker definitions', async () => {
  const { loadWorkerDefinition, loadWorkerPoolConfig }=await import('../../scripts/lib/control-plane/worker.mjs');
  const pool=loadWorkerPoolConfig(root);
  assert.equal(pool.default_enabled,false);
  assert.equal(pool.default_worker_count,0);
  assert.equal(pool.max_wave_workers,3);
  assert.equal(pool.max_concurrent_threads_per_session,3);
  assert.deepEqual(pool.workers.map(worker=>worker.worker_id),['a','b','c','d','e']);

  const definitions=[];
  for (const workerId of ['a','b','c','d','e']) definitions.push(loadWorkerDefinition(root,workerId));
  assert.equal(new Set(definitions.map(item=>item.agent.name)).size,5);
  for (const definition of definitions) {
    assert.equal(definition.optional,true);
    assert.equal(definition.default_enabled,false);
    assert.equal(definition.assignment_driven,true);
    assert.equal(definition.content_prose_generation,false);
    assert.match(definition.agent.developer_instructions,/optional Worker pool/i);
    assert.match(definition.agent.developer_instructions,/assignment/i);
    assert.match(definition.agent.developer_instructions,/article prose/i);
    assert.match(definition.agent.developer_instructions,/\.github\/workflows/);
    assert.match(definition.agent.developer_instructions,/Batch 0001/);
    assert.match(definition.agent.developer_instructions,/never push/i);
  }
});

test('documents Master/content boundaries and optional Worker command semantics', () => {
  const agents=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
  const protocol=fs.readFileSync(path.join(root,'docs/worker-protocol.md'),'utf8');
  for (const text of [agents,protocol]) {
    assert.match(text,/default[- ]off/i);
    assert.match(text,/optional Worker pool/i);
    assert.match(text,/external-content-input/);
    assert.match(text,/article prose/i);
    assert.match(text,/Batch 0001.*read-only/is);
    assert.match(text,/never push/i);
  }
  assert.match(agents,/`t`.*one.*round/is);
  assert.match(agents,/`a`.*session-continuous/is);
  assert.doesNotMatch(protocol,/Before opening a Pull Request/);
});

test('verifies a clean assignment-driven Worker start', async () => {
  const { verifyWorkerStart }=await import('../../scripts/lib/control-plane/worker.mjs');
  assert.deepEqual(verifyWorkerStart(startContext()),{
    ok:true,
    assignment_id:'assignment-0002-a-001-01',
    worker_id:'a',
    execution_route:'codex-worker-wave'
  });
});

test('rejects Worker start identity, base, branch, lock, and dirty-state mismatches', async () => {
  const { verifyWorkerStart }=await import('../../scripts/lib/control-plane/worker.mjs');
  assert.throws(()=>verifyWorkerStart(startContext({worker_id:'b'})),/worker_id/);
  assert.throws(()=>verifyWorkerStart(startContext({base_sha:'c'.repeat(40)})),/base_sha/);
  assert.throws(()=>verifyWorkerStart(startContext({branch:'workers/batch-0002/b-wave-001'})),/branch/);
  assert.throws(()=>verifyWorkerStart(startContext({locks:{...locks(),locks:[]}})),/lock/);
  assert.throws(()=>verifyWorkerStart(startContext({worktree:readyWorktree({status:'DIRTY',clean:false,changes:[' M scripts/example.mjs']})})),/READY/);
});

test('rejects content prose and every non-Worker execution route', async () => {
  const { verifyWorkerStart }=await import('../../scripts/lib/control-plane/worker.mjs');
  const content=assignment({
    classification:'article_writing',
    execution_route:'external-content-input',
    worker_count:0,
    dispatch_reason:'GPT Content Workers provide prose'
  });
  assert.throws(()=>verifyWorkerStart(startContext({assignment:content})),/content|article/i);
  const master=assignment({
    classification:'repository_change',
    execution_route:'codex-master',
    worker_count:0,
    dispatch_reason:'Master owns the task'
  });
  assert.throws(()=>verifyWorkerStart(startContext({assignment:master})),/execution_route/);
});

test('builds a validated Worker Result and preserves its dispatch decision', async () => {
  const { buildWorkerResult }=await import('../../scripts/lib/control-plane/worker.mjs');
  const value=buildWorkerResult({
    ...startContext({worktree:readyWorktree({head:commitSha})}),
    commit_sha:commitSha,
    task_outcomes:[{task_id:'code-task-1',status:'COMPLETED'}],
    changed_paths:['scripts/example.mjs'],
    validation:[{command:'node --test tests/example.test.mjs',exit_code:0}],
    created_at:at,
    completed_at:later,
    notes:'minimal code change complete'
  });
  assert.equal(value.result_id,'result-0002-a-001-01');
  assert.equal(value.assignment_id,'assignment-0002-a-001-01');
  assert.equal(value.execution_route,'codex-worker-wave');
  assert.equal(value.classification,'parallel_code_change');
  assert.equal(value.worker_count,1);
  assert.deepEqual(value.changed_paths,['scripts/example.mjs']);
});

test('rejects Result paths, failed validation, task mismatch, dirty state, and head mismatch', async () => {
  const { buildWorkerResult }=await import('../../scripts/lib/control-plane/worker.mjs');
  const valid={
    ...startContext({worktree:readyWorktree({head:commitSha})}),
    commit_sha:commitSha,
    task_outcomes:[{task_id:'code-task-1',status:'COMPLETED'}],
    changed_paths:['scripts/example.mjs'],
    validation:[{command:'node --test tests/example.test.mjs',exit_code:0}],
    created_at:at,
    completed_at:later,
    notes:''
  };
  assert.throws(()=>buildWorkerResult({...valid,changed_paths:['scripts/unowned.mjs']}),/outside assignment ownership/);
  assert.throws(()=>buildWorkerResult({...valid,validation:[{command:'node --test',exit_code:1}]}),/validation/);
  assert.throws(()=>buildWorkerResult({...valid,task_outcomes:[{task_id:'another-task',status:'COMPLETED'}]}),/task_outcomes/);
  assert.throws(()=>buildWorkerResult({...valid,worktree:readyWorktree({status:'DIRTY',clean:false,head:commitSha,changes:[' M scripts/example.mjs']})}),/READY/);
  assert.throws(()=>buildWorkerResult({...valid,worktree:readyWorktree({head:'c'.repeat(40)})}),/commit_sha/);
});

test('worker-control verify performs a no-write fixture check without remote Git operations', () => {
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-worker-control-'));
  try {
    const contextPath=path.join(temporary,'context.json');
    fs.writeFileSync(contextPath,JSON.stringify(startContext()),'utf8');
    const command=spawnSync(process.execPath,[path.join(root,'scripts/worker-control.mjs'),'verify','--context',contextPath],{encoding:'utf8'});
    assert.equal(command.status,0,command.stderr);
    assert.deepEqual(JSON.parse(command.stdout),{
      ok:true,
      assignment_id:'assignment-0002-a-001-01',
      worker_id:'a',
      execution_route:'codex-worker-wave'
    });
    const source=fs.readFileSync(path.join(root,'scripts/worker-control.mjs'),'utf8');
    assert.doesNotMatch(source,/\bgit\s+(?:push|fetch|pull|remote)\b/i);
  } finally {
    fs.rmSync(temporary,{recursive:true,force:true});
  }
});
