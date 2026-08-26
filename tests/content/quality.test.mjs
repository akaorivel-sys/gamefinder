import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeepArticleRecord, detectExactDuplicateBodies } from '../../scripts/lib/quality.mjs';

test('deep article below 8000 visible chars is rejected', () => {
  assert.throws(()=>validateDeepArticleRecord({depth:'deep',visibleChars:7999,path:'/articles/a.html'}),/8000/);
});

test('exact duplicate bodies are rejected', () => {
  const dup=detectExactDuplicateBodies([
    {path:'/a',bodyHash:'same'}, {path:'/b',bodyHash:'same'}, {path:'/c',bodyHash:'other'}
  ]);
  assert.deepEqual(dup,[['/a','/b']]);
});
