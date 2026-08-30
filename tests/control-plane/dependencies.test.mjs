import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDependencies } from '../../scripts/lib/control-plane/dependencies.mjs';

test('reports queued tasks whose dependencies are completed as ready', () => {
  const tasks=[
    {task_id:'done',depends_on:[],status:'completed'},
    {task_id:'ready',depends_on:['done'],status:'queued'},
    {task_id:'waiting',depends_on:['later'],status:'queued'},
    {task_id:'later',depends_on:[],status:'queued'}
  ];
  assert.deepEqual(evaluateDependencies(tasks,new Set(['done'])),{
    ready_task_ids:['ready','later'],
    blocked_task_ids:['waiting'],
    errors:[]
  });
});

test('treats dependencies as satisfied only when their IDs are completed', () => {
  const tasks=[
    {task_id:'done-but-not-reported',depends_on:[],status:'completed'},
    {task_id:'child',depends_on:['done-but-not-reported'],status:'queued'}
  ];
  assert.deepEqual(evaluateDependencies(tasks,[]),{
    ready_task_ids:[],
    blocked_task_ids:['child'],
    errors:[]
  });
});

test('returns a blocking graph error for a missing dependency ID', () => {
  const tasks=[{task_id:'orphan',depends_on:['does-not-exist'],status:'queued'}];
  assert.deepEqual(evaluateDependencies(tasks,[]),{
    ready_task_ids:[],
    blocked_task_ids:['orphan'],
    errors:[{code:'MISSING_DEPENDENCY',task_id:'orphan',dependency_id:'does-not-exist'}]
  });
});

test('returns a blocking graph error for dependency cycles', () => {
  const tasks=[
    {task_id:'a',depends_on:['b'],status:'queued'},
    {task_id:'b',depends_on:['a'],status:'queued'},
    {task_id:'unrelated',depends_on:[],status:'queued'}
  ];
  assert.deepEqual(evaluateDependencies(tasks,[]),{
    ready_task_ids:[],
    blocked_task_ids:['a','b'],
    errors:[{code:'DEPENDENCY_CYCLE',task_ids:['a','b']}]
  });
});
