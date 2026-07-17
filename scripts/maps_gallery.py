"""
Harvest EVERY Google Maps photo for a place by driving a real browser — the same
thing Michael does by hand: open the listing, click the photo, scroll the whole
gallery, grab every photo. NOT the Places API (which hard-caps at 10).

Proven recipe (validated live in-browser: Drip Drop returned 44 photos vs 10 from the API):
  goto place page -> click hero photo -> find the tall left gallery scroller ->
  scroll it to the bottom repeatedly -> collect all lh3/lh5 googleusercontent
  background-image URLs.

Usage:
  python3 scripts/maps_gallery.py <place_id> [<place_id> ...]        # prints JSON {place_id: [urls]}
  echo '[["id1","placeid1"],...]' | python3 scripts/maps_gallery.py --stdin  # batch, writes _gallery_urls.json
"""
import sys, re, json, time
from playwright.sync_api import sync_playwright

PHOTO_RE = re.compile(r"https://lh[35]\.googleusercontent\.com/(?:p|gps-cs-s|gps-proxy)/[A-Za-z0-9_\-]+")

def harvest(page, place_id):
    page.goto(f"https://www.google.com/maps/place/?q=place_id:{place_id}&hl=en",
              wait_until="domcontentloaded", timeout=35000)
    time.sleep(3)
    page_title = (page.title() or "").replace(" - Google Maps", "").strip()
    # Open the full gallery: click the hero header photo button.
    for sel in ['button[jsaction*="heroHeaderImage"]', 'button[aria-label^="Photo"]',
                'div[role="img"][aria-label]', 'button.aoRNLd', 'a[data-photo-index="0"]']:
        try:
            el = page.query_selector(sel)
            if el:
                el.click(timeout=4000)
                break
        except Exception:
            pass
    time.sleep(2.5)
    # Locate the tall scrollable gallery container on the left.
    page.evaluate("""() => {
      let best=null,bestH=0;
      for (const el of document.querySelectorAll('div')) {
        if (el.scrollHeight > el.clientHeight + 200 && el.clientHeight > 300) {
          const r = el.getBoundingClientRect();
          if (r.left < 450 && el.scrollHeight > bestH) { best=el; bestH=el.scrollHeight; }
        }
      }
      window.__g = best;
    }""")
    urls = set()
    def collect():
        found = page.evaluate("""() => {
          const re=/https:\\/\\/lh[35]\\.googleusercontent\\.com\\/(?:p|gps-cs-s|gps-proxy)\\/[A-Za-z0-9_\\-]+/;
          const out=[];
          for (const el of document.querySelectorAll('*')) {
            const bg=getComputedStyle(el).backgroundImage;
            const m=bg&&bg.match(re); if(m) out.push(m[0]);
          }
          return out;
        }""")
        for u in found:
            urls.add(u)
    has_scroller = page.evaluate("() => !!window.__g")
    if has_scroller:
        last, stable = -1, 0
        for _ in range(80):
            page.evaluate("() => { if(window.__g) window.__g.scrollTop = window.__g.scrollHeight; }")
            time.sleep(0.5)
            collect()
            if len(urls) == last:
                stable += 1
                if stable >= 5:
                    break
            else:
                stable = 0
            last = len(urls)
    collect()
    return page_title, sorted(urls)


def name_matches(listing_name, page_title):
    """Contamination guard: confirm the Maps page is actually THIS wash before trusting
    its photos (the old free scraper cached other washes' photos when it drifted)."""
    def toks(s):
        return set(re.findall(r"[a-z0-9]+", (s or "").lower())) - {
            "car", "wash", "auto", "the", "and", "llc", "inc", "co", "of", "at", "&"}
    a, b = toks(listing_name), toks(page_title)
    if not a or not b:
        return False
    return len(a & b) >= 1  # at least one distinctive token in common

def main():
    args = sys.argv[1:]
    OUT = args[args.index("--out") + 1] if "--out" in args else "scripts/_gallery_urls.json"
    batch = None
    if "--stdin" in args:
        batch = json.load(sys.stdin)          # [[listing_id, place_id, name], ...]
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            locale="en-US",
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        ctx.add_cookies([{"name": "SOCS", "value": "CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTIzLjA2X3AwGgJlbiADGgYIgOaXrgY", "domain": ".google.com", "path": "/"}])
        page = ctx.new_page()
        if batch is not None:
            # Resumable + cumulative: load any existing gallery file, skip listings already done
            # (kept a prior successful harvest), and CHECKPOINT after every listing so a crash or
            # Google hiccup mid-run loses at most one listing, not the whole batch.
            import os
            out = {}
            if os.path.exists(OUT):
                try:
                    with open(OUT) as f:
                        out = json.load(f)
                except Exception:
                    out = {}
            for row in batch:
                lid, pid = row[0], row[1]
                name = row[2] if len(row) > 2 else ""
                if lid in out and out[lid].get("urls"):      # already harvested successfully → skip
                    continue
                title, urls, err = "", [], None
                for attempt in range(2):                      # 1 retry — transient page/nav hiccups
                    try:
                        title, urls = harvest(page, pid)
                        err = None
                        break
                    except Exception as e:
                        err = e
                        time.sleep(2)
                if err is None:
                    match = name_matches(name, title)
                    out[lid] = {"title": title, "match": match, "urls": urls if match else []}
                    flag = "" if match else f"  ⚠ NAME MISMATCH (page='{title}')"
                    print(f"  {len(urls):>3} photos  {name[:34]:<34}{flag}", file=sys.stderr)
                else:
                    out[lid] = {"title": "", "match": False, "urls": []}
                    print(f"  ERR {name[:34]}: {type(err).__name__}", file=sys.stderr)
                with open(OUT, "w") as f:   # checkpoint every listing
                    json.dump(out, f)
            print(f"wrote {OUT} ({len(out)} listings)", file=sys.stderr)
        else:
            out = {}
            for pid in args:
                title, urls = harvest(page, pid)
                out[pid] = urls
            print(json.dumps(out, indent=2))
        browser.close()

if __name__ == "__main__":
    main()
