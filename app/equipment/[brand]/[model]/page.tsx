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
  getModelBySlug,
  getModelsByBrand,
} from "@/lib/equipment-data";
import { slugify, US_STATES } from "@/lib/constants";

export const revalidate = 86400;

function getStateName(code: string): string {
  const state = US_STATES.find((s) => s.code === code);
  return state?.name || code;
}

function getStateSlug(code: string): string {
  return slugify(getStateName(code));
}

type Props = {
  params: Promise<{ brand: string; model: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brand: brandSlug, model: modelSlug } = await params;
  const model = getModelBySlug(brandSlug, modelSlug);
  if (!model) return {};

  return {
    title: model.seoTitle,
    description: model.seoDescription,
  };
}

export async function generateStaticParams() {
  return EQUIPMENT_MODEL_DATA.map((model) => ({
    brand: model.brandSlug,
    model: model.slug,
  }));
}

async function getModelListingCount(brandSlug: string, modelName: string) {
  const { count } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("is_touchless", true)
    .eq("equipment_brand", brandSlug)
    .eq("equipment_model", modelName);

  return count || 0;
}

async function getModelListings(brandSlug: string, modelName: string) {
  const { data } = await supabase
    .from("listings")
    .select(
      "id, name, slug, city, state, hero_image, hero_focal_point, google_photo_url, equipment_model"
    )
    .eq("equipment_brand", brandSlug)
    .eq("equipment_model", modelName)
    .eq("is_touchless", true)
    .or("hero_image.not.is.null,google_photo_url.not.is.null")
    .limit(8);

  return data || [];
}

export default async function ModelDetailPage({ params }: Props) {
  const { brand: brandSlug, model: modelSlug } = await params;
  const brand = getBrandBySlug(brandSlug);
  const model = getModelBySlug(brandSlug, modelSlug);

  if (!brand || !model) {
    notFound();
  }

  const [listingCount, listings] = await Promise.all([
    getModelListingCount(brandSlug, model.name),
    getModelListings(brandSlug, model.name),
  ]);

  const siblingModels = getModelsByBrand(brandSlug).filter(
    (m) => m.slug !== model.slug
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
      {
        "@type": "ListItem",
        position: 4,
        name: model.name,
        item: `https://www.touchlesscarwash.com/equipment/${brand.slug}/${model.slug}`,
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
            <Link
              href={`/equipment/${brand.slug}`}
              className="hover:text-white"
            >
              {brand.label}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-white">{model.name}</span>
          </nav>
          <h1 className="text-4xl font-bold mb-4">{model.name}</h1>
          <p className="text-lg text-gray-300">
            {listingCount} touchless car wash{" "}
            {listingCount === 1 ? "location" : "locations"} using the{" "}
            {model.name}
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Description */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-10">
          <p className="text-blue-900">{model.description}</p>
        </div>

        {/* Listings section */}
        {listings.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">
              Car Washes Using the {model.name}
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
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Sibling models */}
        {siblingModels.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">
              Other {brand.label} Models
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {siblingModels.map((sibling) => (
                <Link
                  key={sibling.slug}
                  href={`/equipment/${brand.slug}/${sibling.slug}`}
                >
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-5">
                      <h3 className="text-lg font-semibold">{sibling.name}</h3>
                    </CardContent>
                  </Card>
                </Link>
              ))}
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
                What is the {model.name}?
              </h3>
              <p className="text-gray-600">
                The {model.name} is a touchless car wash system manufactured by{" "}
                {brand.label}. It uses high-pressure water and specialized
                detergents to clean vehicles without physical contact, helping to
                protect your vehicle&apos;s finish.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">
                How many car washes use the {model.name}?
              </h3>
              <p className="text-gray-600">
                We currently list {listingCount} touchless car wash{" "}
                {listingCount === 1 ? "location" : "locations"} using the{" "}
                {model.name} in our directory. This number is regularly updated
                as we verify and add new locations.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Are there other {brand.label} models available?
              </h3>
              <p className="text-gray-600">
                {siblingModels.length > 0
                  ? `Yes, ${brand.label} offers several other touchless car wash models. Check the "Other ${brand.label} Models" section above to explore them.`
                  : `The ${model.name} is currently the only ${brand.label} model tracked in our directory. We add new models as we identify them at car wash locations.`}
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
