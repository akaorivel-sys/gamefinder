import fs from 'node:fs';
import { buildRegistries, validateRegistryRecords } from './lib/registry.mjs';
const built=buildRegistries('public');
const committed={
  games:JSON.parse(fs.readFileSync('editorial/registry/games.json','utf8')),
  articles:JSON.parse(fs.readFileSync('editorial/registry/articles.json','utf8')),
  sources:JSON.parse(fs.readFileSync('editorial/registry/sources.json','utf8'))
};
validateRegistryRecords(committed.games,committed.articles);
for (const key of ['games','articles','sources']) {
  if (JSON.stringify(built[key])!==JSON.stringify(committed[key])) {
    console.error(`registry mismatch: ${key}`); process.exit(1);
  }
}
console.log('registry gate OK');
