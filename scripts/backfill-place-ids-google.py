#!/usr/bin/env python3
"""Backfill google_place_id via Google Places API 'Find Place From Text'.

Cost: $0.017 per Find Place request. 1,074 listings = ~$18.26.
Google Maps Platform gives $200/month free credits — this job stays
WELL under that, so effective cost is $0 on a fresh account.

Usage: GOOGLE_MAPS_API_KEY=xxx python3 scripts/backfill-place-ids-google.py [--limit N] [--dry-run]
"""
import os, json, ssl, sys, time, datetime, urllib.request, urllib.parse

SUPABASE_URL='https://gteqijdpqjmgxfnyuhvy.supabase.co'
SB='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE

# Load key from env var or .env.local
GKEY=os.environ.get('GOOGLE_MAPS_API_KEY')
if not GKEY:
    try:
        for line in open('/Users/michaelgray/Projects/TouchlessCarWash/.env.local'):
            if line.startswith('GOOGLE_MAPS_API_KEY='):
                GKEY=line.split('=',1)[1].strip().strip('"')
                break
    except: pass
if not GKEY:
    print('ERROR: Set GOOGLE_MAPS_API_KEY env var or add to .env.local'); sys.exit(1)

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

def find_place(listing):
    name=listing.get('name','')
    addr=listing.get('address','')
    city=listing.get('city','')
    state=listing.get('state','')
    input_text=' '.join(filter(None,[name,addr,city,state])).strip()
    if not input_text: return None,'no_input'
    params={
        'input':input_text,
        'inputtype':'textquery',
        'fields':'place_id,name,formatted_address',
        'key':GKEY,
    }
    lat=listing.get('latitude'); lng=listing.get('longitude')
    if lat and lng:
        # Bias by a 5km circle around our stored coordinates
        params['locationbias']=f'circle:5000@{lat},{lng}'
    url=f'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?{urllib.parse.urlencode(params)}'
    try:
        r=urllib.request.urlopen(url,timeout=30,context=ctx)
        data=json.loads(r.read())
        status=data.get('status','')
        if status=='OK' and data.get('candidates'):
            return data['candidates'][0]['place_id'], 'ok'
        if status=='ZERO_RESULTS': return None,'zero_results'
        if status=='REQUEST_DENIED': return None, f'denied: {data.get("error_message","")}'
        if status=='OVER_QUERY_LIMIT': return None, 'over_limit'
        return None, status
    except Exception as e:
        return None, f'err:{type(e).__name__}'

def main():
    log('='*60)
    log(f'BACKFILL google_place_id via Google Places Find Place')
    log(f'dry={DRY} limit={LIMIT or "none"}')
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
    log(f'Est paid cost (before $200/mo free tier): ${len(listings)*0.017:.2f}')

    ok=0; miss=0; reasons={}
    for i,l in enumerate(listings):
        pid,reason=find_place(l)
        if pid:
            ok+=1
            if not DRY:
                try: sb_patch(f"/rest/v1/listings?id=eq.{l['id']}", {'google_place_id':pid})
                except Exception as e: log(f"  patch fail {l['id'][:8]}: {e}")
        else:
            miss+=1
            reasons[reason]=reasons.get(reason,0)+1
            # Bail early on fatal errors
            if reason and ('denied' in reason or reason=='over_limit'):
                log(f'  FATAL: {reason} — aborting'); break
        if (i+1)%25==0 or (i+1)==len(listings):
            log(f'  {i+1}/{len(listings)}  ok={ok} miss={miss}')

    log('='*60)
    log(f'COMPLETE: found={ok} missed={miss} / processed={ok+miss}')
    if reasons: log(f'Miss reasons: {reasons}')

if __name__=='__main__':
    main()
