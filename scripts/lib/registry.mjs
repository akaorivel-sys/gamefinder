import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function stripHtml(input='') {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&#39;/g,"'")
    .replace(/&quot;/g,'"')
    .replace(/\s+/g,' ')
    .trim();
}

export function mainVisibleText(input='') {
  const m=input.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return stripHtml(m ? m[1] : input);
}

export function inferGameSlug(articleStem, gameSlugs) {
  const sorted=[...gameSlugs].sort((a,b)=>b.length-a.length);
  return sorted.find(slug => articleStem===slug || articleStem.startsWith(`${slug}-`)) ?? null;
}

export function countExternalSources(html='') {
  const hrefs=[...html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi)].map(m=>m[1]);
  return [...new Set(hrefs)].length;
}

export function getRobots(html='') {
  const m=html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i) ||
          html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']robots["']/i);
  return m ? m[1].toLowerCase() : null;
}

export function validateRegistryRecords(games,articles) {
  const gameSlugs=new Set();
  const appids=new Set();
  for (const g of games) {
    if (!g.slug) throw new Error('game missing slug');
    if (gameSlugs.has(g.slug)) throw new Error(`duplicate game slug: ${g.slug}`);
    gameSlugs.add(g.slug);
    if (g.appid !== null && g.appid !== undefined) {
      const key=String(g.appid);
      if (appids.has(key)) throw new Error(`duplicate appid: ${key}`);
      appids.add(key);
    }
  }
  const paths=new Set();
  const slugs=new Set();
  for (const a of articles) {
    if (paths.has(a.path)) throw new Error(`duplicate article path: ${a.path}`);
    paths.add(a.path);
    if (slugs.has(a.slug)) throw new Error(`duplicate article slug: ${a.slug}`);
    slugs.add(a.slug);
    if (a.gameSlug && !gameSlugs.has(a.gameSlug)) throw new Error(`article references missing game: ${a.gameSlug}`);
  }
  return true;
}

export function buildRegistries(publicDir) {
  const gamesFile=path.join(publicDir,'data','games.json');
  const games=JSON.parse(fs.readFileSync(gamesFile,'utf8')).map(g=>({
    id:g.id ?? null,
    slug:g.slug,
    title:g.title ?? null,
    appid:g.appid ?? null,
    editorialStatus:g.editorialStatus ?? null,
    editorialLabel:g.editorialLabel ?? null,
    verifiedAt:g.verifiedAt ?? null,
    sourceNote:g.sourceNote ?? null
  }));
  const gameSlugs=games.map(g=>g.slug);
  const articleDir=path.join(publicDir,'articles');
  const articleFiles=fs.readdirSync(articleDir).filter(n=>n.endsWith('.html') && n!=='index.html').sort();
  const articles=[];
  const sources=[];
  for (const name of articleFiles) {
    const full=path.join(articleDir,name);
    const raw=fs.readFileSync(full,'utf8');
    const stem=name.replace(/\.html$/,'');
    const h1=raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const title=stripHtml(h1?.[1] ?? stem);
    const body=mainVisibleText(raw);
    const hrefs=[...raw.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi)].map(m=>m[1]);
    const uniqueSources=[...new Set(hrefs)];
    const gameSlug=inferGameSlug(stem,gameSlugs);
    const isDeep=raw.includes('v9-article-body') || raw.includes('v25-batch-deep');
    articles.push({
      slug:stem,
      path:`/articles/${name}`,
      title,
      gameSlug,
      depth:isDeep?'deep':'thin',
      visibleChars:body.length,
      indexing:getRobots(raw),
      sourceCount:uniqueSources.length,
      bodyHash:crypto.createHash('sha256').update(body).digest('hex')
    });
    for (const url of uniqueSources) sources.push({articleSlug:stem,url});
  }
  validateRegistryRecords(games,articles);
  return {games,articles,sources};
}
