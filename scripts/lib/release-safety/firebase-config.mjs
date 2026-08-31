import fs from 'node:fs';
import path from 'node:path';

const parseJson=(root,relative,errors,label)=>{
  try {
    return JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
  } catch (error) {
    errors.push(`${label} must be valid JSON: ${error.message}`);
    return null;
  }
};

const readText=(root,relative,errors)=>{
  try {
    return fs.readFileSync(path.join(root,relative),'utf8');
  } catch (error) {
    errors.push(`${relative} must be readable: ${error.message}`);
    return '';
  }
};

export const validateFirebaseRelease=(root,{expectedProjectId='gamefinder-b6a00'}={})=>{
  const errors=[];
  const checks={
    firebaserc_json:false,
    project_id:null,
    public_root:null,
    public_public_absent:!fs.existsSync(path.join(root,'public/public')),
    health_marker:null,
    noindex_follow:false,
    robots_disallow_root:false
  };

  const firebaserc=parseJson(root,'.firebaserc',errors,'.firebaserc');
  if (firebaserc) {
    checks.firebaserc_json=true;
    checks.project_id=firebaserc.projects?.default??null;
    if (checks.project_id!==expectedProjectId) errors.push(`.firebaserc projects.default must equal ${expectedProjectId}`);
  }

  const firebase=parseJson(root,'firebase.json',errors,'firebase.json');
  if (firebase) {
    checks.public_root=firebase.hosting?.public??null;
    if (checks.public_root!=='public') errors.push('firebase.json hosting.public must equal public');
  }

  if (!checks.public_public_absent) errors.push('public/public must not exist');

  checks.health_marker=readText(root,'public/health.txt',errors).trim();
  if (!/^gamefinder-v[0-9]+$/.test(checks.health_marker)) errors.push('public/health.txt must contain a versioned health marker');

  const index=readText(root,'public/index.html',errors);
  checks.noindex_follow=/noindex\s*,\s*follow/i.test(index);
  if (!checks.noindex_follow) errors.push('public/index.html must preserve noindex,follow');

  const robots=readText(root,'public/robots.txt',errors);
  checks.robots_disallow_root=/^Disallow:\s*\/$/m.test(robots);
  if (!checks.robots_disallow_root) errors.push('public/robots.txt must preserve Disallow: /');

  return {ok:errors.length===0,errors,checks};
};
