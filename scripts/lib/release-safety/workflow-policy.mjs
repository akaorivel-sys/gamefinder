import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_EXTENSIONS=new Set(['.yml','.yaml']);
const FIREBASE_ACTION=/FirebaseExtended\/action-hosting-deploy@/;
const LIVE_CHANNEL=/channelId\s*:\s*['"]?live['"]?/i;

const relativePath=(root,file)=>path.relative(root,file).replaceAll('\\','/');

const workflowFiles=root=>{
  const workflowRoot=path.join(root,'.github/workflows');
  if (!fs.existsSync(workflowRoot)) return [];
  return fs.readdirSync(workflowRoot,{withFileTypes:true})
    .filter(entry=>entry.isFile() && WORKFLOW_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map(entry=>path.join(workflowRoot,entry.name))
    .sort();
};

const hasTrigger=(text,trigger)=>new RegExp(`(?:^|\\n)\\s*(?:on|["']on["'])\\s*:\\s*\\n\\s*${trigger}\\s*:`,`m`).test(text);
const targetsMain=text=>/branches\s*:\s*(?:\[\s*['"]?main['"]?\s*\]|\n\s*-\s*['"]?main['"]?)/m.test(text);
const hasFullHistoryCheckoutBefore=(text,beforeIndex)=>{
  const checkoutIndex=text.lastIndexOf('actions/checkout@',beforeIndex);
  if (checkoutIndex<0) return false;
  return /fetch-depth\s*:\s*0\s*$/m.test(text.slice(checkoutIndex,beforeIndex));
};

const inspect=(root,file)=>{
  const text=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
  return {
    file:relativePath(root,file),
    text,
    firebase:FIREBASE_ACTION.test(text),
    live:LIVE_CHANNEL.test(text),
    mainPush:hasTrigger(text,'push') && targetsMain(text),
    pullRequest:hasTrigger(text,'pull_request')
  };
};

export const validateWorkflowPolicy=root=>{
  const errors=[];
  const workflows=workflowFiles(root).map(file=>inspect(root,file));
  const production=workflows.filter(item=>item.firebase && item.live && item.mainPush);
  const previews=workflows.filter(item=>item.firebase && item.pullRequest);
  const liveChannels=workflows.reduce((count,item)=>count+(item.text.match(new RegExp(LIVE_CHANNEL.source,'gi'))?.length ?? 0),0);
  const checks={
    production_workflow_count:production.length,
    production_workflow:production.length===1?production[0].file:null,
    preview_workflow_count:previews.length,
    preview_workflow:previews.length===1?previews[0].file:null,
    max_live_channels:liveChannels
  };

  if (production.length!==1) errors.push(`There must be exactly one production Workflow; found ${production.length}`);
  if (production.length===1) {
    const workflow=production[0];
    if (workflow.file!=='.github/workflows/deploy-firebase.yml') errors.push('The production Workflow must be .github/workflows/deploy-firebase.yml');
    const controlIndex=workflow.text.indexOf('npm run validate:control-plane');
    const ciIndex=workflow.text.indexOf('npm run validate:ci');
    const deployIndex=workflow.text.search(FIREBASE_ACTION);
    const verifyIndex=workflow.text.search(/Verify live deployment/i);
    if (controlIndex<0 || controlIndex>deployIndex) errors.push('validate:control-plane must run before live deploy');
    if (controlIndex>=0 && !hasFullHistoryCheckoutBefore(workflow.text,controlIndex)) errors.push('Production Control Plane validation requires full Git history');
    if (ciIndex<0 || ciIndex>deployIndex) errors.push('validate:ci must run before live deploy');
    if (Math.max(controlIndex,ciIndex)>deployIndex || deployIndex<0) errors.push('validation must complete before live deploy');
    if (verifyIndex<deployIndex) errors.push('live verification must run after live deploy');
    const freshnessIndex=workflow.text.indexOf('git ls-remote origin refs/heads/main');
    if (freshnessIndex<0 || !workflow.text.includes('GITHUB_SHA') || freshnessIndex>deployIndex) errors.push('Production must use a remote main freshness guard before live deploy');
    if (!/concurrency\s*:\s*\n(?:[ \t]+.*\n)*?[ \t]+group\s*:\s*firebase-production\s*$/m.test(workflow.text) || !/cancel-in-progress\s*:\s*false\s*$/m.test(workflow.text)) {
      errors.push('Production must use firebase-production concurrency with cancel-in-progress false');
    }
  }

  if (liveChannels!==1) errors.push(`Exactly one live channel declaration is allowed; found ${liveChannels}`);
  if (previews.length!==1) errors.push(`There must be exactly one Firebase PR Preview Workflow; found ${previews.length}`);
  for (const preview of previews) {
    if (preview.live) errors.push('PR Workflow must never target the live channel');
    if (!/(?:^|\n)\s{2}quality-gate\s*:/m.test(preview.text)) errors.push('PR Workflow must define a quality-gate job');
    if (!/needs\s*:\s*quality-gate\s*$/m.test(preview.text)) errors.push('Preview must depend on quality-gate');
    if (!preview.text.includes('npm run validate:control-plane') || !preview.text.includes('npm run validate:ci')) errors.push('PR quality-gate must run both required validations');
    const controlIndex=preview.text.indexOf('npm run validate:control-plane');
    if (controlIndex>=0 && !hasFullHistoryCheckoutBefore(preview.text,controlIndex)) errors.push('PR Control Plane validation requires full Git history');
    if (!/github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository/.test(preview.text)) errors.push('PR Preview must be limited to same-repository branches');
  }

  return {ok:errors.length===0,errors,checks};
};
