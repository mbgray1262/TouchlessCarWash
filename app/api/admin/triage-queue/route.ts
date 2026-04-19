import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export const dynamic = 'force-dynamic';

type Queue = 'bad_hero' | 'uncertain_audit' | 'held_no_audit' | 'approved_risky';

const LISTING_FIELDS = 'id,name,slug,city,state,hero_image,hero_image_source,google_photo_url,street_view_url,google_place_id,latitude,longitude,is_approved,is_touchless,website,parent_chain,touchless_verified,amenities,crawl_notes,review_count';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const queue = (searchParams.get('queue') as Queue) || 'bad_hero';
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '12', 10), 48);

  try {
    if (queue === 'bad_hero') {
      // Every audit row with BAD hero — join listing data
      const { data: audits, count } = await supabase
        .from('ai_audits')
        .select('listing_id, verdict, confidence, flags, reasoning, hero_image_quality, hero_image_reasoning', { count: 'exact' })
        .eq('hero_image_quality', 'BAD')
        .range(offset, offset + limit - 1);
      if (!audits) return NextResponse.json({ cards: [], total: 0 });
      const ids = audits.map(a => a.listing_id);
      const { data: listings } = await supabase
        .from('listings').select(LISTING_FIELDS).in('id', ids);
      const listingMap = new Map((listings || []).map(l => [l.id, l]));
      const cards = audits.map(a => ({
        ...(listingMap.get(a.listing_id) || {}),
        audit_verdict: a.verdict,
        audit_confidence: a.confidence,
        audit_flags: a.flags,
        audit_reasoning: a.reasoning,
        hero_quality: a.hero_image_quality,
        hero_reasoning: a.hero_image_reasoning,
      })).filter(c => c.id);
      return NextResponse.json({ cards, total: count ?? 0 });
    }

    if (queue === 'uncertain_audit') {
      const { data: audits, count } = await supabase
        .from('ai_audits')
        .select('listing_id, verdict, confidence, flags, reasoning, hero_image_quality, hero_image_reasoning', { count: 'exact' })
        .eq('verdict', 'UNCERTAIN')
        .range(offset, offset + limit - 1);
      if (!audits) return NextResponse.json({ cards: [], total: 0 });
      const ids = audits.map(a => a.listing_id);
      const { data: listings } = await supabase
        .from('listings').select(LISTING_FIELDS).in('id', ids);
      const listingMap = new Map((listings || []).map(l => [l.id, l]));
      const cards = audits
        .map(a => ({
          ...(listingMap.get(a.listing_id) || {}),
          audit_verdict: a.verdict,
          audit_confidence: a.confidence,
          audit_flags: a.flags,
          audit_reasoning: a.reasoning,
          hero_quality: a.hero_image_quality,
          hero_reasoning: a.hero_image_reasoning,
        }))
        .filter(c => c.id && c.is_approved); // only currently-approved uncertains
      return NextResponse.json({ cards, total: count ?? 0 });
    }

    if (queue === 'held_no_audit') {
      // Listings that are held (is_touchless=true, is_approved=false) with no audit row
      const { data: auditedIds } = await supabase.from('ai_audits').select('listing_id').limit(10000);
      const auditedSet = new Set((auditedIds || []).map(a => a.listing_id));
      const { data: held, count } = await supabase
        .from('listings')
        .select(LISTING_FIELDS, { count: 'exact' })
        .eq('is_touchless', true).eq('is_approved', false)
        .order('review_count', { ascending: false, nullsFirst: false })
        .range(0, 2000);
      const unaudited = (held || []).filter(l => !auditedSet.has(l.id));
      const slice = unaudited.slice(offset, offset + limit);
      const cards = slice.map(l => ({
        ...l,
        audit_verdict: null,
        audit_confidence: null,
        audit_flags: null,
        audit_reasoning: null,
        hero_quality: null,
        hero_reasoning: null,
      }));
      return NextResponse.json({ cards, total: unaudited.length });
    }

    if (queue === 'approved_risky') {
      // Currently live, classified only from a single Yelp snippet (weakest signal)
      const { data: listings, count } = await supabase
        .from('listings')
        .select(LISTING_FIELDS, { count: 'exact' })
        .eq('is_touchless', true).eq('is_approved', true)
        .eq('touchless_verified', 'user_review')
        .order('review_count', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);
      // Join with audits
      const ids = (listings || []).map(l => l.id);
      const { data: audits } = await supabase
        .from('ai_audits')
        .select('listing_id, verdict, confidence, flags, reasoning, hero_image_quality, hero_image_reasoning')
        .in('listing_id', ids);
      const auditMap = new Map((audits || []).map(a => [a.listing_id, a]));
      const cards = (listings || []).map(l => {
        const a = auditMap.get(l.id);
        return {
          ...l,
          audit_verdict: a?.verdict ?? null,
          audit_confidence: a?.confidence ?? null,
          audit_flags: a?.flags ?? null,
          audit_reasoning: a?.reasoning ?? null,
          hero_quality: a?.hero_image_quality ?? null,
          hero_reasoning: a?.hero_image_reasoning ?? null,
        };
      });
      return NextResponse.json({ cards, total: count ?? 0 });
    }

    return NextResponse.json({ error: `Unknown queue: ${queue}` }, { status: 400 });
  } catch (e) {
    console.error('triage-queue error', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
