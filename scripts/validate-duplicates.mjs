import fs from 'node:fs';
import { detectExactDuplicateBodies } from './lib/quality.mjs';
const articles=JSON.parse(fs.readFileSync('editorial/registry/articles.json','utf8'));
const dups=detectExactDuplicateBodies(articles);
if(dups.length){for(const d of dups)console.error(`duplicate article body: ${d[0]} == ${d[1]}`);process.exit(1)}
console.log('duplicate-body gate OK');
