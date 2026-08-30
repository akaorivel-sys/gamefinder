import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './io.mjs';

export const createControlStore=root=>{
  const stateRoot=path.resolve(root);
  const targetFor=relative=>{
    if (typeof relative!=='string' || relative==='' || path.isAbsolute(relative)) throw new Error('state path is outside root');
    const target=path.resolve(stateRoot,relative);
    const relation=path.relative(stateRoot,target);
    if (relation==='' || relation==='..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) throw new Error('state path is outside root');
    return target;
  };
  return {
    root:stateRoot,
    read(relative,{optional=false}={}) {
      const target=targetFor(relative);
      if (optional && !fs.existsSync(target)) return null;
      return JSON.parse(fs.readFileSync(target,'utf8'));
    },
    write(relative,value) {
      const target=targetFor(relative);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      writeJsonAtomic(target,value);
      return value;
    },
    exists(relative) {
      return fs.existsSync(targetFor(relative));
    }
  };
};
