import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

const productionWorkflow=`name: Production

on:
  push:
    branches: [main]

concurrency:
  group: firebase-production
  cancel-in-progress: false

jobs:
  validate-and-deploy:
    steps:
      - name: Control Plane gate
        run: npm run validate:control-plane
      - name: Release quality gate
        run: npm run validate:ci
      - name: Reject stale main commits
        run: test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$GITHUB_SHA"
      - name: Deploy Firebase Hosting live channel
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          channelId: live
      - name: Verify live deployment
        run: node scripts/verify-live.mjs
`;

const previewWorkflow=`name: PR Validation and Firebase Preview

on:
  pull_request:
    branches: [main]

jobs:
  quality-gate:
    steps:
      - run: npm run validate:control-plane
      - run: npm run validate:ci
  build_and_preview:
    needs: quality-gate
    if: github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - uses: FirebaseExtended/action-hosting-deploy@v0
`;

const makeFixture=({production=productionWorkflow,preview=previewWorkflow,extraWorkflows={}}={})=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-release-workflows-'));
  const workflowRoot=path.join(root,'.github/workflows');
  fs.mkdirSync(workflowRoot,{recursive:true});
  fs.writeFileSync(path.join(workflowRoot,'deploy-firebase.yml'),production);
  fs.writeFileSync(path.join(workflowRoot,'firebase-hosting-pull-request.yml'),preview);
  for (const [name,contents] of Object.entries(extraWorkflows)) fs.writeFileSync(path.join(workflowRoot,name),contents);
  return root;
};

const validate=async root=>{
  const { validateWorkflowPolicy }=await import('../../scripts/lib/release-safety/workflow-policy.mjs');
  return validateWorkflowPolicy(root);
};

test('accepts one serialized quality-gated production Workflow and one gated PR Preview', async () => {
  const root=makeFixture();
  try {
    const report=await validate(root);
    assert.equal(report.ok,true,report.errors.join('\n'));
    assert.equal(report.checks.production_workflow_count,1);
    assert.equal(report.checks.production_workflow,'.github/workflows/deploy-firebase.yml');
    assert.equal(report.checks.preview_workflow_count,1);
    assert.equal(report.checks.max_live_channels,1);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects two main-push Firebase live Workflows', async () => {
  const root=makeFixture({extraWorkflows:{'firebase-hosting-merge.yml':productionWorkflow.replace('name: Production','name: Duplicate Production')}});
  try {
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.equal(report.checks.production_workflow_count,2);
    assert.ok(report.errors.some(error=>/exactly one production Workflow/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects production without both required quality commands', async () => {
  const root=makeFixture({production:productionWorkflow.replace('npm run validate:control-plane','npm run validate:content')});
  try {
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.ok(report.errors.some(error=>/validate:control-plane must run before live deploy/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects production when live deploy precedes validation', async () => {
  const deployBlock=`      - name: Deploy Firebase Hosting live channel
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          channelId: live
`;
  const production=productionWorkflow.replace(deployBlock,'').replace('    steps:\n',`    steps:\n${deployBlock}`);
  const root=makeFixture({production});
  try {
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.ok(report.errors.some(error=>/validation must complete before live deploy/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects production without the firebase-production concurrency lock', async () => {
  const production=productionWorkflow.replace(/concurrency:[\s\S]*?jobs:/,'jobs:');
  const root=makeFixture({production});
  try {
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.ok(report.errors.some(error=>/firebase-production concurrency/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects production without a remote main freshness guard', async () => {
  const production=productionWorkflow.replace('      - name: Reject stale main commits\n        run: test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$GITHUB_SHA"\n','');
  const root=makeFixture({production});
  try {
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.ok(report.errors.some(error=>/remote main freshness guard/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects a PR Workflow that can target the live channel', async () => {
  const preview=previewWorkflow.replace('      - uses: FirebaseExtended/action-hosting-deploy@v0','      - uses: FirebaseExtended/action-hosting-deploy@v0\n        with:\n          channelId: live');
  const root=makeFixture({preview});
  try {
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.ok(report.errors.some(error=>/PR Workflow must never target the live channel/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects PR Preview that is not dependent on quality-gate', async () => {
  const root=makeFixture({preview:previewWorkflow.replace('    needs: quality-gate\n','')});
  try {
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.ok(report.errors.some(error=>/Preview must depend on quality-gate/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('package scripts expose release-safety validation and include it in CI', () => {
  const packageJson=JSON.parse(fs.readFileSync(path.join(repositoryRoot,'package.json'),'utf8'));
  assert.equal(packageJson.scripts['validate:release-safety'],'node scripts/validate-release-safety.mjs');
  assert.match(packageJson.scripts['validate:ci'],/validate:release-safety/);
});
