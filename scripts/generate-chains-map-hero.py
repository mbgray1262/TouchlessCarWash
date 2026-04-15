import json, ssl, urllib.request, urllib.parse
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78'
ssl_ctx = ssl.create_default_context(); ssl_ctx.check_hostname = False; ssl_ctx.verify_mode = ssl.CERT_NONE
def get(p):
    req = urllib.request.Request(SUPABASE_URL + p,
        headers={'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}'})
    return json.loads(urllib.request.urlopen(req, context=ssl_ctx, timeout=30).read())

NAVY, BLUE, GREEN, WHITE = '#0F2744', '#1E3A8A', '#22C55E', '#FFFFFF'
TOP10 = ['Sheetz', 'Holiday Stationstores', 'Power Market', 'Kwik Trip', 'Super Wash',
         'Extra Mile', 'Pinnacle 365', 'Drive & Shine', "Terrible's", 'Delta Sonic']

chain_data = []
for c in TOP10:
    rows = get(f'/rest/v1/listings?select=latitude,longitude&parent_chain=eq.{urllib.parse.quote(c)}&is_touchless=eq.true&limit=500')
    coords = [(float(r['latitude']), float(r['longitude'])) for r in rows if r.get('latitude') and r.get('longitude')]
    if not coords: continue
    chain_data.append({'name': c, 'lat': sum(x[0] for x in coords)/len(coords),
                       'lng': sum(x[1] for x in coords)/len(coords),
                       'count': len(rows), 'coords': coords})

fig, ax = plt.subplots(figsize=(16, 9), dpi=110, facecolor=NAVY)
ax.set_facecolor(NAVY)

# Draw states
with open('/tmp/us_states.geojson') as f: geo = json.load(f)
for feat in geo['features']:
    if feat['properties']['name'] in ('Alaska', 'Hawaii', 'Puerto Rico'): continue
    geom = feat['geometry']
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    for poly in polys:
        if geom['type'] == 'MultiPolygon':
            for ring in poly:
                ax.fill([p[0] for p in ring], [p[1] for p in ring], color='#1a3556', edgecolor=BLUE, linewidth=0.7, zorder=1)
        else:
            for ring in poly:
                ax.fill([p[0] for p in ring], [p[1] for p in ring], color='#1a3556', edgecolor=BLUE, linewidth=0.7, zorder=1)

# Individual location dots (light green)
all_locs = [(lat, lng) for c in chain_data for lat, lng in c['coords']]
ax.scatter([c[1] for c in all_locs], [c[0] for c in all_locs], s=15, c=GREEN, alpha=0.45, edgecolors='none', zorder=2)

# Manually-tuned label positions (absolute coordinates to avoid overlap)
# Format: (label_x, label_y, text_anchor)  positions in lng,lat
LABELS = {
    'Sheetz':                (-68, 35.5, 'left'),    # right of East
    'Holiday Stationstores': (-106, 47.5, 'right'),  # far upper left
    'Kwik Trip':             (-106, 44, 'right'),    # upper left
    'Drive & Shine':         (-72, 44, 'left'),      # upper right
    'Delta Sonic':           (-68, 41, 'left'),      # right side
    'Super Wash':            (-108, 38, 'right'),    # mid-west
    'Power Market':          (-128, 40, 'left'),     # west coast
    'Pinnacle 365':          (-128, 37, 'left'),     # west coast lower
    'Extra Mile':            (-128, 34, 'left'),     # CA
    "Terrible's":            (-122, 29, 'left'),     # southwest
}

for c in chain_data:
    size = 500 + c['count'] * 3
    ax.scatter([c['lng']], [c['lat']], s=size, c=GREEN, edgecolors=WHITE, linewidth=2.8, zorder=5, alpha=0.98)
    ax.text(c['lng'], c['lat'], str(c['count']), ha='center', va='center',
            fontsize=12, fontweight='bold', color=NAVY, zorder=6)

    label_x, label_y, anchor = LABELS.get(c['name'], (c['lng']+2, c['lat']+2, 'left'))
    ha = 'left' if anchor == 'left' else 'right'
    ax.annotate(c['name'],
                xy=(c['lng'], c['lat']),
                xytext=(label_x, label_y),
                fontsize=11, fontweight='bold', color=WHITE,
                ha=ha, va='center',
                path_effects=[pe.withStroke(linewidth=3.5, foreground=NAVY)],
                zorder=7,
                arrowprops=dict(arrowstyle='-', color=GREEN, linewidth=1.5, alpha=0.65,
                                connectionstyle='arc3,rad=0'))

# Title + subtitle (positioned at top using axis coords, not data)
fig.text(0.5, 0.95, 'TOP 10 TOUCHLESS CAR WASH CHAINS',
         fontsize=28, fontweight='bold', color=WHITE, ha='center',
         path_effects=[pe.withStroke(linewidth=4, foreground=NAVY)])
fig.text(0.5, 0.905, 'Verified locations across the United States  ·  2026',
         fontsize=14, color=GREEN, ha='center', style='italic')

total = sum(c['count'] for c in chain_data)
fig.text(0.5, 0.045, f'{total:,} verified touchless locations in top 10 chains  ·  6,000+ total in our directory',
         fontsize=12, color=WHITE, ha='center', alpha=0.8)

ax.set_xlim(-130, -63)
ax.set_ylim(24, 51)
ax.set_aspect('equal')
ax.axis('off')

plt.subplots_adjust(left=0.02, right=0.98, top=0.88, bottom=0.08)
plt.savefig('/tmp/top10_map_hero_v2.jpg', dpi=110, bbox_inches='tight',
            facecolor=NAVY, edgecolor='none', pad_inches=0.15)
import os; print(f'Saved: /tmp/top10_map_hero_v2.jpg ({os.path.getsize("/tmp/top10_map_hero_v2.jpg")} bytes)')
