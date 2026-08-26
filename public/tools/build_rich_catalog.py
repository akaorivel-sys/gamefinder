#!/usr/bin/env python3
"""
GameFinder v17 rich catalog builder.

Supported inputs:
  --steam-dataset CSV
      Steam Dataset 2025 core CSV style, with columns such as:
      app_id,name,release_date,is_free,price_usd,supports_windows,
      supports_mac,supports_linux,primary_genre,multiplayer,
      metacritic_score,positive_reviews,negative_reviews,min_ram_mb,rec_ram_mb

  --steamspy-dir DIR
      Directory containing SteamSpy `request=all&page=N` JSON files.
      SteamSpy all responses can include developer/publisher/positive/negative,
      owners/playtime/price/languages/genre/tags.

The script merges by appid. It never fabricates missing fields.
"""
from __future__ import annotations
import argparse, csv, json, re
from pathlib import Path

RESTRICTED = [
    "hentai","porn","porno","erotic","erotica","nsfw","sex simulator","sex game",
    "adult only","18+","xxx","casino","roulette","blackjack","poker","slot machine",
    "slots casino","sports betting","betting","gambling"
]

def safe_title(name: str) -> bool:
    t=(name or "").lower()
    return not any(x in t for x in RESTRICTED)

def nint(x):
    try: return int(float(str(x).strip()))
    except: return None

def nfloat(x):
    try: return float(str(x).strip())
    except: return None

def split_list(x):
    if x is None: return None
    if isinstance(x,list): return [str(v).strip() for v in x if str(v).strip()]
    if isinstance(x,dict): return [str(k).strip() for k in x.keys() if str(k).strip()]
    s=str(x).strip()
    if not s: return None
    return [v.strip() for v in re.split(r"[;,]",s) if v.strip()]

def completeness(g):
    keys=["appid","name","developer","publisher","genres","tags","languages",
          "price_cents","positive","negative","owners","average_forever_min",
          "platform_windows","release_date"]
    good=sum(g.get(k) not in (None,"",[],{}) for k in keys)
    return round(good/len(keys)*100)

def load_seed(path):
    arr=json.loads(Path(path).read_text(encoding="utf-8"))
    return {int(x["appid"]):dict(x) for x in arr if x.get("appid")}

def merge_csv(db,path):
    with open(path,encoding="utf-8-sig",newline="") as f:
        for r in csv.DictReader(f):
            app=nint(r.get("app_id") or r.get("appid") or r.get("AppID"))
            name=(r.get("name") or r.get("Name") or "").strip()
            if not app or not name or not safe_title(name): continue
            g=db.setdefault(app,{"appid":app,"name":name})
            g["name"]=name
            g["release_date"]=r.get("release_date") or r.get("Release date") or g.get("release_date")
            genre=r.get("primary_genre") or r.get("genres") or r.get("Genres")
            if genre: g["genres"]=split_list(genre)
            g["developer"]=r.get("developer") or r.get("Developer") or g.get("developer")
            g["publisher"]=r.get("publisher") or r.get("Publisher") or g.get("publisher")
            free=(r.get("is_free") or "").strip().lower()
            if free in {"true","false","1","0"}: g["is_free"]=free in {"true","1"}
            price=nfloat(r.get("price_usd") or r.get("Price"))
            if price is not None: g["price_cents"]=round(price*100)
            for src,dst in [
                ("positive_reviews","positive"),("negative_reviews","negative"),
                ("metacritic_score","metacritic")
            ]:
                v=nint(r.get(src))
                if v is not None: g[dst]=v
            for src,dst in [
                ("supports_windows","platform_windows"),("supports_mac","platform_mac"),
                ("supports_linux","platform_linux")
            ]:
                v=(r.get(src) or "").strip().lower()
                if v in {"true","false","1","0"}: g[dst]=v in {"true","1"}
            mp=(r.get("multiplayer") or "").strip()
            if mp: g["multiplayer"]=mp
            if g.get("positive") is not None and g.get("negative") is not None:
                den=g["positive"]+g["negative"]
                if den: g["review_score"]=round(g["positive"]/den,4)
            g["metadata_source"]="Steam Dataset bulk CSV"
            g["metadata_checked"]="dataset snapshot"

def merge_steamspy(db,folder):
    for p in sorted(Path(folder).glob("*.json")):
        try: obj=json.loads(p.read_text(encoding="utf-8"))
        except: continue
        items=obj.values() if isinstance(obj,dict) else obj
        for r in items:
            if not isinstance(r,dict): continue
            app=nint(r.get("appid")); name=str(r.get("name") or "").strip()
            if not app or not name or not safe_title(name): continue
            g=db.setdefault(app,{"appid":app,"name":name})
            for src,dst in [
                ("developer","developer"),("publisher","publisher"),("owners","owners"),
                ("average_forever","average_forever_min"),("median_forever","median_forever_min"),
                ("ccu","ccu"),("positive","positive"),("negative","negative")
            ]:
                v=r.get(src)
                if v not in (None,""): g[dst]=nint(v) if src in {"average_forever","median_forever","ccu","positive","negative"} else v
            if r.get("genre"): g["genres"]=split_list(r.get("genre"))
            if r.get("languages"): g["languages"]=split_list(r.get("languages"))
            if r.get("tags"): g["tags"]=split_list(r.get("tags"))
            if g.get("languages"):
                langs={x.lower() for x in g["languages"]}
                g["japanese"]="japanese" in langs
            for src,dst in [("price","price_cents"),("initialprice","initial_price_cents"),("discount","discount_pct")]:
                v=nint(r.get(src))
                if v is not None: g[dst]=v
            if g.get("positive") is not None and g.get("negative") is not None:
                den=g["positive"]+g["negative"]
                if den: g["review_score"]=round(g["positive"]/den,4)
            g["metadata_source"]="SteamSpy bulk snapshot"
            g["metadata_checked"]="SteamSpy snapshot"

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--seed",required=True)
    ap.add_argument("--steam-dataset")
    ap.add_argument("--steamspy-dir")
    ap.add_argument("--out",required=True)
    ap.add_argument("--limit",type=int,default=10000)
    args=ap.parse_args()
    db=load_seed(args.seed)
    if args.steam_dataset: merge_csv(db,args.steam_dataset)
    if args.steamspy_dir: merge_steamspy(db,args.steamspy_dir)
    rows=[]
    for app,g in db.items():
        if not safe_title(g.get("name","")): continue
        g["metadata_completeness"]=completeness(g)
        g.setdefault("metadata_level","rich-core")
        g.setdefault("image",f"https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{app}/header.jpg")
        g.setdefault("official_store_url",f"https://store.steampowered.com/app/{app}/")
        rows.append(g)
    rows.sort(key=lambda x:(x.get("metadata_completeness",0), x.get("positive",0) or 0),reverse=True)
    rows=rows[:args.limit]
    Path(args.out).write_text(json.dumps(rows,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("rows",len(rows),"min completeness",min((x["metadata_completeness"] for x in rows),default=0))

if __name__=="__main__":
    main()
