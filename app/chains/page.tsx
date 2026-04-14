import Link from 'next/link';
import { ChevronRight, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { CHAINS, renderChainDescription } from '@/lib/chains';
import { getChainHeroImage } from '@/lib/chain-brand-images';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 3600;

const SITE_URL = 'https://touchlesscarwashfinder.com';

export const metadata: Metadata = {
  title: 'Automatic Touchless Car Wash Chains — Find Locations Nationwide',
  description: 'Browse all major automatic touchless car wash chains in the US. Power Market, Holiday Stationstores, Kwik Trip, Elephant Car Wash, and more — with verified locations, maps, and ratings.',
  alternates: { canonical: `${SITE_URL}/chains` },
  openGraph: {
    title: 'Automatic Touchless Car Wash Chains | Touchless Car Wash Finder',
    description: 'Browse all major automatic touchless car wash chains in the US with verified locations, maps, and ratings.',
    url: `${SITE_URL}/chains`,
    siteName: 'Touchless Car Wash Finder',
    type: 'website',
    images: [DEFAULT_OG_IMAGE],
  },
};

type ChainWithStats = {
  name: string;
  slug: string;
  description: string;
  count: number;
  states: string[];
  heroImage: string | null;
};

async function getChainStats(): Promise<ChainWithStats[]> {
  const results: ChainWithStats[] = [];

  for (const chain of CHAINS) {
    const { data } = await supabase
      .from('listings')
      .select('state')
      .eq('parent_chain', chain.name)
      .eq('is_touchless', true);

    if (!data || data.length === 0) continue;

    const stateSet = new Set(data.map(r => r.state));
    const states = Array.from(stateSet).sort();

    results.push({
      name: chain.name,
      slug: chain.slug,
      description: renderChainDescription(chain.description, data.length),
      count: data.length,
      states,
      heroImage: getChainHeroImage(chain.name),
    });
  }

  return results.sort((a, b) => b.count - a.count);
}

export default async function ChainsPage() {
  const chains = await getChainStats();
  const totalLocations = chains.reduce((s, c) => s + c.count, 0);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Chains', item: `${SITE_URL}/chains` },
    ],
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Hero */}
      <div className="bg-[#0F2744] py-12 md:py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">Chains</span>
          </nav>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#22C55E]" />
            </div>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-3 leading-tight">
            Automatic Touchless Car Wash Chains
          </h1>
          <p className="text-lg text-blue-100">
            {chains.length} major chains with {totalLocations} verified automatic touchless locations across the United States.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">
        <div className="bg-blue-50 rounded-xl p-6 mb-8">
          <p className="text-gray-700 leading-relaxed">
            Many gas station and convenience store chains operate touchless car washes at their locations.
            Below are the major chains with verified touchless car wash locations in our directory.
            Click any chain to see all their locations with maps, ratings, and hours.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {chains.map((chain) => (
            <Link key={chain.slug} href={`/chain/${chain.slug}`}>
              <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer h-full overflow-hidden">
                {chain.heroImage && (
                  <div className="h-40 overflow-hidden">
                    <img
                      src={chain.heroImage}
                      alt={chain.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardContent className="p-5">
                  <h2 className="text-lg font-bold text-foreground mb-1">{chain.name}</h2>
                  <p className="text-primary font-semibold text-sm mb-2">
                    {chain.count} touchless location{chain.count !== 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {chain.description}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {chain.states.map(s => (
                      <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
