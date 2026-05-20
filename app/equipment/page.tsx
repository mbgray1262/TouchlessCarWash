import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { EQUIPMENT_BRAND_DATA, getBrandLabel } from "@/lib/equipment-data";
import { ProductGrid } from "@/components/ProductGrid";

export const dynamic = 'force-dynamic'; // see /state/.../slug for context — Netlify CDN cache (netlify.toml) handles edge perf; force-dynamic prevents the Next.js ISR etag-based 304-without-body bug that kept breaking /blog and /best on the CDN.

export const metadata: Metadata = {
  title: "Touchless Car Wash Equipment & Brands",
  description:
    "Explore touchless car wash equipment brands and models. Find car washes near you by the equipment they use, including PDQ, WashTec, Belanger, and more.",
  alternates: {
    canonical: "https://touchlesscarwashfinder.com/equipment",
  },
};

async function getBrandStats() {
  const { data: brandCounts } = await supabase
    .from("listings")
    .select("equipment_brand")
    .eq("is_touchless", true)
    .not("equipment_brand", "is", null);

  const counts: Record<string, number> = {};
  if (brandCounts) {
    for (const row of brandCounts) {
      const brand = row.equipment_brand as string;
      counts[brand] = (counts[brand] || 0) + 1;
    }
  }

  const heroImages: Record<string, string> = {};
  for (const brand of Object.keys(counts)) {
    const { data: listing } = await supabase
      .from("listings")
      .select("hero_image, google_photo_url")
      .eq("is_touchless", true)
      .eq("equipment_brand", brand)
      .or("hero_image.not.is.null,google_photo_url.not.is.null")
      .limit(1)
      .single();

    if (listing) {
      heroImages[brand] =
        (listing.hero_image as string) ||
        (listing.google_photo_url as string) ||
        "";
    }
  }

  return { counts, heroImages };
}

export default async function EquipmentIndexPage() {
  const { counts, heroImages } = await getBrandStats();

  const brandsWithListings = EQUIPMENT_BRAND_DATA.filter(
    (brand) => (counts[brand.slug] || 0) >= 2
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
            <span className="text-white">Equipment</span>
          </nav>
          <h1 className="text-4xl font-bold mb-4">
            Touchless Car Wash Equipment & Brands
          </h1>
          <p className="text-lg text-gray-300 max-w-3xl">
            Discover the leading manufacturers of touchless car wash systems and
            find locations near you that use each brand.
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-10">
          <p className="text-blue-900">
            Touchless car washes use high-pressure water jets and specialized
            detergents to clean vehicles without physical contact. The equipment
            brand and model can significantly affect wash quality, speed, and the
            range of services offered. Browse the brands below to learn more
            about each manufacturer and find car washes that use their systems.
          </p>
        </div>

        {/* Brand grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {brandsWithListings.map((brand) => {
            const count = counts[brand.slug] || 0;
            const image = heroImages[brand.slug];
            const firstSentence =
              brand.description.split(". ")[0] +
              (brand.description.includes(". ") ? "." : "");

            return (
              <Link key={brand.slug} href={`/equipment/${brand.slug}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full">
                  {image && (
                    <div className="relative aspect-video">
                      <Image
                        src={image}
                        alt={`Car wash using ${brand.label} equipment`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  )}
                  <CardContent className="p-5">
                    <h2 className="text-xl font-semibold mb-2">
                      {brand.label}
                    </h2>
                    <p className="text-gray-600 text-sm mb-3">
                      {firstSentence}
                    </p>
                    <p className="text-sm text-blue-600 font-medium">
                      {count} {count === 1 ? "location" : "locations"}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Affiliate Products — DIY home touchless setup */}
        <section className="mb-12">
          <ProductGrid
            preset="equipment"
            variant="card"
            bg="gray"
            subtitle="Want to run touchless washes at home between commercial visits? Here's the gear that gets it done."
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
                What is a touchless car wash?
              </h3>
              <p className="text-gray-600">
                A touchless car wash uses high-pressure water and detergents to
                clean your vehicle without any brushes or friction materials
                making contact with the paint. This reduces the risk of
                scratches and swirl marks compared to traditional brush-style
                washes.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Does the equipment brand matter?
              </h3>
              <p className="text-gray-600">
                Yes, different equipment brands offer varying levels of cleaning
                power, water efficiency, and wash features. Some brands are
                known for superior drying systems, while others excel at
                pre-soak chemistry or high-pressure rinsing.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">
                How do I know what equipment a car wash uses?
              </h3>
              <p className="text-gray-600">
                Our listings include equipment information when available. You
                can browse by brand on this page, or check individual car wash
                listing pages for equipment details.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
