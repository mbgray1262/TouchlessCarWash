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

export const revalidate = 86400;

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
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brand: brandSlug } = await params;
  const brand = getBrandBySlug(brandSlug);
  if (!brand) return {};

  return {
    title: brand.seoTitle,
    description: brand.seoDescription,
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

async function getBrandListings(brandSlug: string) {
  const { data } = await supabase
    .from("listings")
    .select(
      "id, name, slug, city, state, hero_image, hero_focal_point, google_photo_url, equipment_model"
    )
    .eq("equipment_brand", brandSlug)
    .eq("is_touchless", true)
    .or("hero_image.not.is.null,google_photo_url.not.is.null")
    .limit(8);

  return data || [];
}

export default async function BrandDetailPage({ params }: Props) {
  const { brand: brandSlug } = await params;
  const brand = getBrandBySlug(brandSlug);

  if (!brand) {
    notFound();
  }

  const [listingCount, modelCounts, listings] = await Promise.all([
    getBrandListingCount(brandSlug),
    getModelCounts(brandSlug),
    getBrandListings(brandSlug),
  ]);

  const models = getModelsByBrand(brandSlug);
  const modelsWithListings = models.filter(
    (model) => (modelCounts[model.name] || 0) > 0
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
        {/* Description */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-10">
          <p className="text-blue-900">{brand.description}</p>
        </div>

        {/* Website link */}
        {brand.website && (
          <p className="mb-10">
            <a
              href={brand.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline font-medium"
            >
              Visit {brand.label} website &rarr;
            </a>
          </p>
        )}

        {/* Models section */}
        {modelsWithListings.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">
              {brand.label} Models
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {modelsWithListings.map((model) => {
                const count = modelCounts[model.name] || 0;
                return (
                  <Link
                    key={model.slug}
                    href={`/equipment/${brand.slug}/${model.slug}`}
                  >
                    <Card className="hover:shadow-lg transition-shadow h-full">
                      <CardContent className="p-5">
                        <h3 className="text-lg font-semibold mb-2">
                          {model.name}
                        </h3>
                        <p className="text-sm text-blue-600 font-medium">
                          {count} {count === 1 ? "location" : "locations"}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Listings section */}
        {listings.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">
              Car Washes Using {brand.label}
            </h2>
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
