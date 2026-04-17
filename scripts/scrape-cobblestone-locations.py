#!/usr/bin/env python3
"""
Scrape each of Cobblestone's 112 location URLs (from their sitemap.xml)
and extract address + city + state. Produces a JSON authoritative list
for chain reconciliation.
"""
import asyncio, re, json, os, datetime

LOG = 'scripts/scrape-cobblestone-locations.log'


def log(msg):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG, 'a') as f:
        f.write(line + '\n')


# Address pattern — street number + words + suffix
ADDR_RE = re.compile(r'(\d{1,5}(?:-\d{1,5})?\s+(?:[NSEW]\.?\s+)?(?:[\w\.\']+\s+){1,5}(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Way|Hwy|Highway|Pkwy|Parkway|Ln|Lane|Ct|Court|Pl|Place|Cir|Circle|Loop|Trail|Tr|Route|Rte)\b)')
CITY_STATE_ZIP = re.compile(r',\s*([A-Za-z][\w\s\.\']+?),\s+([A-Z]{2})\s+(\d{5})')


async def get_location_urls(crawler, run_config):
    """Fetch the sitemap and extract all /location/ URLs."""
    r = await crawler.arun('https://cobblestone.com/sitemap.xml', config=run_config)
    html = r.html or ''
    urls = re.findall(r'https?://cobblestone\.com/location/[^\s<>\"]+', html)
    # Dedupe preserving order
    seen = set()
    unique = []
    for u in urls:
        u = u.rstrip('/')
        if u not in seen:
            seen.add(u)
            unique.append(u)
    return unique


async def extract_address(crawler, url, run_config):
    """Fetch a single location page and extract the address."""
    try:
        r = await crawler.arun(url, config=run_config)
        md = r.markdown or ''
        # Find address then city/state/zip
        am = ADDR_RE.search(md)
        cm = CITY_STATE_ZIP.search(md)
        if am and cm:
            street = am.group(1).strip().replace('\xa0', ' ')
            # Only accept if city/state/zip appears within 200 chars of the street
            street_pos = md.find(street)
            csz_pos = cm.start()
            if street_pos >= 0 and abs(csz_pos - street_pos) < 250:
                city = cm.group(1).strip()
                state = cm.group(2)
                zip_ = cm.group(3)
                return {'street': street, 'city': city, 'state': state, 'zip': zip_, 'url': url}
        return None
    except Exception as e:
        return None


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    config = BrowserConfig(headless=True, viewport_width=1280, viewport_height=900,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=2.0)

    log('Fetching sitemap...')
    async with AsyncWebCrawler(config=config) as crawler:
        urls = await get_location_urls(crawler, run_config)
        log(f'  {len(urls)} unique location URLs')

        results = []
        for i, u in enumerate(urls):
            data = await extract_address(crawler, u, run_config)
            if data:
                # Also compute num + key for later matching
                data['num'] = data['street'].split()[0]
                rest = data['street'].split()[1:]
                # Skip directional prefix
                key_parts = [p for p in rest if p not in ('N.', 'S.', 'E.', 'W.', 'N', 'S', 'E', 'W')]
                data['key'] = (key_parts[0] if key_parts else '').lower().replace('.', '')
                results.append(data)
                if (i + 1) % 10 == 0 or i < 5:
                    log(f'  [{i+1}/{len(urls)}] ✅ {data["street"]} / {data["city"]}, {data["state"]}')
            else:
                if (i + 1) % 10 == 0:
                    log(f'  [{i+1}/{len(urls)}] ⚠️  {u} — no address extracted')

    os.makedirs('scripts/discovery-output', exist_ok=True)
    with open('scripts/discovery-output/cobblestone-locations.json', 'w') as f:
        json.dump(results, f, indent=2)
    log(f'\nExtracted {len(results)} of {len(urls)} addresses')
    log(f'Saved to scripts/discovery-output/cobblestone-locations.json')


if __name__ == '__main__':
    asyncio.run(main())
