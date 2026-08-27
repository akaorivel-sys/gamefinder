const forbidden=path=>path==='.firebaserc'
  || path==='firebase.json'
  || path==='public/index.html'
  || path==='public/robots.txt'
  || path.startsWith('.github/workflows/')
  || path.startsWith('public/public/')
  || path.startsWith('editorial/queue/assignments/batch-0001-');

export const normalizeOwnedPath=path=>{
  if (typeof path!=='string' || path==='' || path==='.' || path.startsWith('/') || /^[A-Za-z]:\//.test(path) || path.includes('\\') || path.split('/').some(part=>part==='' || part==='.' || part==='..')) throw new Error('owned path is invalid');
  if (forbidden(path)) throw new Error(`owned path is forbidden: ${path}`);
  return path;
};

const copiedManifest=manifest=>({
  ...manifest,
  locks:(manifest?.locks??[]).map(lock=>({...lock}))
});

export const acquireLocks=(manifest,assignment,at)=>{
  const next=copiedManifest(manifest);
  const paths=[...new Set((assignment?.expected_paths??[]).map(normalizeOwnedPath))];
  if (!paths.length) throw new Error('assignment expected_paths are required');
  for (const path of paths) {
    const existing=next.locks.find(lock=>lock.path===path && lock.state==='HELD');
    if (existing && existing.assignment_id!==assignment.assignment_id) throw new Error(`path is locked: ${path}`);
    if (existing && (existing.worker_id!==assignment.worker_id || existing.wave!==assignment.wave)) throw new Error(`locked identity does not match: ${path}`);
  }
  for (const path of paths) {
    if (!next.locks.some(lock=>lock.path===path && lock.assignment_id===assignment.assignment_id && lock.state==='HELD')) {
      next.locks.push({assignment_id:assignment.assignment_id,worker_id:assignment.worker_id,wave:assignment.wave,path,state:'HELD',acquired_at:at,updated_at:at});
    }
  }
  next.updated_at=at;
  return next;
};

export const releaseLocks=(manifest,assignmentId,at)=>{
  const next=copiedManifest(manifest);
  next.locks=next.locks.map(lock=>lock.assignment_id===assignmentId && lock.state==='HELD' ? {...lock,state:'RELEASED',updated_at:at} : lock);
  next.updated_at=at;
  return next;
};

export const assertOwnedChanges=(assignment,paths)=>{
  const owned=new Set((assignment?.expected_paths??[]).map(normalizeOwnedPath));
  if (!owned.size) throw new Error('assignment expected_paths are required');
  if (!Array.isArray(paths)) throw new Error('changed paths are required');
  const normalized=paths.map(normalizeOwnedPath);
  for (const path of normalized) if (!owned.has(path)) throw new Error(`changed path is outside assignment ownership: ${path}`);
  return [...normalized];
};
