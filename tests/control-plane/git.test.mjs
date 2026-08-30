import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const fakeGitEnvironment=()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-fake-git-'));
  const executable=path.join(temporary,process.platform==='win32' ? 'git.exe' : 'git');
  fs.copyFileSync(process.execPath,executable);
  const env={...process.env};
  const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path')??'PATH';
  env[pathKey]=temporary;
  return {temporary,env};
};

let fixture;
before(()=>{ fixture=fakeGitEnvironment(); });
after(()=>{ fs.rmSync(fixture.temporary,{recursive:true,force:true}); });

test('bounds every Git command with the explicit default timeout', async () => {
  const { DEFAULT_GIT_TIMEOUT_MS, runGit }=await import('../../scripts/lib/control-plane/git.mjs');
  const result=runGit(fixture.temporary,['--version'],{env:fixture.env});
  assert.equal(result.ok,true);
  assert.equal(result.timedOut,false);
  assert.equal(result.timeoutMs,DEFAULT_GIT_TIMEOUT_MS);
});

test('returns bounded timeout evidence when Git does not exit', async () => {
  const { runGit }=await import('../../scripts/lib/control-plane/git.mjs');
  const result=runGit(fixture.temporary,['-e','setTimeout(()=>{}, 10000)'],{env:fixture.env,allowFailure:true,timeoutMs:50});
  assert.equal(result.ok,false);
  assert.equal(result.timedOut,true);
  assert.equal(result.timeoutMs,50);
  assert.equal(result.error?.code,'ETIMEDOUT');
});

test('throws a timeout-specific GitCommandError unless failure evidence was requested', async () => {
  const { GitCommandError, runGit }=await import('../../scripts/lib/control-plane/git.mjs');
  assert.throws(
    ()=>runGit(fixture.temporary,['-e','setTimeout(()=>{}, 10000)'],{env:fixture.env,timeoutMs:50}),
    error=>error instanceof GitCommandError && error.timedOut===true && error.timeoutMs===50 && /timed out after 50ms/.test(error.message)
  );
});
