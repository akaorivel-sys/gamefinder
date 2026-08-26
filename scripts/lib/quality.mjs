export function validateDeepArticleRecord(article) {
  if (article.depth==='deep' && Number(article.visibleChars)<8000) {
    throw new Error(`deep article must be at least 8000 visible chars: ${article.path}`);
  }
  return true;
}

export function detectExactDuplicateBodies(articles) {
  const first=new Map();
  const dup=[];
  for (const a of articles) {
    if (!a.bodyHash) continue;
    if (first.has(a.bodyHash)) dup.push([first.get(a.bodyHash),a.path]);
    else first.set(a.bodyHash,a.path);
  }
  return dup;
}
