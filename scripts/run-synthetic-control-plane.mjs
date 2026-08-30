#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPendingApproval } from './lib/control-plane/approval.mjs';
import { runGit } from './lib/control-plane/git.mjs';
import { prepareIntegration } from './lib/control-plane/integration.mjs';
import { runRound } from './lib/control-plane/orchestrator.mjs';
import { reconcileBatch } from './lib/control-plane/reconcile.mjs';
import { reviewWorkerResult } from './lib/control-plane/review.mjs';
import { transitionAssignment, transitionBatch } from './lib/control-plane/state-machine.mjs';
import { buildWorkerResult, verifyWorkerStart } from './lib/control-plane/worker.mjs';
import { cleanupWorkerWorktree, createWorkerWorktree, verifyWorkerWorktree } from './lib/control-plane/worktree.mjs';

const at='2026-08-28T06:00:00.000Z';
const completedAt='2026-08-28T06:05:00.000Z';
const git=(repo,args)=>runGit(repo,args).stdout.trim();
const baseBatch=(base_sha='a'.repeat(40),overrides={})=>({schema_version:2,batch_id:'batch-9002',state:'DRAFT',base_sha,classification:'repository_change',execution_route:'codex-master',worker_count:0,dispatch_reason:'synthetic initial route',created_at:at,updated_at:at,history:[],...overrides});
const orchestrationState=(tasks,base_sha='a'.repeat(40))=>({repository_safe:true,batch:baseBatch(base_sha),tasks,assignments:[],completed_task_ids:[],locks:{schema_version:2,batch_id:'batch-9002',locks:[],updated_at:at},workers:['a','b','c','d','e']});
const task=(task_id,task_type,classification,priority,overrides={})=>({task_id,task_type,classification,priority,status:'queued',depends_on:[],expected_paths:[`synthetic/${task_id}.txt`],...overrides});

export const runSyntheticControlPlane=()=>{
  const local=runRound({state:orchestrationState([task('validate','validation_run','local_script',10)]),at,services:{executeLocal:()=>({completed:true})}});
  const master=runRound({state:orchestrationState([task('master-fix','repository_change','repository_change',10)]),at,services:{executeMaster:()=>({completed:true})}});
  const content=runRound({state:orchestrationState([{...task('article','article_writing','article_writing',10),parallelizable:true,requested_worker_count:3,independent_units:['research','outline','prose']}]),at});

  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-control-plane-synthetic-'));
  const repo=path.join(temporary,'repo');
  const worktreeRoot=path.join(temporary,'worktrees');
  const integrationPath=path.join(worktreeRoot,'integration-batch-9002');
  let leftoverWorktrees=0;
  let completed=false;
  try {
    fs.mkdirSync(repo,{recursive:true});
    git(repo,['init','--quiet','-b','main']);
    git(repo,['config','user.name','Synthetic Control Plane']);
    git(repo,['config','user.email','synthetic@example.invalid']);
    fs.mkdirSync(path.join(repo,'synthetic'),{recursive:true});
    fs.writeFileSync(path.join(repo,'synthetic/base.txt'),'synthetic base\n');
    git(repo,['add','synthetic/base.txt']);
    git(repo,['commit','--quiet','-m','synthetic base']);
    const baseSha=git(repo,['rev-parse','HEAD']);

    const allocated=runRound({state:orchestrationState([
      task('code-a','parallel_code_change','parallel_code_change',20,{parallelizable:true,requested_worker_count:1,independent_units:['unit-a']}),
      task('code-b','parallel_code_change','parallel_code_change',10,{parallelizable:true,requested_worker_count:1,independent_units:['unit-b']})
    ],baseSha),at});
    if (allocated.state.batch.state!=='ALLOCATED') throw new Error('synthetic Master allocation did not reach ALLOCATED');
    let batch=transitionBatch(allocated.state.batch,'ACTIVE',{at,reason:'synthetic Worker worktrees are ready for dispatch'});
    let assignments=allocated.state.assignments.map(item=>transitionAssignment(item,'DISPATCHED',{at,reason:'synthetic Worker was dispatched'}));
    const locks=allocated.state.locks;

    const results=[];
    const worktreeEvidence={};
    const worktreeOptions=[];
    for (let index=0;index<assignments.length;index+=1) {
      let item=assignments[index];
      const worktreePath=path.join(worktreeRoot,item.worker_id);
      const options={repo,worktreeRoot,worktreePath,baseSha,branch:item.branch};
      const created=createWorkerWorktree(options);
      if (created.status!=='READY') throw new Error(`synthetic Worker ${item.worker_id} worktree was not READY`);
      verifyWorkerStart({assignment:item,worker_id:item.worker_id,branch:item.branch,base_sha:baseSha,locks,worktree:created});
      item=transitionAssignment(item,'RUNNING',{at,reason:'synthetic Worker began its assignment'});
      assignments[index]=item;
      const changedPath=item.expected_paths[0];
      fs.writeFileSync(path.join(worktreePath,...changedPath.split('/')),`worker ${item.worker_id}\n`);
      git(worktreePath,['add',changedPath]);
      git(worktreePath,['commit','--quiet','-m',`synthetic worker ${item.worker_id}`]);
      const commitSha=git(worktreePath,['rev-parse','HEAD']);
      const verified=verifyWorkerWorktree({...options,expectedResultCommit:commitSha});
      const workerResult=buildWorkerResult({assignment:item,worker_id:item.worker_id,branch:item.branch,base_sha:baseSha,locks,worktree:verified,commit_sha:commitSha,task_outcomes:item.task_ids.map(taskId=>({task_id:taskId,status:'COMPLETED'})),changed_paths:[changedPath],validation:[{command:'synthetic no-op validation',exit_code:0}],created_at:at,completed_at:completedAt,notes:'synthetic code result'});
      results.push(workerResult);
      worktreeEvidence[item.assignment_id]=verified;
      worktreeOptions.push({...options,expectedResultCommit:commitSha});
    }

    const reconciled=reconcileBatch({batch,assignments,results,worktree_evidence:worktreeEvidence,locks,at:completedAt});
    batch=reconciled.batch;
    assignments=reconciled.assignments;
    const decisions=assignments.map((item,index)=>reviewWorkerResult({repo,assignment:item,result:results[index],reviewed_at:completedAt}));
    assignments=assignments.map((item,index)=>transitionAssignment(item,decisions[index].status,{at:completedAt,reason:`synthetic Master review ${decisions[index].status}`}));
    const integration=prepareIntegration({repo,worktreeRoot,worktreePath:integrationPath,batch,assignments,worker_results:results,review_decisions:decisions,prepared_at:completedAt});
    if (integration.status!=='INTEGRATION_PREPARED') throw new Error(`synthetic integration failed: ${integration.status}`);
    batch=transitionBatch(batch,'INTEGRATION_PREPARED',{at:completedAt,reason:'synthetic reviewed commits were integrated'});
    const approval=buildPendingApproval({batch_id:'batch-9002',integration_branch:integration.branch,integration_head:integration.head,at:completedAt});
    batch=transitionBatch(batch,'APPROVAL_PENDING',{at:completedAt,reason:'synthetic explicit user approval is required'});

    for (const options of worktreeOptions) {
      const cleaned=cleanupWorkerWorktree(options);
      if (!cleaned.removed) throw new Error(`synthetic Worker cleanup refused: ${cleaned.status}`);
    }
    if (git(integrationPath,['status','--porcelain'])!=='') throw new Error('synthetic integration worktree is not clean');
    runGit(repo,['worktree','remove',integrationPath]);
    const registered=git(repo,['worktree','list','--porcelain']).split(/\r?\n/).filter(line=>line.startsWith('worktree '));
    leftoverWorktrees=Math.max(0,registered.length-1);
    if (leftoverWorktrees!==0) throw new Error('synthetic registered worktree residue remains');
    completed=true;

    return {
      routes:{
        'local-script':{worker_count:local.worker_count,status:'COMPLETED'},
        'codex-master':{worker_count:master.worker_count,status:'COMPLETED'},
        'codex-worker-wave':{worker_count:new Set(assignments.map(item=>item.worker_id)).size,allocation_status:'ALLOCATED',assignment_count:assignments.length,worker_ids:assignments.map(item=>item.worker_id),review_statuses:decisions.map(decision=>decision.status),integration_status:integration.status,approval_status:approval.status},
        'external-content-input':{worker_count:content.worker_count,status:'WAITING_FOR_GPT_CONTENT_BATCH',dispatch_created:content.state.assignments.length>0}
      },
      batch_state:batch.state,
      batch_history:[batch.history[0].from,...batch.history.map(entry=>entry.to)],
      leftover_worktrees:leftoverWorktrees
    };
  } catch (error) {
    error.message=`${error.message}; synthetic evidence preserved at ${temporary}`;
    throw error;
  } finally {
    if (completed) fs.rmSync(temporary,{recursive:true});
  }
};

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(runSyntheticControlPlane(),null,2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack??error.message}\n`);
    process.exitCode=1;
  }
}
