import fs from 'node:fs';
import path from 'node:path';
import { ALLOWED_TASK_TYPES } from './lib/allocation.mjs';
import { validateDeepArticleRecord } from './lib/quality.mjs';

const errors=[];
const articles=JSON.parse(fs.readFileSync('editorial/registry/articles.json','utf8'));
const tasks=JSON.parse(fs.readFileSync('editorial/queue/tasks.json','utf8'));
if (!fs.existsSync('public/index.html')) errors.push('missing public/index.html');
if (fs.existsSync('public/public')) errors.push('nested public/public is forbidden');
const upgradeSet=new Set(tasks.filter(t=>t.task_type==='article_upgrade' && t.required_depth==='deep').map(t=>t.article_slug));
for (const t of tasks) {
  if (!ALLOWED_TASK_TYPES.has(t.task_type)) errors.push(`unknown task type: ${t.task_type}`);
  if (t.required_depth==='deep' && Number(t.min_visible_chars)<8000) errors.push(`deep task below minimum: ${t.task_id}`);
}
for (const a of articles) {
  if (a.depth==='deep' && a.visibleChars<8000 && !upgradeSet.has(a.slug)) {
    errors.push(`legacy deep article below 8000 without queued upgrade: ${a.path} (${a.visibleChars})`);
  }
  if (a.deepQualified) {
    try { validateDeepArticleRecord(a); } catch(e) { errors.push(e.message); }
  }
}
// Version-sensitive researched tasks only become blocking for source coverage once a Worker reports them complete/pr-ready.
for (const t of tasks.filter(t=>t.research_required && ['complete','pr-ready'].includes(t.status))) {
  const a=articles.find(x=>x.slug===t.article_slug);
  if (a && a.sourceCount<1) errors.push(`researched task has no external source: ${t.task_id}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`content gate OK: articles=${articles.length} queued-upgrades=${upgradeSet.size}`);
