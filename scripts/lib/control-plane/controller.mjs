import path from 'node:path';
import { buildPendingApproval } from './approval.mjs';
import { prepareIntegration } from './integration.mjs';
import { reconcileBatch } from './reconcile.mjs';
import { reviewWorkerResult } from './review.mjs';
import { runRound } from './orchestrator.mjs';
import { validateApproval, validateAssignment, validateBatchState, validateLockManifest, validateWorkerResult } from './schema.mjs';
import { transitionAssignment, transitionBatch } from './state-machine.mjs';
import { createWorkerWorktree } from './worktree.mjs';

const clone=value=>structuredClone(value);
const terminal=new Set(['INTEGRATED','REVIEW_REJECTED','BLOCKED','FAILED']);
const metadata=state=>({
  execution_route:state.batch.execution_route,
  worker_count:state.batch.worker_count,
  dispatch_reason:state.batch.dispatch_reason,
  classification:state.batch.classification
});

const validateState=state=>{
  if (!state || typeof state!=='object' || Array.isArray(state)) throw new Error('control state is required');
  validateBatchState(state.batch);
  if (state.batch.batch_id==='batch-0001') throw new Error('Batch 0001 is read-only');
  if (state.repository_safe!==true) throw new Error('repository is not verified safe');
  (state.assignments??[]).forEach(validateAssignment);
  (state.results??[]).forEach(validateWorkerResult);
  if (state.approval!==undefined) validateApproval(state.approval);
  validateLockManifest(state.locks);
};

const reconcileIfPossible=(state,at,services)=>{
  const reconcile=services.reconcile??reconcileBatch;
  if (!services.reconcile && state.worktree_evidence===undefined) return {state,attention:[]};
  const reconciled=reconcile({
    batch:state.batch,
    assignments:state.assignments??[],
    results:state.results??[],
    worktree_evidence:state.worktree_evidence??{},
    locks:state.locks,
    at
  });
  return {state:{...state,batch:reconciled.batch,assignments:reconciled.assignments,locks:reconciled.locks},attention:reconciled.attention??[]};
};

const integrationContext=(state,at)=>{
  if (typeof state.repo!=='string' || typeof state.worktree_root!=='string') throw new Error('repo and worktree_root are required for integration');
  return {
    repo:path.resolve(state.repo),
    worktreeRoot:path.resolve(state.worktree_root),
    worktreePath:path.join(path.resolve(state.worktree_root),`integration-${state.batch.batch_id}`),
    batch:state.batch,
    assignments:state.assignments??[],
    worker_results:state.results??[],
    review_decisions:state.review_decisions??[],
    prepared_at:at
  };
};

const prepareWorkersDefault=context=>{
  const { state, assignments, at }=context;
  if (typeof state.repo!=='string' || typeof state.worktree_root!=='string') throw new Error('repo and worktree_root are required for Worker worktrees');
  const prepared=[];
  const worktreeEvidence={...(state.worktree_evidence??{})};
  const attention=[];
  for (const assignment of assignments) {
    const worktreePath=state.worktree_paths?.[assignment.assignment_id]
      ? path.resolve(state.worktree_paths[assignment.assignment_id])
      : path.resolve(state.worktree_root,assignment.worktree_path);
    const evidence=createWorkerWorktree({repo:path.resolve(state.repo),worktreeRoot:path.resolve(state.worktree_root),worktreePath,baseSha:assignment.base_sha,branch:assignment.branch});
    worktreeEvidence[assignment.assignment_id]=evidence;
    if (evidence.status!=='READY') {
      attention.push({assignment_id:assignment.assignment_id,status:evidence.status});
      prepared.push(assignment);
      continue;
    }
    prepared.push(transitionAssignment(assignment,'DISPATCHED',{at,reason:'Master prepared and verified Worker worktree'}));
  }
  return {assignments:prepared,worktree_evidence:worktreeEvidence,attention};
};

export const advanceControlPlaneRound=({state:inputState,at,apply=false,services={}})=>{
  let state=clone(inputState);
  validateState(state);

  const reconciled=reconcileIfPossible(state,at,services);
  state=reconciled.state;
  if (reconciled.attention.length>0) return {action:'MASTER_ATTENTION_REQUIRED',stop:true,state,attention:reconciled.attention,...metadata(state)};

  if (state.approval?.status==='PENDING' || state.batch.state==='APPROVAL_PENDING') {
    return {action:'APPROVAL_PENDING',stop:true,state,...metadata(state)};
  }

  const allocated=(state.assignments??[]).filter(assignment=>assignment.state==='ALLOCATED');
  if (allocated.length>0) {
    if (!apply) return {action:'WORKTREE_PREPARATION_REQUIRED',stop:true,state,...metadata(state)};
    const prepareWorkers=services.prepareWorkers??prepareWorkersDefault;
    const prepared=prepareWorkers({state:clone(state),batch:clone(state.batch),assignments:clone(allocated),at});
    if (prepared.attention?.length) return {action:'MASTER_ATTENTION_REQUIRED',stop:true,state:{...state,worktree_evidence:prepared.worktree_evidence??state.worktree_evidence},attention:prepared.attention,...metadata(state)};
    const byId=new Map((prepared.assignments??[]).map(assignment=>[assignment.assignment_id,assignment]));
    const assignments=(state.assignments??[]).map(assignment=>byId.get(assignment.assignment_id)??assignment);
    assignments.forEach(validateAssignment);
    const nextBatch=state.batch.state==='ALLOCATED'
      ? transitionBatch(state.batch,'ACTIVE',{at,reason:'Master prepared optional Worker worktrees'})
      : state.batch;
    state={...state,batch:nextBatch,assignments,worktree_evidence:prepared.worktree_evidence??state.worktree_evidence};
    return {action:'WORKERS_REQUIRED',stop:true,state,...metadata(state)};
  }

  const decisions=[...(state.review_decisions??[])];
  const decided=new Set(decisions.map(decision=>decision.assignment_id));
  const reviewable=(state.assignments??[]).filter(assignment=>assignment.state==='RESULT_READY' && !decided.has(assignment.assignment_id));
  if (reviewable.length>0) {
    const review=services.review??reviewWorkerResult;
    const assignments=[...(state.assignments??[])];
    for (const assignment of reviewable) {
      const matches=(state.results??[]).filter(result=>result.assignment_id===assignment.assignment_id);
      if (matches.length!==1) return {action:'RESULT_ATTENTION_REQUIRED',stop:true,state,assignment_id:assignment.assignment_id,...metadata(state)};
      const decision=review({repo:state.repo,assignment:clone(assignment),result:clone(matches[0]),reviewed_at:at});
      decisions.push(decision);
      const index=assignments.findIndex(item=>item.assignment_id===assignment.assignment_id);
      assignments[index]=transitionAssignment(assignment,decision.status,{at,reason:`Master review ${decision.status}`});
      if (decision.status!=='REVIEW_PASSED') {
        state={...state,assignments,review_decisions:decisions};
        return {action:'MASTER_REVIEW_REJECTED',stop:true,state,decision,...metadata(state)};
      }
    }
    state={...state,assignments,review_decisions:decisions};
    return {action:'RESULTS_REVIEWED',stop:false,state,...metadata(state)};
  }

  const assignments=state.assignments??[];
  const allReviewed=assignments.length>0 && assignments.every(assignment=>['REVIEW_PASSED','INTEGRATED'].includes(assignment.state));
  if (state.batch.state==='REVIEW' && allReviewed) {
    if (!apply) return {action:'INTEGRATION_REQUIRED',stop:true,state,...metadata(state)};
    const integrate=services.integrate??prepareIntegration;
    const context=services.integrate ? {
      batch:state.batch,
      assignments,
      results:state.results??[],
      worker_results:state.results??[],
      review_decisions:state.review_decisions??[],
      prepared_at:at
    } : integrationContext(state,at);
    const integration=integrate(context);
    if (integration.status!=='INTEGRATION_PREPARED') return {action:'MASTER_ATTENTION_REQUIRED',stop:true,state:{...state,integration},integration,...metadata(state)};
    const nextBatch=transitionBatch(state.batch,'INTEGRATION_PREPARED',{at,reason:'Master prepared reviewed integration branch'});
    state={...state,batch:nextBatch,integration};
    return {action:'INTEGRATION_PREPARED',stop:false,state,...metadata(state)};
  }

  if (state.batch.state==='INTEGRATION_PREPARED' && state.integration?.status==='INTEGRATION_PREPARED') {
    const buildApproval=services.buildApproval??buildPendingApproval;
    const approval=buildApproval({batch_id:state.batch.batch_id,integration_branch:state.integration.branch,integration_head:state.integration.head,at});
    const nextBatch=transitionBatch(state.batch,'APPROVAL_PENDING',{at,reason:'explicit user approval is required'});
    state={...state,batch:nextBatch,approval};
    return {action:'APPROVAL_PENDING',stop:true,state,...metadata(state)};
  }

  const routed=runRound({state,at,services:services.routeServices??services});
  return routed;
};

export const runControlPlaneContinuous=({state,at,apply=false,services={},maxRounds=100})=>{
  let current=state;
  const rounds=[];
  for (let index=0;index<maxRounds;index+=1) {
    const round=advanceControlPlaneRound({state:current,at,apply,services});
    rounds.push(round);
    current=round.state;
    if (round.stop) return {...round,state:current,rounds};
  }
  throw new Error('continuous control plane round limit exceeded');
};
