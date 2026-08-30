import { CLASSIFICATIONS, classifyTask, validateDispatchMetadata } from './resource-routing.mjs';

const TASK_TYPES=new Set(['source_refresh','internal_link_pass','editorial_rewrite','article_upgrade','article_create','dossier_upgrade','game_enrichment','validation_run','registry_build','progress_build','control_plane_validation','repository_change','parallel_code_change','content_generation','article_writing','content_batch_apply']);
const CLASSIFICATION_SET=new Set(CLASSIFICATIONS);
const QUEUE_STATUSES=new Set(['queued','blocked','completed']);
const BATCH_STATES=new Set(['DRAFT','ALLOCATED','ACTIVE','REVIEW','INTEGRATION_PREPARED','APPROVAL_PENDING','APPROVED','COMPLETE','INTERRUPTED']);
const ASSIGNMENT_STATES=new Set(['ALLOCATED','DISPATCHED','RUNNING','RESULT_READY','REVIEW_PASSED','INTEGRATED','REVIEW_REJECTED','INTERRUPTED','BLOCKED','FAILED']);
const APPROVAL_STATES=new Set(['PENDING','APPROVED','REJECTED']);
const WORKERS=new Set(['a','b','c','d','e']);
const SHA=/^[0-9a-f]{40}$/;
const ID=/^[a-z0-9][a-z0-9-]*$/;
const QUEUE_ID=/^[a-z][a-z0-9-]*$/;
const BATCH_ID=/^batch-[0-9]{4,}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const fail=(field,message='is invalid')=>{ throw new Error(`${field} ${message}`); };
const object=(value,field='value')=>{ if (!value || typeof value!=='object' || Array.isArray(value)) fail(field,'must be an object'); };
const required=(value,fields)=>{ for (const field of fields) if (value[field]===undefined) fail(field,'is required'); };
const string=(value,field,pattern=undefined)=>{ if (typeof value!=='string' || (pattern && !pattern.test(value))) fail(field); };
const integer=(value,field,min=undefined)=>{ if (!Number.isInteger(value) || (min!==undefined && value<min)) fail(field); };
const array=(value,field,min=0)=>{ if (!Array.isArray(value) || value.length<min) fail(field); };
const member=(value,field,allowed)=>{ if (!allowed.has(value)) fail(field); };
const timestamp=(value,field)=>string(value,field,ISO);
const sha=(value,field)=>string(value,field,SHA);
const id=(value,field)=>string(value,field,ID);
const queueId=(value,field='queue_id')=>string(value,field,QUEUE_ID);
const batchId=(value,field='batch_id')=>string(value,field,BATCH_ID);
const worker=(value,field='worker_id')=>member(value,field,WORKERS);

const ownedPath=(value,field)=>{
  string(value,field);
  if (value.startsWith('/') || value.includes('\\') || value.split('/').some(part=>part==='' || part==='.' || part==='..')) fail(field);
};

const history=(value,field='history',states=undefined)=>{
  array(value,field);
  value.forEach((entry,index)=>{
    object(entry,`${field}.${index}`);
    required(entry,['from','to','at','reason']);
    if (states) {
      member(entry.from,`${field}.${index}.from`,states);
      member(entry.to,`${field}.${index}.to`,states);
    } else {
      string(entry.from,`${field}.${index}.from`);
      string(entry.to,`${field}.${index}.to`);
    }
    timestamp(entry.at,`${field}.${index}.at`);
    string(entry.reason,`${field}.${index}.reason`);
  });
};

const queueTask=(task,index,version)=>{
  const field=`tasks.${index}`;
  object(task,field);
  required(task,['task_id','task_type','priority','status','depends_on']);
  id(task.task_id,`${field}.task_id`);
  if (version===2) member(task.task_type,`${field}.task_type`,TASK_TYPES);
  else string(task.task_type,`${field}.task_type`);
  if (typeof task.priority!=='number' || !Number.isFinite(task.priority)) fail(`${field}.priority`);
  member(task.status,`${field}.status`,QUEUE_STATUSES);
  array(task.depends_on,`${field}.depends_on`);
  task.depends_on.forEach((dependency,dependencyIndex)=>id(dependency,`${field}.depends_on.${dependencyIndex}`));
  if (version===2) {
    if (task.expected_paths===undefined) fail(`${field}.expected_paths`,'is required');
    array(task.expected_paths,`${field}.expected_paths`);
    task.expected_paths.forEach((expectedPath,pathIndex)=>ownedPath(expectedPath,`${field}.expected_paths.${pathIndex}`));
    if (task.classification!==undefined) member(task.classification,`${field}.classification`,CLASSIFICATION_SET);
  }
};

const normalizedV1Task=(task,index)=>{
  queueTask(task,index,1);
  const base={task_id:task.task_id,task_type:task.task_type,priority:task.priority,status:task.status,depends_on:[...task.depends_on],expected_paths:[],classification:classifyTask(task),source_schema_version:1,eligible:false};
  if ((task.task_type==='article_upgrade' || task.task_type==='article_create') && typeof task.article_slug==='string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task.article_slug)) {
    return {...base,expected_paths:[`public/articles/${task.article_slug}.html`],eligible:true};
  }
  return {...base,ineligible_reason:task.task_type==='article_upgrade' || task.task_type==='article_create' ? 'article_slug' : 'task_type'};
};

export const normalizeQueue=input=>{
  if (Array.isArray(input)) return {schema_version:1,queue_id:null,tasks:input.map(normalizedV1Task)};
  object(input);
  required(input,['schema_version','queue_id','tasks']);
  if (input.schema_version!==2) fail('schema_version');
  queueId(input.queue_id);
  array(input.tasks,'tasks');
  input.tasks.forEach((task,index)=>queueTask(task,index,2));
  return {schema_version:2,queue_id:input.queue_id,tasks:input.tasks.map(task=>({...task,depends_on:[...task.depends_on],expected_paths:[...task.expected_paths],classification:classifyTask(task),source_schema_version:2,eligible:true}))};
};

export const validateBatchState=value=>{
  object(value); required(value,['schema_version','batch_id','state','base_sha','classification','execution_route','worker_count','dispatch_reason','created_at','updated_at','history']);
  if (value.schema_version!==2) fail('schema_version'); batchId(value.batch_id); member(value.state,'state',BATCH_STATES); sha(value.base_sha,'base_sha'); validateDispatchMetadata(value); timestamp(value.created_at,'created_at'); timestamp(value.updated_at,'updated_at'); history(value.history,'history',BATCH_STATES); return value;
};

export const validateAssignment=value=>{
  object(value); required(value,['schema_version','assignment_id','batch_id','wave','worker_id','attempt','state','task_ids','expected_paths','base_sha','branch','worktree_path','result_path','classification','execution_route','worker_count','dispatch_reason','created_at','updated_at','history']);
  if (value.schema_version!==2) fail('schema_version'); id(value.assignment_id,'assignment_id'); batchId(value.batch_id); integer(value.wave,'wave',1); worker(value.worker_id); integer(value.attempt,'attempt',1); member(value.state,'state',ASSIGNMENT_STATES);
  array(value.task_ids,'task_ids',1); value.task_ids.forEach((taskId,index)=>id(taskId,`task_ids.${index}`));
  array(value.expected_paths,'expected_paths',1); value.expected_paths.forEach((expectedPath,index)=>ownedPath(expectedPath,`expected_paths.${index}`));
  sha(value.base_sha,'base_sha'); string(value.branch,'branch',/^workers\/batch-[0-9]{4,}\/[a-e]-wave-[0-9]{3,}$/); ownedPath(value.worktree_path,'worktree_path'); string(value.result_path,'result_path',/^editorial\/results\/v2\/[a-z0-9-]+\.json$/); validateDispatchMetadata(value); timestamp(value.created_at,'created_at'); timestamp(value.updated_at,'updated_at'); history(value.history,'history',ASSIGNMENT_STATES); return value;
};

export const validateWorkerResult=value=>{
  object(value); required(value,['schema_version','result_id','batch_id','wave','assignment_id','worker_id','base_sha','commit_sha','task_outcomes','changed_paths','validation','classification','execution_route','worker_count','dispatch_reason','created_at','completed_at','notes']);
  if (value.schema_version!==2) fail('schema_version'); id(value.result_id,'result_id'); batchId(value.batch_id); integer(value.wave,'wave',1); id(value.assignment_id,'assignment_id'); worker(value.worker_id); sha(value.base_sha,'base_sha'); sha(value.commit_sha,'commit_sha');
  array(value.task_outcomes,'task_outcomes',1); value.task_outcomes.forEach((outcome,index)=>{ const field=`task_outcomes.${index}`; object(outcome,field); if (outcome.task_id===undefined) fail(`${field}.task_id`,'is required'); if (outcome.status===undefined) fail(`${field}.status`,'is required'); id(outcome.task_id,`${field}.task_id`); member(outcome.status,`${field}.status`,new Set(['COMPLETED','BLOCKED','FAILED'])); });
  array(value.changed_paths,'changed_paths'); value.changed_paths.forEach((changedPath,index)=>ownedPath(changedPath,`changed_paths.${index}`));
  array(value.validation,'validation',1); value.validation.forEach((check,index)=>{ object(check,`validation.${index}`); required(check,['command','exit_code']); string(check.command,`validation.${index}.command`); integer(check.exit_code,`validation.${index}.exit_code`); });
  validateDispatchMetadata(value); timestamp(value.created_at,'created_at'); timestamp(value.completed_at,'completed_at'); string(value.notes,'notes'); return value;
};

export const validateLockManifest=value=>{
  object(value); required(value,['schema_version','batch_id','locks','updated_at']); if (value.schema_version!==2) fail('schema_version'); batchId(value.batch_id); array(value.locks,'locks');
  value.locks.forEach((lock,index)=>{ const field=`locks.${index}`; object(lock,field); required(lock,['assignment_id','worker_id','wave','path','state','acquired_at','updated_at']); id(lock.assignment_id,`${field}.assignment_id`); worker(lock.worker_id,`${field}.worker_id`); integer(lock.wave,`${field}.wave`,1); ownedPath(lock.path,`${field}.path`); member(lock.state,`${field}.state`,new Set(['HELD','RELEASED'])); timestamp(lock.acquired_at,`${field}.acquired_at`); timestamp(lock.updated_at,`${field}.updated_at`); }); timestamp(value.updated_at,'updated_at'); return value;
};

export const validateSessionState=value=>{
  object(value); required(value,['schema_version','session_id','batch_id','mode','last_completed_phase','outstanding_assignment_ids','next_action','classification','execution_route','worker_count','dispatch_reason','created_at','updated_at']); if (value.schema_version!==2) fail('schema_version'); id(value.session_id,'session_id'); batchId(value.batch_id); member(value.mode,'mode',new Set(['t','a'])); string(value.last_completed_phase,'last_completed_phase'); array(value.outstanding_assignment_ids,'outstanding_assignment_ids'); value.outstanding_assignment_ids.forEach((assignmentId,index)=>id(assignmentId,`outstanding_assignment_ids.${index}`)); string(value.next_action,'next_action'); validateDispatchMetadata(value); timestamp(value.created_at,'created_at'); timestamp(value.updated_at,'updated_at'); return value;
};

export const validateApproval=value=>{
  object(value); required(value,['schema_version','batch_id','status','integration_branch','integration_head','created_at','updated_at']); if (value.schema_version!==2) fail('schema_version'); batchId(value.batch_id); member(value.status,'status',APPROVAL_STATES); string(value.integration_branch,'integration_branch',/^integration\/batch-[0-9]{4,}$/); sha(value.integration_head,'integration_head');
  if (value.status!=='PENDING') { required(value,['actor','reason','decided_at']); string(value.actor,'actor'); string(value.reason,'reason'); timestamp(value.decided_at,'decided_at'); }
  timestamp(value.created_at,'created_at'); timestamp(value.updated_at,'updated_at'); return value;
};
