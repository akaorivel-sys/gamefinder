import { spawnSync } from 'node:child_process';

export const DEFAULT_GIT_TIMEOUT_MS=30_000;

export class GitCommandError extends Error {
  constructor(repo,args,result) {
    const detail=result.timedOut
      ? `Git command timed out after ${result.timeoutMs}ms`
      : (result.stderr||result.error?.message||'Git command failed').trim();
    super(`${detail} (git ${args.join(' ')})`);
    this.name='GitCommandError';
    this.repo=repo;
    this.args=[...args];
    this.status=result.status;
    this.stdout=result.stdout??'';
    this.stderr=result.stderr??'';
    this.timedOut=result.timedOut===true;
    this.timeoutMs=result.timeoutMs;
    this.cause=result.error;
  }
}

export const runGit=(repo,args,options={})=>{
  if (!Array.isArray(args) || args.some(argument=>typeof argument!=='string')) {
    throw new TypeError('Git arguments must be an array of strings');
  }
  const {allowFailure=false,input,env,timeoutMs=DEFAULT_GIT_TIMEOUT_MS}=options;
  if (!Number.isInteger(timeoutMs) || timeoutMs<1) throw new TypeError('Git timeoutMs must be a positive integer');
  const result=spawnSync('git',args,{
    cwd:repo,
    encoding:'utf8',
    env:env??process.env,
    input,
    timeout:timeoutMs,
    shell:false,
    windowsHide:true
  });
  const timedOut=result.error?.code==='ETIMEDOUT';
  const completed={
    ok:!result.error&&result.status===0,
    status:result.status,
    stdout:result.stdout??'',
    stderr:result.stderr??'',
    error:result.error,
    timedOut,
    timeoutMs
  };
  if (!completed.ok && !allowFailure) throw new GitCommandError(repo,args,completed);
  return completed;
};
