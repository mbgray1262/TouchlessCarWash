// Feature definitions for SEO filter landing pages (/features/*)
// Each feature corresponds to a filter slug in the `filters` table.

export type Feature = {
  name: string;
  slug: string;         // Matches filters.slug in DB
  icon: string;         // Lucide icon name (matches SearchFilters ICON_MAP)
  shortDescription: string;
  longDescription: string;
  seoTitle: string;
  seoDescription: string;
  stateTitle: (stateName: string, count: number) => string;
  stateDescription: (stateName: string, count: number) => string;
  stateSeoTitle: (stateName: string, count: number) => string;
  stateSeoDescription: (stateName: string, count: number) => string;
  faqItems: Array<{
    question: string;
    answer: string | ((stateName: string, count: number) => string);
  }>;
};

export const FEATURES: Feature[] = [
  {
    name: 'Free Vacuum',
    slug: 'free-vacuum',
    icon: 'wind',
    shortDescription: 'Touchless car washes with complimentary vacuum stations.',
    longDescription:
      'Many touchless car washes include complimentary vacuum stations so you can clean your vehicle\'s interior right after your wash. These free vacuums typically offer standard suction and crevice tools at no extra cost with any wash purchase.',
    seoTitle: 'Touchless Car Washes with Free Vacuum Stations',
    seoDescription:
      'Find touchless car washes with free vacuum stations across all 50 states. Every listing is verified brushless with complimentary vacuum access.',
    stateTitle: (state, count) =>
      `${count} Touchless Car Wash${count !== 1 ? 'es' : ''} with Free Vacuum in ${state}`,
    stateDescription: (state, count) =>
      `Browse ${count} verified touchless car wash${count !== 1 ? 'es' : ''} with free vacuum stations in ${state}. Every listing is confirmed brushless with complimentary vacuum access.`,
    stateSeoTitle: (state, count) =>
      `Touchless Car Washes with Free Vacuum in ${state} \u2014 ${count} Locations`,
    stateSeoDescription: (state, count) =>
      `Find ${count} touchless car wash${count !== 1 ? 'es' : ''} with free vacuum stations in ${state}. Verified brushless locations with complimentary vacuums.`,
    faqItems: [
      {
        question: 'Do all touchless car washes have free vacuums?',
        answer:
          'No \u2014 free vacuum availability varies by location. Our directory tags car washes that include complimentary vacuum stations so you can filter specifically for them.',
      },
      {
        question: 'What kind of vacuums are available?',
        answer:
          'Most free vacuum stations offer standard high-powered suction with crevice nozzle attachments. Some locations also provide fragrance and upholstery tools at the vacuum station.',
      },
      {
        question: 'Are free vacuums available with any wash package?',
        answer:
          'Policies vary by location. Some car washes include free vacuums with every wash, while others offer vacuum access only with premium packages or membership plans.',
      },
    ],
  },
  {
    name: 'Open 24 Hours',
    slug: 'open-24-hours',
    icon: 'clock',
    shortDescription: 'Touchless car washes open around the clock, 7 days a week.',
    longDescription:
      'Need a car wash at midnight or early morning? These touchless locations are open 24 hours a day, 7 days a week. Whether you work late shifts or prefer washing your car outside of peak hours, these 24-hour touchless car washes are always available.',
    seoTitle: '24-Hour Touchless Car Washes \u2014 Open Day and Night',
    seoDescription:
      'Find touchless car washes open 24 hours across all 50 states. Verified brushless locations available around the clock, 7 days a week.',
    stateTitle: (state, count) =>
      `${count} 24-Hour Touchless Car Wash${count !== 1 ? 'es' : ''} in ${state}`,
    stateDescription: (state, count) =>
      `Browse ${count} touchless car wash${count !== 1 ? 'es' : ''} open 24 hours in ${state}. Verified brushless locations available around the clock.`,
    stateSeoTitle: (state, count) =>
      `24-Hour Touchless Car Washes in ${state} \u2014 ${count} Locations`,
    stateSeoDescription: (state, count) =>
      `Find ${count} touchless car wash${count !== 1 ? 'es' : ''} open 24 hours in ${state}. Verified brushless, always-open locations.`,
    faqItems: [
      {
        question: 'Are 24-hour touchless car washes fully automated?',
        answer:
          'Most 24-hour touchless car washes are fully automated, accepting credit cards or mobile payments at the bay. Staff may not be present during overnight hours, but the wash equipment operates unattended.',
      },
      {
        question: 'Is it safe to use a car wash at night?',
        answer:
          '24-hour car wash locations are typically well-lit with security cameras. The automated, drive-through format means you stay in your vehicle the entire time.',
      },
      {
        question: 'Do 24-hour car washes cost more at night?',
        answer:
          'No \u2014 pricing is the same regardless of the time of day. Some locations may even be less busy during off-peak hours, so you can avoid lines.',
      },
    ],
  },
  {
    name: 'Membership Plans',
    slug: 'membership',
    icon: 'id-card',
    shortDescription: 'Touchless car washes offering membership or loyalty programs.',
    longDescription:
      'Many touchless car washes offer membership or loyalty programs that provide discounted or unlimited washes for a monthly or annual fee. These programs typically include perks like priority access, upgraded wash packages, and free add-ons.',
    seoTitle: 'Touchless Car Washes with Membership Plans',
    seoDescription:
      'Find touchless car washes with membership and loyalty programs across all 50 states. Verified brushless locations with monthly wash plans.',
    stateTitle: (state, count) =>
      `${count} Touchless Car Wash${count !== 1 ? 'es' : ''} with Membership Plans in ${state}`,
    stateDescription: (state, count) =>
      `Browse ${count} touchless car wash${count !== 1 ? 'es' : ''} offering membership programs in ${state}. Verified brushless locations with monthly plans and loyalty perks.`,
    stateSeoTitle: (state, count) =>
      `Touchless Car Washes with Membership Plans in ${state} \u2014 ${count} Locations`,
    stateSeoDescription: (state, count) =>
      `Find ${count} touchless car wash${count !== 1 ? 'es' : ''} with membership plans in ${state}. Verified brushless locations with monthly wash programs.`,
    faqItems: [
      {
        question: 'How much do touchless car wash memberships cost?',
        answer:
          'Monthly membership plans typically range from $20\u2013$50/month depending on the wash tier and location. Most plans include unlimited washes during the membership period.',
      },
      {
        question: 'Can I use my membership at multiple locations?',
        answer:
          'It depends on the car wash chain. Many multi-location operators honor memberships across all their sites. Single-location washes typically limit membership to that one location.',
      },
      {
        question: 'Can I cancel my membership anytime?',
        answer:
          'Most car wash memberships are month-to-month and can be cancelled at any time. Check with the specific location for their cancellation policy.',
      },
    ],
  },
  {
    name: 'Unlimited Wash Club',
    slug: 'unlimited-wash-club',
    icon: 'refresh-cw',
    shortDescription: 'Touchless car washes with unlimited monthly wash programs.',
    longDescription:
      'Unlimited wash clubs let you wash your car as often as you like for a fixed monthly fee. These programs are ideal for drivers who wash frequently \u2014 most members break even after just 2\u20133 washes per month. Many clubs use RFID tags or license plate recognition for fast, automatic entry.',
    seoTitle: 'Touchless Car Washes with Unlimited Wash Plans',
    seoDescription:
      'Find touchless car washes with unlimited monthly wash clubs across all 50 states. Wash as often as you want for one flat monthly fee.',
    stateTitle: (state, count) =>
      `${count} Touchless Car Wash${count !== 1 ? 'es' : ''} with Unlimited Wash Clubs in ${state}`,
    stateDescription: (state, count) =>
      `Browse ${count} touchless car wash${count !== 1 ? 'es' : ''} with unlimited wash clubs in ${state}. Wash as often as you want for one flat monthly fee.`,
    stateSeoTitle: (state, count) =>
      `Touchless Car Washes with Unlimited Wash Clubs in ${state} \u2014 ${count} Locations`,
    stateSeoDescription: (state, count) =>
      `Find ${count} touchless car wash${count !== 1 ? 'es' : ''} with unlimited wash plans in ${state}. Verified brushless locations with monthly clubs.`,
    faqItems: [
      {
        question: 'How do unlimited wash clubs work?',
        answer:
          'You sign up for a monthly plan (typically $20\u2013$50/month), receive an RFID tag or barcode, and can wash your car as many times as you want during the billing period. Most clubs offer different tiers with varying wash packages.',
      },
      {
        question: 'How often can I wash with an unlimited plan?',
        answer:
          'As often as you like \u2014 there are no daily or weekly limits. Some members wash multiple times per week, especially during pollen season or after storms.',
      },
      {
        question: 'What is the difference between membership and unlimited wash club?',
        answer:
          'An unlimited wash club specifically means unlimited washes for a flat monthly fee. "Membership" is broader and may include loyalty punch cards, per-wash discounts, or other program types that are not necessarily unlimited.',
      },
    ],
  },
  {
    name: 'Undercarriage Cleaning',
    slug: 'undercarriage-cleaning',
    icon: 'car',
    shortDescription: 'Touchless car washes that include undercarriage wash service.',
    longDescription:
      'An undercarriage wash sprays the bottom of your vehicle to remove road salt, mud, and debris that can cause rust and corrosion over time. This service is especially valuable in northern states where winter road salt accelerates undercarriage deterioration.',
    seoTitle: 'Touchless Car Washes with Undercarriage Cleaning',
    seoDescription:
      'Find touchless car washes with undercarriage cleaning service across all 50 states. Protect your vehicle from rust, road salt, and corrosion.',
    stateTitle: (state, count) =>
      `${count} Touchless Car Wash${count !== 1 ? 'es' : ''} with Undercarriage Cleaning in ${state}`,
    stateDescription: (state, count) =>
      `Browse ${count} touchless car wash${count !== 1 ? 'es' : ''} with undercarriage cleaning in ${state}. Remove road salt, mud, and debris to prevent rust and corrosion.`,
    stateSeoTitle: (state, count) =>
      `Touchless Car Washes with Undercarriage Cleaning in ${state} \u2014 ${count} Locations`,
    stateSeoDescription: (state, count) =>
      `Find ${count} touchless car wash${count !== 1 ? 'es' : ''} with undercarriage wash in ${state}. Verified brushless locations that clean the bottom of your vehicle.`,
    faqItems: [
      {
        question: 'Why is undercarriage cleaning important?',
        answer:
          'Road salt, mud, and debris accumulate under your vehicle and cause rust and corrosion over time. Regular undercarriage washing removes these contaminants and extends the life of your vehicle\u2019s frame, exhaust, and suspension components.',
      },
      {
        question: 'Is undercarriage cleaning included in every wash?',
        answer:
          'Not always. Many car washes offer undercarriage cleaning as part of a mid-tier or premium wash package. Check the wash menu at each location for details.',
      },
      {
        question: 'How often should I get an undercarriage wash?',
        answer:
          'In northern states with winter road salt, every 2\u20134 weeks during winter is recommended. In milder climates, once a month or after driving on muddy or gravel roads is usually sufficient.',
      },
    ],
  },
];

export function getFeatureBySlug(slug: string): Feature | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
