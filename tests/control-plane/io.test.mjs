import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

test('generated JSON text compares equal across CRLF and LF', async () => {
  const { generatedTextMatches }=await import('../../scripts/lib/control-plane/io.mjs');
  assert.equal(generatedTextMatches('{\r\n  "game": "alpha"\r\n}\r\n','{\n  "game": "alpha"\n}\n'),true);
});

test('different generated JSON text remains unequal', async () => {
  const { generatedTextMatches }=await import('../../scripts/lib/control-plane/io.mjs');
  assert.equal(generatedTextMatches('{"game":"alpha"}\n','{"game":"beta"}\n'),false);
});

test('atomic JSON write leaves only the target file', async () => {
  const { writeJsonAtomic }=await import('../../scripts/lib/control-plane/io.mjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-io-'));
  try {
    const target=path.join(dir,'state.json');
    writeJsonAtomic(target,{game:'alpha'});
    assert.equal(fs.readFileSync(target,'utf8'),'{\n  "game": "alpha"\n}\n');
    assert.deepEqual(fs.readdirSync(dir),['state.json']);
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('package JSON is configured for LF line endings', () => {
  const output=execFileSync('git',['check-attr','eol','--','package.json'],{cwd:root,encoding:'utf8'});
  assert.match(output,/package\.json: eol: lf/);
});
