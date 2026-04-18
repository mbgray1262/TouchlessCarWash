#!/usr/bin/env python3
"""Backfill missing latitude/longitude on approved listings via OpenStreetMap Nominatim (free, 1 req/sec)."""
import urllib.request, json, ssl, time, sys, datetime

SUPABASE_URL='https://gteqijdpqjmgxfnyuhvy.supabase.co'
SB='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA='touchlesscarwashfinder.com geocoder (michaelbgray123@gmail.com)'

def log(m): print(f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}',flush=True)

def geocode(addr, city, state, zipc):
    q=f"{addr or ''}, {city or ''}, {state or ''} {zipc or ''}".strip(' ,')
    url=f'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q={urllib.parse.quote(q)}'
    req=urllib.request.Request(url, headers={'User-Agent':UA})
    try:
        r=json.loads(urllib.request.urlopen(req, timeout=15, context=ctx).read())
        if r: return float(r[0]['lat']), float(r[0]['lon'])
    except Exception as e: log(f'  geocode err: {e}')
    return None, None

def main():
    import urllib.parse
    off=0; listings=[]
    while True:
        req=urllib.request.Request(f'{SUPABASE_URL}/rest/v1/listings?select=id,name,address,city,state,zip&is_touchless=eq.true&is_approved=eq.true&latitude=is.null&limit=1000&offset={off}',
            headers={'apikey':SB,'Authorization':f'Bearer {SB}'})
        rows=json.loads(urllib.request.urlopen(req,context=ctx).read())
        if not rows: break
        listings.extend(rows)
        if len(rows)<1000: break
        off+=1000
    log(f'{len(listings)} listings need geocoding')
    ok=0; miss=0
    for i,l in enumerate(listings):
        lat,lng=geocode(l.get('address'), l.get('city'), l.get('state'), l.get('zip'))
        if lat and lng:
            body={'latitude':lat,'longitude':lng}
            req=urllib.request.Request(f"{SUPABASE_URL}/rest/v1/listings?id=eq.{l['id']}", data=json.dumps(body).encode(),
                headers={'apikey':SB,'Authorization':f'Bearer {SB}','Content-Type':'application/json','Prefer':'return=minimal'}, method='PATCH')
            try: urllib.request.urlopen(req,context=ctx); ok+=1
            except Exception as e: log(f"  patch fail {l['id'][:8]}: {e}")
        else: miss+=1
        if (i+1)%25==0: log(f'  {i+1}/{len(listings)}  ok={ok} miss={miss}')
        time.sleep(1.1)  # Nominatim rate limit: 1 req/sec
    log(f'DONE: geocoded={ok} missed={miss}')

if __name__=='__main__':
    import urllib.parse
    main()
