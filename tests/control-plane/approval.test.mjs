import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const at='2026-08-28T03:00:00.000Z';
const later='2026-08-28T03:05:00.000Z';
const head='a'.repeat(40);

test('creates an explicit PENDING user approval after integration preparation', async () => {
  const { buildPendingApproval }=await import('../../scripts/lib/control-plane/approval.mjs');
  const approval=buildPendingApproval({batch_id:'batch-9001',integration_branch:'integration/batch-9001',integration_head:head,at});
  assert.deepEqual(approval,{
    schema_version:2,
    batch_id:'batch-9001',
    status:'PENDING',
    integration_branch:'integration/batch-9001',
    integration_head:head,
    created_at:at,
    updated_at:at
  });
});

test('requires an explicit user decision, actor, reason, and timestamp', async () => {
  const { applyUserApproval, buildPendingApproval }=await import('../../scripts/lib/control-plane/approval.mjs');
  const pending=buildPendingApproval({batch_id:'batch-9001',integration_branch:'integration/batch-9001',integration_head:head,at});
  assert.throws(()=>applyUserApproval(pending,'APPROVED',{actor:'user',reason:'reviewed'}),/at/);
  assert.throws(()=>applyUserApproval(pending,'APPROVED',{at:later,reason:'reviewed'}),/actor/);
  assert.throws(()=>applyUserApproval(pending,'APPROVED',{at:later,actor:'user'}),/reason/);
  assert.throws(()=>applyUserApproval(pending,'PENDING',{at:later,actor:'user',reason:'later'}),/decision/);
  assert.deepEqual(pending,buildPendingApproval({batch_id:'batch-9001',integration_branch:'integration/batch-9001',integration_head:head,at}));
});

test('records approved or rejected state once and never auto-advances it', async () => {
  const { applyUserApproval, buildPendingApproval }=await import('../../scripts/lib/control-plane/approval.mjs');
  for (const decision of ['APPROVED','REJECTED']) {
    const pending=buildPendingApproval({batch_id:'batch-9001',integration_branch:'integration/batch-9001',integration_head:head,at});
    const decided=applyUserApproval(pending,decision,{at:later,actor:'user',reason:'explicit review'});
    assert.equal(decided.status,decision);
    assert.equal(decided.actor,'user');
    assert.equal(decided.reason,'explicit review');
    assert.equal(decided.decided_at,later);
    assert.equal(decided.updated_at,later);
    assert.throws(()=>applyUserApproval(decided,decision,{at:later,actor:'user',reason:'again'}),/PENDING/);
  }
});

test('approval JSON Schema requires integration evidence and explicit decision evidence', async () => {
  const { validateApproval }=await import('../../scripts/lib/control-plane/schema.mjs');
  const schema=JSON.parse(fs.readFileSync(path.join(root,'editorial/control/schemas/approval-v2.schema.json'),'utf8'));
  assert.ok(schema.required.includes('integration_branch'));
  assert.ok(schema.required.includes('integration_head'));
  assert.ok(Array.isArray(schema.allOf));
  const approved={schema_version:2,batch_id:'batch-9001',status:'APPROVED',integration_branch:'integration/batch-9001',integration_head:head,actor:'user',reason:'reviewed',decided_at:later,created_at:at,updated_at:later};
  validateApproval(approved);
  for (const field of ['actor','reason','decided_at']) {
    const missing={...approved};
    delete missing[field];
    assert.throws(()=>validateApproval(missing),new RegExp(field));
  }
});
