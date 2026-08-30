#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './lib/control-plane/io.mjs';
import { buildWorkerResult, verifyWorkerStart } from './lib/control-plane/worker.mjs';

const valueAfter=(args,flag)=>{
  const index=args.indexOf(flag);
  if (index===-1 || !args[index+1]) throw new Error(`${flag} is required`);
  return args[index+1];
};

const main=()=>{
  const [action,...args]=process.argv.slice(2);
  if (!['verify','result'].includes(action)) throw new Error('usage: worker-control.mjs verify|result --context <json> [--output <json>]');
  const contextPath=path.resolve(valueAfter(args,'--context'));
  const context=JSON.parse(fs.readFileSync(contextPath,'utf8'));
  if (action==='verify') {
    process.stdout.write(`${JSON.stringify(verifyWorkerStart(context))}\n`);
    return;
  }

  const result=buildWorkerResult(context);
  const output=path.resolve(valueAfter(args,'--output'));
  const controlRoot=path.resolve(context.root??process.cwd());
  const expected=path.resolve(controlRoot,context.assignment.result_path);
  if (output!==expected) throw new Error('output must match assignment result_path');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  writeJsonAtomic(output,result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode=1;
}
