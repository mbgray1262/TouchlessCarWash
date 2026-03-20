#!/usr/bin/env python3
"""Local photo discovery server using Crawl4AI + Bing Image Search (100% free)."""
import asyncio
import json
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote, unquote
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

LOGO_KEYWORDS = ['logo', 'icon', 'favicon', 'badge', 'coupon', 'banner', 'sprite', 'button', 'avatar']
LOGO_EXTENSIONS = ['.svg', '.gif', '.ico']
SKIP_DOMAINS = ['gstatic.com', 'google.com', 'googleapis.com', 'bing.com', 'bing.net']


def is_good_photo(url):
    """Filter out logos, icons, tiny images."""
    lower = url.lower()
    if any(lower.endswith(ext) for ext in LOGO_EXTENSIONS):
        return False
    if any(kw in lower for kw in LOGO_KEYWORDS):
        return False
    if any(d in lower for d in SKIP_DOMAINS):
        return False
    return True


async def search_bing_images(name, city, state, address=None):
    """Search Bing Images for car wash photos (free, no API key needed)."""
    config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig(page_timeout=15000)

    # Build search query with address for specificity
    if address:
        query = quote(f'{name} "{address}" car wash')
    else:
        query = quote(f'{name} {city} {state} car wash')

    async with AsyncWebCrawler(config=config) as crawler:
        url = f'https://www.bing.com/images/search?q={query}&first=1'
        result = await crawler.arun(url=url, config=run_config)
        html = result.html or ''

        # Extract full-res media URLs from Bing's data attributes
        media_urls = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', html)

        photos = []
        seen = set()
        for raw_url in media_urls:
            decoded = unquote(raw_url)
            if decoded in seen:
                continue
            if not is_good_photo(decoded):
                continue
            seen.add(decoded)

            # Determine source label
            domain = urlparse(decoded).netloc.replace('www.', '')
            if 'yelp' in domain:
                label = 'Yelp'
            elif 'facebook' in domain or 'fbsbx' in domain:
                label = 'Facebook'
            elif 'instagram' in domain:
                label = 'Instagram'
            else:
                label = domain[:20]

            photos.append({
                'url': decoded,
                'source': 'bing_search',
                'label': label,
            })

            if len(photos) >= 12:
                break

        return photos


async def crawl_website(url):
    """Crawl a business website and extract photo URLs."""
    config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig(page_timeout=15000)

    async with AsyncWebCrawler(config=config) as crawler:
        result = await crawler.arun(url=url, config=run_config)
        all_imgs = result.media.get('images', [])

        photos = []
        seen = set()
        for img in all_imgs:
            src = img.get('src', '')
            if not src.startswith('http') or src in seen:
                continue
            if not is_good_photo(src):
                continue
            w = img.get('width') or 0
            h = img.get('height') or 0
            if isinstance(w, str):
                w = int(w) if w.isdigit() else 0
            if isinstance(h, str):
                h = int(h) if h.isdigit() else 0
            if w > 0 and w < 200:
                continue
            if h > 0 and h < 150:
                continue

            seen.add(src)
            domain = urlparse(url).netloc.replace('www.', '')
            photos.append({
                'url': src,
                'source': 'website',
                'label': domain[:20],
                'width': w if w > 0 else None,
                'height': h if h > 0 else None,
            })
            if len(photos) >= 10:
                break

        return photos


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == '/search':
            # Bing Image Search
            params = parse_qs(parsed.query)
            name = params.get('name', [None])[0]
            city = params.get('city', [None])[0]
            state = params.get('state', [None])[0]
            address = params.get('address', [None])[0]

            if not name or not city:
                self.send_error(400, '{"error":"name and city required"}')
                return

            try:
                photos = asyncio.run(search_bing_images(name, city, state or '', address))
                self._respond(200, {'photos': photos, 'source': 'bing_images'})
            except Exception as e:
                self._respond(500, {'error': str(e)})

        elif parsed.path == '/website':
            # Website crawl
            params = parse_qs(parsed.query)
            url = params.get('url', [None])[0]
            if not url:
                self.send_error(400, '{"error":"url required"}')
                return
            try:
                photos = asyncio.run(crawl_website(url))
                self._respond(200, {'photos': photos, 'source': 'website'})
            except Exception as e:
                self._respond(500, {'error': str(e)})

        elif parsed.path == '/health':
            self._respond(200, {'status': 'ok'})

        else:
            self.send_error(404)

    def _respond(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[PhotoServer] {args[0]}")


if __name__ == '__main__':
    port = 3456
    server = HTTPServer(('localhost', port), Handler)
    print(f"Free Photo Server running on http://localhost:{port}")
    print(f"")
    print(f"Endpoints:")
    print(f"  /search?name=...&city=...&state=...  - Bing Image Search (free)")
    print(f"  /website?url=...                     - Crawl business website (free)")
    print(f"  /health                              - Health check")
    print(f"")
    print(f"Press Ctrl+C to stop")
    server.serve_forever()
