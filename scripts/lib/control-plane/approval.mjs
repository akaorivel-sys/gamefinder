import { validateApproval } from './schema.mjs';

const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const nonempty=(value,field)=>{ if (typeof value!=='string' || value.trim()==='') throw new Error(`${field} is required`); };

export const buildPendingApproval=({batch_id,integration_branch,integration_head,at})=>{
  const approval={
    schema_version:2,
    batch_id,
    status:'PENDING',
    integration_branch,
    integration_head,
    created_at:at,
    updated_at:at
  };
  validateApproval(approval);
  return approval;
};

export const applyUserApproval=(approval,decision,context={})=>{
  validateApproval(approval);
  if (approval.status!=='PENDING') throw new Error('approval status must be PENDING');
  if (!['APPROVED','REJECTED'].includes(decision)) throw new Error('decision must be APPROVED or REJECTED');
  if (typeof context.at!=='string' || !ISO.test(context.at)) throw new Error('at is invalid');
  nonempty(context.actor,'actor');
  nonempty(context.reason,'reason');
  const decided={
    ...approval,
    status:decision,
    actor:context.actor,
    reason:context.reason,
    decided_at:context.at,
    updated_at:context.at
  };
  validateApproval(decided);
  return decided;
};
