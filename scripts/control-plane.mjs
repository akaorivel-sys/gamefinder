#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './lib/control-plane/io.mjs';
import { advanceControlPlaneRound, runControlPlaneContinuous } from './lib/control-plane/controller.mjs';
import { validateSessionState } from './lib/control-plane/schema.mjs';

const argument=(args,name)=>{
  const index=args.indexOf(name);
  if (index===-1 || !args[index+1]) throw new Error(`${name} is required`);
  return args[index+1];
};

const main=()=>{
  const [mode,...args]=process.argv.slice(2);
  if (!['t','a'].includes(mode)) throw new Error('usage: control-plane.mjs t|a --state <json> [--apply]');
  const statePath=path.resolve(argument(args,'--state'));
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
  const at=new Date().toISOString();
  const apply=args.includes('--apply');
  const result=mode==='t'
    ? advanceControlPlaneRound({state,at,apply})
    : runControlPlaneContinuous({state,at,apply});

  if (apply) {
    if (!/^batch-(?!0001$)[0-9]{4,}$/.test(result.state.batch.batch_id)) throw new Error('an explicit batch ID of 0002 or later is required');
    const session={
      schema_version:2,
      session_id:state.session?.session_id??`session-${result.state.batch.batch_id.slice('batch-'.length)}-${mode}`,
      batch_id:result.state.batch.batch_id,
      mode,
      last_completed_phase:result.action,
      outstanding_assignment_ids:(result.state.assignments??[]).filter(assignment=>!['INTEGRATED','REVIEW_REJECTED','BLOCKED','FAILED'].includes(assignment.state)).map(assignment=>assignment.assignment_id),
      next_action:result.action,
      classification:result.state.batch.classification,
      execution_route:result.execution_route,
      worker_count:result.worker_count,
      dispatch_reason:result.dispatch_reason,
      created_at:state.session?.created_at??at,
      updated_at:at
    };
    validateSessionState(session);
    writeJsonAtomic(statePath,{...result.state,session});
  }
  process.stdout.write(`${JSON.stringify({mode,preview:!apply,...result})}\n`);
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode=1;
}
