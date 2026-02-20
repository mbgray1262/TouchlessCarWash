import type { ClassificationLabel, VerificationStatus } from './types';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function classificationColor(label: ClassificationLabel | null | undefined): string {
  switch (label) {
    case 'confirmed_touchless': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'likely_touchless': return 'bg-teal-100 text-teal-800 border-teal-200';
    case 'not_touchless': return 'bg-red-100 text-red-800 border-red-200';
    case 'uncertain': return 'bg-amber-100 text-amber-800 border-amber-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

export function classificationLabel(label: ClassificationLabel | null | undefined): string {
  switch (label) {
    case 'confirmed_touchless': return 'Confirmed Touchless';
    case 'likely_touchless': return 'Likely Touchless';
    case 'not_touchless': return 'Not Touchless';
    case 'uncertain': return 'Uncertain';
    default: return 'Unclassified';
  }
}

export function verificationStatusColor(status: VerificationStatus): string {
  switch (status) {
    case 'approved': return 'bg-emerald-100 text-emerald-700';
    case 'auto_classified': return 'bg-blue-100 text-blue-700';
    case 'crawled': return 'bg-teal-100 text-teal-700';
    case 'crawl_failed': return 'bg-red-100 text-red-700';
    case 'rejected': return 'bg-rose-100 text-rose-700';
    case 'unverified': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

export function inferClassificationFromListing(listing: {
  is_touchless: boolean | null;
  touchless_confidence: string | null;
  verification_status: VerificationStatus;
}): ClassificationLabel | null {
  if (listing.verification_status !== 'auto_classified' && listing.verification_status !== 'approved') return null;
  if (listing.is_touchless === true) {
    return listing.touchless_confidence === 'high' ? 'confirmed_touchless' : 'likely_touchless';
  }
  if (listing.is_touchless === false) return 'not_touchless';
  return 'uncertain';
}

export function edgeFunctionUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

export function edgeFunctionHeaders(): HeadersInit {
  return {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}
