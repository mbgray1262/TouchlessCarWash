#!/usr/bin/env python3
"""
Junk filter — rejects non-car-wash businesses before they're imported.

Import in any pipeline script and gate new rows through is_junk_listing().

The goal is to catch business types that clearly aren't car washes but
slipped into scraped data (Google Places, All The Places, OSM, etc.):
  - Hotels, motels, lodges
  - Pharmacies, drug stores
  - Pure restaurants/cafes
  - Beauty / hair / nail salons
  - Self-storage facilities
  - Pet-only businesses (grooming, boarding, pet spa)
  - Pure laundromats (unless combined with car wash)
  - Standalone oil change chains (Valvoline, Take 5, Jiffy Lube)
  - Standalone tire shops (Mavis, Discount Tire)
  - Dry cleaners
  - Propane / gas-only stops

If a name clearly contains a car wash signal (car, auto, truck, RV, wash,
carwash, autowash) it's allowed — many combo businesses legitimately
offer car wash alongside another service (Car & Pet Wash, Carwash &
Laundromat).

Usage:
    from junk_filter import is_junk_listing
    if is_junk_listing(name):
        continue  # skip this row

    # Optional stricter mode also checks website domain:
    if is_junk_listing(name, website=row.get('website')):
        continue
"""
import re

# Car wash signals — if any of these appear in the name, it's allowed
# (even if it also contains a junk word, because combos are legitimate).
# Note: "wash" alone is NOT a signal — "Dog Wash" shouldn't pass. We require
# a vehicle-specific word (car/auto/truck/rv/vehicle) or a compound form.
CAR_WASH_SIGNALS = re.compile(
    r'\b(car|cars|auto|autos|truck|trucks|rv|vehicle)\b|carwash|autowash|laserwash|carspa',
    re.I,
)

# Junk categories — each pattern is checked against the name
JUNK_PATTERNS = [
    # Hotels & lodging
    (re.compile(r'\b(hotel|motel|inn|lodge|resort|hostel|b&b|bed\s*&\s*breakfast)\b', re.I), 'hotel'),
    # Pharmacies
    (re.compile(r'\b(pharmacy|drug\s*store|cvs|walgreens|rite\s*aid)\b', re.I), 'pharmacy'),
    # Restaurants (be specific — "grill" and "cafe" are often restaurants)
    (re.compile(r'\b(restaurant|cafe|diner|pizza|tavern|bistro|eatery|bakery|deli|bbq|sushi|steakhouse|burger|donut|doughnut|ice\s*cream|food\s*truck|taqueria|kitchen)\b', re.I), 'restaurant'),
    # Beauty / hair / nails
    (re.compile(r'\b(hair\s*salon|barber|barbershop|beauty\s*salon|nail\s*salon|hair\s*studio|day\s*spa|massage|waxing|lash\s*bar|eyebrow)\b', re.I), 'beauty'),
    # Self-storage
    (re.compile(r'\b(self[\s\-]*storage|mini[\s\-]*storage|storage\s*units|u[\s\-]?haul\s*storage)\b', re.I), 'storage'),
    # Pet businesses (only if no car/auto in name)
    (re.compile(r'\b(pet\s*(?:wash|spa|salon|grooming|supplies|boarding|hotel|resort|daycare)|dog\s*(?:wash|spa|grooming|boarding|daycare|park))\b', re.I), 'pet'),
    # Pure laundry
    (re.compile(r'\b(laundromat|laundry|launderette|washeteria|dry\s*clean|coin\s*laundry)\b', re.I), 'laundry'),
    # Standalone oil change (ignore if combined with car wash, which the signal catches)
    (re.compile(r'\b(valvoline|take\s*5\s*oil|jiffy\s*lube|express\s*oil|instant\s*oil|quick\s*lube|oil\s*change\s*center|grease\s*monkey)\b', re.I), 'oil-change'),
    # Standalone tire shops
    (re.compile(r'\b(tire\s*center|tire\s*shop|tire\s*&\s*service|discount\s*tire|mavis|pep\s*boys|firestone)\b', re.I), 'tire'),
    # Propane / gas only
    (re.compile(r'\b(propane\s*(?:refill|exchange|to\s*go)|u[\s\-]?haul\s*propane)\b', re.I), 'propane'),
    # Medical / healthcare
    (re.compile(r'\b(dental|dentist|clinic|doctor|physician|urgent\s*care|hospital|emergency\s*room|medical\s*center)\b', re.I), 'medical'),
    # Legal / professional
    (re.compile(r'\b(law\s*firm|attorney|accountant|cpa|real\s*estate\s*agent|insurance\s*agent)\b', re.I), 'professional'),
]


def is_junk_listing(name: str | None, website: str | None = None) -> tuple[bool, str | None]:
    """
    Returns (is_junk, reason) tuple.

    A listing is junk if:
      1. Name matches a known junk pattern AND
      2. Name does NOT contain any car wash signal

    If website is provided, known junk domains are also rejected
    (catches cases where name is generic but URL gives it away).
    """
    if not name:
        return (True, 'empty-name')

    name = name.strip()

    # Fast path: has car wash signal → allow
    if CAR_WASH_SIGNALS.search(name):
        return (False, None)

    # Check junk patterns
    for pattern, category in JUNK_PATTERNS:
        if pattern.search(name):
            return (True, category)

    # Website-based check (optional, catches generic names with obvious URLs)
    if website:
        w = website.lower()
        junk_domains = [
            'valvoline.com', 'takefive', 'jiffylube', 'hilton.com', 'marriott.com',
            'ihg.com', 'choicehotels', 'bestwestern', 'cvs.com', 'walgreens.com',
            'riteaid.com', 'publicstorage.com', 'cubesmart.com', 'uhaul.com',
        ]
        for d in junk_domains:
            if d in w:
                return (True, f'junk-domain:{d}')

    return (False, None)


if __name__ == '__main__':
    # Smoke tests
    cases = [
        ('Autowash @ Central Park Car Wash', False, None),
        ('Drive & Shine Car Wash and Oil Change', False, None),  # combo — allowed
        ('Soaps N Suds Laundromat & Car Wash', False, None),  # combo — allowed
        ('Wonder Paws Pet Spa', True, 'pet'),
        ('Holiday Inn Express', True, 'hotel'),
        ('CVS Pharmacy', True, 'pharmacy'),
        ("Tom's Tavern & Restaurant", True, 'restaurant'),
        ('Valvoline Instant Oil Change', True, 'oil-change'),
        ('Mavis Discount Tire', True, 'tire'),
        ('Super Saver Laundromat', True, 'laundry'),
        ('Cherry Valley Laundromat', True, 'laundry'),
        ('CubeSmart Self Storage', True, 'storage'),
        ('Dog Wash Spa Cedar Park', True, 'pet'),
        ('Kwik Trip', False, None),  # no junk word
        ('Shell', False, None),  # no junk word
    ]
    passed = 0
    for name, want_junk, want_reason in cases:
        got_junk, got_reason = is_junk_listing(name)
        if got_junk == want_junk and (not want_reason or got_reason == want_reason):
            print(f'  ✅ {name[:40]:40} → junk={got_junk} reason={got_reason}')
            passed += 1
        else:
            print(f'  ❌ {name[:40]:40} → got junk={got_junk} reason={got_reason}, expected junk={want_junk} reason={want_reason}')
    print(f'\n{passed}/{len(cases)} tests passed')
