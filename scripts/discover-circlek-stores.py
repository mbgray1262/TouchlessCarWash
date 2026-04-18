#!/usr/bin/env python3
"""
Circle K / Holiday Stationstores discovery via their stores_master.php API.

Circle K's internal locator at circlek.com/stores_master.php returns JSON of
stores near a given lat/lng. Paginated (10/page) with a distance cap. Holiday
Stationstores share this API since Circle K acquired Holiday.

Strategy:
  1. Scan a grid of lat/lng points across the continental US
  2. For each point, paginate to exhaustion (collect all results)
  3. Dedupe stores by cost_center (their internal ID)
  4. Filter for car wash (store object has 'carwash' or service flag)
  5. Output structured location data

Zero API cost — just HTTP.
"""
import json, sys, os, re, ssl, time, datetime
import urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

SSL_CTX = ssl.create_default_context(); SSL_CTX.check_hostname=False; SSL_CTX.verify_mode=ssl.CERT_NONE
SCRIPT_DIR = os.path.dirname(__file__)
OUT_FILE = os.path.join(SCRIPT_DIR, 'discovery-output', 'circlek-stores.json')

# US grid points — state capitals + major cities gives good coverage
# 50 state capitals + 50 secondary cities to make sure we don't miss rural areas
US_POINTS = [
    # Format: (lat, lng, label)
    # Northeast
    (42.36, -71.06, 'Boston'), (40.71, -74.01, 'NYC'), (40.44, -79.99, 'Pittsburgh'),
    (42.89, -78.88, 'Buffalo'), (42.65, -73.76, 'Albany'), (43.16, -77.61, 'Rochester'),
    (41.76, -72.67, 'Hartford'), (43.66, -70.25, 'Portland ME'),
    # Southeast
    (33.75, -84.39, 'Atlanta'), (25.76, -80.19, 'Miami'), (28.54, -81.38, 'Orlando'),
    (30.33, -81.66, 'Jacksonville'), (27.95, -82.46, 'Tampa'), (32.77, -79.93, 'Charleston'),
    (35.22, -80.84, 'Charlotte'), (35.78, -78.64, 'Raleigh'), (32.08, -81.09, 'Savannah'),
    (26.71, -80.05, 'WPB'), (30.45, -91.14, 'Baton Rouge'), (29.95, -90.07, 'New Orleans'),
    (33.52, -86.81, 'Birmingham'), (36.16, -86.78, 'Nashville'), (35.15, -90.05, 'Memphis'),
    # Midwest (heavy Holiday territory)
    (44.95, -93.10, 'St Paul'), (44.98, -93.26, 'Minneapolis'), (46.78, -92.10, 'Duluth'),
    (43.07, -89.40, 'Madison'), (43.04, -87.91, 'Milwaukee'), (44.52, -88.02, 'Green Bay'),
    (41.59, -93.62, 'Des Moines'), (41.65, -91.53, 'Iowa City'), (42.50, -96.40, 'Sioux City'),
    (41.26, -95.93, 'Omaha'), (39.76, -104.88, 'Denver'), (40.76, -111.89, 'Salt Lake City'),
    (41.62, -93.72, 'Des Moines 2'), (44.30, -93.27, 'Faribault MN'), (45.55, -94.15, 'St Cloud'),
    (45.77, -94.87, 'Rural MN'), (42.03, -93.62, 'Ames IA'), (43.64, -95.60, 'Rural IA-MN border'),
    (41.88, -87.62, 'Chicago'), (41.50, -81.69, 'Cleveland'), (39.96, -82.99, 'Columbus'),
    (39.10, -84.51, 'Cincinnati'), (42.33, -83.04, 'Detroit'), (42.96, -85.67, 'Grand Rapids'),
    (39.76, -86.15, 'Indianapolis'), (38.25, -85.75, 'Louisville'), (39.09, -94.57, 'KC'),
    (38.62, -90.19, 'St Louis'),
    # South Central
    (32.77, -96.79, 'Dallas'), (29.76, -95.36, 'Houston'), (29.42, -98.49, 'San Antonio'),
    (30.26, -97.74, 'Austin'), (35.22, -97.44, 'Norman OK'), (35.46, -97.51, 'OKC'),
    (36.15, -95.99, 'Tulsa'), (32.74, -97.32, 'Ft Worth'), (34.74, -92.33, 'Little Rock'),
    # West
    (33.44, -112.07, 'Phoenix'), (36.17, -115.14, 'Las Vegas'), (34.05, -118.24, 'LA'),
    (32.71, -117.16, 'San Diego'), (37.77, -122.42, 'SF'), (37.34, -121.89, 'San Jose'),
    (38.58, -121.49, 'Sacramento'), (45.52, -122.68, 'Portland OR'), (47.60, -122.33, 'Seattle'),
    (47.66, -117.43, 'Spokane'), (43.62, -116.20, 'Boise'), (39.53, -119.81, 'Reno'),
    (35.08, -106.65, 'Albuquerque'), (35.69, -105.94, 'Santa Fe'), (32.22, -110.93, 'Tucson'),
    # Rural gaps
    (46.05, -118.34, 'Walla Walla'), (42.82, -108.73, 'Wyoming'), (44.77, -106.96, 'Sheridan WY'),
    (41.08, -81.51, 'Akron'), (43.04, -76.14, 'Syracuse'), (42.10, -75.92, 'Binghamton'),
    (34.00, -81.03, 'Columbia SC'), (33.74, -84.39, 'Atl 2'), (32.84, -83.63, 'Macon'),
    # More midwest rural (Circle K/Holiday dense here)
    (44.44, -96.61, 'Brookings SD'), (42.09, -97.42, 'Norfolk NE'), (43.54, -96.72, 'Sioux Falls'),
    (47.92, -97.03, 'Grand Forks'), (46.87, -96.79, 'Fargo'), (43.54, -95.78, 'Worthington MN'),
]


def log(m): print(f'[{datetime.datetime.now().strftime("%H:%M:%S")}] {m}', flush=True)


def fetch_page(lat, lng, distance, page):
    """Fetch one page of stores near lat/lng."""
    params = urllib.parse.urlencode({
        'lat': lat, 'lng': lng, 'distance': distance, 'lang': 'en', 'page': page,
    })
    url = f'https://www.circlek.com/stores_master.php?{params}'
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.circlek.com/store-locator',
        'Accept': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
            return json.loads(r.read())
    except Exception as e:
        return {'error': str(e)[:100]}


def fetch_all_from_point(lat, lng, label):
    """Paginate through all pages for a grid point."""
    stores = {}
    for page in range(1, 50):  # safety cap
        d = fetch_page(lat, lng, 500, page)
        if 'error' in d: break
        page_stores = d.get('stores') or {}
        if not page_stores: break
        for sid, s in page_stores.items():
            stores[sid] = s
        # Stop if count < 10 (no more pages)
        if d.get('count', 0) < 10: break
        time.sleep(0.2)  # polite
    return stores


def main():
    all_stores = {}
    log(f'Scanning {len(US_POINTS)} US grid points in parallel...')

    def scan_one(pt):
        lat, lng, label = pt
        stores = fetch_all_from_point(lat, lng, label)
        return label, stores

    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(scan_one, pt): pt for pt in US_POINTS}
        for fut in as_completed(futures):
            label, stores = fut.result()
            before = len(all_stores)
            all_stores.update(stores)
            after = len(all_stores)
            log(f'  {label}: found {len(stores)} stores, {after-before} new ({after} total unique)')

    log(f'\nTotal unique stores: {len(all_stores)}')

    # Save raw
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w') as f:
        json.dump(all_stores, f, indent=2)
    log(f'Saved raw data to {OUT_FILE}')

    # Check sample structure
    sample = list(all_stores.values())[0] if all_stores else {}
    log(f'\nSample store keys: {list(sample.keys())[:20]}')

    # Find car wash indicator
    cw_field_candidates = ['carwash', 'car_wash', 'services', 'amenities', 'features']
    cw_count = 0
    for s in all_stores.values():
        if 'carwash' in str(s).lower():
            # Check specific fields
            for k in cw_field_candidates:
                v = s.get(k)
                if v and 'carwash' in str(v).lower():
                    cw_count += 1
                    break
            else:
                if 'carwash' in str(s).lower(): cw_count += 1
    log(f'Stores mentioning "carwash": {cw_count}')

    # Show first store details
    log(f'\nSample store JSON:')
    log(json.dumps(sample, indent=2)[:1500])


if __name__ == '__main__':
    main()
