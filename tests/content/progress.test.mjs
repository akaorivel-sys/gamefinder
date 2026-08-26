import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveProgress } from '../../scripts/lib/progress.mjs';

test('progress totals derive from registry and assignment records', () => {
  const progress=deriveProgress({
    games:[{slug:'a',editorialStatus:'deep'},{slug:'b',editorialStatus:'editorial-plus'}],
    articles:[{depth:'deep',deepQualified:true},{depth:'thin',deepQualified:false},{depth:'deep',deepQualified:false}],
    tasks:[{task_id:'1',status:'queued'},{task_id:'2',status:'queued'}],
    assignments:[{worker:'a',workload:3,tasks:[{task_id:'1'}]}],
    results:[{worker:'a',tasks:[{task_id:'1',status:'complete'}]}]
  });
  assert.equal(progress.current.games,2);
  assert.equal(progress.current.deepMarkedArticles,2);
  assert.equal(progress.current.deepQualifiedArticles,1);
  assert.equal(progress.queue.queuedAvailable,1);
  assert.equal(progress.queue.assigned,1);
  assert.equal(progress.workers.a.complete,1);
});
