import assert from 'node:assert/strict';
import test from 'node:test';

test('synthetic proof covers three resource routes and blocks Codex content generation', async () => {
  const { runSyntheticControlPlane }=await import('../../scripts/run-synthetic-control-plane.mjs');
  const summary=runSyntheticControlPlane();
  assert.deepEqual(summary.routes['local-script'],{worker_count:0,status:'COMPLETED'});
  assert.deepEqual(summary.routes['codex-master'],{worker_count:0,status:'COMPLETED'});
  assert.equal(summary.routes['codex-worker-wave'].worker_count,2);
  assert.ok(summary.routes['codex-worker-wave'].worker_count<=3);
  assert.equal(summary.routes['codex-worker-wave'].allocation_status,'ALLOCATED');
  assert.equal(summary.routes['codex-worker-wave'].assignment_count,2);
  assert.equal(new Set(summary.routes['codex-worker-wave'].worker_ids).size,2);
  assert.deepEqual(summary.routes['codex-worker-wave'].review_statuses,['REVIEW_PASSED','REVIEW_PASSED']);
  assert.equal(summary.routes['codex-worker-wave'].integration_status,'INTEGRATION_PREPARED');
  assert.equal(summary.routes['codex-worker-wave'].approval_status,'PENDING');
  assert.deepEqual(summary.routes['external-content-input'],{worker_count:0,status:'WAITING_FOR_GPT_CONTENT_BATCH',dispatch_created:false});
  assert.equal(summary.leftover_worktrees,0);
  assert.equal(summary.batch_state,'APPROVAL_PENDING');
  assert.deepEqual(summary.batch_history,['DRAFT','ALLOCATED','ACTIVE','REVIEW','INTEGRATION_PREPARED','APPROVAL_PENDING']);
});
