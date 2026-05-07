/**
 * chain-badge-svg.ts
 *
 * Generates SVG award badges for ranked touchless car wash chains.
 * Mirrors lib/badge-svg.ts (used for individual listing badges) but
 * adds "Chain" to the title line and uses a scope name (e.g. "America"
 * or "Midwest") in place of a metro area name.
 */

export interface ChainBadgeSvgOptions {
  rank: number;         // 1, 2, or 3
  scopeName: string;   // "America" | "Midwest" | "Pacific Coast" | etc.
  year: number;
  theme: 'light' | 'dark';
  size: 'standard' | 'compact';
}

/* ------------------------------------------------------------------ */
/*  Lucide icon paths                                                 */
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
  if (rank === 1) return '#FBBF24';
  if (rank === 2) return theme === 'light' ? '#64748B' : '#94A3B8';
  return '#D97706';
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

function renderTrophy(x: number, y: number, size: number, color: string, sw = 2): string {
  const paths = TROPHY_PATHS.map(d => `<path d="${d}"/>`).join('');
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function renderDroplet(x: number, y: number, size: number, color: string, sw = 2, opacity = 1): string {
  const op = opacity < 1 ? ` opacity="${opacity}"` : '';
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${op}><path d="${DROPLET_PATH}"/></svg>`;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export function generateChainBadgeSvg(options: ChainBadgeSvgOptions): string {
  const { rank, scopeName, year, theme, size } = options;
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
  const scope = escapeXml(scopeName);
  const rankText = `${rank}${getOrdinalSuffix(rank)}`;
  const pillAlpha = isDark ? 0.12 : 0.08;
  const wmAlpha = isDark ? 0.06 : 0.04;

  if (isCompact) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
  <defs><clipPath id="card"><rect width="${w}" height="${h}" rx="8"/></clipPath></defs>
  <rect width="${w}" height="${h}" rx="8" fill="${bg}" stroke="${borderColor}" stroke-width="1"/>
  <rect x="0" y="0" width="3" height="${h}" fill="${rankAccent}" clip-path="url(#card)"/>
  <rect x="12" y="8" width="48" height="20" rx="4" fill="${rankAccent}" opacity="${pillAlpha}"/>
  ${renderTrophy(14, 10, 16, rankAccent, 2.5)}
  <text x="33" y="23" font-family="${FONT_STACK}" font-size="11" font-weight="800" fill="${rankAccent}">${rankText}</text>
  <text x="12" y="42" font-family="${FONT_STACK}" font-size="11" font-weight="700" fill="${textPrimary}">Best Touchless Car Wash Chain</text>
  <text x="12" y="55" font-family="${FONT_STACK}" font-size="9" fill="${textSecondary}">${scope} · ${year}</text>
  <text x="12" y="67" font-family="${FONT_STACK}" font-size="8" font-weight="500" fill="${brandColor}">touchlesscarwashfinder.com</text>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
  <defs><clipPath id="card"><rect width="${w}" height="${h}" rx="10"/></clipPath></defs>
  <rect width="${w}" height="${h}" rx="10" fill="${bg}" stroke="${borderColor}" stroke-width="1"/>
  <rect x="0" y="0" width="4" height="${h}" fill="${rankAccent}" clip-path="url(#card)"/>
  ${renderDroplet(w - 58, 24, 48, textPrimary, 1.5, wmAlpha)}
  <rect x="16" y="18" width="58" height="24" rx="5" fill="${rankAccent}" opacity="${pillAlpha}"/>
  ${renderTrophy(19, 20, 20, rankAccent)}
  <text x="43" y="35" font-family="${FONT_STACK}" font-size="14" font-weight="800" fill="${rankAccent}">${rankText}</text>
  <text x="82" y="35" font-family="${FONT_STACK}" font-size="13" font-weight="700" fill="${textPrimary}" letter-spacing="0.2">Best Touchless Car Wash Chain</text>
  <text x="16" y="58" font-family="${FONT_STACK}" font-size="11" fill="${textSecondary}">${scope} · ${year}</text>
  ${renderDroplet(16, 68, 10, brandColor, 2.5)}
  <text x="30" y="77" font-family="${FONT_STACK}" font-size="10" font-weight="500" fill="${brandColor}">touchlesscarwashfinder.com</text>
</svg>`;
}
