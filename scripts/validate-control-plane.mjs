#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGit } from './lib/control-plane/git.mjs';
import { normalizeLf } from './lib/control-plane/io.mjs';
import { normalizeQueue } from './lib/control-plane/schema.mjs';
import { loadWorkerDefinition, loadWorkerPoolConfig } from './lib/control-plane/worker.mjs';

const BASELINE='c204d865cf60f07fbb83037985f01e03a2f5e809';
const SCHEMAS=['approval-v2.schema.json','assignment-v2.schema.json','batch-state-v2.schema.json','lock-manifest-v2.schema.json','queue-v2.schema.json','session-state-v2.schema.json','worker-result-v2.schema.json'];
const DISPATCH_SCHEMAS=['assignment-v2.schema.json','batch-state-v2.schema.json','session-state-v2.schema.json','worker-result-v2.schema.json'];
const DISPATCH_FIELDS=['classification','execution_route','worker_count','dispatch_reason'];
const LEGACY_BATCH_FILES=['editorial/queue/tasks.json',...['a','b','c','d','e'].map(workerId=>`editorial/queue/assignments/batch-0001-worker-${workerId}.json`)];
const PROTECTED_PATHS=['.github/workflows','.firebaserc','firebase.json','public/index.html','public/robots.txt','public/public','public/articles','public/games','public/data',...LEGACY_BATCH_FILES.slice(1)];

const read=(root,relative)=>fs.readFileSync(path.join(root,relative),'utf8');

export const validateControlPlane=(root,{contractsOnly=false,baselineSha=BASELINE}={})=>{
  const errors=[];
  const checks={schemas:0,workers:0,default_worker_count:null,max_wave_workers:null,batch_0001_compatible:null,forbidden_diff_count:null,public_public_absent:null,noindex_preserved:null,robots_disallow_preserved:null};
  const schemaRoot=path.join(root,'editorial/control/schemas');
  for (const name of SCHEMAS) {
    const file=path.join(schemaRoot,name);
    if (!fs.existsSync(file)) {
      errors.push(`${name} is missing`);
      continue;
    }
    try {
      const schema=JSON.parse(fs.readFileSync(file,'utf8'));
      if (schema.type!=='object' || !Array.isArray(schema.required) || !schema.properties) errors.push(`${name} is not a complete object schema`);
      if (DISPATCH_SCHEMAS.includes(name)) {
        for (const field of DISPATCH_FIELDS) if (!schema.required.includes(field)) errors.push(`${name} must require ${field}`);
        if (schema.properties.worker_count?.default!==0) errors.push(`${name} worker_count must default to 0`);
        if (!Array.isArray(schema.allOf)) errors.push(`${name} must encode route/count correlations`);
      }
      checks.schemas+=1;
    } catch (error) {
      errors.push(`${name} is invalid JSON: ${error.message}`);
    }
  }

  const configPath=path.join(root,'.codex/config.toml');
  if (!fs.existsSync(configPath)) errors.push('.codex/config.toml is missing');
  for (const workerId of ['a','b','c','d','e']) {
    const agentPath=path.join(root,'.codex/agents',`worker-${workerId}.toml`);
    if (!fs.existsSync(agentPath)) errors.push(`.codex/agents/worker-${workerId}.toml is missing`);
  }
  try {
    const pool=loadWorkerPoolConfig(root);
    checks.default_worker_count=pool.default_worker_count;
    checks.max_wave_workers=pool.max_wave_workers;
    for (const workerId of ['a','b','c','d','e']) {
      const definition=loadWorkerDefinition(root,workerId);
      if (definition.optional!==true || definition.default_enabled!==false || definition.assignment_driven!==true || definition.content_prose_generation!==false) errors.push(`worker-${workerId} optional-pool flags are invalid`);
      if (!/optional Worker pool/i.test(definition.agent.developer_instructions) || !/article prose/i.test(definition.agent.developer_instructions)) errors.push(`worker-${workerId} instructions do not enforce the content boundary`);
      checks.workers+=1;
    }
  } catch (error) {
    errors.push(`Worker pool validation failed: ${error.message}`);
  }

  if (!contractsOnly) {
    try {
      const queue=JSON.parse(read(root,'editorial/queue/tasks.json'));
      normalizeQueue(queue);
      checks.batch_0001_compatible=true;
      for (const relative of LEGACY_BATCH_FILES) {
        const baseline=runGit(root,['show',`${baselineSha}:${relative}`],{allowFailure:true});
        if (!baseline.ok || !fs.existsSync(path.join(root,relative)) || normalizeLf(baseline.stdout)!==normalizeLf(read(root,relative))) {
          checks.batch_0001_compatible=false;
          errors.push(`${relative} differs from baseline ${baselineSha}`);
        }
      }
    } catch (error) {
      checks.batch_0001_compatible=false;
      errors.push(`Batch 0001 compatibility failed: ${error.message}`);
    }

    const diff=runGit(root,['diff','--name-only',baselineSha,'--',...PROTECTED_PATHS],{allowFailure:true});
    const untracked=runGit(root,['ls-files','--others','--exclude-standard','-z','--',...PROTECTED_PATHS],{allowFailure:true});
    const changed=diff.ok && untracked.ok
      ? [...new Set([...diff.stdout.split(/\r?\n/).filter(Boolean),...untracked.stdout.split('\0').filter(Boolean)])].sort()
      : ['GIT_DIFF_FAILED'];
    checks.forbidden_diff_count=changed.length;
    if (changed.length) errors.push(`forbidden paths changed: ${changed.join(', ')}`);

    checks.public_public_absent=!fs.existsSync(path.join(root,'public/public'));
    if (!checks.public_public_absent) errors.push('public/public must not exist');
    const index=read(root,'public/index.html');
    checks.noindex_preserved=/noindex\s*,\s*follow/i.test(index);
    if (!checks.noindex_preserved) errors.push('public/index.html must preserve noindex,follow');
    const robots=read(root,'public/robots.txt');
    checks.robots_disallow_preserved=/^Disallow:\s*\/$/m.test(robots);
    if (!checks.robots_disallow_preserved) errors.push('public/robots.txt must preserve Disallow: /');
  }

  return {ok:errors.length===0,errors,checks};
};

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const report=validateControlPlane(process.cwd());
  process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
  if (!report.ok) process.exitCode=1;
}
