export function extractDomain(url: string): string | null {
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(normalized);
    let host = parsed.hostname.toLowerCase();
    host = host.replace(/^www\./, '');
    if (!host || host.length < 4) return null;
    return host;
  } catch {
    return null;
  }
}

export function domainToVendorName(domain: string): string {
  const withoutTld = domain.replace(/\.[^.]+$/, '');
  return withoutTld
    .split(/[-_.]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
