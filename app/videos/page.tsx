import { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { EQUIPMENT_BRAND_DATA, getModelBySlug } from "@/lib/equipment-data";
import { VideoGallery, GalleryGroup } from "@/components/VideoGallery";

export const revalidate = 3600; // ISR edge-cache full-body response (was force-dynamic no-store bypass)

export const metadata: Metadata = {
  title: "Touchless Car Wash Videos — See the Equipment in Action",
  description:
    "Watch real touchless car wash systems wash a car — PDQ LaserWash, WashWorld Razor, Belanger, Kärcher and more. No brushes, no contact, just clean.",
  alternates: {
    canonical: "https://touchlesscarwashfinder.com/videos",
  },
};

type VideoRow = {
  youtube_id: string;
  title: string;
  brand_slug: string | null;
  model_slug: string | null;
};

async function getVideos(): Promise<VideoRow[]> {
  const { data } = await supabase
    .from("equipment_videos")
    .select("youtube_id,title,brand_slug,model_slug,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data || []) as VideoRow[];
}

export default async function VideosPage() {
  const videos = await getVideos();

  // Group videos by brand, preserving the canonical brand ordering. Videos with
  // no (or an unknown) brand_slug fall into a trailing "More touchless washes"
  // group so nothing is ever dropped from the gallery.
  const byBrand = new Map<string, VideoRow[]>();
  const orphans: VideoRow[] = [];
  for (const v of videos) {
    const known =
      v.brand_slug && EQUIPMENT_BRAND_DATA.some((b) => b.slug === v.brand_slug);
    if (known && v.brand_slug) {
      const arr = byBrand.get(v.brand_slug) ?? [];
      arr.push(v);
      byBrand.set(v.brand_slug, arr);
    } else {
      orphans.push(v);
    }
  }

  const groups: GalleryGroup[] = [];
  for (const brand of EQUIPMENT_BRAND_DATA) {
    const rows = byBrand.get(brand.slug);
    if (!rows || rows.length === 0) continue;
    groups.push({
      brandSlug: brand.slug,
      brandLabel: brand.label,
      brandHref: `/equipment/${brand.slug}`,
      videos: rows.map((r) => {
        const model =
          r.model_slug && r.brand_slug
            ? getModelBySlug(r.brand_slug, r.model_slug)
            : undefined;
        return {
          youtubeId: r.youtube_id,
          title: r.title,
          modelName: model?.name ?? null,
          modelHref: model
            ? `/equipment/${r.brand_slug}#model-${r.model_slug}`
            : null,
        };
      }),
    });
  }

  if (orphans.length > 0) {
    groups.push({
      brandSlug: "_other",
      brandLabel: "More Touchless Washes",
      brandHref: "/equipment",
      videos: orphans.map((r) => ({
        youtubeId: r.youtube_id,
        title: r.title,
        modelName: null,
        modelHref: null,
      })),
    });
  }

  const totalVideos = videos.length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://touchlesscarwashfinder.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Videos",
        item: "https://touchlesscarwashfinder.com/videos",
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
            <span className="text-white">Videos</span>
          </nav>
          <h1 className="text-4xl font-bold mb-4">
            Touchless Car Wash Videos
          </h1>
          <p className="text-lg text-gray-300 max-w-3xl">
            Watch real touchless and touch-free systems wash a car — no brushes,
            no contact, just high-pressure water and detergents. Browse{" "}
            {totalVideos} clips of the equipment used at car washes across the
            country.
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {groups.length > 0 ? (
          <VideoGallery groups={groups} />
        ) : (
          <p className="text-gray-600">Videos are coming soon — check back shortly.</p>
        )}

        {/* Funnel to equipment hub */}
        <div className="mt-14 bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-900 mb-3">
            Want to know which car washes near you use this equipment?
          </p>
          <Link
            href="/equipment"
            className="inline-block bg-[#22C55E] text-white font-medium px-5 py-2.5 rounded-lg hover:bg-[#1ea34d] transition-colors"
          >
            Browse equipment brands →
          </Link>
        </div>
      </div>
    </>
  );
}
