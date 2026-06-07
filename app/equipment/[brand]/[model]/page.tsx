import { permanentRedirect } from "next/navigation";
import { getBrandBySlug, getModelBySlug } from "@/lib/equipment-data";

export const revalidate = 3600; // ISR edge-cache full-body response (was force-dynamic no-store bypass)
// ISR on-demand: prerender none at build, but mark the route static so each
// render is cached at the Netlify edge. A dynamic [param] route WITHOUT
// generateStaticParams is treated as fully dynamic (no-store) and bypasses the CDN.
export function generateStaticParams() { return []; }

type Props = {
  params: Promise<{ brand: string; model: string }>;
};

// Equipment model pages were consolidated onto the vendor (brand) page: every
// model now lives in a #model-<slug> section there with its description,
// features and video. These old per-model URLs 301-redirect to that section so
// existing inbound links and indexed URLs keep working and search equity is
// preserved on the richer vendor page.
export default async function ModelDetailRedirect({ params }: Props) {
  const { brand: brandSlug, model: modelSlug } = await params;
  const brand = getBrandBySlug(brandSlug);

  if (!brand) {
    permanentRedirect("/equipment");
  }

  const model = getModelBySlug(brandSlug, modelSlug);
  if (model) {
    permanentRedirect(`/equipment/${brandSlug}#model-${model.slug}`);
  }

  // Brand exists but the model slug is unknown (retired/renamed): send to the
  // vendor page rather than 404.
  permanentRedirect(`/equipment/${brandSlug}`);
}
