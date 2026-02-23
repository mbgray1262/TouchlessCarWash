'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, XCircle, ExternalLink, Calendar, Tag, Mail, MessageSquare } from 'lucide-react';
import { slugify } from '@/lib/constants';

const ISSUE_LABELS: Record<string, string> = {
  permanently_closed: 'Permanently closed',
  not_touchless: 'Not actually touchless',
  wrong_address: 'Wrong address',
  wrong_phone: 'Wrong phone number',
  wrong_hours: 'Wrong hours',
  wrong_website: 'Wrong website',
  other: 'Other',
};

const ISSUE_COLORS: Record<string, string> = {
  permanently_closed: 'bg-red-100 text-red-700',
  not_touchless: 'bg-red-100 text-red-700',
  wrong_address: 'bg-amber-100 text-amber-700',
  wrong_phone: 'bg-amber-100 text-amber-700',
  wrong_hours: 'bg-amber-100 text-amber-700',
  wrong_website: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-600',
};

interface Listing {
  id: string;
  name: string;
  city: string;
  state: string;
  slug: string;
}

interface Edit {
  id: string;
  listing_id: string;
  issue_type: string;
  details: string | null;
  email: string | null;
  status: string;
  created_at: string;
  listings: Listing | Listing[] | null;
}

interface Props {
  initialEdits: Edit[];
}

export default function SuggestedEditsClient({ initialEdits }: Props) {
  const [edits, setEdits] = useState<Edit[]>(initialEdits);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleAction(editId: string, listingId: string, action: 'approve' | 'dismiss', issueType: string) {
    setActionLoading(editId);
    try {
      const res = await fetch('/api/suggest-edit/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edit_id: editId, listing_id: listingId, action, issue_type: issueType }),
      });
      if (res.ok) {
        setEdits((prev) => prev.filter((e) => e.id !== editId));
      }
    } finally {
      setActionLoading(null);
    }
  }

  if (edits.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">All caught up</p>
        <p className="text-sm mt-1">No pending suggestions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {edits.map((edit) => {
        const listing = Array.isArray(edit.listings) ? edit.listings[0] ?? null : edit.listings;
        const stateSlug = listing ? slugify(listing.state) : '';
        const citySlug = listing ? slugify(listing.city) : '';
        const listingUrl = listing ? `/car-washes/${stateSlug}/${citySlug}/${listing.slug}` : null;
        const isLoading = actionLoading === edit.id;

        return (
          <div key={edit.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ISSUE_COLORS[edit.issue_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {ISSUE_LABELS[edit.issue_type] ?? edit.issue_type}
                  </span>
                  {listing && listingUrl && (
                    <Link
                      href={listingUrl}
                      target="_blank"
                      className="text-sm font-semibold text-[#0F2744] hover:text-[#22C55E] transition-colors flex items-center gap-1"
                    >
                      {listing.name}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                  {listing && (
                    <span className="text-xs text-gray-400">{listing.city}, {listing.state}</span>
                  )}
                </div>

                <div className="space-y-1.5 mt-2">
                  {edit.details && (
                    <div className="flex items-start gap-2 text-sm text-gray-700">
                      <MessageSquare className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <span>{edit.details}</span>
                    </div>
                  )}
                  {edit.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <a href={`mailto:${edit.email}`} className="hover:underline">{edit.email}</a>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>{new Date(edit.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleAction(edit.id, edit.listing_id, 'approve', edit.issue_type)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#22C55E] text-white rounded-lg hover:bg-[#16A34A] disabled:opacity-50 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={() => handleAction(edit.id, edit.listing_id, 'dismiss', edit.issue_type)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
