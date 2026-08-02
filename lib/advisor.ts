/**
 * Wash-Type Advisor — the decision logic + question set for the interactive "which car wash is
 * right for you?" tool at /car-wash-advisor. Pure + framework-free so it's easy to reason about
 * (and unit-testable): the client quiz and any server rendering both import from here.
 *
 * ADVISOR_LIVE gates the tool exactly like the category launches: while FALSE the page renders
 * (so it can be previewed) but is noindex, not in the nav, and not in /sitemap.xml. Flip to TRUE
 * (one line) + deploy to launch.
 */

export const ADVISOR_LIVE = false;

export type WashType = 'touchless' | 'self_serve' | 'hand_wash' | 'tunnel';

export interface AdvisorOption {
  label: string;
  /** Points this answer adds to each wash type. */
  scores: Partial<Record<WashType, number>>;
}
export interface AdvisorQuestion {
  id: string;
  question: string;
  options: AdvisorOption[];
}

// Four short questions. Scores are tuned so each answer nudges toward the type(s) it genuinely
// favors; the winner is the highest total. Kept deliberately transparent (small integers).
export const ADVISOR_QUESTIONS: AdvisorQuestion[] = [
  {
    id: 'priority',
    question: 'What matters most to you?',
    options: [
      { label: 'Keeping it cheap', scores: { self_serve: 3, tunnel: 1, touchless: 1 } },
      { label: 'The most thorough clean', scores: { hand_wash: 3, touchless: 1 } },
      { label: 'Protecting my paint', scores: { touchless: 3, hand_wash: 1 } },
      { label: 'Speed and convenience', scores: { tunnel: 2, touchless: 2 } },
    ],
  },
  {
    id: 'who',
    question: 'Who should do the washing?',
    options: [
      { label: "I'll do it myself", scores: { self_serve: 3 } },
      { label: "I'd rather someone did it for me", scores: { hand_wash: 3, touchless: 1 } },
      { label: 'A machine is fine', scores: { touchless: 2, tunnel: 2 } },
    ],
  },
  {
    id: 'vehicle',
    question: 'What are you driving?',
    options: [
      { label: 'A regular car', scores: { tunnel: 1 } },
      { label: 'A truck, SUV, or van', scores: { hand_wash: 1, self_serve: 1 } },
      { label: 'Something I baby (luxury, ceramic coat, wrap)', scores: { touchless: 3, hand_wash: 1 } },
    ],
  },
  {
    id: 'frequency',
    question: 'How often do you wash it?',
    options: [
      { label: 'Every week or two', scores: { tunnel: 2, touchless: 2, self_serve: 1 } },
      { label: 'About once a month', scores: { touchless: 1, hand_wash: 1 } },
      { label: 'Only once in a while', scores: { hand_wash: 2 } },
    ],
  },
];

export interface AdvisorResult {
  type: WashType;
  runnerUp: WashType;
  label: string;
  tagline: string;
  why: string[];
  /** Primary directory hub for this wash type. */
  href: string;
  ctaLabel: string;
}

const META: Record<WashType, { label: string; tagline: string; why: string[]; href: string; ctaLabel: string }> = {
  touchless: {
    label: 'A touchless automatic wash',
    tagline: 'Fast, hands-off, and the safest automated option for your paint.',
    why: [
      'No brushes or cloth ever touch your paint — high-pressure water and detergents do the work.',
      'Quick and available around the clock at many locations — ideal for washing often.',
      'The safest automated choice for delicate finishes, ceramic coatings, and wraps.',
    ],
    href: '/best',
    ctaLabel: 'Find the best touchless washes near you',
  },
  self_serve: {
    label: 'A self-serve car wash',
    tagline: 'The cheapest option, with total control over every panel.',
    why: [
      'The most affordable way to wash — typically $3–$12, and you only pay for what you use.',
      'You control the wand and every setting, so you decide exactly how each panel gets cleaned.',
      'Great for a hands-on owner who wants a targeted clean on their own schedule.',
    ],
    href: '/self-serve-car-wash',
    ctaLabel: 'Find a self-serve bay near you',
  },
  hand_wash: {
    label: 'A hand car wash',
    tagline: 'The most thorough clean, done for you by hand.',
    why: [
      'Trained attendants wash your car by hand and reach spots a machine skips — wheels, jambs, trim.',
      'Most locations hand-dry and clean the interior too, for a genuinely deep clean.',
      'The best choice when you want someone else to do it and you want it done thoroughly.',
    ],
    href: '/hand-car-wash',
    ctaLabel: 'Find a hand car wash near you',
  },
  tunnel: {
    label: 'A tunnel (express) wash',
    tagline: 'Fast, cheap, and on every corner — the popular default, with one trade-off to know.',
    why: [
      'Speed and value: a conveyor pulls your car through in a couple of minutes, and unlimited memberships make washing often very cheap.',
      'It’s the most common wash type, so there’s almost always one nearby.',
      'The trade-off: tunnels use spinning brushes or cloth that touch your paint and can leave fine swirl marks over time — most noticeable on darker or delicate finishes.',
    ],
    // We’re a touchless directory, so we don’t list tunnel washes — the honest CTA offers the
    // brush-free version at the same speed rather than pretending we have a tunnel directory.
    href: '/best',
    ctaLabel: 'Want the speed without the brushes? See touchless washes near you',
  },
};

// Ties resolve toward the type we can actually send visitors to and stand behind — so a
// touchless-vs-tunnel tie goes to touchless (brush-free, same speed). Tunnel only wins when it
// strictly outscores everything (a daily-driver owner who prizes speed/cost over paint).
const TIE_ORDER: WashType[] = ['touchless', 'hand_wash', 'self_serve', 'tunnel'];

/** Score a set of chosen options (one per question) and return the recommendation. */
export function recommend(chosen: AdvisorOption[]): AdvisorResult {
  const totals: Record<WashType, number> = { touchless: 0, self_serve: 0, hand_wash: 0, tunnel: 0 };
  for (const opt of chosen) {
    for (const [t, n] of Object.entries(opt.scores)) totals[t as WashType] += n ?? 0;
  }
  const ranked = (Object.keys(totals) as WashType[]).sort(
    (a, b) => totals[b] - totals[a] || TIE_ORDER.indexOf(a) - TIE_ORDER.indexOf(b),
  );
  const type = ranked[0];
  return { type, runnerUp: ranked[1], ...META[type] };
}

export const WASH_META = META;
