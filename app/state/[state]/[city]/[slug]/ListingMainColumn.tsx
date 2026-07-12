/**
 * Left (2/3-width) content column of the listing detail page: satisfaction
 * gauge, score comparison, Paint-Safe module, description, wash type &
 * equipment, amenities, packages, memberships, savings calculator, extra
 * details, photo gallery, customer reviews, video, and FAQs.
 */
import Link from 'next/link';
import {
  Sparkles, ExternalLink, HelpCircle, ChevronDown, Droplet, CreditCard, Zap,
  MessageSquareQuote, CheckCircle,
} from 'lucide-react';
import PhotoGalleryGrid from '@/components/PhotoGalleryGrid';
import { SavingsCalculator } from '@/components/SavingsCalculator';
import { TouchlessVideo } from '@/components/TouchlessVideo';
import { Badge } from '@/components/ui/badge';
import PaintSafeModule, { type PaintSnippet } from '@/components/PaintSafeModule';
import TouchlessSatisfactionGauge, { type TssSnippet } from '@/components/TouchlessSatisfactionGauge';
import { TouchlessScoreComparison, type ScoreRankItem } from '@/components/TouchlessScoreComparison';
import type { Listing, ReviewSnippet } from '@/lib/supabase';
import { isSelfServeOnly } from '@/lib/self-serve';
import { getStateSlug, slugify } from '@/lib/constants';
import { getBrandLabel, getBrandBySlug, slugifyModel } from '@/lib/equipment-data';
import { WASH_TYPE_LABELS, asArray, monthlyMemberships, defaultWashPrice } from './listing-content';
import { ReviewSnippetCard } from './listing-ui';

interface ListingMainColumnProps {
  listing: Listing;
  showTouchlessGauge: boolean;
  touchlessReviewSnippets: TssSnippet[];
  cityScoreRanking: ScoreRankItem[];
  paintModuleSnippets: PaintSnippet[];
  genericReviews: ReviewSnippet[];
  galleryPhotos: string[];
  equipmentVideos: { id: string; title: string; brand: string | null }[];
  faqs: { q: string; a: string }[];
}

export function ListingMainColumn({
  listing,
  showTouchlessGauge,
  touchlessReviewSnippets,
  cityScoreRanking,
  paintModuleSnippets,
  genericReviews,
  galleryPhotos,
  equipmentVideos,
  faqs,
}: ListingMainColumnProps) {
  // Self-serve-only listings must not show the touchless "Paint-Safe" framing.
  // The gauge/score/sentiment blocks self-suppress (no touchless data), but the
  // Paint-Safe module renders even in its empty "not enough reviews" state, so
  // gate it explicitly.
  const selfServe = isSelfServeOnly(listing);
  return (
    <div className="lg:col-span-2 space-y-6">
      {/* Touchless Satisfaction Score — the headline 0–100 gauge (and its
          "a score appears once there are 3 reviews" empty state). It rates the
          touchless wash specifically, so it's hidden on self-serve-only listings. */}
      {!selfServe && showTouchlessGauge && (
        <TouchlessSatisfactionGauge
          score={listing.touchless_satisfaction_score ?? null}
          pos={listing.touchless_pos ?? 0}
          neg={listing.touchless_neg ?? 0}
          mentions={listing.touchless_mentions ?? 0}
          trend={listing.touchless_trend ?? null}
          snippets={touchlessReviewSnippets}
        />
      )}
      {!selfServe && cityScoreRanking.length >= 2 && (
        <TouchlessScoreComparison
          items={cityScoreRanking}
          currentId={listing.id}
          cityLabel={listing.city}
          cityHref={`/state/${getStateSlug(listing.state)}/${slugify(listing.city)}?sort=tss`}
        />
      )}
      {/* Touchless Sentiment summary — sits ABOVE the review evidence below as
          a header. Only shown when there is displayable touchless evidence (a
          touchless-themed snippet in the Paint-Safe module) so it never claims
          reviews the visitor can't see, and suppressed when the gauge is present
          (the gauge already shows the sentiment split). */}
      {!selfServe && listing.touchless_sentiment && !showTouchlessGauge && paintModuleSnippets.some((s) => s.theme === 'touchless') && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${
          listing.touchless_sentiment === 'positive'
            ? 'bg-green-50 border-green-200'
            : listing.touchless_sentiment === 'negative'
            ? 'bg-red-50 border-red-200'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <span className="text-lg">
            {listing.touchless_sentiment === 'positive' ? '👍' : listing.touchless_sentiment === 'negative' ? '👎' : '➖'}
          </span>
          <div>
            <span className={`text-sm font-semibold ${
              listing.touchless_sentiment === 'positive'
                ? 'text-green-700'
                : listing.touchless_sentiment === 'negative'
                ? 'text-red-700'
                : 'text-gray-600'
            }`}>
              {listing.touchless_sentiment === 'positive'
                ? 'Positive touchless reviews'
                : listing.touchless_sentiment === 'negative'
                ? 'Negative touchless reviews'
                : 'Mixed touchless reviews'}
            </span>
            <p className="text-xs text-gray-400">Based on customer review analysis</p>
          </div>
        </div>
      )}

      {/* Paint-Safe module — verified badge + unified review-evidence drawer
          (absorbs the old touchless-snippets section). Public badge only; the
          granular paint_score stays internal for ranking. Touchless-only framing,
          so it's hidden on self-serve-only listings. */}
      {!selfServe && (
        <PaintSafeModule
          state={(listing.paint_state as 'verified' | 'has_data_unverified' | 'not_enough') ?? 'not_enough'}
          reviewCount={listing.review_count ?? 0}
          paintPos={listing.paint_pos ?? 0}
          paintNeg={listing.paint_neg ?? 0}
          snippets={paintModuleSnippets}
        />
      )}
      {/* AI-Generated Description */}
      {listing.description && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-[#0F2744] mb-3">{listing.name} — {isSelfServeOnly(listing) ? 'Self-Serve' : 'Touchless & Brushless'} Car Wash in {listing.city}, {listing.state}</h2>
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {listing.description}
          </div>
        </div>
      )}

      {/* "Laser wash" explainer — shown only for laser-named locations */}
      {/laser/i.test(listing.name) && (
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5 text-sm text-gray-700 leading-relaxed">
          <strong className="text-[#0F2744]">Is a &ldquo;laser wash&rdquo; the same as touchless?</strong>{' '}
          Yes — despite the name, a{' '}
          <Link href="/laser-car-wash" className="text-[#0F2744] font-medium hover:underline">laser car wash</Link>{' '}
          is simply another term for a touchless wash. {listing.name} cleans your vehicle with high-pressure
          water and detergents — no brushes ever touch your paint.{' '}
          <Link href="/laser-car-wash" className="text-[#0F2744] font-medium hover:underline">Learn what &ldquo;laser wash&rdquo; means →</Link>
        </div>
      )}


      {/* Wash Type & Equipment */}
      {((listing.touchless_wash_types && listing.touchless_wash_types.length > 0) || listing.equipment_brand) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
            <Droplet className="w-5 h-5 text-blue-500" />
            Wash Type & Equipment
          </h2>
          {listing.touchless_wash_types && listing.touchless_wash_types.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {listing.touchless_wash_types.map((wt: string) => {
                const info = WASH_TYPE_LABELS[wt] || { label: wt, color: 'bg-gray-100 text-gray-700 border-gray-200' };
                return (
                  <Badge key={wt} className={`${info.color} border text-sm py-1 px-3`}>
                    {info.label}
                  </Badge>
                );
              })}
            </div>
          )}
          {listing.equipment_brand && (() => {
            const brandLabel = getBrandLabel(listing.equipment_brand);
            const displayText = listing.equipment_model
              ? `${brandLabel} · ${listing.equipment_model}`
              : brandLabel;
            const brandData = getBrandBySlug(listing.equipment_brand);
            // Link straight to the vendor page's model section (the old
            // per-model URL now 301-redirects there, so we skip the hop).
            const equipmentUrl = listing.equipment_model && brandData
              ? `/equipment/${listing.equipment_brand}#model-${slugifyModel(listing.equipment_model)}`
              : brandData ? `/equipment/${listing.equipment_brand}` : null;
            return (
              <div className="text-sm text-gray-700">
                <span className="font-medium">Equipment: </span>
                {equipmentUrl ? (
                  <Link href={equipmentUrl} className="text-blue-600 hover:underline">
                    {displayText}
                  </Link>
                ) : displayText}
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Equipment identified via AI image recognition and may not be 100% accurate. Car washes may upgrade or replace equipment over time.
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {listing.amenities && listing.amenities.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#22C55E]" />
            Amenities & Features
          </h2>
          <div className="flex flex-wrap gap-2">
            {listing.amenities.map((a: string) => (
              <Badge key={a} variant="outline" className="text-sm py-1 px-3 border-gray-200 text-gray-700">
                {a}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {listing.wash_packages && listing.wash_packages.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-[#0F2744] mb-4">Wash Packages</h2>
          <div className="space-y-3">
            {listing.wash_packages.map((pkg, i) => (
              <div key={i} className="flex items-start justify-between gap-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex-1">
                  <div className="font-semibold text-[#0F2744]">{pkg.name}</div>
                  {pkg.description && <p className="text-sm text-gray-600 mt-0.5">{pkg.description}</p>}
                </div>
                {pkg.price && (
                  <span className="shrink-0 font-bold text-[#22C55E] text-lg">{pkg.price}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Membership Plans from extracted_data */}
      {Array.isArray(listing.extracted_data?.membership_plans) && listing.extracted_data!.membership_plans.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#22C55E]" />
            Membership Plans
          </h2>
          <div className="space-y-3">
            {listing.extracted_data!.membership_plans.map((plan, i) => {
              const planFeatures = asArray(plan.features);
              return (
              <div key={i} className="p-3 rounded-lg bg-green-50 border border-green-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-[#0F2744]">{plan.name}</div>
                    {planFeatures.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {planFeatures.map((f, j) => (
                          <li key={j} className="text-sm text-gray-600 flex items-start gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {plan.price && (
                    <span className="shrink-0 font-bold text-[#22C55E] text-lg">{plan.price}</span>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subscription savings calculator — only where real monthly membership pricing exists */}
      {monthlyMemberships(listing).length > 0 && (
        <SavingsCalculator
          listingName={listing.name}
          memberships={monthlyMemberships(listing)}
          defaultWashPrice={defaultWashPrice(listing)}
        />
      )}

      {/* Special Features & Payment Methods from extracted_data */}
      {listing.extracted_data && (asArray(listing.extracted_data.special_features).length > 0 || asArray(listing.extracted_data.payment_methods).length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Additional Details
          </h2>
          {asArray(listing.extracted_data.special_features).length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-2">Special Features</h3>
              <div className="flex flex-wrap gap-2">
                {asArray(listing.extracted_data.special_features).map((f, i) => (
                  <Badge key={i} variant="outline" className="text-sm py-1 px-3 border-amber-200 bg-amber-50 text-amber-800">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {asArray(listing.extracted_data.payment_methods).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-2">Payment Methods</h3>
              <div className="flex flex-wrap gap-2">
                {asArray(listing.extracted_data.payment_methods).map((pm, i) => (
                  <Badge key={i} variant="outline" className="text-sm py-1 px-3 border-gray-200 text-gray-700">
                    {pm}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {galleryPhotos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-[#0F2744] mb-4">Photos</h2>
          <PhotoGalleryGrid photos={galleryPhotos} listingName={listing.name} />
        </div>
      )}

      {/* Touchless review snippets are now shown inside the Paint-Safe module
          above (unified evidence drawer, "Touchless" theme chip). Section removed
          here to avoid duplicating reviews on the page. */}

      {/* More Customer Reviews — positive, on-topic Google reviews that
          aren't touchless-evidence. Adds review depth to drive engagement
          without diluting the curated touchless-evidence section above. */}
      {genericReviews.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-[#0F2744] flex items-center gap-2">
              <MessageSquareQuote className="w-5 h-5 text-[#0F2744]" />
              More Customer Reviews
            </h2>
            <span className="text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full whitespace-nowrap">
              {genericReviews.length} {genericReviews.length === 1 ? 'review' : 'reviews'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Recent customer reviews from Google for {listing.name}
          </p>
          <div className="space-y-3">
            {genericReviews.map((snippet) => (
              <ReviewSnippetCard key={snippet.id} snippet={snippet} />
            ))}
          </div>
          {listing.google_place_id && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <a
                href={`https://search.google.com/local/reviews?placeid=${listing.google_place_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#22C55E] hover:underline font-medium flex items-center gap-1.5"
              >
                Read all reviews on Google
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* "See a Touchless Wash in Action" — touchless equipment footage, off-topic
          on a self-serve-only listing, so hidden there. */}
      {!selfServe && equipmentVideos.length > 0 && (
        <TouchlessVideo listingId={listing.id} videos={equipmentVideos} preferBrand={listing.equipment_brand} />
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-[#0F2744] mb-5 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#22C55E]" />
          Frequently Asked Questions
        </h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <details key={i} className="group border border-gray-200 rounded-xl overflow-hidden">
              <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer select-none bg-gray-50 hover:bg-gray-100 transition-colors">
                <span className="text-sm font-semibold text-[#0F2744]">{faq.q}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="px-4 py-3 text-sm text-gray-700 leading-relaxed border-t border-gray-100">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
