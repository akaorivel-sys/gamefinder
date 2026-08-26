import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistryRecords } from '../../scripts/lib/registry.mjs';

test('duplicate article paths are rejected', () => {
  const games=[{slug:'alpha',appid:1}];
  const articles=[{slug:'a',path:'/articles/a.html',gameSlug:'alpha'},{slug:'b',path:'/articles/a.html',gameSlug:'alpha'}];
  assert.throws(()=>validateRegistryRecords(games,articles),/duplicate article path/i);
});

test('article referencing missing game is rejected', () => {
  const games=[{slug:'alpha',appid:1}];
  const articles=[{slug:'a',path:'/articles/a.html',gameSlug:'missing'}];
  assert.throws(()=>validateRegistryRecords(games,articles),/missing game/i);
});
