import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();

const removeTemporaryRoot=root=>{
  const resolved=path.resolve(root);
  const temporaryRoot=path.resolve(os.tmpdir());
  assert.notEqual(resolved,temporaryRoot);
  assert.equal(path.dirname(resolved),temporaryRoot);
  fs.rmSync(resolved,{recursive:true,force:true});
};

const createRepository=()=>{
  const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-worktree-'));
  const repo=path.join(temporaryRoot,'repo');
  const worktreeRoot=path.join(temporaryRoot,'worktrees');
  fs.mkdirSync(repo);
  fs.mkdirSync(worktreeRoot);
  git(repo,['init']);
  git(repo,['config','user.email','worker-tests@example.invalid']);
  git(repo,['config','user.name','Worker Tests']);
  git(repo,['config','core.autocrlf','false']);
  fs.writeFileSync(path.join(repo,'seed.txt'),'seed\n');
  git(repo,['add','seed.txt']);
  git(repo,['commit','-m','seed']);
  return {
    temporaryRoot,
    repo,
    worktreeRoot,
    baseSha:git(repo,['rev-parse','HEAD']),
    branch:'workers/batch-0002/a-wave-001',
    worktreePath:path.join(worktreeRoot,'batch-0002-a-wave-001')
  };
};

const isRegistered=(repo,worktreePath)=>git(repo,['worktree','list','--porcelain']).includes(`worktree ${worktreePath.replaceAll('\\','/')}`);

const worktreeAdminDirectory=worktreePath=>{
  const pointer=fs.readFileSync(path.join(worktreePath,'.git'),'utf8').trim();
  assert.match(pointer,/^gitdir: /);
  return pointer.slice('gitdir: '.length);
};

test('creates a Worker worktree on its exact registered branch', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    const result=createWorkerWorktree(fixture);

    assert.equal(result.status,'READY');
    assert.equal(result.created,true);
    assert.equal(path.resolve(result.path),path.resolve(fixture.worktreePath));
    assert.equal(result.branch,fixture.branch);
    assert.equal(result.registered,true);
    assert.equal(git(fixture.worktreePath,['branch','--show-current']),fixture.branch);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('verifies registration, a clean status, and base ancestry at the expected Result commit', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree, verifyWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    createWorkerWorktree(fixture);
    fs.writeFileSync(path.join(fixture.worktreePath,'result.txt'),'result\n');
    git(fixture.worktreePath,['add','result.txt']);
    git(fixture.worktreePath,['commit','-m','worker result']);
    const expectedResultCommit=git(fixture.worktreePath,['rev-parse','HEAD']);

    const result=verifyWorkerWorktree({...fixture,expectedResultCommit});

    assert.equal(result.status,'READY');
    assert.equal(result.registered,true);
    assert.equal(result.baseExists,true);
    assert.equal(result.baseIsAncestor,true);
    assert.equal(result.clean,true);
    assert.equal(result.head,expectedResultCommit);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('classifies tracked and untracked working changes as DIRTY with recovery evidence', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree, verifyWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    createWorkerWorktree(fixture);
    fs.appendFileSync(path.join(fixture.worktreePath,'seed.txt'),'changed\n');
    fs.writeFileSync(path.join(fixture.worktreePath,'recovery.txt'),'untracked\n');

    const result=verifyWorkerWorktree(fixture);

    assert.equal(result.status,'DIRTY');
    assert.equal(result.clean,false);
    assert.deepEqual(result.changes,[' M seed.txt','?? recovery.txt']);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('classifies a base commit that is not an ancestor of the Worker head as STALE', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree, verifyWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    createWorkerWorktree(fixture);
    fs.writeFileSync(path.join(fixture.repo,'later.txt'),'later\n');
    git(fixture.repo,['add','later.txt']);
    git(fixture.repo,['commit','-m','later base']);
    const laterBase=git(fixture.repo,['rev-parse','HEAD']);

    const result=verifyWorkerWorktree({...fixture,baseSha:laterBase});

    assert.equal(result.status,'STALE');
    assert.deepEqual(result.issues,['BASE_NOT_ANCESTOR']);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('classifies an expected Result commit mismatch as STALE', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree, verifyWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    createWorkerWorktree(fixture);
    fs.writeFileSync(path.join(fixture.repo,'other.txt'),'other\n');
    git(fixture.repo,['add','other.txt']);
    git(fixture.repo,['commit','-m','other commit']);
    const otherCommit=git(fixture.repo,['rev-parse','HEAD']);

    const result=verifyWorkerWorktree({...fixture,expectedResultCommit:otherCommit});

    assert.equal(result.status,'STALE');
    assert.deepEqual(result.issues,['RESULT_COMMIT_MISMATCH']);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('classifies a registered worktree on the wrong branch as CORRUPTED', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree, verifyWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    createWorkerWorktree(fixture);

    const result=verifyWorkerWorktree({...fixture,branch:'workers/batch-0002/b-wave-001'});

    assert.equal(result.status,'CORRUPTED');
    assert.deepEqual(result.issues,['REGISTERED_BRANCH_MISMATCH']);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('refuses a target outside the configured worktree root', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    const outsidePath=path.join(fixture.temporaryRoot,'outside-worker');

    const result=createWorkerWorktree({...fixture,worktreePath:outsidePath});

    assert.equal(result.status,'CORRUPTED');
    assert.deepEqual(result.issues,['PATH_OUTSIDE_ROOT']);
    assert.equal(fs.existsSync(outsidePath),false);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('classifies an unregistered Git checkout as CORRUPTED', async () => {
  const fixture=createRepository();
  try {
    const { verifyWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    git(fixture.repo,['clone','--quiet','--no-local',fixture.repo,fixture.worktreePath]);

    const result=verifyWorkerWorktree(fixture);

    assert.equal(result.status,'CORRUPTED');
    assert.deepEqual(result.issues,['PATH_UNREGISTERED']);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('classifies a registered path whose Git link is missing as CORRUPTED', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree, verifyWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    createWorkerWorktree(fixture);
    fs.unlinkSync(path.join(fixture.worktreePath,'.git'));

    const result=verifyWorkerWorktree(fixture);

    assert.equal(result.status,'CORRUPTED');
    assert.deepEqual(result.issues,['WORKTREE_NOT_GIT']);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('classifies damaged worktree registry metadata as CORRUPTED', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree, verifyWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    createWorkerWorktree(fixture);
    fs.writeFileSync(path.join(worktreeAdminDirectory(fixture.worktreePath),'HEAD'),'not-a-ref\n');

    const result=verifyWorkerWorktree(fixture);

    assert.equal(result.status,'CORRUPTED');
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('create preserves an existing dirty worktree instead of reusing or cleaning it', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    createWorkerWorktree(fixture);
    const recoveryPath=path.join(fixture.worktreePath,'recovery.txt');
    fs.writeFileSync(recoveryPath,'keep me\n');

    const result=createWorkerWorktree(fixture);

    assert.equal(result.status,'DIRTY');
    assert.equal(result.created,false);
    assert.equal(fs.readFileSync(recoveryPath,'utf8'),'keep me\n');
    assert.equal(isRegistered(fixture.repo,fixture.worktreePath),true);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('resume reports protected evidence without mutating a dirty worktree', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree, resumeWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    createWorkerWorktree(fixture);
    const recoveryPath=path.join(fixture.worktreePath,'recovery.txt');
    fs.writeFileSync(recoveryPath,'keep me\n');
    const beforeStatus=git(fixture.worktreePath,['status','--porcelain=v1','--untracked-files=all']);

    const result=resumeWorkerWorktree(fixture);

    assert.equal(result.status,'DIRTY');
    assert.equal(result.mutated,false);
    assert.equal(fs.readFileSync(recoveryPath,'utf8'),'keep me\n');
    assert.equal(git(fixture.worktreePath,['status','--porcelain=v1','--untracked-files=all']),beforeStatus);
    assert.equal(isRegistered(fixture.repo,fixture.worktreePath),true);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('cleanup removes only an exactly verified READY worktree', async () => {
  const fixture=createRepository();
  try {
    const { createWorkerWorktree, cleanupWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
    createWorkerWorktree(fixture);

    const result=cleanupWorkerWorktree(fixture);

    assert.equal(result.status,'READY');
    assert.equal(result.removed,true);
    assert.equal(fs.existsSync(fixture.worktreePath),false);
    assert.equal(isRegistered(fixture.repo,fixture.worktreePath),false);
  } finally {
    removeTemporaryRoot(fixture.temporaryRoot);
  }
});

test('cleanup preserves DIRTY, STALE, CORRUPTED, and outside-root worktrees', async t => {
  const cases=[
    {
      name:'DIRTY',
      arrange:fixture=>fs.writeFileSync(path.join(fixture.worktreePath,'recovery.txt'),'keep\n'),
      options:fixture=>fixture,
      want:'DIRTY'
    },
    {
      name:'STALE',
      arrange:fixture=>{
        fs.writeFileSync(path.join(fixture.repo,'later.txt'),'later\n');
        git(fixture.repo,['add','later.txt']);
        git(fixture.repo,['commit','-m','later base']);
      },
      options:fixture=>({...fixture,baseSha:git(fixture.repo,['rev-parse','HEAD'])}),
      want:'STALE'
    },
    {
      name:'CORRUPTED wrong branch',
      arrange:()=>{},
      options:fixture=>({...fixture,branch:'workers/batch-0002/b-wave-001'}),
      want:'CORRUPTED'
    },
    {
      name:'CORRUPTED outside root',
      arrange:()=>{},
      options:fixture=>({...fixture,worktreeRoot:path.join(fixture.temporaryRoot,'different-root')}),
      want:'CORRUPTED'
    }
  ];

  for (const item of cases) {
    await t.test(item.name,async () => {
      const fixture=createRepository();
      try {
        const { createWorkerWorktree, cleanupWorkerWorktree }=await import('../../scripts/lib/control-plane/worktree.mjs');
        createWorkerWorktree(fixture);
        item.arrange(fixture);

        const result=cleanupWorkerWorktree(item.options(fixture));

        assert.equal(result.status,item.want);
        assert.equal(result.removed,false);
        assert.equal(fs.existsSync(fixture.worktreePath),true);
        assert.equal(isRegistered(fixture.repo,fixture.worktreePath),true);
      } finally {
        removeTemporaryRoot(fixture.temporaryRoot);
      }
    });
  }
});
