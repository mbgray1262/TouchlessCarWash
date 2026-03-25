import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts just the street address from an address field that may contain
 * city, state, and zip already embedded (e.g., "123 Main St, Springfield, IL 62701").
 * Returns only the street portion (e.g., "123 Main St").
 */
export function streetAddress(
  address: string,
  city?: string | null,
  state?: string | null,
  zip?: string | null,
): string {
  if (!address) return '';

  let street = address;

  // Strip trailing zip code (5-digit or 5+4)
  if (zip) {
    street = street.replace(new RegExp(`,?\\s*${zip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '');
  }

  // Strip trailing state abbreviation (with optional preceding comma)
  if (state) {
    street = street.replace(new RegExp(`,?\\s*${state}\\s*$`, 'i'), '');
  }

  // Strip trailing city name (with optional preceding comma)
  if (city) {
    street = street.replace(new RegExp(`,?\\s*${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
  }

  return street.trim();
}

/** Returns true if the listing has a real street address (not just city/state/zip) */
export function hasStreetAddress(
  address: string | null,
  city?: string | null,
  state?: string | null,
  zip?: string | null,
): boolean {
  if (!address) return false;
  const street = streetAddress(address, city, state, zip);
  // A real street address starts with a number
  return street.length > 0 && /^\d/.test(street);
}
