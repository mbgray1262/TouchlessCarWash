#!/usr/bin/env python3
"""
Scrape per-location addresses for ScrubaDub, Brown Bear, and Elephant.
Each chain needs a different approach:
  - ScrubaDub: stores-sitemap.xml has 24 /locations/{slug}/ URLs → fetch each
  - Brown Bear: wp-sitemap-posts-wash-1.xml has 51 /wash/{slug}/ URLs → fetch each
  - Elephant: /our-arizona-wash-locations + /our-washington-wash-locations
    have inline addresses → parse directly
"""
import asyncio, re, json, os, datetime

LOG = 'scripts/scrape-chain-locations-multi.log'


def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG, 'a') as f:
        f.write(line + '\n')


ADDR_RE = re.compile(r'(\d{1,5}(?:-\d{1,5})?\s+(?:[NSEW]\.?\s+)?(?:[\w\.\']+\s+){1,5}(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Way|Hwy|Highway|Pkwy|Parkway|Ln|Lane|Ct|Court|Pl|Place|Cir|Circle|Route|Rte|Loop|Trail|Tr)\b)')
CITY_STATE_ZIP_RE = re.compile(r'([A-Za-z][\w\s\.\'-]+?),\s+([A-Z]{2})\s+(\d{5})')


def parse_address_from_md(md):
    """Find first street address + city/state/zip block."""
    am = ADDR_RE.search(md)
    cm = CITY_STATE_ZIP_RE.search(md)
    if am and cm:
        addr_pos = md.find(am.group(1))
        csz_pos = cm.start()
        if addr_pos >= 0 and abs(csz_pos - addr_pos) < 250:
            return {
                'street': am.group(1).strip().replace('\xa0', ' '),
                'city': cm.group(1).strip(),
                'state': cm.group(2),
                'zip': cm.group(3),
            }
    return None


def normalize_key(street):
    """Extract (number, keyword) for matching."""
    parts = street.split()
    num = parts[0] if parts else ''
    rest = [p for p in parts[1:] if p not in ('N.', 'S.', 'E.', 'W.', 'N', 'S', 'E', 'W')]
    key = (rest[0] if rest else '').lower().replace('.', '').replace(',', '')
    return num, key


async def scrape_brown_bear(crawler, run_config):
    log('=== Brown Bear ===')
    r = await crawler.arun('https://brownbear.com/wp-sitemap-posts-wash-1.xml', config=run_config)
    urls = sorted(set(re.findall(r'https://brownbear\.com/wash/[a-z0-9-]+/?', r.markdown or '')))
    log(f'  {len(urls)} wash URLs from sitemap')
    out = []
    for i, url in enumerate(urls):
        try:
            r = await crawler.arun(url, config=run_config)
            loc = parse_address_from_md(r.markdown or '')
            if loc:
                loc['url'] = url
                loc['num'], loc['key'] = normalize_key(loc['street'])
                out.append(loc)
                if (i + 1) % 10 == 0 or i < 3:
                    log(f'  [{i+1}/{len(urls)}] ✅ {loc["street"]} / {loc["city"]}, {loc["state"]}')
        except Exception:
            pass
    with open('scripts/discovery-output/brown-bear-locations.json', 'w') as f:
        json.dump(out, f, indent=2)
    log(f'  Extracted {len(out)} of {len(urls)}. Saved to brown-bear-locations.json')


async def scrape_scrubadub(crawler, run_config):
    log('=== ScrubaDub ===')
    r = await crawler.arun('https://www.scrubadub.com/stores-sitemap.xml', config=run_config)
    urls = sorted(set(re.findall(r'https://www\.scrubadub\.com/locations/[a-z0-9-]+/?', r.markdown or '')))
    log(f'  {len(urls)} locations from sitemap')
    out = []
    for i, url in enumerate(urls):
        try:
            r = await crawler.arun(url, config=run_config)
            loc = parse_address_from_md(r.markdown or '')
            if loc:
                loc['url'] = url
                loc['num'], loc['key'] = normalize_key(loc['street'])
                out.append(loc)
                if (i + 1) % 5 == 0 or i < 3:
                    log(f'  [{i+1}/{len(urls)}] ✅ {loc["street"]} / {loc["city"]}, {loc["state"]}')
        except Exception:
            pass
    with open('scripts/discovery-output/scrubadub-locations.json', 'w') as f:
        json.dump(out, f, indent=2)
    log(f'  Extracted {len(out)} of {len(urls)}. Saved to scrubadub-locations.json')


async def scrape_elephant(crawler, run_config):
    log('=== Elephant Car Wash ===')
    # State hub pages list addresses inline
    out = []
    for state_url in ['https://www.elephantcarwash.com/our-arizona-wash-locations',
                       'https://www.elephantcarwash.com/our-washington-wash-locations']:
        r = await crawler.arun(state_url, config=run_config)
        md = r.markdown or ''
        # Each location on these pages has: address + city/state/zip in sequence
        # Use a greedier pattern that captures multiple per page
        for m in re.finditer(r'(\d{1,5}\s+(?:[NSEW]\.?\s+)?(?:[\w\.\']+\s+){1,5}(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Way|Hwy|Highway|Pkwy|Parkway|Ln|Lane|Ct|Court|Pl|Place)\b).*?([A-Za-z][\w\s\.\'-]+?),\s+([A-Z]{2})\s+(\d{5})',
                             md, re.DOTALL):
            # Don't let the .*? run too long
            if m.end(1) >= m.start(2) - 200:  # address to city must be nearby
                out.append({
                    'street': m.group(1).strip().replace('\xa0', ' '),
                    'city': m.group(2).strip(),
                    'state': m.group(3),
                    'zip': m.group(4),
                    'url': state_url,
                })
    # Dedupe
    seen = set()
    uniq = []
    for loc in out:
        key = f"{loc['state']}|{loc['city'].lower()}|{loc['street'].lower().replace(' ', '')}"
        if key in seen: continue
        seen.add(key)
        loc['num'], loc['key'] = normalize_key(loc['street'])
        uniq.append(loc)
    with open('scripts/discovery-output/elephant-locations.json', 'w') as f:
        json.dump(uniq, f, indent=2)
    log(f'  Extracted {len(uniq)} unique locations. Saved to elephant-locations.json')


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    config = BrowserConfig(headless=True, viewport_width=1280, viewport_height=900,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=2.0)
    os.makedirs('scripts/discovery-output', exist_ok=True)
    async with AsyncWebCrawler(config=config) as crawler:
        await scrape_elephant(crawler, run_config)
        await scrape_scrubadub(crawler, run_config)
        await scrape_brown_bear(crawler, run_config)


if __name__ == '__main__':
    asyncio.run(main())
