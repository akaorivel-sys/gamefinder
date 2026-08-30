import { allocateWave } from './wave.mjs';
import { evaluateDependencies } from './dependencies.mjs';
import { acquireLocks } from './ownership.mjs';
import { planResources, selectExecutionRoute } from './resource-routing.mjs';
import { validateApproval, validateAssignment, validateBatchState } from './schema.mjs';
import { transitionBatch } from './state-machine.mjs';

const clone=value=>structuredClone(value);
const order=(left,right)=>(right.priority??0)-(left.priority??0) || String(left.task_id).localeCompare(String(right.task_id));
const pad=value=>String(value).padStart(3,'0');
const ACTIVE_ASSIGNMENT_STATES=new Set(['ALLOCATED','DISPATCHED','RUNNING','RESULT_READY','REVIEW_PASSED']);

const withPlan=(state,plan,at)=>({
  ...state,
  batch:{...state.batch,...plan,updated_at:at}
});

const completeTask=(state,task,plan,at)=>{
  const completed=new Set(state.completed_task_ids??[]);
  completed.add(task.task_id);
  return withPlan({
    ...state,
    tasks:state.tasks.map(item=>item.task_id===task.task_id ? {...item,status:'completed'} : item),
    completed_task_ids:[...completed]
  },plan,at);
};

export const createWorkerWave=context=>{
  const allocation=allocateWave({
    tasks:context.tasks,
    batch:{...context.batch,assignments:context.assignments,completed_task_ids:context.completed_task_ids},
    workers:context.workers,
    locks:context.locks,
    maxWorkers:context.maxWorkers
  });
  if (allocation.errors.length) throw new Error(allocation.errors.join('; '));
  const selectedWorkerCount=new Set(allocation.assignments.map(group=>group.worker_id)).size;
  const wave=Math.max(0,...context.assignments.map(assignment=>assignment.wave??0))+1;
  const batchNumber=context.batch.batch_id.slice('batch-'.length);
  let locks=clone(context.locks);
  const assignments=allocation.assignments.map(group=>{
    const assignmentId=`assignment-${batchNumber}-${group.worker_id}-${pad(wave)}-${pad(group.attempt)}`;
    const assignment={
      schema_version:2,
      assignment_id:assignmentId,
      batch_id:context.batch.batch_id,
      wave,
      worker_id:group.worker_id,
      attempt:group.attempt,
      state:'ALLOCATED',
      task_ids:[...group.task_ids],
      expected_paths:[...group.expected_paths],
      base_sha:context.batch.base_sha,
      branch:`workers/${context.batch.batch_id}/${group.worker_id}-wave-${pad(wave)}`,
      worktree_path:`worktrees/${context.batch.batch_id}/${group.worker_id}-wave-${pad(wave)}`,
      result_path:`editorial/results/v2/result-${batchNumber}-${group.worker_id}-${pad(wave)}-${pad(group.attempt)}.json`,
      classification:'parallel_code_change',
      execution_route:'codex-worker-wave',
      worker_count:selectedWorkerCount,
      dispatch_reason:`${selectedWorkerCount} optional Codex Worker${selectedWorkerCount===1 ? '' : 's'} were selected for independent code tasks`,
      created_at:context.at,
      updated_at:context.at,
      history:[]
    };
    validateAssignment(assignment);
    locks=acquireLocks(locks,assignment,context.at);
    return assignment;
  });
  return {assignments,locks,blocked_task_ids:allocation.blocked_task_ids};
};

export const runRound=({state:inputState,at,services={}})=>{
  const state=clone(inputState);
  validateBatchState(state.batch);
  if (state.batch.batch_id==='batch-0001') throw new Error('Batch 0001 is read-only');
  if (state.repository_safe!==true) throw new Error('repository is not verified safe');
  if (state.approval) {
    validateApproval(state.approval);
    if (state.approval.status==='PENDING') return {action:'APPROVAL_PENDING',stop:true,state,execution_route:state.batch.execution_route,worker_count:state.batch.worker_count,dispatch_reason:'explicit user approval is required'};
  }

  const dependency=evaluateDependencies(state.tasks??[],state.completed_task_ids??[]);
  if (dependency.errors.length>0) {
    return {
      action:'DEPENDENCY_ERROR',
      stop:true,
      state,
      execution_route:state.batch.execution_route,
      worker_count:0,
      dispatch_reason:'the task dependency graph must be repaired before execution',
      dependency_errors:dependency.errors
    };
  }

  const existingAssignments=state.assignments??[];
  const activeAssignments=existingAssignments.filter(assignment=>ACTIVE_ASSIGNMENT_STATES.has(assignment.state));
  const activeTaskIds=new Set(activeAssignments.flatMap(assignment=>assignment.task_ids??[]));
  const historicalTaskIds=new Set(existingAssignments.flatMap(assignment=>assignment.task_ids??[]));
  const allowedReassignments=new Set(state.batch.allow_reassignment_task_ids??[]);
  const dependencyReadyIds=new Set(dependency.ready_task_ids);
  const ready=[...(state.tasks??[])].filter(task=>task.status==='queued'
    && dependencyReadyIds.has(task.task_id)
    && !activeTaskIds.has(task.task_id)
    && (!historicalTaskIds.has(task.task_id) || allowedReassignments.has(task.task_id))
  ).sort(order);
  if (ready.length===0) {
    if (activeAssignments.length>0) {
      const workerCount=Math.min(3,new Set(activeAssignments.map(assignment=>assignment.worker_id)).size);
      return {action:'WORKERS_REQUIRED',stop:true,state,execution_route:'codex-worker-wave',worker_count:workerCount,dispatch_reason:'outstanding Worker assignments require Results'};
    }
    return {action:'NO_READY_WORK',stop:true,state,execution_route:state.batch.execution_route,worker_count:0,dispatch_reason:'no dependency-ready tasks remain'};
  }

  const task=ready[0];
  const plan=selectExecutionRoute(task);
  if (plan.execution_route==='external-content-input') {
    return {action:'EXTERNAL_CONTENT_REQUIRED',stop:true,state:withPlan(state,plan,at),...plan};
  }
  if (plan.execution_route==='local-script') {
    const evidence=services.executeLocal?.({task:clone(task),plan:clone(plan),state:clone(state)});
    if (evidence?.completed!==true) return {action:'LOCAL_SCRIPT_REQUIRED',stop:true,state:withPlan(state,plan,at),...plan};
    return {action:'LOCAL_SCRIPT_COMPLETED',stop:false,state:completeTask(state,task,plan,at),...plan};
  }
  if (plan.execution_route==='codex-master') {
    const evidence=services.executeMaster?.({task:clone(task),plan:clone(plan),state:clone(state)});
    if (evidence?.completed!==true) return {action:'CODEX_MASTER_REQUIRED',stop:true,state:withPlan(state,plan,at),...plan};
    return {action:'CODEX_MASTER_COMPLETED',stop:false,state:completeTask(state,task,plan,at),...plan};
  }

  const workerTasks=ready.filter(candidate=>selectExecutionRoute(candidate).execution_route==='codex-worker-wave');
  const resources=planResources(workerTasks);
  const selectedTaskIds=new Set(resources.task_plans.map(taskPlan=>taskPlan.task_id));
  const allocationTasks=(state.tasks??[]).map(candidate=>candidate.status==='queued' && !selectedTaskIds.has(candidate.task_id)
    ? {...candidate,status:'blocked'}
    : candidate
  );
  const createWave=services.createWorkerWave??createWorkerWave;
  const created=createWave({
    tasks:allocationTasks,
    batch:state.batch,
    assignments:existingAssignments,
    completed_task_ids:state.completed_task_ids??[],
    workers:state.workers??[],
    locks:state.locks,
    maxWorkers:resources.worker_count,
    at
  });
  const assignments=created?.assignments??[];
  if (assignments.length===0) return {action:'NO_READY_WORK',stop:true,state,execution_route:'codex-worker-wave',worker_count:0,dispatch_reason:'no safe Worker assignment could be allocated'};
  const actualWorkerCount=Math.min(3,new Set(assignments.map((assignment,index)=>assignment.worker_id??`worker-${index}`)).size);
  const dispatchPlan={...plan,worker_count:actualWorkerCount,dispatch_reason:`${actualWorkerCount} optional Codex Workers are required for this Wave`};
  let next=withPlan({...state,assignments:[...(state.assignments??[]),...assignments],locks:created.locks??state.locks},dispatchPlan,at);
  if (next.batch.state==='DRAFT') {
    next={...next,batch:transitionBatch(next.batch,'ALLOCATED',{at,reason:'optional Codex Worker assignments were allocated'})};
  }
  return {action:'WORKERS_REQUIRED',stop:true,state:next,...dispatchPlan};
};

export const runContinuous=({state,at,services={},maxRounds=100})=>{
  let current=state;
  const rounds=[];
  for (let index=0;index<maxRounds;index+=1) {
    const round=runRound({state:current,at,services});
    rounds.push(round);
    current=round.state;
    if (round.stop) return {...round,state:current,rounds};
  }
  throw new Error('continuous round limit exceeded');
};
