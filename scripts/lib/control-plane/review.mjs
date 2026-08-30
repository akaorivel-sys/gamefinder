import { runGit } from './git.mjs';
import { assertOwnedChanges } from './ownership.mjs';
import { validateAssignment, validateWorkerResult } from './schema.mjs';

const SHA=/^[0-9a-f]{40}$/;
const sameSet=(left,right)=>{
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (new Set(left).size!==left.length || new Set(right).size!==right.length) return false;
  return [...left].sort().join('\0')===[...right].sort().join('\0');
};

const identityMatches=(assignment,result)=>[
  ['batch_id','batch_id'],
  ['wave','wave'],
  ['assignment_id','assignment_id'],
  ['worker_id','worker_id'],
  ['base_sha','base_sha'],
  ['classification','classification'],
  ['execution_route','execution_route'],
  ['worker_count','worker_count'],
  ['dispatch_reason','dispatch_reason']
].every(([assignmentField,resultField])=>assignment[assignmentField]===result[resultField]);

const actualChangedPaths=(repo,baseSha,commitSha)=>{
  if (!SHA.test(baseSha??'') || !SHA.test(commitSha??'')) return null;
  const diff=runGit(repo,['diff','--name-only','-z',baseSha,commitSha,'--'],{allowFailure:true});
  if (!diff.ok) return null;
  return diff.stdout.split('\0').filter(Boolean).sort();
};

const isSingleCommitFromBase=(repo,baseSha,commitSha)=>{
  const parents=runGit(repo,['rev-list','--parents','-n','1',commitSha],{allowFailure:true});
  if (!parents.ok) return false;
  const fields=parents.stdout.trim().split(/\s+/);
  return fields.length===2 && fields[0]===commitSha && fields[1]===baseSha;
};

export const reviewWorkerResult=context=>{
  const { repo, assignment, result, reviewed_at }=context;
  const reasons=[];
  try {
    validateAssignment(assignment);
    validateWorkerResult(result);
  } catch {
    reasons.push('SCHEMA_INVALID');
  }

  if (assignment?.state!=='RESULT_READY') reasons.push('ASSIGNMENT_NOT_REVIEWABLE');
  if (!identityMatches(assignment??{},result??{})) reasons.push('IDENTITY_MISMATCH');
  if (assignment?.execution_route!=='codex-worker-wave' || assignment?.classification!=='parallel_code_change') reasons.push('ROUTE_NOT_WORKER');

  let actual=[];
  const commitSha=result?.commit_sha;
  const commit=typeof commitSha==='string'
    ? runGit(repo,['cat-file','-e',`${commitSha}^{commit}`],{allowFailure:true})
    : {ok:false};
  if (!commit.ok) {
    reasons.push('COMMIT_MISSING');
  } else {
    if (!SHA.test(assignment?.base_sha??'')) {
      reasons.push('ANCESTRY_CHECK_FAILED');
    } else {
      const ancestry=runGit(repo,['merge-base','--is-ancestor',assignment.base_sha,commitSha],{allowFailure:true});
      if (!ancestry.ok) reasons.push(ancestry.status===1 ? 'COMMIT_NOT_DESCENDANT' : 'ANCESTRY_CHECK_FAILED');
      else if (!isSingleCommitFromBase(repo,assignment.base_sha,commitSha)) reasons.push('RESULT_NOT_SINGLE_COMMIT');
    }
    actual=actualChangedPaths(repo,assignment?.base_sha,commitSha);
    if (!actual) reasons.push('DIFF_UNREADABLE');
  }

  if (actual && !sameSet(actual,result?.changed_paths)) reasons.push('RESULT_DIFF_MISMATCH');
  if (commit.ok && Array.isArray(actual) && actual.length===0) reasons.push('NO_CHANGED_PATHS');
  if (actual) {
    try {
      assertOwnedChanges(assignment,actual);
    } catch {
      reasons.push('OWNERSHIP_VIOLATION');
    }
  }

  const taskIds=assignment?.task_ids??[];
  const outcomeIds=(result?.task_outcomes??[]).map(outcome=>outcome.task_id);
  if (!sameSet(taskIds,outcomeIds)) reasons.push('TASK_OUTCOME_MISMATCH');
  if ((result?.task_outcomes??[]).some(outcome=>outcome.status!=='COMPLETED')) reasons.push('TASK_OUTCOME_NOT_COMPLETED');
  if (!Array.isArray(result?.validation) || result.validation.length===0 || result.validation.some(check=>check.exit_code!==0)) reasons.push('VALIDATION_FAILED');

  const uniqueReasons=[...new Set(reasons)];
  return {
    schema_version:2,
    decision_id:`review-${assignment?.assignment_id??'invalid'}`,
    batch_id:assignment?.batch_id??result?.batch_id??'invalid',
    wave:assignment?.wave??result?.wave??0,
    assignment_id:assignment?.assignment_id??result?.assignment_id??'invalid',
    worker_id:assignment?.worker_id??result?.worker_id??'invalid',
    commit_sha:commitSha??null,
    status:uniqueReasons.length===0 ? 'REVIEW_PASSED' : 'REVIEW_REJECTED',
    actual_changed_paths:actual??[],
    reviewed_at,
    reasons:uniqueReasons
  };
};
