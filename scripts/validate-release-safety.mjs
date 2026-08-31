#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFirebaseRelease } from './lib/release-safety/firebase-config.mjs';
import { validateWorkflowPolicy } from './lib/release-safety/workflow-policy.mjs';

export const validateReleaseSafety=root=>{
  const firebase=validateFirebaseRelease(root);
  const workflows=validateWorkflowPolicy(root);
  return {
    ok:firebase.ok && workflows.ok,
    errors:[...firebase.errors,...workflows.errors],
    checks:{firebase:firebase.checks,workflows:workflows.checks}
  };
};

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const report=validateReleaseSafety(process.cwd());
  process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
  if (!report.ok) process.exitCode=1;
}
