import fs from 'node:fs';
import path from 'node:path';
import { runGit } from './git.mjs';

const WORKER_BRANCH=/^workers\/batch-[0-9]{4,}\/[a-e]-wave-[0-9]{3}$/;
const SHA=/^[0-9a-f]{40}$/i;

const resolved=value=>path.resolve(value);
const isInside=(root,target)=>{
  const relative=path.relative(resolved(root),resolved(target));
  return relative!=='' && relative!=='..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const parseWorktreeRegistry=output=>{
  const records=[];
  let record={};
  for (const field of output.split('\0')) {
    if (field==='') {
      if (Object.keys(record).length) records.push(record);
      record={};
      continue;
    }
    const separator=field.indexOf(' ');
    const key=separator===-1 ? field : field.slice(0,separator);
    const value=separator===-1 ? true : field.slice(separator+1);
    if (Object.hasOwn(record,key)) return null;
    record[key]=value;
  }
  if (Object.keys(record).length) records.push(record);
  if (records.some(entry=>typeof entry.worktree!=='string' || typeof entry.HEAD!=='string')) return null;
  return records;
};

const evidence=(options,overrides={})=>({
  status:'CORRUPTED',
  path:resolved(options.worktreePath),
  branch:options.branch,
  baseSha:options.baseSha,
  head:null,
  registered:false,
  baseExists:false,
  baseIsAncestor:false,
  clean:false,
  expectedResultCommit:options.expectedResultCommit??null,
  changes:[],
  issues:[],
  ...overrides
});

const repositoryReady=repo=>{
  const result=runGit(repo,['rev-parse','--is-inside-work-tree'],{allowFailure:true});
  return result.ok && result.stdout.trim()==='true';
};

const commitExists=(repo,sha)=>{
  if (!SHA.test(sha??'')) return false;
  return runGit(repo,['cat-file','-e',`${sha}^{commit}`],{allowFailure:true}).ok;
};

export const verifyWorkerWorktree=options=>{
  const {repo,worktreeRoot,worktreePath,baseSha,branch,expectedResultCommit}=options;
  let result=evidence(options);
  if (!WORKER_BRANCH.test(branch??'')) return {...result,issues:['INVALID_BRANCH']};
  if (!repositoryReady(repo)) return {...result,issues:['REPOSITORY_NOT_GIT']};
  if (!commitExists(repo,baseSha)) return {...result,issues:['BASE_COMMIT_MISSING']};
  result={...result,baseExists:true};
  if (!isInside(worktreeRoot,worktreePath)) return {...result,issues:['PATH_OUTSIDE_ROOT']};

  const listing=runGit(repo,['worktree','list','--porcelain','-z'],{allowFailure:true});
  if (!listing.ok) return {...result,issues:['REGISTRY_UNREADABLE']};
  const registry=parseWorktreeRegistry(listing.stdout);
  if (!registry) return {...result,issues:['REGISTRY_MALFORMED']};
  const matches=registry.filter(entry=>resolved(entry.worktree)===resolved(worktreePath));
  if (matches.length!==1) return {...result,issues:['PATH_UNREGISTERED']};
  const entry=matches[0];
  result={...result,registered:true};
  if (entry.branch!==`refs/heads/${branch}`) return {...result,issues:['REGISTERED_BRANCH_MISMATCH']};
  if (!repositoryReady(worktreePath)) return {...result,issues:['WORKTREE_NOT_GIT']};

  const topLevel=runGit(worktreePath,['rev-parse','--show-toplevel'],{allowFailure:true});
  const actualBranch=runGit(worktreePath,['symbolic-ref','--quiet','--short','HEAD'],{allowFailure:true});
  const headResult=runGit(worktreePath,['rev-parse','--verify','HEAD^{commit}'],{allowFailure:true});
  if (!topLevel.ok || resolved(topLevel.stdout.trim())!==resolved(worktreePath) ||
      !actualBranch.ok || actualBranch.stdout.trim()!==branch || !headResult.ok) {
    return {...result,issues:['WORKTREE_IDENTITY_MISMATCH']};
  }

  const head=headResult.stdout.trim();
  result={...result,head};
  const ancestry=runGit(repo,['merge-base','--is-ancestor',baseSha,head],{allowFailure:true});
  if (!ancestry.ok) {
    if (ancestry.status===1) return {...result,status:'STALE',issues:['BASE_NOT_ANCESTOR']};
    return {...result,issues:['ANCESTRY_CHECK_FAILED']};
  }
  result={...result,baseIsAncestor:true};
  if (expectedResultCommit!==undefined && (!SHA.test(expectedResultCommit) || head!==expectedResultCommit)) {
    return {...result,status:'STALE',issues:['RESULT_COMMIT_MISMATCH']};
  }

  const status=runGit(worktreePath,['status','--porcelain=v1','--untracked-files=all'],{allowFailure:true});
  if (!status.ok) return {...result,issues:['STATUS_UNREADABLE']};
  if (status.stdout.length>0) {
    const changes=status.stdout.trimEnd().split(/\r?\n/);
    return {...result,status:'DIRTY',changes,issues:['WORKTREE_DIRTY']};
  }
  return {...result,status:'READY',clean:true,issues:[]};
};

export const createWorkerWorktree=options=>{
  const {repo,worktreeRoot,worktreePath,baseSha,branch}=options;
  const preflight=evidence(options);
  if (!WORKER_BRANCH.test(branch??'')) return {...preflight,created:false,issues:['INVALID_BRANCH']};
  if (!repositoryReady(repo)) return {...preflight,created:false,issues:['REPOSITORY_NOT_GIT']};
  if (!commitExists(repo,baseSha)) return {...preflight,created:false,issues:['BASE_COMMIT_MISSING']};
  if (!isInside(worktreeRoot,worktreePath)) return {...preflight,baseExists:true,created:false,issues:['PATH_OUTSIDE_ROOT']};

  const listing=runGit(repo,['worktree','list','--porcelain','-z'],{allowFailure:true});
  const registry=listing.ok ? parseWorktreeRegistry(listing.stdout) : null;
  if (!registry) return {...preflight,baseExists:true,created:false,issues:['REGISTRY_MALFORMED']};
  const registered=registry.some(entry=>resolved(entry.worktree)===resolved(worktreePath));
  if (registered || fs.existsSync(worktreePath)) {
    return {...verifyWorkerWorktree(options),created:false};
  }

  fs.mkdirSync(worktreeRoot,{recursive:true});
  const creation=runGit(repo,['worktree','add','-b',branch,worktreePath,baseSha],{allowFailure:true});
  if (!creation.ok) return {...preflight,baseExists:true,created:false,issues:['CREATE_FAILED'],gitError:creation.stderr.trim()};
  return {...verifyWorkerWorktree(options),created:true};
};

export const resumeWorkerWorktree=options=>({
  ...verifyWorkerWorktree(options),
  mutated:false
});

export const cleanupWorkerWorktree=options=>{
  const verification=verifyWorkerWorktree(options);
  if (verification.status!=='READY') return {...verification,removed:false};
  const removal=runGit(options.repo,['worktree','remove',options.worktreePath],{allowFailure:true});
  if (!removal.ok) {
    return {
      ...verification,
      status:'CORRUPTED',
      removed:false,
      clean:false,
      issues:['CLEANUP_FAILED'],
      gitError:removal.stderr.trim()
    };
  }
  return {...verification,removed:true};
};
