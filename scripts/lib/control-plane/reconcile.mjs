import { validateAssignment, validateBatchState, validateLockManifest, validateWorkerResult } from './schema.mjs';

const copy=value=>structuredClone(value);
const unsafe=new Set(['DIRTY','STALE','CORRUPTED']);
const reviewable=new Set(['RESULT_READY','REVIEW_PASSED','INTEGRATED']);

const recordState=(value,state,at,reason)=>value.state===state ? value : {
  ...value,
  state,
  updated_at:at,
  history:[...value.history.map(entry=>({...entry})),{from:value.state,to:state,at,reason}]
};

const resultMatches=(assignment,result,evidence)=>assignment.assignment_id===result.assignment_id
  && assignment.batch_id===result.batch_id
  && assignment.wave===result.wave
  && assignment.worker_id===result.worker_id
  && assignment.base_sha===result.base_sha
  && assignment.execution_route===result.execution_route
  && assignment.classification===result.classification
  && assignment.worker_count===result.worker_count
  && evidence.status==='READY'
  && evidence.clean===true
  && evidence.baseIsAncestor===true
  && evidence.head===result.commit_sha;

export const reconcileBatch=context=>{
  validateBatchState(context.batch);
  context.assignments.forEach(validateAssignment);
  validateLockManifest(context.locks);
  const batch=copy(context.batch);
  const locks=copy(context.locks);
  const resultsByAssignment=new Map();
  for (const result of context.results??[]) {
    const matches=resultsByAssignment.get(result?.assignment_id)??[];
    matches.push(result);
    resultsByAssignment.set(result?.assignment_id,matches);
  }
  const attention=[];
  const assignments=context.assignments.map(original=>{
    let assignment=copy(original);
    const matchingResults=resultsByAssignment.get(assignment.assignment_id)??[];
    if (matchingResults.length>1) {
      attention.push({assignment_id:assignment.assignment_id,status:'RESULT_DUPLICATE'});
      return assignment;
    }
    const evidence=context.worktree_evidence?.[assignment.assignment_id];
    if (evidence && unsafe.has(evidence.status)) {
      attention.push({assignment_id:assignment.assignment_id,status:evidence.status});
      if (['DISPATCHED','RUNNING','RESULT_READY'].includes(assignment.state)) assignment=recordState(assignment,'INTERRUPTED',context.at,`reconcile preserved ${evidence.status} worktree`);
      return assignment;
    }
    if (assignment.state==='REVIEW_REJECTED') {
      attention.push({assignment_id:assignment.assignment_id,status:'REVIEW_REJECTED'});
      return assignment;
    }
    const result=matchingResults[0];
    if (!result || !evidence) return assignment;
    try {
      validateWorkerResult(result);
    } catch {
      attention.push({assignment_id:assignment.assignment_id,status:'RESULT_INVALID'});
      return assignment;
    }
    if (resultMatches(assignment,result,evidence) && ['DISPATCHED','RUNNING','INTERRUPTED'].includes(assignment.state)) {
      assignment=recordState(assignment,'RESULT_READY',context.at,'reconcile proved clean Worker Result commit');
    }
    return assignment;
  });

  let nextBatch=batch;
  if (attention.length>0 && ['ACTIVE','REVIEW','INTEGRATION_PREPARED'].includes(batch.state)) {
    nextBatch=recordState(batch,'INTERRUPTED',context.at,'reconcile requires Master attention');
  } else if (assignments.length>0 && assignments.every(assignment=>reviewable.has(assignment.state)) && ['ACTIVE','INTERRUPTED'].includes(batch.state)) {
    nextBatch=recordState(batch,'REVIEW',context.at,'reconcile proved all assignments reviewable');
  }

  return {batch:nextBatch,assignments,locks,attention};
};
