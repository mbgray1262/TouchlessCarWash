export interface BadgeSvgOptions {
  rank: number;
  metroName: string;
  year: number;
  theme: 'light' | 'dark';
  size: 'standard' | 'compact';
}

export interface Top10BadgeSvgOptions {
  metroName: string;
  year: number;
  theme: 'light' | 'dark';
  size: 'standard' | 'compact';
}

/* ------------------------------------------------------------------ */
/*  Lucide icon paths (24×24 viewBox, stroke-based)                   */
/* ------------------------------------------------------------------ */

const TROPHY_PATHS = [
  'M6 9H4.5a2.5 2.5 0 0 1 0-5H6',
  'M18 9h1.5a2.5 2.5 0 0 0 0-5H18',
  'M4 22h16',
  'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22',
  'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22',
  'M18 2H6v7a6 6 0 0 0 12 0V2Z',
];

const DROPLET_PATH =
  'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getRankAccent(rank: number, theme: 'light' | 'dark'): string {
  if (rank === 1) return '#FBBF24'; // Gold — good contrast on both themes
  if (rank === 2) return theme === 'light' ? '#64748B' : '#94A3B8'; // Silver — darkened for light bg
  return '#D97706'; // Bronze — good on both
}

function getOrdinalSuffix(rank: number): string {
  if (rank === 1) return 'st';
  if (rank === 2) return 'nd';
  return 'rd';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const FONT_STACK =
  'Inter,-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif';

/** Render the Lucide Trophy icon as a nested <svg> */
function renderTrophy(
  x: number,
  y: number,
  size: number,
  color: string,
  sw: number = 2,
): string {
  const paths = TROPHY_PATHS.map((d) => `<path d="${d}"/>`).join('');
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/** Render the Lucide Droplet icon as a nested <svg> */
function renderDroplet(
  x: number,
  y: number,
  size: number,
  color: string,
  sw: number = 2,
  opacity: number = 1,
): string {
  const op = opacity < 1 ? ` opacity="${opacity}"` : '';
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${op}><path d="${DROPLET_PATH}"/></svg>`;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/** Top 10 consolation badge for listings ranked 4–10 in their metro */
export function generateTop10BadgeSvg(options: Top10BadgeSvgOptions): string {
  const { metroName, year, theme, size } = options;

  const isCompact = size === 'compact';
  const w = isCompact ? 220 : 320;
  const h = isCompact ? 72 : 96;

  const bg = theme === 'dark' ? '#0F2744' : '#FFFFFF';
  const textPrimary = theme === 'dark' ? '#FFFFFF' : '#0F2744';
  const textSecondary = theme === 'dark' ? '#94A3B8' : '#6B7280';
  const borderColor = theme === 'dark' ? '#1E3A5F' : '#E2E8F0';
  const brandColor = '#22C55E';
  const accentColor = '#0891B2'; // teal — distinct from gold/silver/bronze
  const isDark = theme === 'dark';
  const metro = escapeXml(metroName);
  const pillAlpha = isDark ? 0.12 : 0.08;
  const wmAlpha = isDark ? 0.06 : 0.04;

  if (isCompact) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
  <defs><clipPath id="card"><rect width="${w}" height="${h}" rx="8"/></clipPath></defs>
  <rect width="${w}" height="${h}" rx="8" fill="${bg}" stroke="${borderColor}" stroke-width="1"/>
  <rect x="0" y="0" width="3" height="${h}" fill="${accentColor}" clip-path="url(#card)"/>
  <rect x="12" y="8" width="56" height="20" rx="4" fill="${accentColor}" opacity="${pillAlpha}"/>
  ${renderTrophy(14, 10, 16, accentColor, 2.5)}
  <text x="33" y="23" font-family="${FONT_STACK}" font-size="9" font-weight="800" fill="${accentColor}">Top 10</text>
  <text x="12" y="42" font-family="${FONT_STACK}" font-size="11" font-weight="700" fill="${textPrimary}">Best Touchless Car Wash</text>
  <text x="12" y="55" font-family="${FONT_STACK}" font-size="9" fill="${textSecondary}">${metro} · ${year}</text>
  <text x="12" y="67" font-family="${FONT_STACK}" font-size="8" font-weight="500" fill="${brandColor}">touchlesscarwashfinder.com</text>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
  <defs><clipPath id="card"><rect width="${w}" height="${h}" rx="10"/></clipPath></defs>
  <rect width="${w}" height="${h}" rx="10" fill="${bg}" stroke="${borderColor}" stroke-width="1"/>
  <rect x="0" y="0" width="4" height="${h}" fill="${accentColor}" clip-path="url(#card)"/>
  ${renderDroplet(w - 58, 24, 48, textPrimary, 1.5, wmAlpha)}
  <rect x="16" y="18" width="78" height="24" rx="5" fill="${accentColor}" opacity="${pillAlpha}"/>
  ${renderTrophy(19, 20, 20, accentColor)}
  <text x="43" y="35" font-family="${FONT_STACK}" font-size="12" font-weight="800" fill="${accentColor}">Top 10</text>
  <text x="100" y="35" font-family="${FONT_STACK}" font-size="13" font-weight="700" fill="${textPrimary}" letter-spacing="0.2">Best Touchless Car Wash</text>
  <text x="16" y="58" font-family="${FONT_STACK}" font-size="11" fill="${textSecondary}">${metro} · ${year}</text>
  ${renderDroplet(16, 68, 10, brandColor, 2.5)}
  <text x="30" y="77" font-family="${FONT_STACK}" font-size="10" font-weight="500" fill="${brandColor}">touchlesscarwashfinder.com</text>
</svg>`;
}

export function generateBadgeSvg(options: BadgeSvgOptions): string {
  const { rank, metroName, year, theme, size } = options;

  const isCompact = size === 'compact';
  const w = isCompact ? 220 : 320;
  const h = isCompact ? 72 : 96;

  const bg = theme === 'dark' ? '#0F2744' : '#FFFFFF';
  const textPrimary = theme === 'dark' ? '#FFFFFF' : '#0F2744';
  const textSecondary = theme === 'dark' ? '#94A3B8' : '#6B7280';
  const borderColor = theme === 'dark' ? '#1E3A5F' : '#E2E8F0';
  const brandColor = '#22C55E';
  const rankAccent = getRankAccent(rank, theme);
  const isDark = theme === 'dark';

  const c: SvgColors = {
    w,
    h,
    bg,
    textPrimary,
    textSecondary,
    borderColor,
    brandColor,
    rankAccent,
    rank,
    metroName,
    year,
    isDark,
  };

  return isCompact ? generateCompactSvg(c) : generateStandardSvg(c);
}

/* ------------------------------------------------------------------ */
/*  Internal types                                                    */
/* ------------------------------------------------------------------ */

interface SvgColors {
  w: number;
  h: number;
  bg: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  brandColor: string;
  rankAccent: string;
  rank: number;
  metroName: string;
  year: number;
  isDark: boolean;
}

/* ------------------------------------------------------------------ */
/*  Standard badge — 320 × 96                                        */
/* ------------------------------------------------------------------ */

function generateStandardSvg(c: SvgColors): string {
  const metro = escapeXml(c.metroName);
  const rankText = `${c.rank}${getOrdinalSuffix(c.rank)}`;
  const pillAlpha = c.isDark ? 0.12 : 0.08;
  const wmAlpha = c.isDark ? 0.06 : 0.04;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}" fill="none">
  <defs>
    <clipPath id="card"><rect width="${c.w}" height="${c.h}" rx="10"/></clipPath>
  </defs>

  <!-- Card background -->
  <rect width="${c.w}" height="${c.h}" rx="10" fill="${c.bg}" stroke="${c.borderColor}" stroke-width="1"/>

  <!-- Left accent strip (rank color) -->
  <rect x="0" y="0" width="4" height="${c.h}" fill="${c.rankAccent}" clip-path="url(#card)"/>

  <!-- Droplet watermark (faint, right side) -->
  ${renderDroplet(c.w - 58, 24, 48, c.textPrimary, 1.5, wmAlpha)}

  <!-- Trophy + rank pill -->
  <rect x="16" y="18" width="58" height="24" rx="5" fill="${c.rankAccent}" opacity="${pillAlpha}"/>
  ${renderTrophy(19, 20, 20, c.rankAccent)}
  <text x="43" y="35" font-family="${FONT_STACK}" font-size="14" font-weight="800" fill="${c.rankAccent}">${rankText}</text>

  <!-- Title (inline with pill) -->
  <text x="82" y="35" font-family="${FONT_STACK}" font-size="13" font-weight="700" fill="${c.textPrimary}" letter-spacing="0.2">Best Touchless Car Wash</text>

  <!-- Metro + Year -->
  <text x="16" y="58" font-family="${FONT_STACK}" font-size="11" fill="${c.textSecondary}">${metro} \u00B7 ${c.year}</text>

  <!-- Brand URL with droplet logo -->
  ${renderDroplet(16, 68, 10, c.brandColor, 2.5)}
  <text x="30" y="77" font-family="${FONT_STACK}" font-size="10" font-weight="500" fill="${c.brandColor}">touchlesscarwashfinder.com</text>
</svg>`;
}

/* ------------------------------------------------------------------ */
/*  Compact badge — 220 × 72                                         */
/* ------------------------------------------------------------------ */

function generateCompactSvg(c: SvgColors): string {
  const metro = escapeXml(c.metroName);
  const rankText = `${c.rank}${getOrdinalSuffix(c.rank)}`;
  const pillAlpha = c.isDark ? 0.12 : 0.08;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}" fill="none">
  <defs>
    <clipPath id="card"><rect width="${c.w}" height="${c.h}" rx="8"/></clipPath>
  </defs>

  <!-- Card background -->
  <rect width="${c.w}" height="${c.h}" rx="8" fill="${c.bg}" stroke="${c.borderColor}" stroke-width="1"/>

  <!-- Left accent strip -->
  <rect x="0" y="0" width="3" height="${c.h}" fill="${c.rankAccent}" clip-path="url(#card)"/>

  <!-- Trophy + rank pill -->
  <rect x="12" y="8" width="48" height="20" rx="4" fill="${c.rankAccent}" opacity="${pillAlpha}"/>
  ${renderTrophy(14, 10, 16, c.rankAccent, 2.5)}
  <text x="33" y="23" font-family="${FONT_STACK}" font-size="11" font-weight="800" fill="${c.rankAccent}">${rankText}</text>

  <!-- Title -->
  <text x="12" y="42" font-family="${FONT_STACK}" font-size="11" font-weight="700" fill="${c.textPrimary}">Best Touchless Car Wash</text>

  <!-- Metro + Year -->
  <text x="12" y="55" font-family="${FONT_STACK}" font-size="9" fill="${c.textSecondary}">${metro} \u00B7 ${c.year}</text>

  <!-- Brand URL -->
  <text x="12" y="67" font-family="${FONT_STACK}" font-size="8" font-weight="500" fill="${c.brandColor}">touchlesscarwashfinder.com</text>
</svg>`;
}
