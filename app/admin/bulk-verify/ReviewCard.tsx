'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, ExternalLink, ChevronDown, ChevronUp, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, classificationColor, classificationLabel, inferClassificationFromListing } from './utils';
import type { PipelineListing } from './types';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface Props {
  listing: PipelineListing;
  onUpdate: (id: string, updates: Partial<PipelineListing>) => void;
}

export function ReviewCard({ listing, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [heroOverride, setHeroOverride] = useState<string | null>(null);
  const [logoOverride, setLogoOverride] = useState<string | null>(null);

  const classification = inferClassificationFromListing(listing);
  const hero = heroOverride ?? listing.hero_image;
  const logo = logoOverride ?? listing.logo_url;
  const allPhotos = (listing.photos ?? []).filter(p => !(listing.blocked_photos ?? []).includes(p));

  async function handleApprove() {
    setSaving(true);
    const updates: Record<string, unknown> = {
      is_approved: true,
      is_touchless: listing.is_touchless,
      verification_status: 'approved',
    };
    if (heroOverride) updates.hero_image = heroOverride;
    if (logoOverride) updates.logo_url = logoOverride;

    const { error } = await supabase.from('listings').update(updates).eq('id', listing.id);
    setSaving(false);
    if (!error) {
      onUpdate(listing.id, { ...updates, verification_status: 'approved', is_approved: true } as Partial<PipelineListing>);
    }
  }

  async function handleReject() {
    setSaving(true);
    const { error } = await supabase.from('listings').update({
      verification_status: 'rejected',
      is_approved: false,
    }).eq('id', listing.id);
    setSaving(false);
    if (!error) onUpdate(listing.id, { verification_status: 'rejected', is_approved: false });
  }

  async function handleReclassify(newTouchless: boolean | null) {
    setSaving(true);
    const confidence = newTouchless === null ? null : 100;
    const { error } = await supabase.from('listings').update({
      is_touchless: newTouchless,
      classification_confidence: confidence,
      touchless_confidence: newTouchless === null ? null : 'high',
    }).eq('id', listing.id);
    setSaving(false);
    if (!error) {
      onUpdate(listing.id, {
        is_touchless: newTouchless,
        classification_confidence: confidence,
        touchless_confidence: newTouchless === null ? null : 'high',
      });
    }
  }

  async function handleSetHero(url: string) {
    setHeroOverride(url);
    await supabase.from('listings').update({ hero_image: url }).eq('id', listing.id);
    onUpdate(listing.id, { hero_image: url });
  }

  async function handleSetLogo(url: string) {
    setLogoOverride(url);
    await supabase.from('listings').update({ logo_url: url }).eq('id', listing.id);
    onUpdate(listing.id, { logo_url: url });
  }

  async function handleBlockPhoto(url: string) {
    const blocked = [...(listing.blocked_photos ?? []), url];
    await supabase.from('listings').update({ blocked_photos: blocked }).eq('id', listing.id);
    onUpdate(listing.id, { blocked_photos: blocked });
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-sm transition-shadow">
      <div className="flex gap-3 p-4">
        {hero ? (
          <div className="w-20 h-16 rounded-lg overflow-hidden shrink-0 bg-gray-100">
            <img src={hero} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-20 h-16 rounded-lg shrink-0 bg-gray-100 flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-gray-300" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap mb-1">
            <span className="font-semibold text-[#0F2744] text-sm truncate max-w-xs">{listing.name}</span>
            {listing.parent_chain && (
              <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs shrink-0">{listing.parent_chain}</Badge>
            )}
            {listing.classification_source === 'chain_inferred' && (
              <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs shrink-0">chain-inferred</Badge>
            )}
          </div>

          <p className="text-xs text-gray-500 mb-1.5">{listing.city}, {listing.state}</p>

          <div className="flex flex-wrap items-center gap-2">
            {classification && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${classificationColor(classification)}`}>
                {classificationLabel(classification)}
              </span>
            )}
            {listing.classification_confidence !== null && listing.classification_confidence !== undefined && (
              <span className="text-xs text-gray-400">{listing.classification_confidence}% confident</span>
            )}
            {listing.website && (
              <a href={listing.website} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                <ExternalLink className="w-3 h-3" /> site
              </a>
            )}
          </div>

          {listing.touchless_evidence && listing.touchless_evidence.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {listing.touchless_evidence.slice(0, 4).map((e, i) => (
                <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded px-1.5 py-0.5 font-mono">
                  {e.keyword}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          <Button size="sm" onClick={handleApprove} disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={handleReject} disabled={saving}
            className="text-red-600 border-red-200 hover:bg-red-50 h-8 px-3 text-xs">
            <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
          </Button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 justify-center"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Reclassify</p>
              <div className="flex gap-1.5">
                {(['touchless', 'not_touchless', 'uncertain'] as const).map(opt => (
                  <button key={opt}
                    onClick={() => handleReclassify(opt === 'touchless' ? true : opt === 'not_touchless' ? false : null)}
                    disabled={saving}
                    className="text-xs border rounded-lg px-2 py-1 hover:bg-white transition-colors disabled:opacity-50"
                  >
                    {opt === 'touchless' ? 'Touchless' : opt === 'not_touchless' ? 'Not Touchless' : 'Uncertain'}
                  </button>
                ))}
              </div>
            </div>

            {listing.amenities?.length > 0 && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 mb-1">Extracted Amenities ({listing.amenities.length})</p>
                <div className="flex flex-wrap gap-1">
                  {listing.amenities.slice(0, 8).map((a, i) => (
                    <span key={i} className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">{a}</span>
                  ))}
                  {listing.amenities.length > 8 && (
                    <span className="text-xs text-gray-400">+{listing.amenities.length - 8} more</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {allPhotos.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Photos — click to set as hero or logo</p>
              <div className="grid grid-cols-6 gap-1.5">
                {allPhotos.slice(0, 12).map((url, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={url}
                      alt=""
                      className={`w-full aspect-square object-cover rounded-lg cursor-pointer border-2 transition-all ${
                        url === hero ? 'border-emerald-400' : url === logo ? 'border-blue-400' : 'border-transparent hover:border-gray-300'
                      }`}
                      onClick={() => handleSetHero(url)}
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center gap-1">
                      <button onClick={() => handleSetHero(url)}
                        className="text-white text-[10px] bg-emerald-600 rounded px-1.5 py-0.5">Hero</button>
                      <button onClick={e => { e.stopPropagation(); handleSetLogo(url); }}
                        className="text-white text-[10px] bg-blue-600 rounded px-1.5 py-0.5">Logo</button>
                      <button onClick={e => { e.stopPropagation(); handleBlockPhoto(url); }}
                        className="text-white text-[10px] bg-red-600 rounded px-1.5 py-0.5">Block</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {logo && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Detected Logo</p>
              <img src={logo} alt="logo" className="h-12 object-contain border border-gray-200 rounded-lg p-1 bg-white" />
            </div>
          )}

          {listing.crawl_notes && (
            <p className="text-xs text-gray-500 font-mono bg-white border border-gray-100 rounded-lg p-2">
              {listing.crawl_notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
