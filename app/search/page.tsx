import { Fragment } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { publicListings } from '@/lib/public-listings';
import { SELF_SERVE_LIVE, publicSelfServeListings } from '@/lib/self-serve';
import { getStateSlug, slugify, US_STATES } from '@/lib/constants';
import { ListingCard } from '@/components/ListingCard';
import { Pagination, PAGE_SIZE } from '@/components/Pagination';
import { SearchFilters } from '@/components/SearchFilters';
import { withPaintSafeChip, PAINT_SAFE_FILTER_SLUG } from '@/lib/paint-safe-filter';
import { METRO_AREAS, haversineDistance, boundingBox, getMetroBySlug, type MetroArea } from '@/lib/metro-areas';
import { earnsTrophy, scoreListing } from '@/lib/metro-scoring';
import { MapPin, Map as MapIcon, Trophy, Search, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';

interface Filter {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
}

interface SearchPageProps {
  searchParams: {
    q?: string;
    lat?: string;
    lng?: string;
    filters?: string;
    page?: string;
    sort?: string;
    type?: string;
  };
}

async function getFilters(): Promise<Filter[]> {
  const { data } = await supabase
    .from('filters')
    .select('id, name, slug, category, icon')
    .order('sort_order');
  return data ?? [];
}

/** Build an OR filter string that matches city/zip/state/name, handling & variants. */
function buildSearchFilter(query: string): string {
  const base = `city.ilike.%${query}%,zip.ilike.%${query}%,state.ilike.%${query}%,name.ilike.%${query}%`;

  const extras: string[] = [];
  if (query.includes('&')) {
    // "K&D" → also try "K & D" and "K and D"
    extras.push(`name.ilike.%${query.replace(/&/g, ' & ')}%`);
    extras.push(`name.ilike.%${query.replace(/&/g, ' and ')}%`);
  } else if (query.includes(' & ')) {
    // "K & D" → also try "K&D"
    extras.push(`name.ilike.%${query.replace(/ & /g, '&')}%`);
  } else if (query.toLowerCase().includes(' and ')) {
    // "K and D" → also try "K&D" and "K & D"
    extras.push(`name.ilike.%${query.replace(/ and /gi, '&')}%`);
    extras.push(`name.ilike.%${query.replace(/ and /gi, ' & ')}%`);
  }

  return extras.length > 0 ? `${base},${extras.join(',')}` : base;
}

// The visibility source for the active wash-type tab: publicListings (touchless)
// or publicSelfServeListings. Both share the (columns, opts?) signature so they're
// interchangeable here; the amenity-filter join logic is wash-type-agnostic.
type ListingSource = typeof publicListings;

async function searchListings(
  query: string,
  activeFilterSlugs: string[],
  allFilters: Filter[],
  source: ListingSource
): Promise<Listing[]> {
  // Paint-Safe Verified is a synthetic chip filtering the paint_safe_verified
  // column, not an amenity join — it never resolves to a listing_filters id.
  const wantsPaintSafe = activeFilterSlugs.includes(PAINT_SAFE_FILTER_SLUG);
  const filterIds = activeFilterSlugs
    .map(slug => allFilters.find(f => f.slug === slug)?.id)
    .filter((id): id is number => id != null);

  if (filterIds.length > 0) {
    const { data: matchedRows } = await supabase
      .from('listing_filters')
      .select('listing_id')
      .in('filter_id', filterIds);

    if (!matchedRows || matchedRows.length === 0) return [];

    const idCounts: Record<string, number> = {};
    for (const row of matchedRows) {
      idCounts[row.listing_id] = (idCounts[row.listing_id] ?? 0) + 1;
    }
    const qualifiedIds = Object.entries(idCounts)
      .filter(([, count]) => count === filterIds.length)
      .map(([id]) => id);

    if (qualifiedIds.length === 0) return [];

    let q = source(LISTING_CARD_COLUMNS)
      .in('id', qualifiedIds)
      .order('rating', { ascending: false });

    if (wantsPaintSafe) q = q.eq('paint_safe_verified', true);
    if (query) {
      q = q.or(buildSearchFilter(query));
    }

    const { data } = await q;
    return (data as Listing[]) ?? [];
  } else {
    let q = source(LISTING_CARD_COLUMNS)
      .order('rating', { ascending: false });

    if (wantsPaintSafe) q = q.eq('paint_safe_verified', true);
    if (query) {
      q = q.or(buildSearchFilter(query));
    }

    const { data } = await q;
    return (data as Listing[]) ?? [];
  }
}

// ── Server-side forward geocode (Nominatim) ──────────────────────────

async function serverForwardGeocode(query: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=us&limit=1`,
      {
        headers: { 'Accept-Language': 'en-US,en', 'User-Agent': 'TouchlessCarWashFinder/1.0' },
        next: { revalidate: 86400 }, // cache for 24h
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Proximity-based search ─────────────────────────────────────────────

const PROXIMITY_COLUMNS = LISTING_CARD_COLUMNS + ', latitude, longitude';

async function searchByProximity(
  lat: number,
  lng: number,
  activeFilterSlugs: string[],
  allFilters: Filter[],
  source: ListingSource
): Promise<(Listing & { distanceMiles: number })[]> {
  const radii = [25, 50, 100];

  const wantsPaintSafe = activeFilterSlugs.includes(PAINT_SAFE_FILTER_SLUG);

  // Pre-compute qualified listing IDs if amenity filters are active
  let qualifiedIds: string[] | null = null;
  if (activeFilterSlugs.length > 0) {
    const filterIds = activeFilterSlugs
      .map(slug => allFilters.find(f => f.slug === slug)?.id)
      .filter((id): id is number => id != null);

    if (filterIds.length > 0) {
      const { data: matchedRows } = await supabase
        .from('listing_filters')
        .select('listing_id')
        .in('filter_id', filterIds);

      if (!matchedRows || matchedRows.length === 0) return [];

      const idCounts: Record<string, number> = {};
      for (const row of matchedRows) {
        idCounts[row.listing_id] = (idCounts[row.listing_id] ?? 0) + 1;
      }
      qualifiedIds = Object.entries(idCounts)
        .filter(([, count]) => count === filterIds.length)
        .map(([id]) => id);

      if (qualifiedIds.length === 0) return [];
    }
  }

  for (const radius of radii) {
    const box = boundingBox(lat, lng, radius);

    let query = source(PROXIMITY_COLUMNS)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', box.minLat)
      .lte('latitude', box.maxLat)
      .gte('longitude', box.minLng)
      .lte('longitude', box.maxLng)
      .limit(500);

    if (qualifiedIds) {
      query = query.in('id', qualifiedIds);
    }
    if (wantsPaintSafe) {
      query = query.eq('paint_safe_verified', true);
    }

    const { data } = await query;
    if (!data) continue;

    const withDistance = (data as unknown as (Listing & { latitude: number; longitude: number })[])
      .map(l => ({
        ...l,
        distanceMiles: Math.round(haversineDistance(lat, lng, l.latitude, l.longitude) * 10) / 10,
      }))
      .filter(l => l.distanceMiles <= radius)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);

    // Return if we found enough results, or on the last radius
    if (withDistance.length >= 3 || radius === radii[radii.length - 1]) {
      return withDistance;
    }
  }
  return [];
}

// Look up state from query for better no-results suggestions
function guessStateFromQuery(query: string): { code: string; name: string } | null {
  const q = query.trim().toLowerCase();
  // Check if query matches a state name or abbreviation
  const match = US_STATES.find(
    (s) => s.name.toLowerCase() === q || s.code.toLowerCase() === q
  );
  if (match) return match;
  return null;
}

// ZIP prefix to state mapping (first 3 digits of ZIP → state code)
const ZIP_PREFIX_TO_STATE: Record<string, string> = {
  '006': 'PR', '007': 'PR', '008': 'PR', '009': 'PR',
  '010': 'MA', '011': 'MA', '012': 'MA', '013': 'MA', '014': 'MA', '015': 'MA', '016': 'MA', '017': 'MA', '018': 'MA', '019': 'MA',
  '020': 'MA', '021': 'MA', '022': 'MA', '023': 'MA', '024': 'MA',
  '025': 'MA', '026': 'MA', '027': 'MA',
  '028': 'RI', '029': 'RI',
  '030': 'NH', '031': 'NH', '032': 'NH', '033': 'NH', '034': 'NH', '035': 'NH', '036': 'NH', '037': 'NH', '038': 'NH',
  '039': 'ME', '040': 'ME', '041': 'ME', '042': 'ME', '043': 'ME', '044': 'ME', '045': 'ME', '046': 'ME', '047': 'ME', '048': 'ME', '049': 'ME',
  '050': 'VT', '051': 'VT', '052': 'VT', '053': 'VT', '054': 'VT', '056': 'VT', '057': 'VT', '058': 'VT', '059': 'VT',
  '060': 'CT', '061': 'CT', '062': 'CT', '063': 'CT', '064': 'CT', '065': 'CT', '066': 'CT', '067': 'CT', '068': 'CT', '069': 'CT',
  '070': 'NJ', '071': 'NJ', '072': 'NJ', '073': 'NJ', '074': 'NJ', '075': 'NJ', '076': 'NJ', '077': 'NJ', '078': 'NJ', '079': 'NJ',
  '080': 'NJ', '081': 'NJ', '082': 'NJ', '083': 'NJ', '084': 'NJ', '085': 'NJ', '086': 'NJ', '087': 'NJ', '088': 'NJ', '089': 'NJ',
  '100': 'NY', '101': 'NY', '102': 'NY', '103': 'NY', '104': 'NY', '105': 'NY', '106': 'NY', '107': 'NY', '108': 'NY', '109': 'NY',
  '110': 'NY', '111': 'NY', '112': 'NY', '113': 'NY', '114': 'NY', '115': 'NY', '116': 'NY', '117': 'NY', '118': 'NY', '119': 'NY',
  '120': 'NY', '121': 'NY', '122': 'NY', '123': 'NY', '124': 'NY', '125': 'NY', '126': 'NY', '127': 'NY', '128': 'NY', '129': 'NY',
  '130': 'NY', '131': 'NY', '132': 'NY', '133': 'NY', '134': 'NY', '135': 'NY', '136': 'NY', '137': 'NY', '138': 'NY', '139': 'NY',
  '140': 'NY', '141': 'NY', '142': 'NY', '143': 'NY', '144': 'NY', '145': 'NY', '146': 'NY', '147': 'NY', '148': 'NY', '149': 'NY',
  '150': 'PA', '151': 'PA', '152': 'PA', '153': 'PA', '154': 'PA', '155': 'PA', '156': 'PA', '157': 'PA', '158': 'PA', '159': 'PA',
  '160': 'PA', '161': 'PA', '162': 'PA', '163': 'PA', '164': 'PA', '165': 'PA', '166': 'PA', '167': 'PA', '168': 'PA', '169': 'PA',
  '170': 'PA', '171': 'PA', '172': 'PA', '173': 'PA', '174': 'PA', '175': 'PA', '176': 'PA', '177': 'PA', '178': 'PA', '179': 'PA',
  '180': 'PA', '181': 'PA', '182': 'PA', '183': 'PA', '184': 'PA', '185': 'PA', '186': 'PA', '187': 'PA', '188': 'PA', '189': 'PA',
  '190': 'PA', '191': 'PA',
  '193': 'PA', '194': 'PA', '195': 'PA', '196': 'PA',
  '197': 'DE', '198': 'DE', '199': 'DE',
  '200': 'DC', '201': 'VA', '202': 'DC', '203': 'DC', '204': 'DC', '205': 'DC',
  '206': 'MD', '207': 'MD', '208': 'MD', '209': 'MD', '210': 'MD', '211': 'MD', '212': 'MD', '214': 'MD', '215': 'MD', '216': 'MD', '217': 'MD', '218': 'MD', '219': 'MD',
  '220': 'VA', '221': 'VA', '222': 'VA', '223': 'VA', '224': 'VA', '225': 'VA', '226': 'VA', '227': 'VA', '228': 'VA', '229': 'VA',
  '230': 'VA', '231': 'VA', '232': 'VA', '233': 'VA', '234': 'VA', '235': 'VA', '236': 'VA', '237': 'VA', '238': 'VA', '239': 'VA',
  '240': 'VA', '241': 'VA', '242': 'VA', '243': 'VA', '244': 'VA', '245': 'VA', '246': 'WV',
  '247': 'WV', '248': 'WV', '249': 'WV', '250': 'WV', '251': 'WV', '252': 'WV', '253': 'WV', '254': 'WV', '255': 'WV', '256': 'WV', '257': 'WV', '258': 'WV', '259': 'WV', '260': 'WV', '261': 'WV', '262': 'WV', '263': 'WV', '264': 'WV', '265': 'WV', '266': 'WV', '267': 'WV', '268': 'WV',
  '270': 'NC', '271': 'NC', '272': 'NC', '273': 'NC', '274': 'NC', '275': 'NC', '276': 'NC', '277': 'NC', '278': 'NC', '279': 'NC',
  '280': 'NC', '281': 'NC', '282': 'NC', '283': 'NC', '284': 'NC', '285': 'NC', '286': 'NC', '287': 'NC', '288': 'NC', '289': 'NC',
  '290': 'SC', '291': 'SC', '292': 'SC', '293': 'SC', '294': 'SC', '295': 'SC', '296': 'SC', '297': 'SC', '298': 'SC', '299': 'SC',
  '300': 'GA', '301': 'GA', '302': 'GA', '303': 'GA', '304': 'GA', '305': 'GA', '306': 'GA', '307': 'GA', '308': 'GA', '309': 'GA',
  '310': 'GA', '311': 'GA', '312': 'GA', '313': 'GA', '314': 'GA', '315': 'GA', '316': 'GA', '317': 'GA', '318': 'GA', '319': 'GA',
  '320': 'FL', '321': 'FL', '322': 'FL', '323': 'FL', '324': 'FL', '325': 'FL', '326': 'FL', '327': 'FL', '328': 'FL', '329': 'FL',
  '330': 'FL', '331': 'FL', '332': 'FL', '333': 'FL', '334': 'FL', '335': 'FL', '336': 'FL', '337': 'FL', '338': 'FL', '339': 'FL',
  '340': 'FL',
  '350': 'AL', '351': 'AL', '352': 'AL', '354': 'AL', '355': 'AL', '356': 'AL', '357': 'AL', '358': 'AL', '359': 'AL',
  '360': 'AL', '361': 'AL', '362': 'AL', '363': 'AL', '364': 'AL', '365': 'AL', '366': 'AL', '367': 'AL', '368': 'AL', '369': 'AL',
  '370': 'TN', '371': 'TN', '372': 'TN', '373': 'TN', '374': 'TN', '375': 'TN', '376': 'TN', '377': 'TN', '378': 'TN', '379': 'TN',
  '380': 'TN', '381': 'TN', '382': 'TN', '383': 'TN', '384': 'TN', '385': 'TN',
  '386': 'MS', '387': 'MS', '388': 'MS', '389': 'MS', '390': 'MS', '391': 'MS', '392': 'MS', '393': 'MS', '394': 'MS', '395': 'MS', '396': 'MS', '397': 'MS',
  '400': 'KY', '401': 'KY', '402': 'KY', '403': 'KY', '404': 'KY', '405': 'KY', '406': 'KY', '407': 'KY', '408': 'KY', '409': 'KY',
  '410': 'KY', '411': 'KY', '412': 'KY', '413': 'KY', '414': 'KY', '415': 'KY', '416': 'KY', '417': 'KY', '418': 'KY',
  '420': 'KY', '421': 'KY', '422': 'KY', '423': 'KY', '424': 'KY', '425': 'KY', '426': 'KY', '427': 'KY',
  '430': 'OH', '431': 'OH', '432': 'OH', '433': 'OH', '434': 'OH', '435': 'OH', '436': 'OH', '437': 'OH', '438': 'OH', '439': 'OH',
  '440': 'OH', '441': 'OH', '442': 'OH', '443': 'OH', '444': 'OH', '445': 'OH', '446': 'OH', '447': 'OH', '448': 'OH', '449': 'OH',
  '450': 'OH', '451': 'OH', '452': 'OH', '453': 'OH', '454': 'OH', '455': 'OH', '456': 'OH', '457': 'OH', '458': 'OH',
  '460': 'IN', '461': 'IN', '462': 'IN', '463': 'IN', '464': 'IN', '465': 'IN', '466': 'IN', '467': 'IN', '468': 'IN', '469': 'IN',
  '470': 'IN', '471': 'IN', '472': 'IN', '473': 'IN', '474': 'IN', '475': 'IN', '476': 'IN', '477': 'IN', '478': 'IN', '479': 'IN',
  '480': 'MI', '481': 'MI', '482': 'MI', '483': 'MI', '484': 'MI', '485': 'MI', '486': 'MI', '487': 'MI', '488': 'MI', '489': 'MI',
  '490': 'MI', '491': 'MI', '492': 'MI', '493': 'MI', '494': 'MI', '495': 'MI', '496': 'MI', '497': 'MI', '498': 'MI', '499': 'MI',
  '500': 'IA', '501': 'IA', '502': 'IA', '503': 'IA', '504': 'IA', '505': 'IA', '506': 'IA', '507': 'IA', '508': 'IA', '509': 'IA',
  '510': 'IA', '511': 'IA', '512': 'IA', '513': 'IA', '514': 'IA', '515': 'IA', '516': 'IA', '520': 'IA', '521': 'IA', '522': 'IA', '523': 'IA', '524': 'IA', '525': 'IA', '526': 'IA', '527': 'IA', '528': 'IA',
  '530': 'WI', '531': 'WI', '532': 'WI', '534': 'WI', '535': 'WI', '537': 'WI', '538': 'WI', '539': 'WI',
  '540': 'WI', '541': 'WI', '542': 'WI', '543': 'WI', '544': 'WI', '545': 'WI', '546': 'WI', '547': 'WI', '548': 'WI', '549': 'WI',
  '550': 'MN', '551': 'MN', '553': 'MN', '554': 'MN', '555': 'MN', '556': 'MN', '557': 'MN', '558': 'MN', '559': 'MN',
  '560': 'MN', '561': 'MN', '562': 'MN', '563': 'MN', '564': 'MN', '565': 'MN', '566': 'MN', '567': 'MN',
  '570': 'SD', '571': 'SD', '572': 'SD', '573': 'SD', '574': 'SD', '575': 'SD', '576': 'SD', '577': 'SD',
  '580': 'ND', '581': 'ND', '582': 'ND', '583': 'ND', '584': 'ND', '585': 'ND', '586': 'ND', '587': 'ND', '588': 'ND',
  '590': 'MT', '591': 'MT', '592': 'MT', '593': 'MT', '594': 'MT', '595': 'MT', '596': 'MT', '597': 'MT', '598': 'MT', '599': 'MT',
  '600': 'IL', '601': 'IL', '602': 'IL', '603': 'IL', '604': 'IL', '605': 'IL', '606': 'IL', '607': 'IL', '608': 'IL', '609': 'IL',
  '610': 'IL', '611': 'IL', '612': 'IL', '613': 'IL', '614': 'IL', '615': 'IL', '616': 'IL', '617': 'IL', '618': 'IL', '619': 'IL',
  '620': 'IL', '622': 'IL', '623': 'IL', '624': 'IL', '625': 'IL', '626': 'IL', '627': 'IL', '628': 'IL', '629': 'IL',
  '630': 'MO', '631': 'MO', '633': 'MO', '634': 'MO', '635': 'MO', '636': 'MO', '637': 'MO', '638': 'MO', '639': 'MO',
  '640': 'MO', '641': 'MO', '644': 'MO', '645': 'MO', '646': 'MO', '647': 'MO', '648': 'MO', '649': 'MO',
  '650': 'MO', '651': 'MO', '652': 'MO', '653': 'MO', '654': 'MO', '655': 'MO', '656': 'MO', '657': 'MO', '658': 'MO',
  '660': 'KS', '661': 'KS', '662': 'KS', '664': 'KS', '665': 'KS', '666': 'KS', '667': 'KS', '668': 'KS', '669': 'KS',
  '670': 'KS', '671': 'KS', '672': 'KS', '673': 'KS', '674': 'KS', '675': 'KS', '676': 'KS', '677': 'KS', '678': 'KS', '679': 'KS',
  '680': 'NE', '681': 'NE', '683': 'NE', '684': 'NE', '685': 'NE', '686': 'NE', '687': 'NE', '688': 'NE', '689': 'NE', '690': 'NE', '691': 'NE', '692': 'NE', '693': 'NE',
  '700': 'LA', '701': 'LA', '703': 'LA', '704': 'LA', '705': 'LA', '706': 'LA', '707': 'LA', '708': 'LA', '710': 'LA', '711': 'LA', '712': 'LA', '713': 'LA', '714': 'LA',
  '716': 'AR', '717': 'AR', '718': 'AR', '719': 'AR', '720': 'AR', '721': 'AR', '722': 'AR', '723': 'AR', '724': 'AR', '725': 'AR', '726': 'AR', '727': 'AR', '728': 'AR', '729': 'AR',
  '730': 'OK', '731': 'OK', '734': 'OK', '735': 'OK', '736': 'OK', '737': 'OK', '738': 'OK', '739': 'OK',
  '740': 'OK', '741': 'OK', '743': 'OK', '744': 'OK', '745': 'OK', '746': 'OK', '747': 'OK', '748': 'OK', '749': 'OK',
  '750': 'TX', '751': 'TX', '752': 'TX', '753': 'TX', '754': 'TX', '755': 'TX', '756': 'TX', '757': 'TX', '758': 'TX', '759': 'TX',
  '760': 'TX', '761': 'TX', '762': 'TX', '763': 'TX', '764': 'TX', '765': 'TX', '766': 'TX', '767': 'TX', '768': 'TX', '769': 'TX',
  '770': 'TX', '771': 'TX', '772': 'TX', '773': 'TX', '774': 'TX', '775': 'TX', '776': 'TX', '777': 'TX', '778': 'TX', '779': 'TX',
  '780': 'TX', '781': 'TX', '782': 'TX', '783': 'TX', '784': 'TX', '785': 'TX', '786': 'TX', '787': 'TX', '788': 'TX', '789': 'TX',
  '790': 'TX', '791': 'TX', '792': 'TX', '793': 'TX', '794': 'TX', '795': 'TX', '796': 'TX', '797': 'TX', '798': 'TX', '799': 'TX',
  '800': 'CO', '801': 'CO', '802': 'CO', '803': 'CO', '804': 'CO', '805': 'CO', '806': 'CO', '807': 'CO', '808': 'CO', '809': 'CO',
  '810': 'CO', '811': 'CO', '812': 'CO', '813': 'CO', '814': 'CO', '815': 'CO', '816': 'CO',
  '820': 'WY', '821': 'WY', '822': 'WY', '823': 'WY', '824': 'WY', '825': 'WY', '826': 'WY', '827': 'WY', '828': 'WY', '829': 'WY', '830': 'WY', '831': 'WY',
  '832': 'ID', '833': 'ID', '834': 'ID', '835': 'ID', '836': 'ID', '837': 'ID', '838': 'ID',
  '840': 'UT', '841': 'UT', '842': 'UT', '843': 'UT', '844': 'UT', '845': 'UT', '846': 'UT', '847': 'UT',
  '850': 'AZ', '851': 'AZ', '852': 'AZ', '853': 'AZ', '855': 'AZ', '856': 'AZ', '857': 'AZ', '859': 'AZ', '860': 'AZ', '863': 'AZ', '864': 'AZ', '865': 'AZ',
  '870': 'NM', '871': 'NM', '872': 'NM', '873': 'NM', '874': 'NM', '875': 'NM', '877': 'NM', '878': 'NM', '879': 'NM', '880': 'NM', '881': 'NM', '882': 'NM', '883': 'NM', '884': 'NM',
  '889': 'NV', '890': 'NV', '891': 'NV', '893': 'NV', '894': 'NV', '895': 'NV', '897': 'NV', '898': 'NV',
  '900': 'CA', '901': 'CA', '902': 'CA', '903': 'CA', '904': 'CA', '905': 'CA', '906': 'CA', '907': 'CA', '908': 'CA', '910': 'CA', '911': 'CA', '912': 'CA', '913': 'CA', '914': 'CA', '915': 'CA', '916': 'CA', '917': 'CA', '918': 'CA',
  '919': 'CA', '920': 'CA', '921': 'CA', '922': 'CA', '923': 'CA', '924': 'CA', '925': 'CA', '926': 'CA', '927': 'CA', '928': 'CA',
  '930': 'CA', '931': 'CA', '932': 'CA', '933': 'CA', '934': 'CA', '935': 'CA', '936': 'CA', '937': 'CA', '938': 'CA', '939': 'CA',
  '940': 'CA', '941': 'CA', '942': 'CA', '943': 'CA', '944': 'CA', '945': 'CA', '946': 'CA', '947': 'CA', '948': 'CA', '949': 'CA',
  '950': 'CA', '951': 'CA', '952': 'CA', '953': 'CA', '954': 'CA', '955': 'CA', '956': 'CA', '957': 'CA', '958': 'CA', '959': 'CA',
  '960': 'CA', '961': 'CA',
  '967': 'HI', '968': 'HI',
  '970': 'OR', '971': 'OR', '972': 'OR', '973': 'OR', '974': 'OR', '975': 'OR', '976': 'OR', '977': 'OR', '978': 'OR', '979': 'OR',
  '980': 'WA', '981': 'WA', '982': 'WA', '983': 'WA', '984': 'WA', '985': 'WA', '986': 'WA', '988': 'WA', '989': 'WA',
  '990': 'WA', '991': 'WA', '992': 'WA', '993': 'WA', '994': 'WA',
  '995': 'AK', '996': 'AK', '997': 'AK', '998': 'AK', '999': 'AK',
};

function getStateFromZip(zip: string): string | null {
  const prefix = zip.slice(0, 3);
  return ZIP_PREFIX_TO_STATE[prefix] ?? null;
}

// Map states to the metro region they belong to, for suggesting nearby metros
const STATE_TO_REGION: Record<string, string> = {
  CT: 'Northeast', DE: 'Northeast', MA: 'Northeast', MD: 'Northeast', ME: 'Northeast',
  NH: 'Northeast', NJ: 'Northeast', NY: 'Northeast', PA: 'Northeast', RI: 'Northeast', VT: 'Northeast', DC: 'Northeast',
  AL: 'Southeast', FL: 'Southeast', GA: 'Southeast', KY: 'Southeast', MS: 'Southeast',
  NC: 'Southeast', SC: 'Southeast', TN: 'Southeast', VA: 'Southeast', WV: 'Southeast',
  IA: 'Midwest', IL: 'Midwest', IN: 'Midwest', KS: 'Midwest', MI: 'Midwest',
  MN: 'Midwest', MO: 'Midwest', ND: 'Midwest', NE: 'Midwest', OH: 'Midwest', SD: 'Midwest', WI: 'Midwest',
  AZ: 'Southwest', NM: 'Southwest', OK: 'Southwest', TX: 'Southwest', AR: 'Southwest', LA: 'Southwest',
  AK: 'West', CA: 'West', CO: 'West', HI: 'West', ID: 'West', MT: 'West',
  NV: 'West', OR: 'West', UT: 'West', WA: 'West', WY: 'West',
};

function getSuggestedMetros(stateCode: string | null): { name: string; displayName: string; slug: string }[] {
  const pick = (m: typeof METRO_AREAS[number]) => ({ name: m.name, displayName: m.displayName, slug: m.slug });

  if (!stateCode) return METRO_AREAS.slice(0, 6).map(pick);

  // 1) Metros covering this state directly
  const stateMetros = METRO_AREAS.filter((m) => m.states.includes(stateCode));
  if (stateMetros.length >= 4) return stateMetros.slice(0, 6).map(pick);

  // 2) Metros in the same region
  const region = STATE_TO_REGION[stateCode];
  const regionMetros = region
    ? METRO_AREAS.filter((m) => m.region === region && !stateMetros.some((sm) => sm.slug === m.slug))
    : [];

  const combined = [...stateMetros, ...regionMetros];
  if (combined.length >= 6) return combined.slice(0, 6).map(pick);

  // 3) Fill remaining with popular metros from other regions
  const usedSlugs = new Set(combined.map((m) => m.slug));
  const extras = METRO_AREAS.filter((m) => !usedSlugs.has(m.slug)).slice(0, 6 - combined.length);
  return [...combined, ...extras].slice(0, 6).map(pick);
}

/**
 * Resolve the metro area a search maps to, so we can cross-link the matching
 * /best/[metro] page and surface "#N Best" badges on top-ranked results.
 *
 * Resolution order:
 *   1. Exact slug match on the query (e.g. "seattle" → seattle metro)
 *   2. Nearest metro whose radius covers the resolved lat/lng (proximity search)
 */
function resolveSearchMetro(
  query: string,
  lat?: number | null,
  lng?: number | null,
): MetroArea | undefined {
  const bySlug = query ? getMetroBySlug(slugify(query)) : undefined;
  if (bySlug) return bySlug;

  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return undefined;
  let best: MetroArea | undefined;
  let bestDist = Infinity;
  for (const m of METRO_AREAS) {
    const d = haversineDistance(lat, lng, m.lat, m.lng);
    if (d <= m.radiusMiles && d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Fetch the persisted Best-Of ranks for a metro, keyed by listing_id. This is
 * the same table that powers the "#N Best in [Metro]" badge on detail pages, so
 * the search results stay consistent with the /best/[metro] page. Returns an
 * empty map if the metro has no published ranking yet (used to gate the CTA).
 */
async function getMetroRankMap(metroSlug: string): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('best_of_rankings')
    .select('listing_id, rank')
    .eq('metro_slug', metroSlug)
    .order('rank', { ascending: true });

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.listing_id as string, row.rank as number);
  }
  return map;
}

/**
 * Cheap count of approved touchless listings inside a metro's bounding box.
 * Gates the Best-Of banner/CTA: we only cross-link a /best/[metro] page when it
 * clears the same 3-listing minimum the best-of page itself requires, so we
 * never funnel users to a thin page that 308-redirects away.
 */
async function getMetroListingCount(metro: MetroArea): Promise<number> {
  const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);
  const { count } = await publicListings('id', { count: 'exact', head: true })
    .gte('latitude', box.minLat)
    .lte('latitude', box.maxLat)
    .gte('longitude', box.minLng)
    .lte('longitude', box.maxLng);
  return count ?? 0;
}

function buildBaseHref(query: string, activeFilterSlugs: string[], lat?: number | null, lng?: number | null, washType?: 'touchless' | 'self_serve'): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (lat != null && lng != null) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  }
  if (activeFilterSlugs.length > 0) params.set('filters', activeFilterSlugs.join(','));
  if (washType === 'self_serve') params.set('type', 'self-serve');
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const query = searchParams.q || '';
  const filterSlugs = searchParams.filters?.split(',').filter(Boolean) ?? [];
  const hasCoords = searchParams.lat && searchParams.lng;

  if (!query && filterSlugs.length === 0) {
    return {
      title: 'Search Touchless Car Washes',
      description: 'Search for touchless, touch-free, and brushless car washes by city, zip code, or filter. Find verified no-scratch car wash locations near you.',
      robots: { index: false, follow: true },
    };
  }

  let title = '';
  if (query) {
    const displayQuery = query.replace(/\b\w/g, c => c.toUpperCase());
    title = hasCoords ? `Touchless Car Washes Near ${displayQuery}` : `Touchless Car Washes in ${displayQuery}`;
  } else {
    title = 'Touchless Car Washes';
  }

  if (filterSlugs.length > 0) {
    const allFilters = await getFilters();
    const filterNames = filterSlugs
      .map(slug => allFilters.find(f => f.slug === slug)?.name)
      .filter(Boolean);
    if (filterNames.length > 0) {
      title += ` with ${filterNames.join(', ')}`;
    }
  }

  return {
    title,
    description: `Find touchless car washes${query ? ` in ${query}` : ''}${filterSlugs.length > 0 ? ' matching your filters' : ''}. Browse verified no-scratch car wash locations with ratings and reviews.`,
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = searchParams.q || '';
  const activeFilterSlugs = searchParams.filters?.split(',').filter(Boolean) ?? [];
  const currentPage = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const lat = searchParams.lat ? parseFloat(searchParams.lat) : null;
  const lng = searchParams.lng ? parseFloat(searchParams.lng) : null;
  const isProximitySearch = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);

  // Wash-type tab: touchless (default/flagship) vs self-serve. The self-serve tab
  // only exists once the category is live; until then this is always touchless,
  // so the search page is unchanged. `source` swaps the visibility rule; the rest
  // of the touchless-only funnel (Best-Of banner, TSS sort) is gated off below.
  const washType: 'touchless' | 'self_serve' =
    SELF_SERVE_LIVE && searchParams.type === 'self-serve' ? 'self_serve' : 'touchless';
  const selfServe = washType === 'self_serve';
  const washNoun = selfServe ? 'self-serve' : 'touchless';
  const source: ListingSource = selfServe ? publicSelfServeListings : publicListings;

  const allFilters = await getFilters();

  const hasSearch = query.length > 0 || activeFilterSlugs.length > 0;

  let listings: (Listing & { distanceMiles?: number })[] = [];
  let resolvedProximity = isProximitySearch;
  let resolvedLat = lat;
  let resolvedLng = lng;

  if (isProximitySearch) {
    listings = await searchByProximity(lat, lng, activeFilterSlugs, allFilters, source);
  } else if (hasSearch) {
    listings = await searchListings(query, activeFilterSlugs, allFilters, source);

    // Fallback: if text search found nothing and no lat/lng, try geocoding the query
    if (listings.length === 0 && query.length > 0) {
      const geo = await serverForwardGeocode(query);
      if (geo) {
        listings = await searchByProximity(geo.lat, geo.lng, activeFilterSlugs, allFilters, source);
        resolvedProximity = true;
        resolvedLat = geo.lat;
        resolvedLng = geo.lng;
      }
    }
  }

  // Optional sort by Touchless Satisfaction Score (unscored fall to the bottom).
  const sortTss = searchParams.sort === 'tss';
  if (sortTss) {
    listings = [...listings].sort(
      (a, b) => (b.touchless_satisfaction_score ?? -1) - (a.touchless_satisfaction_score ?? -1),
    );
  } else if (!resolvedProximity) {
    // Default "recommended" order for non-location searches = the proprietary
    // TSS-first scoreListing composite (same as the browse pages + /best), not
    // raw Google rating. Location ("near me") searches keep nearest-first order.
    listings = [...listings].sort((a, b) => scoreListing(b) - scoreListing(a));
  }

  const totalPages = Math.ceil(listings.length / PAGE_SIZE);
  const page = Math.min(currentPage, Math.max(1, totalPages));
  const paginatedListings = listings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resultLabel = (hasSearch || resolvedProximity)
    ? listings.length > 0
      ? resolvedProximity
        ? `${listings.length} ${washNoun} car wash${listings.length !== 1 ? 'es' : ''} near ${query || 'this location'}`
        : `Found ${listings.length} car wash${listings.length !== 1 ? 'es' : ''}`
      : 'No results found'
    : null;

  const baseHref = buildBaseHref(query, activeFilterSlugs, resolvedLat, resolvedLng, washType);

  // Steer users toward top-tier listings and the matching /best/[metro] page.
  // Banner/CTA show whenever the search maps to a metro with a real best-of page
  // (>=3 listings). Trophy badges are best-effort from the persisted rankings
  // (same source as the detail-page "#N Best in [Metro]" badge), so they stay
  // consistent and simply don't appear for metros not yet synced.
  // Best-Of is a touchless-only funnel (metros ranked by touchless evidence), so
  // it's suppressed on the self-serve tab.
  const searchMetro = !selfServe && listings.length > 0
    ? resolveSearchMetro(query, resolvedLat, resolvedLng)
    : undefined;
  const [metroRanks, metroListingCount] = searchMetro
    ? await Promise.all([getMetroRankMap(searchMetro.slug), getMetroListingCount(searchMetro)])
    : [new Map<string, number>(), 0];
  const hasBestOf = searchMetro != null && metroListingCount >= 3;

  const jsonLd = hasSearch && listings.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: query
          ? `${selfServe ? 'Self-Serve' : 'Touchless'} Car Washes in ${query}`
          : `${selfServe ? 'Self-Serve' : 'Touchless'} Car Wash Search Results`,
        numberOfItems: listings.length,
        itemListElement: paginatedListings.map((listing, index) => ({
          '@type': 'ListItem',
          position: (page - 1) * PAGE_SIZE + index + 1,
          name: listing.name,
          url: `https://touchlesscarwashfinder.com/state/${getStateSlug(listing.state)}/${slugify(listing.city)}/${listing.slug}`,
        })),
      }
    : null;

  return (
    <div className="min-h-screen">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            {resolvedProximity && query
              ? <>{selfServe ? 'Self-Serve' : 'Touchless'} Car Washes Near {query}</>
              : query
                ? <>Results for &ldquo;{query}&rdquo;</>
                : 'Find a Car Wash'}
          </h1>
          {resultLabel && (
            <p className="text-white/70 text-lg">{resultLabel}</p>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">
        {SELF_SERVE_LIVE && (hasSearch || resolvedProximity) && (
          <div className="flex items-center gap-2 mb-5">
            <span className="text-sm text-gray-500">Wash type:</span>
            <Link
              href={buildBaseHref(query, activeFilterSlugs, resolvedLat, resolvedLng, 'touchless')}
              className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${!selfServe ? 'bg-[#0F2744] text-white border-[#0F2744]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0F2744]'}`}
            >
              Touchless
            </Link>
            <Link
              href={buildBaseHref(query, activeFilterSlugs, resolvedLat, resolvedLng, 'self_serve')}
              className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${selfServe ? 'bg-[#0F2744] text-white border-[#0F2744]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0F2744]'}`}
            >
              Self-Serve
            </Link>
          </div>
        )}
        <SearchFilters
          filters={withPaintSafeChip(
            allFilters,
            activeFilterSlugs.includes(PAINT_SAFE_FILTER_SLUG) || listings.some(l => l.paint_safe_verified),
          )}
          activeFilterSlugs={activeFilterSlugs}
          currentQuery={query}
          lat={resolvedLat}
          lng={resolvedLng}
        />

        {(hasSearch || resolvedProximity) && listings.length > 1 && (sortTss || listings.some(l => l.touchless_satisfaction_score != null)) && (
          <div className="flex items-center gap-2 mb-5 -mt-1">
            <span className="text-sm text-gray-500">Sort by:</span>
            <Link
              href={baseHref}
              className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${!sortTss ? 'bg-[#0F2744] text-white border-[#0F2744]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0F2744]'}`}
            >
              Recommended
            </Link>
            <Link
              href={baseHref.includes('?') ? `${baseHref}&sort=tss` : `${baseHref}?sort=tss`}
              className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${sortTss ? 'bg-[#0F2744] text-white border-[#0F2744]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0F2744]'}`}
            >
              Touchless Satisfaction
            </Link>
          </div>
        )}

        {!hasSearch && !resolvedProximity ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-lg text-muted-foreground mb-4">Enter a city name or zip code to search, or select filters above</p>
              <Button asChild>
                <Link href="/#search">Go to Search</Link>
              </Button>
            </CardContent>
          </Card>
        ) : listings.length === 0 ? (
          <NoResultsSection query={query} activeFilterSlugs={activeFilterSlugs} isProximitySearch={resolvedProximity} lat={resolvedLat} lng={resolvedLng} washNoun={washNoun} selfServe={selfServe} />
        ) : (
          <>
            {hasBestOf && searchMetro && (
              <Link
                href={`/best/${searchMetro.slug}`}
                className="group mb-6 flex items-center gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 hover:border-amber-400 hover:shadow-md transition-all"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                  <Trophy className="h-6 w-6 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[#0F2744]">
                    See the Top-Ranked Touchless Car Washes in {searchMetro.name}
                  </p>
                  <p className="text-sm text-gray-600">
                    Our editor-ranked list, scored by ratings, reviews &amp; verified touchless evidence.
                  </p>
                </div>
                <span className="hidden shrink-0 items-center gap-1 rounded-xl bg-[#0F2744] px-4 py-2 text-sm font-semibold text-white group-hover:bg-amber-500 transition-colors sm:inline-flex">
                  View Rankings
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedListings.map((listing, idx) => (
                <Fragment key={listing.id}>
                  {/* "#N Best" trophy chip only when the wash earns it (own TSS ≥ "Good") */}
                  <ListingCard
                    listing={listing}
                    distance={listing.distanceMiles}
                    rank={earnsTrophy(listing) ? metroRanks.get(listing.id) : undefined}
                    context={selfServe ? 'self-serve' : 'default'}
                  />
                  {/* Inline funnel after the first row (page 1 only) */}
                  {hasBestOf && searchMetro && page === 1 && idx === 2 && listings.length > 3 && (
                    <Link
                      href={`/best/${searchMetro.slug}`}
                      className="col-span-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-5 py-3 text-sm font-semibold text-[#0F2744] hover:bg-amber-50 hover:border-amber-400 transition-colors"
                    >
                      <Trophy className="h-4 w-4 text-amber-500" />
                      See the full ranked list &mdash; Best Touchless Car Washes in {searchMetro.name}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </Fragment>
              ))}
            </div>
            <Pagination
              currentPage={page}
              totalItems={listings.length}
              baseHref={baseHref}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ─── No Results Section ────────────────────────────────────────────────── */

function NoResultsSection({
  query,
  activeFilterSlugs,
  isProximitySearch,
  washNoun = 'touchless',
  selfServe = false,
}: {
  query: string;
  activeFilterSlugs: string[];
  isProximitySearch?: boolean;
  lat?: number | null;
  lng?: number | null;
  washNoun?: string;
  selfServe?: boolean;
}) {
  const isZip = /^\d{5}$/.test(query.trim());
  const stateFromZip = isZip ? getStateFromZip(query.trim()) : null;
  const stateFromQuery = !isZip ? guessStateFromQuery(query) : null;
  const stateCode = stateFromZip ?? stateFromQuery?.code ?? null;
  const stateInfo = stateCode ? US_STATES.find((s) => s.code === stateCode) : null;
  const suggestedMetros = getSuggestedMetros(stateCode);

  return (
    <div className="space-y-8">
      {/* Main no-results card */}
      <Card>
        <CardContent className="p-10 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {isProximitySearch
              ? `No ${washNoun} car washes found near ${query || 'this location'}`
              : `No ${washNoun} car washes found${query ? ` for \u201c${query}\u201d` : ''}`}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {isProximitySearch
              ? `We searched within 100 miles but didn\u2019t find any verified ${washNoun} car washes${stateInfo ? `. Try browsing ${stateInfo.name} or a nearby metro area` : '. Try browsing by state or checking a nearby metro area'}.`
              : isZip
                ? `We don\u2019t have any verified ${washNoun} car washes at that ZIP code yet${stateInfo ? `, but we have listings throughout ${stateInfo.name}` : ''}.`
                : 'Try searching for a nearby city, a different ZIP code, or browse by state below.'}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {activeFilterSlugs.length > 0 && (
              <Button variant="outline" asChild>
                <Link href={buildBaseHref(query, [])}>Clear Filters</Link>
              </Button>
            )}
            {stateInfo && (
              <Button asChild>
                <Link href={selfServe ? `/self-serve-car-wash/${getStateSlug(stateInfo.code)}` : `/state/${getStateSlug(stateInfo.code)}`}>
                  <MapPin className="w-4 h-4 mr-1.5" />
                  Browse {stateInfo.name}
                </Link>
              </Button>
            )}
            <Button variant={stateInfo ? 'outline' : 'default'} asChild>
              <Link href={selfServe ? '/self-serve-car-wash' : '/states'}>
                <MapIcon className="w-4 h-4 mr-1.5" />
                {selfServe ? 'Browse Self-Serve' : 'Browse All States'}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Suggested "Best Of" metros — touchless-only funnel, hidden on self-serve */}
      {!selfServe && suggestedMetros.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            {stateCode ? 'Top-Rated Nearby' : 'Popular Metro Areas'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestedMetros.map((metro) => (
              <Link
                key={metro.slug}
                href={`/best/${metro.slug}`}
                className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-colors group"
              >
                <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                    Best in {metro.displayName}
                  </p>
                  <p className="text-sm text-gray-500">Top-rated touchless washes</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
