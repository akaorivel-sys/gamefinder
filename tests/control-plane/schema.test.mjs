import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const at='2026-08-27T00:00:00.000Z';
const sha='a'.repeat(40);
const readSchema=name=>JSON.parse(fs.readFileSync(path.join(root,'editorial/control/schemas',name),'utf8'));
const queue=()=>({schema_version:2,queue_id:'queue-0002',tasks:[{task_id:'task-1',task_type:'article_upgrade',priority:10,status:'queued',depends_on:[],expected_paths:['public/articles/example.html']}]});
const batch=()=>({schema_version:2,batch_id:'batch-0002',state:'DRAFT',base_sha:sha,created_at:at,updated_at:at,history:[]});
const assignment=()=>({schema_version:2,assignment_id:'assignment-0002-a-001-01',batch_id:'batch-0002',wave:1,worker_id:'a',attempt:1,state:'ALLOCATED',task_ids:['task-1'],expected_paths:['public/articles/example.html'],base_sha:sha,branch:'workers/batch-0002/a-wave-001',worktree_path:'worktrees/batch-0002/a-wave-001',result_path:'editorial/results/v2/result-0002-a-001-01.json',created_at:at,updated_at:at,history:[]});
const result=()=>({schema_version:2,result_id:'result-0002-a-001-01',batch_id:'batch-0002',wave:1,assignment_id:'assignment-0002-a-001-01',worker_id:'a',base_sha:sha,commit_sha:'b'.repeat(40),task_outcomes:[{task_id:'task-1',status:'COMPLETED'}],changed_paths:['public/articles/example.html'],validation:[{command:'npm run validate:ci',exit_code:0}],created_at:at,completed_at:at,notes:''});
const locks=()=>({schema_version:2,batch_id:'batch-0002',locks:[{assignment_id:'assignment-0002-a-001-01',worker_id:'a',wave:1,path:'public/articles/example.html',state:'HELD',acquired_at:at,updated_at:at}],updated_at:at});
const session=()=>({schema_version:2,session_id:'session-0002',batch_id:'batch-0002',mode:'a',last_completed_phase:'ALLOCATE',outstanding_assignment_ids:['assignment-0002-a-001-01'],next_action:'WORKERS_REQUIRED',created_at:at,updated_at:at});
const approval=()=>({schema_version:2,batch_id:'batch-0002',status:'PENDING',created_at:at,updated_at:at});

test('normalizes v1 article tasks without mutating the legacy array', async () => {
  const { normalizeQueue }=await import('../../scripts/lib/control-plane/schema.mjs');
  const input=[{task_id:'legacy-1',task_type:'article_upgrade',priority:100,status:'queued',depends_on:[],article_slug:'example'}];
  assert.deepEqual(normalizeQueue(input),{schema_version:1,queue_id:null,tasks:[{task_id:'legacy-1',task_type:'article_upgrade',priority:100,status:'queued',depends_on:[],expected_paths:['public/articles/example.html'],source_schema_version:1,eligible:true}]});
  assert.deepEqual(input,[{task_id:'legacy-1',task_type:'article_upgrade',priority:100,status:'queued',depends_on:[],article_slug:'example'}]);
});

test('marks path-ambiguous v1 tasks ineligible instead of guessing an owned path', async () => {
  const { normalizeQueue }=await import('../../scripts/lib/control-plane/schema.mjs');
  const normalized=normalizeQueue([{task_id:'legacy-2',task_type:'article_upgrade',priority:10,status:'queued',depends_on:[],article_slug:'bad/slug'}]);
  assert.deepEqual(normalized.tasks[0].expected_paths,[]);
  assert.equal(normalized.tasks[0].eligible,false);
  assert.equal(normalized.tasks[0].ineligible_reason,'article_slug');
});

test('reports unsupported v1 task types as ineligible without rejecting the legacy queue', async () => {
  const { normalizeQueue }=await import('../../scripts/lib/control-plane/schema.mjs');
  const normalized=normalizeQueue([{task_id:'legacy-3',task_type:'unknown_legacy_type',priority:10,status:'queued',depends_on:[]}]);
  assert.deepEqual(normalized.tasks[0],{task_id:'legacy-3',task_type:'unknown_legacy_type',priority:10,status:'queued',depends_on:[],expected_paths:[],source_schema_version:1,eligible:false,ineligible_reason:'task_type'});
});

test('normalizes a v2 queue and rejects malformed queue task fields', async () => {
  const { normalizeQueue }=await import('../../scripts/lib/control-plane/schema.mjs');
  const normalized=normalizeQueue(queue());
  assert.equal(normalized.schema_version,2);
  assert.equal(normalized.queue_id,'queue-0002');
  assert.deepEqual(normalized.tasks[0].expected_paths,['public/articles/example.html']);
  assert.throws(()=>normalizeQueue({...queue(),tasks:[{...queue().tasks[0],status:'running'}]}),/tasks\.0\.status/);
});

test('JSON Schema required and enum contracts match runtime validator behavior', async () => {
  const api=await import('../../scripts/lib/control-plane/schema.mjs');
  const validators=[
    ['queue-v2.schema.json',queue(),api.normalizeQueue,null],
    ['batch-state-v2.schema.json',batch(),api.validateBatchState,'state'],
    ['assignment-v2.schema.json',assignment(),api.validateAssignment,'state'],
    ['worker-result-v2.schema.json',result(),api.validateWorkerResult,null],
    ['lock-manifest-v2.schema.json',locks(),api.validateLockManifest,null],
    ['session-state-v2.schema.json',session(),api.validateSessionState,null],
    ['approval-v2.schema.json',approval(),api.validateApproval,'status']
  ];
  for (const [name,valid,validate,enumField] of validators) {
    const schema=readSchema(name);
    validate(valid);
    for (const field of schema.required) {
      const missing={...valid};
      delete missing[field];
      assert.throws(()=>validate(missing),new RegExp(field),`${name} requires ${field}`);
    }
    if (enumField) {
      for (const allowed of schema.properties[enumField].enum) validate({...valid,[enumField]:allowed});
      assert.throws(()=>validate({...valid,[enumField]:'INVALID'}),new RegExp(enumField),`${name} rejects invalid ${enumField}`);
    }
  }
});

test('reports malformed identity, SHA, path, and status fields precisely', async () => {
  const { validateAssignment, validateWorkerResult, validateLockManifest, validateApproval }=await import('../../scripts/lib/control-plane/schema.mjs');
  assert.throws(()=>validateAssignment({...assignment(),assignment_id:'bad identity'}),/assignment_id/);
  assert.throws(()=>validateWorkerResult({...result(),commit_sha:'not-a-sha'}),/commit_sha/);
  assert.throws(()=>validateLockManifest({...locks(),locks:[{...locks().locks[0],path:'public\\articles\\example.html'}]}),/locks\.0\.path/);
  assert.throws(()=>validateApproval({...approval(),status:'AUTO_APPROVED'}),/status/);
});

test('nested JSON Schema enums and required fields match runtime validator behavior', async () => {
  const api=await import('../../scripts/lib/control-plane/schema.mjs');
  const lockSchema=readSchema('lock-manifest-v2.schema.json');
  const lockItems=lockSchema.properties.locks.items;
  assert.ok(lockItems,'lock schema declares lock items');
  const resultSchema=readSchema('worker-result-v2.schema.json');
  const outcomeSchema=resultSchema.properties.task_outcomes.items;
  assert.ok(outcomeSchema,'worker Result schema declares task outcome items');
  const cases=[
    [readSchema('queue-v2.schema.json').properties.tasks.items.properties,queue().tasks[0],task=>api.normalizeQueue({...queue(),tasks:[task]})],
    [readSchema('assignment-v2.schema.json').properties,assignment(),api.validateAssignment],
    [readSchema('worker-result-v2.schema.json').properties,result(),api.validateWorkerResult],
    [lockItems.properties,locks().locks[0],lock=>api.validateLockManifest({...locks(),locks:[lock]})],
    [readSchema('session-state-v2.schema.json').properties,session(),api.validateSessionState]
  ];
  for (const [properties,valid,validate] of cases) {
    for (const [field,definition] of Object.entries(properties)) {
      if (!definition.enum) continue;
      for (const allowed of definition.enum) validate({...valid,[field]:allowed});
      assert.throws(()=>validate({...valid,[field]:'INVALID'}),new RegExp(field));
    }
  }
  assert.deepEqual(outcomeSchema.required,['task_id','status']);
  for (const status of outcomeSchema.properties.status.enum) api.validateWorkerResult({...result(),task_outcomes:[{task_id:'task-1',status}]});
  assert.throws(()=>api.validateWorkerResult({...result(),task_outcomes:[{task_id:'task-1'}]}),/task_outcomes\.0\.status/);
});

test('schema identity and path patterns reject the same malformed values as runtime validation', async () => {
  const { normalizeQueue, validateAssignment, validateSessionState }=await import('../../scripts/lib/control-plane/schema.mjs');
  const queueSchema=readSchema('queue-v2.schema.json');
  const taskSchema=queueSchema.properties.tasks.items.properties;
  const assignmentSchema=readSchema('assignment-v2.schema.json');
  const sessionSchema=readSchema('session-state-v2.schema.json');
  const checks=[
    [queueSchema.properties.queue_id.pattern,'1'],
    [taskSchema.depends_on.items.pattern,'bad id'],
    [taskSchema.expected_paths.items.pattern,'public//example.html'],
    [taskSchema.expected_paths.items.pattern,'public/./example.html'],
    [assignmentSchema.properties.task_ids.items.pattern,'bad id'],
    [sessionSchema.properties.outstanding_assignment_ids.items.pattern,'bad id']
  ];
  for (const [pattern,invalid] of checks) assert.doesNotMatch(invalid,new RegExp(pattern));
  assert.throws(()=>normalizeQueue({...queue(),queue_id:'1'}),/queue_id/);
  assert.throws(()=>normalizeQueue({...queue(),tasks:[{...queue().tasks[0],depends_on:['bad id']}]}),/tasks\.0\.depends_on\.0/);
  assert.throws(()=>normalizeQueue({...queue(),tasks:[{...queue().tasks[0],expected_paths:['public/./example.html']}]}),/tasks\.0\.expected_paths\.0/);
  assert.throws(()=>validateAssignment({...assignment(),task_ids:['bad id']}),/task_ids\.0/);
  assert.throws(()=>validateSessionState({...session(),outstanding_assignment_ids:['bad id']}),/outstanding_assignment_ids\.0/);
});

test('batch and assignment history schemas constrain state records like runtime validation', async () => {
  const { validateAssignment, validateBatchState }=await import('../../scripts/lib/control-plane/schema.mjs');
  const batchSchema=readSchema('batch-state-v2.schema.json');
  const assignmentSchema=readSchema('assignment-v2.schema.json');
  for (const [schema,valid,validate] of [[batchSchema,batch(),validateBatchState],[assignmentSchema,assignment(),validateAssignment]]) {
    const item=schema.properties.history.items;
    assert.ok(item,'history schema declares record items');
    assert.deepEqual(item.required,['from','to','at','reason']);
    assert.ok(item.properties.from.enum.includes(valid.state));
    validate({...valid,history:[{from:valid.state,to:valid.state,at,reason:'recorded'}]});
    assert.throws(()=>validate({...valid,history:[{from:'NOT_A_STATE',to:valid.state,at,reason:'recorded'}]}),/history\.0\.from/);
  }
});
