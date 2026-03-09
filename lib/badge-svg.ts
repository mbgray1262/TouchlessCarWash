export interface BadgeSvgOptions {
  rank: number;
  metroName: string;
  year: number;
  theme: 'light' | 'dark';
  size: 'standard' | 'compact';
}

function getRankAccent(rank: number): string {
  if (rank === 1) return '#FBBF24'; // Gold
  if (rank === 2) return '#94A3B8'; // Silver
  return '#D97706'; // Bronze
}

function getRankGradient(rank: number): {
  light: string;
  mid: string;
  dark: string;
} {
  if (rank === 1)
    return { light: '#FDE68A', mid: '#FBBF24', dark: '#D97706' }; // Gold shimmer
  if (rank === 2)
    return { light: '#E2E8F0', mid: '#CBD5E1', dark: '#94A3B8' }; // Silver shimmer
  return { light: '#FBBF24', mid: '#D97706', dark: '#B45309' }; // Bronze shimmer
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
  const rankAccent = getRankAccent(rank);

  if (isCompact) {
    return generateCompactSvg({
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
    });
  }

  return generateStandardSvg({
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
  });
}

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
}

function generateStandardSvg(c: SvgColors): string {
  const metro = escapeXml(c.metroName);
  const ordinal = getOrdinalSuffix(c.rank);
  const grad = getRankGradient(c.rank);

  // Rank circle positioning
  const cx = 48;
  const cy = 48;
  const r = 23;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}" fill="none">
  <defs>
    <linearGradient id="rg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${grad.light}"/>
      <stop offset="45%" stop-color="${grad.mid}"/>
      <stop offset="100%" stop-color="${grad.dark}"/>
    </linearGradient>
  </defs>

  <!-- Background card -->
  <rect width="${c.w}" height="${c.h}" rx="12" fill="${c.bg}" stroke="${c.borderColor}" stroke-width="1"/>

  <!-- Rank badge: soft outer glow -->
  <circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="${c.rankAccent}" opacity="0.1"/>

  <!-- Rank badge: main gradient circle -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rg)"/>

  <!-- Rank badge: inner decorative ring -->
  <circle cx="${cx}" cy="${cy}" r="${r - 3}" fill="none" stroke="white" stroke-width="0.75" opacity="0.35"/>

  <!-- Rank number (clean, no # symbol) -->
  <text x="${cx - 1}" y="${cy + 8}" text-anchor="middle" font-family="${FONT_STACK}" font-size="26" font-weight="700" fill="white">${c.rank}</text>

  <!-- Ordinal suffix (superscript style) -->
  <text x="${cx + 11}" y="${cy - 4}" font-family="${FONT_STACK}" font-size="10" font-weight="600" fill="white" opacity="0.9">${ordinal}</text>

  <!-- Title -->
  <text x="86" y="32" font-family="${FONT_STACK}" font-size="14" font-weight="700" fill="${c.textPrimary}" letter-spacing="0.2">Best Touchless Car Wash</text>

  <!-- Metro + Year -->
  <text x="86" y="50" font-family="${FONT_STACK}" font-size="12" fill="${c.textSecondary}">${metro} \u00B7 ${c.year}</text>

  <!-- Brand URL -->
  <text x="86" y="74" font-family="${FONT_STACK}" font-size="10" font-weight="500" fill="${c.brandColor}">touchlesscarwashfinder.com</text>

  <!-- Verified checkmark -->
  <circle cx="${c.w - 22}" cy="${cy}" r="10" fill="${c.brandColor}" opacity="0.08"/>
  <circle cx="${c.w - 22}" cy="${cy}" r="7.5" fill="${c.brandColor}"/>
  <path d="M${c.w - 25.5} ${cy} l2.2 2.2 4.2-4.2" stroke="white" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function generateCompactSvg(c: SvgColors): string {
  const metro = escapeXml(c.metroName);
  const ordinal = getOrdinalSuffix(c.rank);
  const grad = getRankGradient(c.rank);

  const cx = 36;
  const cy = 36;
  const r = 17;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}" fill="none">
  <defs>
    <linearGradient id="rg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${grad.light}"/>
      <stop offset="45%" stop-color="${grad.mid}"/>
      <stop offset="100%" stop-color="${grad.dark}"/>
    </linearGradient>
  </defs>

  <rect width="${c.w}" height="${c.h}" rx="10" fill="${c.bg}" stroke="${c.borderColor}" stroke-width="1"/>

  <!-- Rank badge -->
  <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="${c.rankAccent}" opacity="0.1"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rg)"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 2.5}" fill="none" stroke="white" stroke-width="0.6" opacity="0.3"/>

  <!-- Rank number -->
  <text x="${cx - 1}" y="${cy + 6}" text-anchor="middle" font-family="${FONT_STACK}" font-size="19" font-weight="700" fill="white">${c.rank}</text>

  <!-- Ordinal suffix -->
  <text x="${cx + 8}" y="${cy - 3}" font-family="${FONT_STACK}" font-size="8" font-weight="600" fill="white" opacity="0.9">${ordinal}</text>

  <!-- Text -->
  <text x="64" y="24" font-family="${FONT_STACK}" font-size="12" font-weight="700" fill="${c.textPrimary}">Best Touchless Car Wash</text>
  <text x="64" y="40" font-family="${FONT_STACK}" font-size="11" fill="${c.textSecondary}">${metro} \u00B7 ${c.year}</text>
  <text x="64" y="58" font-family="${FONT_STACK}" font-size="9" font-weight="500" fill="${c.brandColor}">touchlesscarwashfinder.com</text>
</svg>`;
}
