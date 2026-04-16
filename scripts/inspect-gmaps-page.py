#!/usr/bin/env python3
"""
Diagnostic — fetch a single Google Maps place page and dump what keywords
are actually present, so we can design reliable closed-detection patterns.
"""
import asyncio, sys, re

async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    place_id = sys.argv[1] if len(sys.argv) > 1 else 'ChIJDYaxhK1d-IcR_NSvLnZQzZw'
    url = f'https://www.google.com/maps/place/?q=place_id:{place_id}'
    print(f'Fetching: {url}\n')

    config = BrowserConfig(
        headless=True,
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport_width=1280, viewport_height=900,
    )
    run_config = CrawlerRunConfig(page_timeout=30000, delay_before_return_html=3.0)

    async with AsyncWebCrawler(config=config) as crawler:
        result = await crawler.arun(url, config=run_config)

    md = result.markdown or ''
    html = result.html or ''
    blob = md + '\n' + html

    print(f'Markdown length: {len(md)}')
    print(f'HTML length: {len(html)}')
    print()

    # Check for key status-indicator phrases
    keywords = [
        'Permanently closed',
        'Temporarily closed',
        'closed_permanently',
        'CLOSED_PERMANENTLY',
        'CLOSED_TEMPORARILY',
        'not found',
        'Not found',
        'doesn\'t exist',
        "can't find",
        'Open now',
        'Closed now',
        'Closes',
        'Opens',
    ]
    print('Keyword presence:')
    for k in keywords:
        count = len(re.findall(re.escape(k), blob, flags=re.IGNORECASE))
        if count > 0:
            print(f'  "{k}": {count} match(es)')

    # Show ratings-like content
    print('\nRating/review patterns found:')
    rating_matches = re.findall(r'\b([1-5]\.\d)\s*\(\s*([\d,]+)\s*\)', blob)
    for r, rc in rating_matches[:5]:
        print(f'  rating={r} reviews={rc}')

    # Show first 2000 chars of markdown so we can see structure
    print('\nFirst 2000 chars of markdown:')
    print(md[:2000])

if __name__ == '__main__':
    asyncio.run(main())
