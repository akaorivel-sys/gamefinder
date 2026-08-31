import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const makeFixture=()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gamefinder-release-config-'));
  fs.mkdirSync(path.join(root,'public'),{recursive:true});
  fs.writeFileSync(path.join(root,'.firebaserc'),'\u007b\n  "projects": \u007b "default": "gamefinder-b6a00" \u007d\n\u007d\n');
  fs.writeFileSync(path.join(root,'firebase.json'),'\u007b\n  "hosting": \u007b "public": "public" \u007d\n\u007d\n');
  fs.writeFileSync(path.join(root,'public/index.html'),'<meta name="robots" content="noindex,follow">\n');
  fs.writeFileSync(path.join(root,'public/robots.txt'),'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(root,'public/health.txt'),'gamefinder-v29\n');
  return root;
};

const validate=async root=>{
  const { validateFirebaseRelease }=await import('../../scripts/lib/release-safety/firebase-config.mjs');
  return validateFirebaseRelease(root);
};

test('accepts the exact Firebase project, public root, health marker, and noindex policy', async () => {
  const root=makeFixture();
  try {
    const report=await validate(root);
    assert.equal(report.ok,true,report.errors.join('\n'));
    assert.deepEqual(report.checks,{
      firebaserc_json:true,
      project_id:'gamefinder-b6a00',
      public_root:'public',
      public_public_absent:true,
      health_marker:'gamefinder-v29',
      noindex_follow:true,
      robots_disallow_root:true
    });
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects malformed .firebaserc JSON before deployment', async () => {
  const root=makeFixture();
  try {
    fs.writeFileSync(path.join(root,'.firebaserc'),'\u007b "projects": \u007b\n');
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.equal(report.checks.firebaserc_json,false);
    assert.ok(report.errors.some(error=>/\.firebaserc must be valid JSON/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects a Firebase project mismatch', async () => {
  const root=makeFixture();
  try {
    fs.writeFileSync(path.join(root,'.firebaserc'),'\u007b"projects":\u007b"default":"wrong-project"\u007d\u007d\n');
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.equal(report.checks.project_id,'wrong-project');
    assert.ok(report.errors.some(error=>/must equal gamefinder-b6a00/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects a Firebase public root other than public', async () => {
  const root=makeFixture();
  try {
    fs.writeFileSync(path.join(root,'firebase.json'),'\u007b"hosting":\u007b"public":"public/public"\u007d\u007d\n');
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.equal(report.checks.public_root,'public/public');
    assert.ok(report.errors.some(error=>/hosting\.public must equal public/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects public/public even when the configured root is public', async () => {
  const root=makeFixture();
  try {
    fs.mkdirSync(path.join(root,'public/public'));
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.equal(report.checks.public_public_absent,false);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects a missing noindex,follow marker', async () => {
  const root=makeFixture();
  try {
    fs.writeFileSync(path.join(root,'public/index.html'),'<meta name="robots" content="index,follow">\n');
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.equal(report.checks.noindex_follow,false);
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('rejects robots.txt without Disallow: / and an invalid health marker', async () => {
  const root=makeFixture();
  try {
    fs.writeFileSync(path.join(root,'public/robots.txt'),'User-agent: *\nAllow: /\n');
    fs.writeFileSync(path.join(root,'public/health.txt'),'latest\n');
    const report=await validate(root);
    assert.equal(report.ok,false);
    assert.equal(report.checks.robots_disallow_root,false);
    assert.equal(report.checks.health_marker,'latest');
    assert.ok(report.errors.some(error=>/health marker/.test(error)));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
