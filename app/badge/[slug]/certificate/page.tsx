import { cache } from 'react';
import { permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { earnsTrophy } from '@/lib/metro-scoring';
import { tssTier } from '@/lib/touchless-satisfaction';
import { CertificatePrintButton } from '@/components/CertificatePrintButton';
import type { Metadata } from 'next';

export const revalidate = 3600;
// ISR like the badge page: static-cached at the edge, no build-time prerender.
export function generateStaticParams() {
  return [];
}

interface CertListing {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  rating: number | null;
  review_count: number | null;
  touchless_satisfaction_score: number | null;
}
interface Ranking {
  metro_slug: string;
  metro_name: string;
  rank: number;
  computed_at: string;
}

const getListing = cache(async (slug: string) => {
  const { data } = await supabase
    .from('listings')
    .select('id, name, slug, city, state, rating, review_count, touchless_satisfaction_score')
    .eq('slug', slug)
    .maybeSingle();
  return data as CertListing | null;
});

const getRankings = cache(async (listingId: string) => {
  const { data } = await supabase
    .from('best_of_rankings')
    .select('metro_slug, metro_name, rank, computed_at')
    .eq('listing_id', listingId)
    .order('rank', { ascending: true });
  return ((data || []) as Ranking[]).filter((r) => r.rank <= 10);
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListing(slug);
  return {
    title: listing ? `${listing.name} — Printable Award Certificate` : 'Certificate',
    // Utility print page for the owner — never indexed / sitemapped (mirrors the badge page).
    robots: { index: false, follow: true },
    alternates: { canonical: `https://touchlesscarwashfinder.com/badge/${slug}/certificate` },
  };
}

const NAVY = '#0F2744';
const GOLD = '#B8902F';
const GOLD_LT = '#D8B14A';

export default async function CertificatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getListing(slug);
  if (!listing) permanentRedirect('/chains');

  const rankings = await getRankings(listing.id);
  if (rankings.length === 0 || !earnsTrophy(listing)) {
    permanentRedirect(`/state/${getStateSlug(listing.state)}/${slugify(listing.city) || 'unknown'}/${listing.slug}`);
  }

  const top = rankings[0];
  const year = top.computed_at ? new Date(top.computed_at).getFullYear() : new Date().getFullYear();
  const tss = listing.touchless_satisfaction_score;
  const tier = tss != null ? tssTier(tss) : null;
  const isTop3 = top.rank <= 3;

  // QR → home page (UTM-tagged so lobby scans show up in GA). Baked into the
  // static HTML so it always prints, no client JS / external image service.
  const qrSvg = await QRCode.toString('https://touchlesscarwashfinder.com/?utm_source=certificate&utm_medium=qr', {
    type: 'svg',
    margin: 0,
    color: { dark: NAVY, light: '#0000' },
  });

  return (
    <main className="min-h-screen bg-gray-100">
      <style>{`@media print { .cert-toolbar{display:none!important;} body{background:#fff!important;} .cert-page{box-shadow:none!important;margin:0!important;} } @page { size: letter landscape; margin: 0.4in; }`}</style>

      {/* Toolbar (not printed) */}
      <div className="cert-toolbar bg-white border-b border-gray-200">
        <div className="container mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <Link href={`/badge/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#0F2744]">
            <ArrowLeft className="w-4 h-4" /> Back to your badge
          </Link>
          <CertificatePrintButton />
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-8">
        <p className="cert-toolbar text-center text-sm text-gray-500 mb-5">
          Click <strong>Print / Save as PDF</strong>, then print it or save a PDF to frame at your wash.
        </p>

        {/* The certificate */}
        <div className="cert-page bg-white mx-auto" style={{ maxWidth: 920, boxShadow: '0 2px 18px rgba(15,39,68,0.12)' }}>
          <div style={{ border: `9px solid ${NAVY}`, padding: 8 }}>
            <div style={{ border: `1.5px solid ${GOLD}`, background: '#FDFCF8', padding: '40px 52px 32px', textAlign: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 11, left: 11, width: 10, height: 10, background: GOLD, transform: 'rotate(45deg)' }} />
              <div style={{ position: 'absolute', top: 11, right: 11, width: 10, height: 10, background: GOLD, transform: 'rotate(45deg)' }} />
              <div style={{ position: 'absolute', bottom: 11, left: 11, width: 10, height: 10, background: GOLD, transform: 'rotate(45deg)' }} />
              <div style={{ position: 'absolute', bottom: 11, right: 11, width: 10, height: 10, background: GOLD, transform: 'rotate(45deg)' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 18 }}>
                <span style={{ fontSize: 13, letterSpacing: '0.2em', color: NAVY }}>TOUCHLESS CAR WASH FINDER</span>
              </div>
              <div style={{ width: 64, height: 2, background: GOLD, margin: '0 auto 22px' }} />

              <div style={{ fontSize: 12, letterSpacing: '0.32em', color: GOLD, marginBottom: 10 }}>CERTIFICATE OF RECOGNITION</div>
              <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 32, color: NAVY, lineHeight: 1.15, marginBottom: 22 }}>
                {year} Best Touchless Car Wash
              </div>

              <div style={{ fontSize: 14, color: '#5B6470', marginBottom: 8 }}>is proudly presented to</div>
              <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 38, color: NAVY, marginBottom: 4 }}>{listing.name}</div>
              <div style={{ fontSize: 14, color: '#5B6470', marginBottom: 22 }}>{listing.city}, {listing.state}</div>

              <div style={{ fontSize: 15, color: NAVY, lineHeight: 1.55, maxWidth: 540, margin: '0 auto 18px' }}>
                Recognized as {isTop3 ? <>the <span style={{ color: GOLD }}>#{top.rank} touchless car wash</span></> : <>a <span style={{ color: GOLD }}>Top 10 touchless car wash</span></>} in the {top.metro_name} area, ranked by our proprietary Touchless&nbsp;Satisfaction&nbsp;Score.
              </div>

              {tss != null && (
                <div style={{ position: 'relative', display: 'inline-block', margin: '8px 0 26px' }}>
                  <div style={{ position: 'absolute', left: '50%', bottom: -17, transform: 'translateX(-50%)', display: 'flex', gap: 22, zIndex: 0 }}>
                    <div style={{ width: 16, height: 38, background: GOLD, transform: 'rotate(14deg)', clipPath: 'polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)' }} />
                    <div style={{ width: 16, height: 38, background: GOLD, transform: 'rotate(-14deg)', clipPath: 'polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)' }} />
                  </div>
                  <div style={{ position: 'relative', zIndex: 1, width: 122, height: 122, borderRadius: '50%', background: NAVY, border: `3px solid ${GOLD}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: 34, lineHeight: 1, color: GOLD_LT }}>{tss}</div>
                    <div style={{ fontSize: 11, color: '#B9C2D0', marginTop: 3 }}>out of 100</div>
                    <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#fff', marginTop: 4, textTransform: 'uppercase' }}>{tier?.label}</div>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 12.5, color: '#8A8F98', maxWidth: 480, margin: '0 auto 22px', lineHeight: 1.5 }}>
                An independent, review-based honor earned from real customer feedback about the touchless wash — never pay-to-play.
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, paddingTop: 16, borderTop: '1px solid #ECE7DA' }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 17, color: NAVY, borderBottom: '1px solid #C9C2B2', paddingBottom: 3, marginBottom: 4 }}>Michael, Founder</div>
                  <div style={{ fontSize: 11, letterSpacing: '0.06em', color: '#8A8F98' }}>TOUCHLESS CAR WASH FINDER</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, color: NAVY }}>touchlesscarwashfinder.com</div>
                  <div style={{ fontSize: 11, color: '#8A8F98', marginTop: 2 }}>Find your nearest touchless wash</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 56, height: 56 }} dangerouslySetInnerHTML={{ __html: qrSvg }} />
                  <div style={{ fontSize: 11, color: '#8A8F98', marginTop: 3 }}>Scan to visit</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
