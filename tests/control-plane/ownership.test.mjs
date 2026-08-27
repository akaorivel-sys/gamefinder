import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireLocks, assertOwnedChanges, normalizeOwnedPath, releaseLocks } from '../../scripts/lib/control-plane/ownership.mjs';

const at='2026-08-27T00:00:00.000Z';
const assignment=(overrides={})=>({assignment_id:'assignment-0002-a-001-01',worker_id:'a',wave:1,expected_paths:['public/articles/example.html'],...overrides});
const manifest=(locks=[])=>({schema_version:2,batch_id:'batch-0002',locks,updated_at:at});

test('normalizes only exact repository-relative POSIX owned paths', () => {
  assert.equal(normalizeOwnedPath('public/articles/example.html'),'public/articles/example.html');
  for (const path of ['/absolute.html','C:/absolute.html','public\\articles\\example.html','','.','public/../index.html','public//index.html']) {
    assert.throws(()=>normalizeOwnedPath(path),/owned path/);
  }
});

test('rejects files protected from Worker ownership', () => {
  for (const path of ['.github/workflows/deploy.yml','.firebaserc','firebase.json','public/index.html','public/robots.txt','public/public/index.html','editorial/queue/assignments/batch-0001-worker-a.json']) {
    assert.throws(()=>normalizeOwnedPath(path),/forbidden/);
  }
});

test('acquires exclusive immutable locks for an assignment', () => {
  const original=manifest();
  const locked=acquireLocks(original,assignment(),at);
  assert.deepEqual(locked.locks,[{assignment_id:'assignment-0002-a-001-01',worker_id:'a',wave:1,path:'public/articles/example.html',state:'HELD',acquired_at:at,updated_at:at}]);
  assert.deepEqual(original,manifest());
  assert.throws(()=>acquireLocks(locked,assignment({assignment_id:'assignment-0002-b-001-01',worker_id:'b'}),at),/locked/);
});

test('allows only an explicit release and retains held locks after interruption', () => {
  const locked=acquireLocks(manifest(),assignment(),at);
  const interrupted={...assignment(),state:'INTERRUPTED'};
  assert.deepEqual(locked.locks.map(lock=>lock.state),['HELD']);
  assert.deepEqual(assertOwnedChanges(interrupted,['public/articles/example.html']),['public/articles/example.html']);
  const released=releaseLocks(locked,'assignment-0002-a-001-01','2026-08-27T00:01:00.000Z');
  assert.deepEqual(released.locks.map(lock=>lock.state),['RELEASED']);
  assert.deepEqual(locked.locks.map(lock=>lock.state),['HELD']);
});

test('rejects diffs outside the assignment exact ownership set', () => {
  assert.throws(()=>assertOwnedChanges(assignment(),['public/articles/example.html','public/articles/other.html']),/outside assignment ownership/);
  assert.throws(()=>assertOwnedChanges(assignment(),['public/index.html']),/forbidden/);
});
