/**
 * Dataset JSON-LD for blog posts that publish original statistical research.
 *
 * Why this exists: AI content tools and Google's Dataset Search index pages
 * with @type: Dataset markup as authoritative data sources. Without this,
 * AI scrapers fall back to pattern-matching whatever URL on our domain
 * looks vaguely related to a stat they want to cite — which is exactly
 * how Pine Country Windows ended up linking a fabricated "market review"
 * citation to /state/kansas/wichita instead of to our real statistics page.
 *
 * Adding Dataset markup with each headline statistic as a PropertyValue
 * gives those scrapers a structured, citable data point. Anchor IDs on
 * the in-page headings (added in app/blog/[slug]/page.tsx) let them
 * deep-link to the specific section.
 *
 * Returns null for any slug we don't have an explicit Dataset definition
 * for — most blog posts are commentary, not data, and shouldn't claim
 * Dataset status.
 */

const SITE_URL = 'https://touchlesscarwashfinder.com';
const ORG_NAME = 'Touchless Car Wash Finder';

interface DatasetInput {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
}

export function getBlogDatasetJsonLd(input: DatasetInput): Record<string, unknown> | null {
  if (input.slug === 'does-touchless-car-wash-scratch-paint-study') {
    return paintSafetyDataset(input);
  }
  if (input.slug === 'best-touchless-car-wash-chains-ranked') {
    return chainRankingDataset(input);
  }
  if (input.slug === 'touchless-car-wash-satisfaction-by-state') {
    return stateRankingDataset(input);
  }
  if (input.slug !== 'touchless-car-wash-statistics') return null;

  const url = `${SITE_URL}/blog/${input.slug}`;

  // variableMeasured uses PropertyValue. Each entry is one headline statistic
  // from the article, anchored to the in-page heading via `url`. AI tools
  // and Google's Dataset Search consume these as canonical data points.
  // Numbers as `value`; units as `unitText`. Sources stay in the prose.
  const variableMeasured = [
    {
      '@type': 'PropertyValue',
      name: 'Verified touchless car wash locations in the US',
      value: 4383,
      unitText: 'locations',
      url: `${url}#original-data-touchless-car-wash-locations-across-america`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Average Google rating across verified touchless car washes',
      value: 3.86,
      unitText: 'stars (out of 5)',
      url: `${url}#original-data-touchless-car-wash-locations-across-america`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Percentage of touchless car washes operating 24 hours daily',
      value: 51,
      unitText: '%',
      url: `${url}#original-data-touchless-car-wash-locations-across-america`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Touchless car washes offering free vacuum stations',
      value: 41,
      unitText: '%',
      url: `${url}#amenities-at-touchless-car-washes`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Touchless car washes offering unlimited wash memberships',
      value: 35,
      unitText: '%',
      url: `${url}#amenities-at-touchless-car-washes`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Touchless car wash locations operated by recognized chains',
      value: 12,
      unitText: '%',
      url: `${url}#chain-vs-independent-touchless-car-washes`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Total Google reviews aggregated across verified touchless car washes',
      value: 694750,
      unitText: 'reviews',
      url: `${url}#original-data-touchless-car-wash-locations-across-america`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Touchless car washes with predominantly positive customer sentiment',
      value: 43,
      unitText: '%',
      url: `${url}#how-customers-feel-about-touchless-car-washes-sentiment-analysis`,
    },
    {
      '@type': 'PropertyValue',
      name: 'US touchless automatic car wash system market size',
      value: 1.38,
      unitText: 'billion USD',
      url: `${url}#touchless-car-wash-market-statistics`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Touchless car wash market projected CAGR through 2033',
      value: 9,
      unitText: '%',
      url: `${url}#touchless-car-wash-market-statistics`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Consumers who prefer touchless or soft-touch washing over brush systems',
      value: 48,
      unitText: '%',
      url: `${url}#touchless-car-wash-market-statistics`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Top state by touchless car wash count: California',
      value: 433,
      unitText: 'locations',
      url: `${url}#top-10-states-by-touchless-car-wash-locations`,
    },
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: input.title,
    description: input.description,
    url,
    sameAs: url,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    keywords: [
      'touchless car wash',
      'car wash statistics',
      'car wash market',
      'touchless car wash market size',
      'touchless car wash growth',
      'car wash industry data',
      'US car wash statistics',
    ],
    creator: {
      '@type': 'Organization',
      name: ORG_NAME,
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: ORG_NAME,
      url: SITE_URL,
    },
    spatialCoverage: {
      '@type': 'Place',
      name: 'United States',
    },
    temporalCoverage: '2024-01-01/2026-04-12',
    measurementTechnique: [
      'Aggregation of operator-confirmed chain location lists',
      'Natural-language analysis of Google review snippets for touchless/brushless mentions',
      'Website content extraction and verification',
      'Community submissions',
    ],
    variableMeasured,
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/html',
        contentUrl: url,
      },
    ],
  };
}

/**
 * Dataset markup for the Touchless Paint-Safety Study
 * (/blog/does-touchless-car-wash-scratch-paint-study). Each headline stat is a
 * citable PropertyValue anchored to the in-page heading it appears under, so AI
 * tools and Google Dataset Search deep-link to the right section.
 */
function paintSafetyDataset(input: DatasetInput): Record<string, unknown> {
  const url = `${SITE_URL}/blog/${input.slug}`;
  const variableMeasured = [
    {
      '@type': 'PropertyValue',
      name: 'Touchless car washes with zero paint-damage complaints',
      value: 66,
      unitText: '%',
      url: `${url}#the-headline-finding`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Touchless car washes with a paint-damage complaint rate under 1% of reviews',
      value: 87,
      unitText: '%',
      url: `${url}#the-headline-finding`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Median share of a touchless wash’s reviews mentioning paint damage',
      value: 0,
      unitText: '%',
      url: `${url}#the-headline-finding`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Verified touchless car washes analyzed',
      value: 4485,
      unitText: 'locations',
      url: `${url}#methodology`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Google reviews analyzed for paint-safety mentions',
      value: 730663,
      unitText: 'reviews',
      url: `${url}#methodology`,
    },
    {
      '@type': 'PropertyValue',
      name: 'Review comments identified that mention paint or finish',
      value: 6144,
      unitText: 'mentions',
      url: `${url}#methodology`,
    },
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: input.title,
    description: input.description,
    url,
    sameAs: url,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    keywords: [
      'touchless car wash paint safety',
      'does touchless car wash scratch paint',
      'car wash paint damage statistics',
      'touchless car wash reviews',
      'brushless car wash',
    ],
    creator: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
    spatialCoverage: { '@type': 'Place', name: 'United States' },
    temporalCoverage: '2024-01-01/2026-06-04',
    measurementTechnique: [
      'Natural-language classification of Google review snippets for paint/finish mentions',
      'Per-location paint-complaint rate computed as a share of total reviews',
    ],
    variableMeasured,
    distribution: [
      { '@type': 'DataDownload', encodingFormat: 'text/html', contentUrl: url },
    ],
  };
}

/**
 * Dataset markup for the chain-ranking study
 * (/blog/best-touchless-car-wash-chains-ranked). Headline facts as citable
 * PropertyValues, anchored to in-page sections.
 */
function chainRankingDataset(input: DatasetInput): Record<string, unknown> {
  const url = `${SITE_URL}/blog/${input.slug}`;
  const variableMeasured = [
    { '@type': 'PropertyValue', name: 'Touchless car wash chains ranked by customer satisfaction', value: 22, unitText: 'chains', url: `${url}#the-full-ranking` },
    { '@type': 'PropertyValue', name: 'Individual chain locations scored', value: 312, unitText: 'locations', url: `${url}#how-we-ranked-the-chains` },
    { '@type': 'PropertyValue', name: 'Highest chain Touchless Satisfaction Score (BP)', value: 77, unitText: 'out of 100', url: `${url}#the-full-ranking` },
    { '@type': 'PropertyValue', name: 'Autowash chain Touchless Satisfaction Score', value: 76, unitText: 'out of 100', url: `${url}#the-full-ranking` },
    { '@type': 'PropertyValue', name: 'Kwik Trip chain Touchless Satisfaction Score', value: 73, unitText: 'out of 100', url: `${url}#the-full-ranking` },
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: input.title,
    description: input.description,
    url,
    sameAs: url,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    keywords: [
      'touchless car wash chains',
      'best touchless car wash chain',
      'car wash chain ranking',
      'touchless satisfaction score',
      'kwik trip car wash',
    ],
    creator: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
    spatialCoverage: { '@type': 'Place', name: 'United States' },
    temporalCoverage: '2024-01-01/2026-06-05',
    measurementTechnique: [
      'Natural-language classification of Google review snippets for touchless-wash sentiment',
      'Per-location Touchless Satisfaction Score averaged by parent chain (min 8 locations)',
    ],
    variableMeasured,
    distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/html', contentUrl: url }],
  };
}

/**
 * Dataset markup for the state-by-state satisfaction ranking
 * (/blog/touchless-car-wash-satisfaction-by-state). Headline facts as citable
 * PropertyValues, anchored to in-page sections. Values are a periodic snapshot;
 * the on-page table itself is regenerated live on each revalidate.
 */
function stateRankingDataset(input: DatasetInput): Record<string, unknown> {
  const url = `${SITE_URL}/blog/${input.slug}`;
  const variableMeasured = [
    { '@type': 'PropertyValue', name: 'States ranked by touchless car wash satisfaction', value: 36, unitText: 'states', url: `${url}#touchless-car-wash-satisfaction-ranked-by-state` },
    { '@type': 'PropertyValue', name: 'National average Touchless Satisfaction Score', value: 70, unitText: 'out of 100', url: `${url}#key-findings` },
    { '@type': 'PropertyValue', name: 'Highest-scoring state (Nebraska) Touchless Satisfaction Score', value: 75, unitText: 'out of 100', url: `${url}#touchless-car-wash-satisfaction-ranked-by-state` },
    { '@type': 'PropertyValue', name: 'Lowest-scoring ranked state (Maryland) Touchless Satisfaction Score', value: 63, unitText: 'out of 100', url: `${url}#touchless-car-wash-satisfaction-ranked-by-state` },
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: input.title,
    description: input.description,
    url,
    sameAs: url,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    keywords: [
      'touchless car wash satisfaction by state',
      'best states touchless car wash',
      'car wash satisfaction ranking',
      'touchless satisfaction score',
      'car wash study',
    ],
    creator: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
    spatialCoverage: { '@type': 'Place', name: 'United States' },
    temporalCoverage: '2024-01-01/2026-07-08',
    measurementTechnique: [
      'Natural-language classification of Google review snippets for touchless-wash sentiment',
      'Per-location Touchless Satisfaction Score averaged by state (min 20 scored washes)',
    ],
    variableMeasured,
    distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/html', contentUrl: url }],
  };
}
