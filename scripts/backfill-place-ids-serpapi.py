#!/usr/bin/env python3
"""Backfill google_place_id via SerpAPI Google Maps engine.

Cost: ~$0.0075 per search on paid SerpAPI plans. 1,074 listings = ~$8.
Uses listing name + full address; biases search by lat/lng when available
so SerpAPI returns the closest match (not a same-named business elsewhere).

Usage: python3 scripts/backfill-place-ids-serpapi.py [--limit N] [--dry-run]
"""
import os, json, ssl, sys, time, datetime, urllib.request, urllib.parse

SUPABASE_URL='https://gteqijdpqjmgxfnyuhvy.supabase.co'
SB='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE

# Load SerpAPI key from env file
SERPAPI_KEY=None
for line in open(os.path.expanduser('/Users/michaelgray/Projects/TouchlessCarWash/.env.local')):
    if line.startswith('SERPAPI_KEY='):
        SERPAPI_KEY=line.split('=',1)[1].strip().strip('"')
        break
if not SERPAPI_KEY:
    print('ERROR: SERPAPI_KEY not found in .env.local'); sys.exit(1)

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

def serpapi_find(listing):
    name=listing.get('name','')
    addr=listing.get('address','')
    city=listing.get('city','')
    state=listing.get('state','')
    q=' '.join(filter(None,[name,addr,city,state]))
    params={
        'engine':'google_maps',
        'q':q,
        'type':'search',
        'api_key':SERPAPI_KEY,
    }
    # Bias by lat/lng when available — ll takes "@LAT,LNG,14z" format
    lat=listing.get('latitude'); lng=listing.get('longitude')
    if lat and lng:
        params['ll']=f'@{lat},{lng},14z'
    url=f'https://serpapi.com/search.json?{urllib.parse.urlencode(params)}'
    try:
        r=urllib.request.urlopen(url,timeout=30,context=ctx)
        data=json.loads(r.read())
        # Place result (exact match) or first local result
        if 'place_results' in data and data['place_results'].get('place_id'):
            return data['place_results']['place_id'], 'place_results'
        for lr in data.get('local_results',[]) or []:
            if lr.get('place_id'): return lr['place_id'], 'local_results'
        return None, None
    except Exception as e:
        return None, f'err:{e}'

def main():
    log('='*60)
    log(f'BACKFILL google_place_id via SerpAPI dry={DRY} limit={LIMIT or "none"}')
    log('='*60)

    off=0; listings=[]
    while True:
        rows=sb_get(f'/rest/v1/listings?select=id,name,address,city,state,zip,latitude,longitude&is_touchless=eq.true&is_approved=eq.true&google_place_id=is.null&limit=1000&offset={off}')
        if not rows: break
        listings.extend(rows)
        if len(rows)<1000: break
        off+=1000
    if LIMIT>0: listings=listings[:LIMIT]
    log(f'Target: {len(listings)}')
    log(f'Est cost on pay-as-you-go (~$0.0075 ea): ${len(listings)*0.0075:.2f}')

    ok=0; miss=0; sources={}
    for i,l in enumerate(listings):
        pid,src=serpapi_find(l)
        if pid:
            ok+=1
            sources[src]=sources.get(src,0)+1
            if not DRY:
                try: sb_patch(f"/rest/v1/listings?id=eq.{l['id']}", {'google_place_id':pid})
                except Exception as e: log(f"  patch fail {l['id'][:8]}: {e}")
        else:
            miss+=1
        if (i+1)%25==0 or (i+1)==len(listings):
            log(f'  {i+1}/{len(listings)}  ok={ok} miss={miss}  sources={sources}')
        time.sleep(0.1)  # be polite

    log('='*60)
    log(f'COMPLETE: found={ok} missed={miss} / {len(listings)}')
    log(f'Sources: {sources}')

if __name__=='__main__':
    main()
