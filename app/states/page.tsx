import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { US_STATES, getStateSlug } from '@/lib/constants';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Touchless Car Washes by State | Browse All States',
  description: 'Find touchless car washes in your state. Browse our directory of verified touchless and brushless car washes across the United States.',
};

async function getStateListingCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('state_listing_counts');
  if (error || !data) return {};
  return data as Record<string, number>;
}

export default async function StatesPage() {
  const stateListingCounts = await getStateListingCounts();
  const statesWithListings = US_STATES.filter(s => (stateListingCounts[s.code] ?? 0) > 0);

  return (
    <div className="min-h-screen">
      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">States</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Browse Touchless Car Washes by State
          </h1>
          <p className="text-white/70 text-lg">
            {statesWithListings.length} states with verified touchless car wash listings
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {statesWithListings.map((state) => (
            <Link
              key={state.code}
              href={`/state/${getStateSlug(state.code)}`}
              className="group"
            >
              <Card className="text-center hover:shadow-lg transition-all cursor-pointer hover:bg-gradient-to-br hover:from-blue-50 hover:to-blue-100">
                <CardContent className="p-6">
                  <div className="text-4xl font-bold text-[#0F2744] mb-2 group-hover:scale-110 transition-transform">
                    {state.code}
                  </div>
                  <div className="text-sm font-medium text-foreground mb-1">
                    {state.name}
                  </div>
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {stateListingCounts[state.code]} wash{stateListingCounts[state.code] !== 1 ? 'es' : ''}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
