import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true}).trim();

const contractFixture=()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-control-validation-'));
  fs.mkdirSync(path.join(temporary,'editorial/control'),{recursive:true});
  fs.cpSync(path.join(root,'editorial/control/schemas'),path.join(temporary,'editorial/control/schemas'),{recursive:true});
  fs.copyFileSync(path.join(root,'editorial/control/workers.json'),path.join(temporary,'editorial/control/workers.json'));
  fs.mkdirSync(path.join(temporary,'.codex/agents'),{recursive:true});
  fs.writeFileSync(path.join(temporary,'.codex/config.toml'),'[agents]\nmax_concurrent_threads_per_session = 3\n');
  for (const workerId of ['a','b','c','d','e']) fs.writeFileSync(path.join(temporary,'.codex/agents',`worker-${workerId}.toml`),`name = "Worker ${workerId}"\ndescription = "Optional code Worker"\ndeveloper_instructions = """default-off optional Worker pool; assignment only; never article prose; .github/workflows; Batch 0001; never push"""\n`);
  return temporary;
};

const repositoryFixture=()=>{
  const temporary=contractFixture();
  fs.mkdirSync(path.join(temporary,'editorial/queue/assignments'),{recursive:true});
  fs.copyFileSync(path.join(root,'editorial/queue/tasks.json'),path.join(temporary,'editorial/queue/tasks.json'));
  for (const workerId of ['a','b','c','d','e']) fs.copyFileSync(path.join(root,'editorial/queue/assignments',`batch-0001-worker-${workerId}.json`),path.join(temporary,'editorial/queue/assignments',`batch-0001-worker-${workerId}.json`));
  fs.mkdirSync(path.join(temporary,'public/articles'),{recursive:true});
  fs.mkdirSync(path.join(temporary,'public/games'),{recursive:true});
  fs.mkdirSync(path.join(temporary,'public/data'),{recursive:true});
  fs.copyFileSync(path.join(root,'public/index.html'),path.join(temporary,'public/index.html'));
  fs.copyFileSync(path.join(root,'public/robots.txt'),path.join(temporary,'public/robots.txt'));
  fs.writeFileSync(path.join(temporary,'public/articles/base.html'),'article baseline\n');
  fs.writeFileSync(path.join(temporary,'public/games/base.html'),'game baseline\n');
  fs.writeFileSync(path.join(temporary,'public/data/games.json'),'{"games":[]}\n');
  git(temporary,['init','--quiet','-b','main']);
  git(temporary,['config','user.name','Control Plane Validation Test']);
  git(temporary,['config','user.email','validation@example.invalid']);
  git(temporary,['config','core.autocrlf','false']);
  git(temporary,['add','.']);
  git(temporary,['commit','--quiet','-m','validation baseline']);
  return {temporary,baselineSha:git(temporary,['rev-parse','HEAD'])};
};

test('validates Control Plane schemas and a complete optional Worker contract fixture', async () => {
  const { validateControlPlane }=await import('../../scripts/validate-control-plane.mjs');
  const temporary=contractFixture();
  try {
    const report=validateControlPlane(temporary,{contractsOnly:true});
    assert.equal(report.ok,true,report.errors.join('\n'));
    assert.equal(report.checks.schemas,7);
    assert.equal(report.checks.workers,5);
    assert.equal(report.checks.default_worker_count,0);
    assert.equal(report.checks.max_wave_workers,3);
  } finally {
    fs.rmSync(temporary,{recursive:true,force:true});
  }
});

test('exposes Control Plane validation and synthetic commands', () => {
  const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(packageJson.scripts['validate:control-plane'],'node scripts/validate-control-plane.mjs');
  assert.equal(packageJson.scripts['control:synthetic'],'node scripts/run-synthetic-control-plane.mjs');
});

test('Master and operator docs preserve the resource-aware content boundary', () => {
  for (const relative of ['docs/master-protocol.md','docs/master-worker-control-plane.md']) {
    const text=fs.readFileSync(path.join(root,relative),'utf8');
    assert.match(text,/default[- ]off/i);
    assert.match(text,/external-content-input/);
    assert.match(text,/local-script/);
    assert.match(text,/codex-master/);
    assert.match(text,/codex-worker-wave/);
    assert.match(text,/article prose/i);
    assert.match(text,/APPROVAL_PENDING/);
    assert.match(text,/Batch 0001.*read-only/is);
    assert.match(text,/never push/i);
  }
});

test('reports mutated schema and Worker concurrency contracts specifically', async () => {
  const { validateControlPlane }=await import('../../scripts/validate-control-plane.mjs');
  const temporary=contractFixture();
  try {
    const schemaPath=path.join(temporary,'editorial/control/schemas/assignment-v2.schema.json');
    const schema=JSON.parse(fs.readFileSync(schemaPath,'utf8'));
    schema.required=schema.required.filter(field=>field!=='classification');
    fs.writeFileSync(schemaPath,JSON.stringify(schema));
    fs.writeFileSync(path.join(temporary,'.codex/config.toml'),'[agents]\nmax_concurrent_threads_per_session = 4\n');
    const report=validateControlPlane(temporary,{contractsOnly:true});
    assert.equal(report.ok,false);
    assert.ok(report.errors.some(error=>/assignment-v2.*classification/.test(error)));
    assert.ok(report.errors.some(error=>/max_concurrent_threads_per_session.*3/.test(error)));
  } finally {
    fs.rmSync(temporary,{recursive:true,force:true});
  }
});

test('full repository validation accepts the project-scoped optional Agent files', async () => {
  const { validateControlPlane }=await import('../../scripts/validate-control-plane.mjs');
  const report=validateControlPlane(root);
  assert.equal(report.ok,true,report.errors.join('\n'));
  assert.deepEqual(report.errors,[]);
  assert.equal(report.checks.workers,5);
  assert.equal(report.checks.default_worker_count,0);
  assert.equal(report.checks.max_wave_workers,3);
  assert.equal(report.checks.batch_0001_compatible,true);
  assert.equal(report.checks.forbidden_diff_count,0);
  assert.equal(report.checks.public_public_absent,true);
  assert.equal(report.checks.noindex_preserved,true);
  assert.equal(report.checks.robots_disallow_preserved,true);
});

test('compares the complete legacy Batch 0001 queue and assignments with baseline content', async () => {
  const { validateControlPlane }=await import('../../scripts/validate-control-plane.mjs');
  const fixture=repositoryFixture();
  try {
    const queuePath=path.join(fixture.temporary,'editorial/queue/tasks.json');
    const queue=JSON.parse(fs.readFileSync(queuePath,'utf8'));
    queue[0].priority+=1;
    fs.writeFileSync(queuePath,`${JSON.stringify(queue,null,2)}\n`);
    const report=validateControlPlane(fixture.temporary,{baselineSha:fixture.baselineSha});
    assert.equal(report.checks.batch_0001_compatible,false);
    assert.ok(report.errors.some(error=>/editorial\/queue\/tasks\.json.*differs from baseline/.test(error)));
  } finally {
    fs.rmSync(fixture.temporary,{recursive:true,force:true});
  }
});

test('detects forbidden content changes while Release Safety owns Workflow validation', async () => {
  const { validateControlPlane }=await import('../../scripts/validate-control-plane.mjs');
  const fixture=repositoryFixture();
  try {
    fs.writeFileSync(path.join(fixture.temporary,'public/articles/base.html'),'changed article\n');
    fs.writeFileSync(path.join(fixture.temporary,'public/games/base.html'),'changed game\n');
    fs.writeFileSync(path.join(fixture.temporary,'public/data/games.json'),'{"games":["changed"]}\n');
    fs.mkdirSync(path.join(fixture.temporary,'.github/workflows'),{recursive:true});
    fs.writeFileSync(path.join(fixture.temporary,'.github/workflows/untracked.yml'),'name: forbidden\n');
    const report=validateControlPlane(fixture.temporary,{baselineSha:fixture.baselineSha});
    assert.equal(report.checks.forbidden_diff_count,3);
    assert.ok(report.errors.some(error=>/public\/articles\/base\.html/.test(error)));
    assert.ok(report.errors.some(error=>/public\/games\/base\.html/.test(error)));
    assert.ok(report.errors.some(error=>/public\/data\/games\.json/.test(error)));
    assert.ok(!report.errors.some(error=>/\.github\/workflows\/untracked\.yml/.test(error)));
  } finally {
    fs.rmSync(fixture.temporary,{recursive:true,force:true});
  }
});
