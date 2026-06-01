#!/usr/bin/env python3
"""
Stage 2 of thin-cluster verification (READ-ONLY — no DB writes).

Reads scripts/discovery-output/thin-cluster-candidates.json, crawls each
candidate that has a real business website, and classifies touchless using the
EXACT same analyze_content() classifier as crawl4ai-touchless-scan.py. Writes a
reviewable verdict file + a per-cluster rollup (which thin clusters would reach
5 if the verified-touchless candidates were imported).

Import/enrichment is a separate, reviewed stage 3 — this script never promotes.

Run: python3 scripts/verify-touchless-candidates.py [--limit N]
"""
import asyncio, json, os, sys, importlib.util, datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CAND_FILE = os.path.join(SCRIPT_DIR, 'discovery-output', 'thin-cluster-candidates.json')
OUT_FILE = os.path.join(SCRIPT_DIR, 'discovery-output', 'thin-cluster-verified.json')

# Reuse the production classifier from the existing scanner (filename has
# hyphens, so load it by path). Module top-level has no side effects beyond
# defining constants — main() is guarded by __name__ == '__main__'.
_spec = importlib.util.spec_from_file_location('scan', os.path.join(SCRIPT_DIR, 'crawl4ai-touchless-scan.py'))
scan = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(scan)

LIMIT = None
if '--limit' in sys.argv:
    LIMIT = int(sys.argv[sys.argv.index('--limit') + 1])


def build_rollup(results):
    by_cluster = {}
    for r in results:
        cl = by_cluster.setdefault(r['cluster'], {'cluster': r['cluster'], 'have': r['clusterHave'], 'new_touchless': 0})
        if r['verdict'] == 'touchless':
            cl['new_touchless'] += 1
    rollup = sorted(by_cluster.values(), key=lambda x: -(x['have'] + x['new_touchless']))
    for cl in rollup:
        cl['potential'] = cl['have'] + cl['new_touchless']
        cl['reaches_5'] = cl['potential'] >= 5
    return rollup


def write_out(results):
    counts = {}
    for r in results:
        counts[r['verdict']] = counts.get(r['verdict'], 0) + 1
    json.dump({'generatedAt': datetime.datetime.now().isoformat(), 'verdictCounts': counts,
               'results': results, 'clusterRollup': build_rollup(results)}, open(OUT_FILE, 'w'), indent=2)
    return counts


async def main():
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    data = json.load(open(CAND_FILE))
    cands = data['candidates']
    # Only those with a crawlable business website
    todo = [c for c in cands if c.get('website') and not scan.should_skip_url(c['website'])]
    if LIMIT:
        todo = todo[:LIMIT]

    # Resume: keep results already written, skip their place_ids (checkpointing
    # so a killed run doesn't lose progress).
    results = []
    done = set()
    if os.path.exists(OUT_FILE):
        try:
            prev = json.load(open(OUT_FILE))
            results = prev.get('results', [])
            done = {r['place_id'] for r in results}
        except Exception:
            pass
    todo = [c for c in todo if c['place_id'] not in done]
    print(f'Candidates: {len(cands)} | crawlable: {len(todo) + len(done)} | already done: {len(done)} | to crawl: {len(todo)}')

    browser = BrowserConfig(headless=True, verbose=False)
    run = CrawlerRunConfig(page_timeout=15000)
    async with AsyncWebCrawler(config=browser) as crawler:
        for i, c in enumerate(todo, 1):
            verdict, score, evidence, equip = 'unknown', 0, [], None
            try:
                res = await crawler.arun(c['website'], config=run)
                if res and res.markdown and len(res.markdown) > 50:
                    is_t, ev, sc = scan.analyze_content(res.markdown)
                    score = sc
                    evidence = ev[:2]
                    equip = scan.detect_equipment(res.markdown)
                    verdict = 'touchless' if is_t is True else ('not-touchless' if is_t is False else 'uncertain')
                else:
                    verdict = 'no-content'
            except Exception as e:
                verdict = 'crawl-error'
                evidence = [{'error': str(e)[:120]}]
            results.append({**{k: c[k] for k in ('place_id','name','address','website','cluster','clusterHave','rating','reviews')},
                            'verdict': verdict, 'score': score, 'evidence': evidence, 'equipment': equip})
            if i % 15 == 0:
                write_out(results)  # checkpoint
                tl = sum(1 for r in results if r['verdict'] == 'touchless')
                print(f'  {i}/{len(todo)} crawled · {tl} touchless so far (checkpointed)')

    counts = write_out(results)
    print('\nVerdicts:', counts)
    rollup = [c for c in build_rollup(results)]
    reach = [c for c in rollup if c['reaches_5'] and c['new_touchless'] > 0]
    print(f'Clusters pushed to 5+ by verified candidates: {len(reach)}')
    for c in reach[:25]:
        print(f"  {c['cluster']:<26} have:{c['have']} +{c['new_touchless']} = {c['potential']}")
    print(f'\nWrote {OUT_FILE}')


if __name__ == '__main__':
    asyncio.run(main())
