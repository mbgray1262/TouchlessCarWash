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

function getRankLabel(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  return '3rd';
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
  'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

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
  const rankLabel = `#${c.rank}`;

  // Trophy SVG path (simplified)
  const trophyPath = `M12,2 L12,4 L8,4 L8,2 L4,2 L4,6 C4,8 6,10 8,10 L8,12 L6,14 L10,14 L10,12 C12,12 14,10 14,8 L14,6 L16,6 L16,2 Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}" fill="none">
  <rect width="${c.w}" height="${c.h}" rx="12" fill="${c.bg}" stroke="${c.borderColor}" stroke-width="1.5"/>

  <!-- Rank circle -->
  <circle cx="48" cy="38" r="24" fill="${c.rankAccent}" opacity="0.15"/>
  <circle cx="48" cy="38" r="20" fill="${c.rankAccent}"/>

  <!-- Trophy icon inside circle -->
  <g transform="translate(38, 28) scale(0.65)">
    <path d="M7 3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V4H19C19.5523 4 20 4.44772 20 5V7C20 8.65685 18.6569 10 17 10H16.874C16.4299 11.7252 14.8638 13 13 13V15H15C15.5523 15 16 15.4477 16 16V17C16 17.5523 15.5523 18 15 18H9C8.44772 18 8 17.5523 8 17V16C8 15.4477 8.44772 15 9 15H11V13C9.13616 13 7.57006 11.7252 7.12602 10H7C5.34315 10 4 8.65685 4 7V5C4 4.44772 4.44772 4 5 4H7V3Z" fill="${c.bg}" opacity="0.9"/>
  </g>

  <!-- Rank number -->
  <text x="48" y="44" text-anchor="middle" font-family="${FONT_STACK}" font-size="16" font-weight="800" fill="${c.bg}">${rankLabel}</text>

  <!-- Main text -->
  <text x="82" y="30" font-family="${FONT_STACK}" font-size="15" font-weight="700" fill="${c.textPrimary}">Best Touchless Car Wash</text>
  <text x="82" y="50" font-family="${FONT_STACK}" font-size="13" fill="${c.textSecondary}">${metro} \u00B7 ${c.year}</text>

  <!-- Brand footer -->
  <text x="82" y="72" font-family="${FONT_STACK}" font-size="10" font-weight="600" fill="${c.brandColor}">touchlesscarwashfinder.com</text>

  <!-- Verified checkmark -->
  <circle cx="${c.w - 24}" cy="38" r="12" fill="${c.brandColor}" opacity="0.12"/>
  <circle cx="${c.w - 24}" cy="38" r="9" fill="${c.brandColor}"/>
  <path d="M${c.w - 28} 38 l3 3 6-6" stroke="${c.bg}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function generateCompactSvg(c: SvgColors): string {
  const metro = escapeXml(c.metroName);
  const rankLabel = `#${c.rank}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}" fill="none">
  <rect width="${c.w}" height="${c.h}" rx="10" fill="${c.bg}" stroke="${c.borderColor}" stroke-width="1.5"/>

  <!-- Rank circle -->
  <circle cx="36" cy="30" r="16" fill="${c.rankAccent}"/>
  <text x="36" y="35" text-anchor="middle" font-family="${FONT_STACK}" font-size="13" font-weight="800" fill="${c.bg}">${rankLabel}</text>

  <!-- Main text -->
  <text x="62" y="24" font-family="${FONT_STACK}" font-size="12" font-weight="700" fill="${c.textPrimary}">Best Touchless Car Wash</text>
  <text x="62" y="40" font-family="${FONT_STACK}" font-size="11" fill="${c.textSecondary}">${metro} \u00B7 ${c.year}</text>

  <!-- Brand -->
  <text x="62" y="58" font-family="${FONT_STACK}" font-size="9" font-weight="600" fill="${c.brandColor}">touchlesscarwashfinder.com</text>
</svg>`;
}
