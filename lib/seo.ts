/** Shared SEO constants and utilities */

/** Default Open Graph image used across the site when no page-specific image is available. */
export const DEFAULT_OG_IMAGE = {
  url: 'https://res.cloudinary.com/dret3qhyu/image/upload/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png',
  width: 1200,
  height: 630,
  alt: 'Touchless Car Wash Finder',
};

/** Ensure an image URL uses HTTPS (some DB records store http:// URLs). */
export function ensureHttps(url: string): string {
  return url.replace(/^http:\/\//, 'https://');
}

/**
 * Truncate a meta description to a safe length for SERPs.
 * Cuts at the last word boundary before `maxLen` and appends "..." if truncated.
 */
export function truncateDescription(text: string, maxLen = 155): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(' ', maxLen);
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, maxLen)) + '...';
}
