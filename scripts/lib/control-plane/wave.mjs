import { TASK_WEIGHTS } from '../allocation.mjs';
import { evaluateDependencies } from './dependencies.mjs';
import { normalizeOwnedPath } from './ownership.mjs';

const ACTIVE_ASSIGNMENT_STATES=new Set(['ALLOCATED','DISPATCHED','RUNNING','RESULT_READY','REVIEW_PASSED']);
const workerId=worker=>typeof worker==='string' ? worker : worker.worker_id;
const workerActive=worker=>typeof worker==='object' && ACTIVE_ASSIGNMENT_STATES.has(worker.state);
const taskOrder=(a,b)=>(b.priority??0)-(a.priority??0) || String(a.task_id).localeCompare(String(b.task_id));

const historicalAttempts=(assignments,taskId)=>assignments
  .filter(assignment=>(assignment.task_ids??[]).includes(taskId))
  .reduce((highest,assignment)=>Math.max(highest,assignment.attempt??1),0);

export const allocateWave=({tasks,batch,workers,locks,maxWorkers})=>{
  const assignments=batch?.assignments??[];
  const dependency=evaluateDependencies(tasks,batch?.completed_task_ids??[]);
  if (dependency.errors.length) return {assignments:[],blocked_task_ids:[...dependency.blocked_task_ids],errors:[...dependency.errors]};
  const activeWorkers=new Set(assignments.filter(assignment=>ACTIVE_ASSIGNMENT_STATES.has(assignment.state)).map(assignment=>assignment.worker_id));
  const activeTaskIds=new Set(assignments.filter(assignment=>ACTIVE_ASSIGNMENT_STATES.has(assignment.state)).flatMap(assignment=>assignment.task_ids??[]));
  const availableWorkers=[...new Set([...workers]
    .filter(worker=>!workerActive(worker) && !activeWorkers.has(workerId(worker)))
    .map(workerId)
  )].sort()
    .slice(0,Math.min(maxWorkers??3,3));
  const bins=availableWorkers.map(worker_id=>({worker_id,entries:[],workload_units:0}));
  const heldPaths=new Set((locks?.locks??[]).filter(lock=>lock.state==='HELD').map(lock=>normalizeOwnedPath(lock.path)));
  const selectedPaths=new Set();
  const ready=new Set(dependency.ready_task_ids);
  const usedTaskIds=new Set(assignments.flatMap(assignment=>assignment.task_ids??[]));
  const allowedReassignments=new Set(batch?.allow_reassignment_task_ids??[]);
  const blocked=[...dependency.blocked_task_ids];
  for (const task of [...tasks].filter(task=>task.status==='queued').sort(taskOrder)) {
    if (!ready.has(task.task_id)) continue;
    if (activeTaskIds.has(task.task_id) || (usedTaskIds.has(task.task_id) && !allowedReassignments.has(task.task_id))) {
      blocked.push(task.task_id);
      continue;
    }
    let paths;
    try {
      paths=[...new Set((task.expected_paths??[]).map(normalizeOwnedPath))];
    } catch {
      blocked.push(task.task_id);
      continue;
    }
    if (!paths.length || paths.some(path=>heldPaths.has(path) || selectedPaths.has(path))) {
      blocked.push(task.task_id);
      continue;
    }
    const bin=[...bins].sort((a,b)=>a.workload_units-b.workload_units || a.worker_id.localeCompare(b.worker_id))[0];
    if (!bin) {
      blocked.push(task.task_id);
      continue;
    }
    const workload_units=TASK_WEIGHTS[task.task_type]??1;
    bin.entries.push({task_id:task.task_id,expected_paths:paths,workload_units,attempt:historicalAttempts(assignments,task.task_id)+1});
    bin.workload_units+=workload_units;
    paths.forEach(path=>selectedPaths.add(path));
  }
  return {
    assignments:bins.flatMap(bin=>{
      const byAttempt=new Map();
      for (const entry of bin.entries) {
        const group=byAttempt.get(entry.attempt)??{worker_id:bin.worker_id,task_ids:[],expected_paths:[],workload_units:0,attempt:entry.attempt};
        group.task_ids.push(entry.task_id);
        group.expected_paths.push(...entry.expected_paths);
        group.workload_units+=entry.workload_units;
        byAttempt.set(entry.attempt,group);
      }
      return [...byAttempt.values()].map(group=>({...group,task_ids:[...group.task_ids],expected_paths:[...group.expected_paths]}));
    }),
    blocked_task_ids:blocked,
    errors:[]
  };
};
