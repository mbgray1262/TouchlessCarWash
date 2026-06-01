import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import {
  EQUIPMENT_BRAND_DATA,
  EQUIPMENT_MODEL_DATA,
  getBrandBySlug,
  getModelsByBrand,
} from "@/lib/equipment-data";
import { slugify, US_STATES } from "@/lib/constants";
import { ProductGrid } from "@/components/ProductGrid";
import { EquipmentModelVideo } from "@/components/EquipmentModelVideo";

export const dynamic = 'force-dynamic'; // see /state/.../slug for context — Netlify CDN cache (netlify.toml) handles edge perf; force-dynamic prevents the Next.js ISR etag-based 304-without-body bug that kept breaking /blog and /best on the CDN.

function getStateName(code: string): string {
  const state = US_STATES.find(
    (s) => s.code === code
  );
  return state?.name || code;
}

function getStateSlug(code: string): string {
  return slugify(getStateName(code));
}

type Props = {
  params: Promise<{ brand: string }>;
  // ?model=<exact model name> filters the locations list to one model. The
  // canonical stays the clean /equipment/<brand> URL (set in generateMetadata),
  // so filtered views don't get indexed as duplicates.
  searchParams: Promise<{ model?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brand: brandSlug } = await params;
  const brand = getBrandBySlug(brandSlug);
  if (!brand) return {};

  return {
    title: brand.seoTitle,
    description: brand.seoDescription,
    alternates: {
      canonical: `https://touchlesscarwashfinder.com/equipment/${brandSlug}`,
    },
  };
}

export async function generateStaticParams() {
  return EQUIPMENT_BRAND_DATA.map((brand) => ({
    brand: brand.slug,
  }));
}

async function getModelCounts(brandSlug: string) {
  const { data } = await supabase
    .from("listings")
    .select("equipment_model")
    .eq("is_touchless", true)
    .eq("equipment_brand", brandSlug)
    .not("equipment_model", "is", null);

  const counts: Record<string, number> = {};
  if (data) {
    for (const row of data) {
      const model = row.equipment_model as string;
      counts[model] = (counts[model] || 0) + 1;
    }
  }
  return counts;
}

async function getBrandListingCount(brandSlug: string) {
  const { count } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("is_touchless", true)
    .eq("equipment_brand", brandSlug);

  return count || 0;
}

async function getBrandListings(brandSlug: string, modelName?: string) {
  let q = supabase
    .from("listings")
    .select(
      "id, name, slug, city, state, hero_image, hero_focal_point, google_photo_url, equipment_model"
    )
    .eq("equipment_brand", brandSlug)
    .eq("is_touchless", true)
    .or("hero_image.not.is.null,google_photo_url.not.is.null");

  // When filtered to one model show more of them; otherwise a brand sampler.
  if (modelName) q = q.eq("equipment_model", modelName).limit(24);
  else q = q.limit(8);

  const { data } = await q;
  return data || [];
}

// Map of model_slug -> youtube_id for this brand's active, tagged videos.
// Lowest sort_order wins when a model has more than one tagged clip.
async function getBrandVideos(brandSlug: string): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("equipment_videos")
    .select("model_slug, youtube_id")
    .eq("brand_slug", brandSlug)
    .eq("is_active", true)
    .not("model_slug", "is", null)
    .order("sort_order", { ascending: true });

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const slug = row.model_slug as string;
    if (slug && !map[slug]) map[slug] = row.youtube_id as string;
  }
  return map;
}

export default async function BrandDetailPage({ params, searchParams }: Props) {
  const { brand: brandSlug } = await params;
  const { model: modelFilter } = await searchParams;
  const brand = getBrandBySlug(brandSlug);

  if (!brand) {
    notFound();
  }

  const [listingCount, modelCounts, listings, videoMap] = await Promise.all([
    getBrandListingCount(brandSlug),
    getModelCounts(brandSlug),
    getBrandListings(brandSlug, modelFilter),
    getBrandVideos(brandSlug),
  ]);

  const models = getModelsByBrand(brandSlug);
  // Show a model section if it has real listings OR a tagged video, so models
  // like the Saber/Opti 8000 (and any with a clip) always appear.
  const modelsWithListings = models.filter(
    (model) => (modelCounts[model.name] || 0) > 0 || !!videoMap[model.slug]
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://www.touchlesscarwash.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Equipment",
        item: "https://www.touchlesscarwash.com/equipment",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: brand.label,
        item: `https://www.touchlesscarwash.com/equipment/${brand.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <section className="bg-[#0F2744] text-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <nav className="text-sm text-gray-300 mb-4">
            <Link href="/" className="hover:text-white">
              Home
            </Link>
            <span className="mx-2">/</span>
            <Link href="/equipment" className="hover:text-white">
              Equipment
            </Link>
            <span className="mx-2">/</span>
            <span className="text-white">{brand.label}</span>
          </nav>
          <h1 className="text-4xl font-bold mb-4">{brand.label}</h1>
          <p className="text-lg text-gray-300">
            {listingCount} touchless car wash{" "}
            {listingCount === 1 ? "location" : "locations"} using {brand.label}{" "}
            equipment
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* About section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-10">
          <p className="text-blue-900">{brand.description}</p>
          {brand.website && (
            <p className="mt-3">
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm inline-flex items-center gap-1"
              >
                Visit {brand.label} website &rarr;
              </a>
            </p>
          )}
        </div>

        {/* History */}
        {brand.history && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">
              History of {brand.label}
            </h2>
            <p className="text-gray-700 leading-relaxed">{brand.history}</p>
          </section>
        )}

        {/* Key features */}
        {brand.features && brand.features.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">
              What Makes {brand.label} Different
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {brand.features.map((feature, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4"
                >
                  <span className="text-blue-500 mt-0.5 shrink-0">✓</span>
                  <span className="text-gray-700 text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Models section — each model inline with description, features and a
            video where we have one. Replaces the old per-model pages (which now
            301-redirect to the matching #model-<slug> anchor below). */}
        {modelsWithListings.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">
              {brand.label} Models
            </h2>
            <div className="space-y-6">
              {modelsWithListings.map((model) => {
                const count = modelCounts[model.name] || 0;
                const videoId = videoMap[model.slug];
                return (
                  <div
                    key={model.slug}
                    id={`model-${model.slug}`}
                    className="scroll-mt-24 bg-white border border-gray-200 rounded-xl p-6"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
                      <h3 className="text-xl font-semibold text-[#0F2744]">
                        {model.name}
                      </h3>
                      {count > 0 && (
                        <Link
                          href={`/equipment/${brand.slug}?model=${encodeURIComponent(model.name)}#locations`}
                          className="text-sm text-blue-600 font-medium hover:underline shrink-0"
                        >
                          See {count} {count === 1 ? "location" : "locations"} &rarr;
                        </Link>
                      )}
                    </div>

                    <p className="text-gray-700 leading-relaxed">{model.description}</p>

                    {model.bestFor && (
                      <p className="text-sm text-gray-600 mt-3">
                        <span className="font-semibold">Best for:</span> {model.bestFor}
                      </p>
                    )}

                    {model.keyFeatures && model.keyFeatures.length > 0 && (
                      <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                        {model.keyFeatures.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="text-blue-500 mt-0.5 shrink-0">✓</span>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {videoId && (
                      <EquipmentModelVideo youtubeId={videoId} modelName={model.name} compact />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Listings section */}
        {listings.length > 0 && (
          <section id="locations" className="mb-16 scroll-mt-24">
            <h2 className="text-2xl font-bold mb-6">
              {modelFilter
                ? `Car Washes Using the ${modelFilter}`
                : `Car Washes Using ${brand.label}`}
            </h2>
            {modelFilter && (
              <p className="-mt-4 mb-6 text-sm text-gray-500">
                <Link href={`/equipment/${brand.slug}`} className="text-blue-600 hover:underline">
                  &larr; Show all {brand.label} locations
                </Link>
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {listings.map((listing) => {
                const image =
                  (listing.hero_image as string) ||
                  (listing.google_photo_url as string);
                if (!image) return null;

                const stateName = getStateName(listing.state);
                const stateSlug = getStateSlug(listing.state);
                const citySlug = slugify(listing.city);
                const listingUrl = `/state/${stateSlug}/${citySlug}/${listing.slug}`;

                return (
                  <Link key={listing.id} href={listingUrl}>
                    <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full">
                      <div className="relative aspect-video">
                        <Image
                          src={image}
                          alt={listing.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        />
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-sm mb-1 line-clamp-1">
                          {listing.name}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {listing.city}, {stateName}
                        </p>
                        {listing.equipment_model && (
                          <p className="text-xs text-blue-600 mt-1">
                            {listing.equipment_model}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Affiliate Products — home DIY setup */}
        <section className="mb-12">
          <ProductGrid
            preset="equipment"
            variant="card"
            bg="gray"
            subtitle="Building your own touchless setup at home? Start here."
          />
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-2xl font-bold mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                What makes {brand.label} car washes different?
              </h3>
              <p className="text-gray-600">
                {brand.label} manufactures specialized touchless car wash
                equipment with unique engineering and wash chemistry. Each brand
                has its own approach to water pressure, detergent application,
                and drying systems that affect the overall wash quality.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">
                How many car washes use {brand.label} equipment?
              </h3>
              <p className="text-gray-600">
                We currently list {listingCount} touchless car wash{" "}
                {listingCount === 1 ? "location" : "locations"} using{" "}
                {brand.label} equipment in our directory. This number is
                regularly updated as we add new locations.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Can I search for a specific {brand.label} model?
              </h3>
              <p className="text-gray-600">
                Yes! We track specific equipment models when available. Browse
                the models section above to find car washes using a particular{" "}
                {brand.label} system.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
