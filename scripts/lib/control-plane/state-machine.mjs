import { validateAssignment, validateBatchState } from './schema.mjs';

const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const BATCH_TRANSITIONS={
  DRAFT:new Set(['ALLOCATED']),
  ALLOCATED:new Set(['ACTIVE']),
  ACTIVE:new Set(['REVIEW','INTERRUPTED']),
  REVIEW:new Set(['INTEGRATION_PREPARED','INTERRUPTED']),
  INTEGRATION_PREPARED:new Set(['APPROVAL_PENDING','INTERRUPTED']),
  APPROVAL_PENDING:new Set(['APPROVED']),
  APPROVED:new Set(['COMPLETE']),
  COMPLETE:new Set(),
  INTERRUPTED:new Set()
};

const ASSIGNMENT_TRANSITIONS={
  ALLOCATED:new Set(['DISPATCHED','BLOCKED']),
  DISPATCHED:new Set(['RUNNING','INTERRUPTED','FAILED']),
  RUNNING:new Set(['RESULT_READY','INTERRUPTED','FAILED']),
  RESULT_READY:new Set(['REVIEW_PASSED','REVIEW_REJECTED']),
  REVIEW_PASSED:new Set(['INTEGRATED']),
  INTEGRATED:new Set(),
  REVIEW_REJECTED:new Set(),
  INTERRUPTED:new Set(),
  BLOCKED:new Set(),
  FAILED:new Set()
};

const contextFields=context=>{
  if (!context || typeof context!=='object') throw new Error('context is required');
  if (typeof context.at!=='string' || !ISO.test(context.at)) throw new Error('at is invalid');
  if (typeof context.reason!=='string' || context.reason==='') throw new Error('reason is required');
  return context;
};

const appendTransition=(value,to,context)=>({
  ...value,
  state:to,
  updated_at:context.at,
  history:[...value.history.map(entry=>({...entry})),{from:value.state,to,at:context.at,reason:context.reason}]
});

const transition=(value,to,context,transitions,validate)=>{
  validate(value);
  contextFields(context);
  if (!transitions[value.state]?.has(to)) throw new Error(`invalid transition ${value.state} -> ${to}`);
  return appendTransition(value,to,context);
};

export const transitionBatch=(batch,to,context)=>{
  if (batch?.state==='APPROVAL_PENDING' && to==='APPROVED') {
    if (context?.user_decision!=='APPROVED' || typeof context.actor!=='string' || context.actor==='') throw new Error('user_decision APPROVED with actor is required');
  }
  return transition(batch,to,context,BATCH_TRANSITIONS,validateBatchState);
};

export const transitionAssignment=(assignment,to,context)=>transition(assignment,to,context,ASSIGNMENT_TRANSITIONS,validateAssignment);
