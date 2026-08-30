import fs from 'node:fs';

export const normalizeLf=text=>text.replace(/\r\n?/g,'\n');

export const generatedTextMatches=(previous,next)=>previous!==null&&normalizeLf(previous)===normalizeLf(next);

export const writeJsonAtomic=(target,value)=>{
  const temp=`${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');
  fs.renameSync(temp,target);
};
