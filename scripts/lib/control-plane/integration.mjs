import fs from 'node:fs';
import path from 'node:path';
import { runGit } from './git.mjs';
import { reviewWorkerResult } from './review.mjs';
import { validateAssignment, validateBatchState, validateWorkerResult } from './schema.mjs';

const resolved=value=>path.resolve(value);
const inside=(root,target)=>{
  const relative=path.relative(resolved(root),resolved(target));
  return relative!=='' && relative!=='..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const order=(left,right)=>left.wave-right.wave || left.worker_id.localeCompare(right.worker_id) || left.assignment_id.localeCompare(right.assignment_id);
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const sameArray=(left,right)=>Array.isArray(left) && Array.isArray(right)
  && left.length===right.length
  && left.every((value,index)=>value===right[index]);

const sameReviewDecision=(expected,actual)=>[
  'schema_version',
  'decision_id',
  'batch_id',
  'wave',
  'assignment_id',
  'worker_id',
  'commit_sha',
  'status',
  'reviewed_at'
].every(field=>expected[field]===actual[field])
  && sameArray(expected.actual_changed_paths,actual.actual_changed_paths)
  && sameArray(expected.reasons,actual.reasons);

const uniqueByAssignment=(values,label,validate)=>{
  if (!Array.isArray(values) || values.length===0) throw new Error(`${label} are required`);
  const entries=new Map();
  for (const value of values) {
    validate(value);
    if (entries.has(value.assignment_id)) throw new Error(`duplicate ${label} assignment_id`);
    entries.set(value.assignment_id,value);
  }
  return entries;
};

const validateDecisions=(repo,batch,assignments,workerResults,decisions)=>{
  if (!Array.isArray(decisions) || decisions.length===0) throw new Error('review_decisions are required');
  if (decisions.some(decision=>decision.status!=='REVIEW_PASSED')) throw new Error('all integration decisions must be REVIEW_PASSED');
  if (decisions.some(decision=>decision.batch_id!==batch.batch_id)) throw new Error('review decision batch_id mismatch');
  if (new Set(decisions.map(decision=>decision.assignment_id)).size!==decisions.length) throw new Error('duplicate assignment review decision');
  if (new Set(decisions.map(decision=>decision.commit_sha)).size!==decisions.length) throw new Error('duplicate reviewed commit');

  const assignmentById=uniqueByAssignment(assignments,'assignments',validateAssignment);
  const resultByAssignment=uniqueByAssignment(workerResults,'worker_results',validateWorkerResult);
  const decisionIds=new Set(decisions.map(decision=>decision.assignment_id));
  if (assignmentById.size!==decisionIds.size || resultByAssignment.size!==decisionIds.size ||
      [...assignmentById.keys()].some(assignmentId=>!decisionIds.has(assignmentId)) ||
      [...resultByAssignment.keys()].some(assignmentId=>!decisionIds.has(assignmentId))) {
    throw new Error('review evidence must cover every Assignment and Worker Result exactly once');
  }

  for (const decision of decisions) {
    if (!ISO.test(decision.reviewed_at??'')) throw new Error('reviewed_at is invalid');
    const assignment=assignmentById.get(decision.assignment_id);
    const result=resultByAssignment.get(decision.assignment_id);
    if (assignment.batch_id!==batch.batch_id || result.batch_id!==batch.batch_id) throw new Error('review evidence batch_id mismatch');
    if (assignment.base_sha!==batch.base_sha || result.base_sha!==batch.base_sha) throw new Error('Assignment base_sha must match Batch base_sha');
    if (assignment.state!=='REVIEW_PASSED') throw new Error('Assignment must be REVIEW_PASSED');
    const expected=reviewWorkerResult({repo,assignment:{...assignment,state:'RESULT_READY'},result,reviewed_at:decision.reviewed_at});
    if (expected.status!=='REVIEW_PASSED' || !sameReviewDecision(expected,decision)) {
      throw new Error(`review decision does not match actual Master review output: ${decision.assignment_id}`);
    }
    if (!runGit(repo,['cat-file','-e',`${decision.commit_sha}^{commit}`],{allowFailure:true}).ok) throw new Error(`reviewed commit is missing: ${decision.commit_sha}`);
    if (!runGit(repo,['merge-base','--is-ancestor',batch.base_sha,decision.commit_sha],{allowFailure:true}).ok) throw new Error(`reviewed commit does not descend from base: ${decision.commit_sha}`);
  }
  return [...decisions].sort(order);
};

export const prepareIntegration=context=>{
  const { repo, worktreeRoot, worktreePath, batch, assignments, worker_results, review_decisions, prepared_at }=context;
  validateBatchState(batch);
  if (batch.state!=='REVIEW') throw new Error('batch must be in REVIEW');
  if (batch.batch_id==='batch-0001') throw new Error('Batch 0001 is read-only');
  const branch=`integration/${batch.batch_id}`;
  if (!/^integration\/batch-[0-9]{4,}$/.test(branch)) throw new Error('integration branch is invalid');
  if (!inside(worktreeRoot,worktreePath)) throw new Error('integration worktree path is outside root');
  if (fs.existsSync(worktreePath)) throw new Error('integration worktree path already exists');
  if (runGit(repo,['show-ref','--verify','--quiet',`refs/heads/${branch}`],{allowFailure:true}).ok) throw new Error('integration branch already exists');

  const decisions=validateDecisions(repo,batch,assignments,worker_results,review_decisions);
  fs.mkdirSync(worktreeRoot,{recursive:true});
  runGit(repo,['worktree','add','-b',branch,worktreePath,batch.base_sha]);

  const commitOrder=[];
  for (const decision of decisions) {
    const cherryPick=runGit(worktreePath,['cherry-pick',decision.commit_sha],{allowFailure:true});
    if (!cherryPick.ok) {
      return {
        status:'CONFLICT',
        batch_id:batch.batch_id,
        branch,
        worktree_path:resolved(worktreePath),
        base_sha:batch.base_sha,
        commit_order:commitOrder,
        conflict_commit:decision.commit_sha,
        prepared_at,
        git_error:cherryPick.stderr.trim()
      };
    }
    commitOrder.push(decision.commit_sha);
  }

  const head=runGit(worktreePath,['rev-parse','--verify','HEAD^{commit}']).stdout.trim();
  return {
    status:'INTEGRATION_PREPARED',
    batch_id:batch.batch_id,
    branch,
    worktree_path:resolved(worktreePath),
    base_sha:batch.base_sha,
    head,
    commit_order:commitOrder,
    prepared_at
  };
};
