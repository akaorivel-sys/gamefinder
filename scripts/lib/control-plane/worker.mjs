import fs from 'node:fs';
import path from 'node:path';
import { assertOwnedChanges } from './ownership.mjs';
import { validateAssignment, validateLockManifest, validateWorkerResult } from './schema.mjs';

const WORKER_ID=/^[a-e]$/;

const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const fail=field=>{ throw new Error(`${field} does not match the Worker assignment`); };

const tomlString=(text,key)=>{
  const multiline=text.match(new RegExp(`^${key}\\s*=\\s*"""([\\s\\S]*?)"""`,`m`));
  if (multiline) return multiline[1].trim();
  const scalar=text.match(new RegExp(`^${key}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"\\s*$`,`m`));
  if (!scalar) throw new Error(`agent ${key} is required`);
  return scalar[1].replace(/\\"/g,'"').replace(/\\n/g,'\n').replace(/\\\\/g,'\\');
};

const parseAgentToml=text=>({
  name:tomlString(text,'name'),
  description:tomlString(text,'description'),
  developer_instructions:tomlString(text,'developer_instructions')
});

const parseThreadLimit=text=>{
  if (!/^\[agents\]\s*$/m.test(text)) throw new Error('[agents] config is required');
  const match=text.match(/^max_concurrent_threads_per_session\s*=\s*(\d+)\s*$/m);
  if (!match) throw new Error('max_concurrent_threads_per_session is required');
  return Number(match[1]);
};

export const loadWorkerPoolConfig=root=>{
  const registry=readJson(path.join(root,'editorial/control/workers.json'));
  if (registry.schema_version!==2) throw new Error('worker registry schema_version is invalid');
  if (registry.default_enabled!==false || registry.default_worker_count!==0) throw new Error('optional Worker pool must default off');
  if (registry.max_wave_workers!==3) throw new Error('max_wave_workers must be 3');
  if (!Array.isArray(registry.workers) || registry.workers.length!==5) throw new Error('worker registry must define A-E');
  const ids=registry.workers.map(worker=>worker.worker_id);
  if (new Set(ids).size!==5 || ids.join(',')!=='a,b,c,d,e') throw new Error('worker IDs must be unique A-E');
  const config=fs.readFileSync(path.join(root,'.codex/config.toml'),'utf8');
  const maxConcurrent=parseThreadLimit(config);
  if (maxConcurrent!==3) throw new Error('max_concurrent_threads_per_session must be 3');
  return {...registry,max_concurrent_threads_per_session:maxConcurrent};
};

export const loadWorkerDefinition=(root,workerId)=>{
  if (!WORKER_ID.test(workerId??'')) throw new Error('worker_id is invalid');
  const pool=loadWorkerPoolConfig(root);
  const definition=pool.workers.find(worker=>worker.worker_id===workerId);
  const agentPath=path.join(root,'.codex/agents',`worker-${workerId}.toml`);
  const agent=parseAgentToml(fs.readFileSync(agentPath,'utf8'));
  return {...definition,agent_path:path.relative(root,agentPath).replaceAll('\\','/'),agent};
};

const verifyAssignmentRoute=assignment=>{
  if (assignment.classification==='content_generation' || assignment.classification==='article_writing') {
    throw new Error('content and article prose assignments are forbidden for Codex Workers');
  }
  if (assignment.execution_route!=='codex-worker-wave') fail('execution_route');
};

const verifyIdentity=(context,{resultCommit=false}={})=>{
  const { assignment, worktree }=context;
  validateAssignment(assignment);
  verifyAssignmentRoute(assignment);
  if (context.worker_id!==assignment.worker_id) fail('worker_id');
  if (context.base_sha!==assignment.base_sha) fail('base_sha');
  if (context.branch!==assignment.branch) fail('branch');
  if (!worktree || worktree.status!=='READY' || worktree.clean!==true || (worktree.changes??[]).length!==0) {
    throw new Error('worktree must be READY and clean');
  }
  if (worktree.branch!==assignment.branch) fail('worktree branch');
  if (worktree.baseSha!==assignment.base_sha || worktree.baseExists!==true || worktree.baseIsAncestor!==true) fail('worktree base_sha');
  if (resultCommit) {
    if (worktree.head!==context.commit_sha) fail('commit_sha');
  } else if (worktree.head!==assignment.base_sha) {
    fail('worktree head');
  }

  validateLockManifest(context.locks);
  for (const expectedPath of assignment.expected_paths) {
    const held=context.locks.locks.find(lock=>lock.path===expectedPath && lock.state==='HELD');
    if (!held || held.assignment_id!==assignment.assignment_id || held.worker_id!==assignment.worker_id || held.wave!==assignment.wave) fail(`lock ${expectedPath}`);
  }
};

export const verifyWorkerStart=context=>{
  verifyIdentity(context);
  return {
    ok:true,
    assignment_id:context.assignment.assignment_id,
    worker_id:context.assignment.worker_id,
    execution_route:context.assignment.execution_route
  };
};

export const buildWorkerResult=context=>{
  verifyIdentity(context,{resultCommit:true});
  const assignment=context.assignment;
  const changedPaths=assertOwnedChanges(assignment,context.changed_paths);
  if (!Array.isArray(context.task_outcomes) || context.task_outcomes.length!==assignment.task_ids.length) fail('task_outcomes');
  const outcomeIds=context.task_outcomes.map(outcome=>outcome.task_id);
  if (new Set(outcomeIds).size!==outcomeIds.length || assignment.task_ids.some(taskId=>!outcomeIds.includes(taskId))) fail('task_outcomes');
  if (!Array.isArray(context.validation) || context.validation.length===0 || context.validation.some(check=>check.exit_code!==0)) {
    throw new Error('validation must contain only passing commands');
  }
  const resultId=path.basename(assignment.result_path,'.json');
  const result={
    schema_version:2,
    result_id:resultId,
    batch_id:assignment.batch_id,
    wave:assignment.wave,
    assignment_id:assignment.assignment_id,
    worker_id:assignment.worker_id,
    base_sha:assignment.base_sha,
    commit_sha:context.commit_sha,
    task_outcomes:context.task_outcomes.map(outcome=>({...outcome})),
    changed_paths:changedPaths,
    validation:context.validation.map(check=>({...check})),
    classification:assignment.classification,
    execution_route:assignment.execution_route,
    worker_count:assignment.worker_count,
    dispatch_reason:assignment.dispatch_reason,
    created_at:context.created_at,
    completed_at:context.completed_at,
    notes:context.notes??''
  };
  validateWorkerResult(result);
  return result;
};
