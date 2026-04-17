#!/usr/bin/env python3
"""
Scrape each chain's locations page and extract addresses.
Saves raw output so we can hand-curate CHAIN_DATA.
"""
import asyncio, re, json, os, sys

CHAINS = {
    'brown-bear':       'https://www.brownbear.com/locations/',
    'elephant':         'https://elephantcarwash.com/locations/',
    'scrubadub':        'https://scrubadub.com/locations/',
    'prestige':         'https://www.prestigewash.com/locations/',
    'super-wash':       'https://www.superwash.com/locations/',
    'cobblestone':      'https://cobblestone.com/locations/',
    'drive-and-shine':  'https://driveandshine.com/locations/',
    'hoffman':          'https://www.hoffmancarwash.com/locations/',
    'grease-monkey':    'https://greasemonkeyauto.com/locations/',
}

ADDR_RE = re.compile(r'(\d{1,5}(?:-\d{1,5})?\s+(?:[NSEW]\.?\s+)?(?:[A-Z][\w\.\'-]*\s+){1,5}(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Way|Hwy|Highway|Pkwy|Parkway|Ln|Lane|Ct|Court|Pl|Place|Trail|Tr|Cir|Circle|Route|Rte))', re.MULTILINE)
STATE_ZIP_RE = re.compile(r',\s*([A-Z]{2})\s+\d{5}')


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    config = BrowserConfig(headless=True, viewport_width=1280, viewport_height=900,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=4.0)

    out = {}
    async with AsyncWebCrawler(config=config) as crawler:
        for slug, url in CHAINS.items():
            try:
                r = await crawler.arun(url, config=run_config)
                md = r.markdown or ''
                # Write raw markdown for later inspection
                fname = f'scripts/discovery-output/chain-scrape-{slug}.md'
                os.makedirs(os.path.dirname(fname), exist_ok=True)
                with open(fname, 'w') as f:
                    f.write(md)
                addrs = ADDR_RE.findall(md)
                states = STATE_ZIP_RE.findall(md)
                out[slug] = {'url': url, 'md_length': len(md), 'addresses_found': len(addrs), 'state_zip_pairs': len(states), 'sample_addrs': addrs[:5]}
                print(f'{slug}: len={len(md)}, addrs={len(addrs)}, states={len(states)}, sample={addrs[:3]}')
            except Exception as e:
                print(f'{slug}: ERROR {str(e)[:100]}')
                out[slug] = {'url': url, 'error': str(e)[:200]}

    with open('scripts/discovery-output/chain-scrape-summary.json', 'w') as f:
        json.dump(out, f, indent=2)
    print('\nSaved summaries. Raw markdowns in scripts/discovery-output/chain-scrape-*.md')


if __name__ == '__main__':
    asyncio.run(main())
