#!/usr/bin/env python3
"""Backfill google_place_id on approved listings via Crawl4AI Google Maps scrape (free).

Approach: for each listing missing place_id, fetch
  https://www.google.com/maps/search/?api=1&query={name}+{address}
Google Maps redirects/renders to a page whose embedded JSON contains the place_id
as `ChIJ...`. We scrape the rendered HTML with Crawl4AI (JS-enabled) and regex out
the place_id. Rate-limited to be polite.

Usage: python3 scripts/backfill-place-ids-crawl4ai.py [--limit N] [--dry-run]
"""
import asyncio, json, os, re, ssl, sys, datetime, urllib.request, urllib.parse
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

SUPABASE_URL='https://gteqijdpqjmgxfnyuhvy.supabase.co'
SB=[l.split("=",1)[1].strip() for l in open(".env.local") if l.startswith("SUPABASE_SERVICE_ROLE_KEY=")][0]
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE

LIMIT=0; DRY=False
for i,a in enumerate(sys.argv[1:],1):
    if a=='--limit' and i<len(sys.argv)-1: LIMIT=int(sys.argv[i+1])
    elif a.startswith('--limit='): LIMIT=int(a.split('=')[1])
    elif a=='--dry-run': DRY=True

def log(m): print(f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}',flush=True)

def sb_get(path):
    req=urllib.request.Request(f'{SUPABASE_URL}{path}', headers={'apikey':SB,'Authorization':f'Bearer {SB}'})
    return json.loads(urllib.request.urlopen(req,timeout=30,context=ctx).read())

def sb_patch(path,body):
    req=urllib.request.Request(f'{SUPABASE_URL}{path}', data=json.dumps(body).encode(),
        headers={'apikey':SB,'Authorization':f'Bearer {SB}','Content-Type':'application/json','Prefer':'return=minimal'}, method='PATCH')
    urllib.request.urlopen(req,timeout=30,context=ctx)

# place_id regex — Google uses ChIJ... base64-ish (27+ chars) but also 0x hex form in URL
PLACE_ID_RE = re.compile(r'(ChIJ[A-Za-z0-9_-]{20,60})')

async def extract_place_id(crawler, listing):
    name=listing.get('name','')
    addr=listing.get('address','')
    city=listing.get('city','')
    state=listing.get('state','')
    zipc=listing.get('zip','')
    q=' '.join(filter(None,[name,addr,city,state,zipc]))
    url=f'https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(q)}'
    try:
        r=await crawler.arun(url, config=CrawlerRunConfig(
            page_timeout=25000, delay_before_return_html=3.0,
            simulate_user=True, override_navigator=True, magic=True,
            cache_mode=CacheMode.BYPASS, verbose=False,
        ))
        if not r or not r.success: return None
        html=(r.html or '')+(r.markdown or '')
        m=PLACE_ID_RE.search(html)
        return m.group(1) if m else None
    except Exception as e:
        return None

async def main():
    log('='*60)
    log(f'BACKFILL google_place_id via Crawl4AI (free) dry={DRY} limit={LIMIT or "none"}')
    log('='*60)

    off=0; listings=[]
    while True:
        rows=sb_get(f'/rest/v1/listings?select=id,name,address,city,state,zip&is_touchless=eq.true&is_approved=eq.false&parent_chain=eq.BFS&google_place_id=is.null&limit=1000&offset={off}')
        if not rows: break
        listings.extend(rows)
        if len(rows)<1000: break
        off+=1000
    if LIMIT>0: listings=listings[:LIMIT]
    log(f'Target: {len(listings)}')

    browser_cfg=BrowserConfig(headless=True, java_script_enabled=True, ignore_https_errors=True, verbose=False)
    ok=0; miss=0
    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        sem=asyncio.Semaphore(3)

        async def process(l):
            nonlocal ok,miss
            async with sem:
                pid=await extract_place_id(crawler, l)
                if pid:
                    ok+=1
                    if not DRY:
                        try: sb_patch(f"/rest/v1/listings?id=eq.{l['id']}", {'google_place_id':pid})
                        except Exception as e: log(f"  patch fail {l['id'][:8]}: {e}")
                    if ok % 20 == 0:
                        log(f'  progress: ok={ok} miss={miss} / {len(listings)}')
                else:
                    miss+=1

        await asyncio.gather(*(process(l) for l in listings), return_exceptions=True)

    log('='*60)
    log(f'COMPLETE: found={ok} missed={miss} / {len(listings)}')

if __name__=='__main__':
    asyncio.run(main())
