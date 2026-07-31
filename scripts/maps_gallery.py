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
import sys, re, json, time, os
from playwright.sync_api import sync_playwright

PHOTO_RE = re.compile(r"https://lh[35]\.googleusercontent\.com/(?:p|gps-cs-s|gps-proxy)/[A-Za-z0-9_\-]+")

def _collect_photos(page):
    """Scan BOTH CSS background-images (gallery grid tiles) AND <img> src (hero +
    overview thumbnails). The regex only matches real place-photo paths
    (p / gps-cs-s / gps-proxy), so reviewer avatars (/a-/, /a/) are excluded."""
    return page.evaluate("""() => {
      const re=/https:\\/\\/lh[35]\\.googleusercontent\\.com\\/(?:p|gps-cs-s|gps-proxy)\\/[A-Za-z0-9_\\-]+/;
      const out=new Set();
      for (const el of document.querySelectorAll('*')) {
        const bg=getComputedStyle(el).backgroundImage;
        const m=bg&&bg.match(re); if(m) out.add(m[0]);
      }
      for (const img of document.querySelectorAll('img')) {
        const m=(img.src||'').match(re); if(m) out.add(m[0]);
      }
      return [...out];
    }""")


def harvest(page, place_id):
    _dbg = os.environ.get("MG_DEBUG") == "1"
    # The "See photos" gallery button is FLAKY — it renders only some of the time, and a
    # fresh reload of the SAME place often makes it appear when the first load didn't. So we
    # reload-and-retry: each attempt opens the full gallery grid (scrollable → all photos);
    # if no attempt opens it we fall back to the best OVERVIEW-only photo set (~10-19 photos)
    # rather than returning nothing. Attempts default to 3, tunable via MG_GALLERY_TRIES.
    tries = int(os.environ.get("MG_GALLERY_TRIES", "3"))
    page_title, best_urls, opened = "", [], False
    for attempt in range(tries):
        page.goto(f"https://www.google.com/maps/place/?q=place_id:{place_id}&hl=en",
                  wait_until="domcontentloaded", timeout=35000)
        time.sleep(3)
        # Navigation guard: a dropped VPN / geo hiccup can leave us on a consent wall, a search
        # results list, or a captcha. The place-page URL is NOT a reliable signal — Maps often
        # loads content (correct <title>) before rewriting the ?q=place_id URL to /maps/place/…,
        # so we trust the TITLE instead: an unresolved place_id leaves the title as the generic
        # "Google Maps", which the title guard below catches. Downstream name_matches + the
        # stale-photo signature guard catch any contamination if a wrong page slips through.
        final_url = page.url or ""
        if _dbg: print(f"[dbg] try {attempt+1}/{tries} url={final_url}\n[dbg] title={page.title()!r}", file=sys.stderr)
        if ("consent.google" in final_url or "/maps/search/" in final_url
                or "/sorry/" in final_url):
            if _dbg: print("[dbg] bailed: navigation guard", file=sys.stderr)
            continue
        page_title = (page.title() or "").replace(" - Google Maps", "").strip()
        if not page_title or page_title.lower() in ("google maps", "maps"):
            if _dbg: print("[dbg] bailed: title guard", file=sys.stderr)
            page_title = ""
            continue
        # Open the full gallery. Current Maps renders a "See photos" button over the hero;
        # older/other layouts expose the hero photo button directly. Try the label-based
        # control first (most reliable), then fall back to the legacy selectors.
        for sel in ['button[aria-label="See photos"]', 'button[jsaction*="heroHeaderImage"]',
                    'button[aria-label^="Photo"]', 'div[role="img"][aria-label]',
                    'button.aoRNLd', 'a[data-photo-index="0"]']:
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
        urls = set(_collect_photos(page))  # overview photos always captured as a floor
        has_scroller = page.evaluate("() => !!window.__g")
        if _dbg: print(f"[dbg] gallery_opened={has_scroller} overview_photos={len(urls)}", file=sys.stderr)
        if has_scroller:
            opened = True
            last, stable = -1, 0
            for _ in range(80):
                page.evaluate("() => { if(window.__g) window.__g.scrollTop = window.__g.scrollHeight; }")
                time.sleep(0.5)
                urls.update(_collect_photos(page))
                if len(urls) == last:
                    stable += 1
                    if stable >= 5:
                        break
                else:
                    stable = 0
                last = len(urls)
        if len(urls) > len(best_urls):
            best_urls = sorted(urls)
        if opened:
            break  # got the full gallery — no need to reload again
        if _dbg: print(f"[dbg] gallery did not open, reloading (attempt {attempt+1})", file=sys.stderr)
    return page_title, best_urls


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
    # Headless bundled Chromium is fingerprinted and blocked by Google Maps (returns a
    # blank/consent page → 0 photos) even behind a US VPN — headless detection is
    # independent of IP. Use the REAL Chrome binary (channel="chrome") in HEADED mode
    # with the automation flag stripped and navigator.webdriver spoofed; this is what
    # a genuine browser looks like and reliably loads the full gallery. HEADLESS=1 in
    # the environment forces the old (blockable) headless path if ever needed.
    headless = os.environ.get("HEADLESS") == "1"
    with sync_playwright() as p:
        # A visible window is required (headless is blocked), but for a long batch run we
        # push it far off-screen so it never steals focus while Michael uses his Mac.
        launch_kw = dict(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled",
                  "--window-position=-2400,-2400", "--window-size=1280,900"],
        )
        try:
            browser = p.chromium.launch(channel="chrome", **launch_kw)   # real Chrome
        except Exception:
            browser = p.chromium.launch(**launch_kw)                     # fallback: bundled
        ctx = browser.new_context(
            locale="en-US",
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
        ctx.add_cookies([{"name": "SOCS", "value": "CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTIzLjA2X3AwGgJlbiADGgYIgOaXrgY", "domain": ".google.com", "path": "/"}])
        page = ctx.new_page()
        if batch is not None:
            # Resumable + cumulative: load any existing gallery file, skip listings already done
            # (kept a prior successful harvest), and CHECKPOINT after every listing so a crash or
            # Google hiccup mid-run loses at most one listing, not the whole batch.
            out = {}
            if os.path.exists(OUT):
                try:
                    with open(OUT) as f:
                        out = json.load(f)
                except Exception:
                    out = {}
            prev_sig = None   # photo signature of the previous kept listing (stale-page guard)
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
                    keep = urls if match else []
                    # STALE-PAGE GUARD: if this listing's photos are byte-identical to the previous
                    # kept listing's, the page almost certainly didn't navigate (VPN/nav hiccup) and
                    # we're re-reading the last place. Two DIFFERENT place_ids never share an exact
                    # gallery — even chain siblings differ — so this is the contamination that pinned
                    # one wash's photos onto many (esp. same-named chains, where name_matches passes).
                    sig = tuple(keep)
                    stale = bool(keep) and prev_sig is not None and sig == prev_sig
                    if stale:
                        keep = []
                    elif keep:
                        prev_sig = sig
                    out[lid] = {"title": title, "match": match, "urls": keep}
                    flag = ("  ⚠ STALE (identical to previous) — blanked" if stale
                            else "" if match else f"  ⚠ NAME MISMATCH (page='{title}')")
                    print(f"  {len(keep):>3} photos  {name[:34]:<34}{flag}", file=sys.stderr)
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
