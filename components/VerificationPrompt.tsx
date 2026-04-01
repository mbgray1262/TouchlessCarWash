'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, CheckCircle, Users, MessageSquare } from 'lucide-react';

export interface VerificationStats {
  yesCount: number;
  noCount: number;
  recentComments: Array<{
    is_touchless: boolean;
    comment: string | null;
    created_at: string;
  }>;
}

interface VerificationPromptProps {
  listingId: string;
  listingName: string;
  stats: VerificationStats;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? 's' : ''} ago`;
}

export default function VerificationPrompt({ listingId, listingName, stats }: VerificationPromptProps) {
  const [step, setStep] = useState<'idle' | 'comment' | 'done' | 'already_submitted'>('idle');
  const [selectedVote, setSelectedVote] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStats, setLocalStats] = useState(stats);

  const total = localStats.yesCount + localStats.noCount;
  const pct = total > 0 ? Math.round((localStats.yesCount / total) * 100) : null;

  function handleVote(vote: boolean) {
    setSelectedVote(vote);
    setStep('comment');
    setError(null);
  }

  async function handleSubmit() {
    if (selectedVote === null) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/verify-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          is_touchless: selectedVote,
          comment: comment.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setStep('already_submitted');
        } else {
          setError(data.error || 'Something went wrong. Please try again.');
        }
        return;
      }

      // Optimistically update local stats
      setLocalStats(prev => ({
        yesCount: selectedVote ? prev.yesCount + 1 : prev.yesCount,
        noCount: !selectedVote ? prev.noCount + 1 : prev.noCount,
        recentComments: comment.trim()
          ? [{ is_touchless: selectedVote, comment: comment.trim(), created_at: new Date().toISOString() }, ...prev.recentComments].slice(0, 5)
          : prev.recentComments,
      }));

      setStep('done');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const commentsWithText = localStats.recentComments.filter(c => c.comment);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide mb-4 flex items-center gap-2">
        <Users className="w-4 h-4" />
        Community Verification
      </h2>

      {/* Stats bar */}
      {total > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-600">
              {total} visitor{total !== 1 ? 's' : ''} reported
            </span>
            {pct !== null && (
              <span className={`font-semibold ${pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                {pct}% confirmed touchless
              </span>
            )}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${pct !== null && pct >= 70 ? 'bg-green-500' : pct !== null && pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3 text-green-500" />{localStats.yesCount} yes</span>
            <span className="flex items-center gap-1"><ThumbsDown className="w-3 h-3 text-red-400" />{localStats.noCount} no</span>
          </div>
        </div>
      )}

      {/* Recent comments */}
      {commentsWithText.length > 0 && (
        <div className="mb-4 space-y-2">
          {commentsWithText.slice(0, 3).map((c, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="mt-0.5 shrink-0">
                {c.is_touchless
                  ? <ThumbsUp className="w-3.5 h-3.5 text-green-500" />
                  : <ThumbsDown className="w-3.5 h-3.5 text-red-400" />}
              </span>
              <div>
                <span className="text-gray-700">{c.comment}</span>
                <span className="text-gray-400 text-xs ml-1.5">{timeAgo(c.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Interaction area */}
      {step === 'idle' && (
        <div>
          <p className="text-sm text-gray-600 mb-3">
            Have you visited <span className="font-medium">{listingName}</span>? Help the community by sharing your experience.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleVote(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-400 text-green-700 font-medium text-sm transition-all"
            >
              <ThumbsUp className="w-4 h-4" />
              Yes, it&apos;s touchless
            </button>
            <button
              onClick={() => handleVote(false)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 border-red-100 bg-red-50 hover:bg-red-100 hover:border-red-300 text-red-600 font-medium text-sm transition-all"
            >
              <ThumbsDown className="w-4 h-4" />
              Not touchless
            </button>
          </div>
        </div>
      )}

      {step === 'comment' && (
        <div>
          <div className={`flex items-center gap-2 text-sm font-medium mb-3 ${selectedVote ? 'text-green-700' : 'text-red-600'}`}>
            {selectedVote
              ? <><ThumbsUp className="w-4 h-4" /> Marked as touchless</>
              : <><ThumbsDown className="w-4 h-4" /> Marked as not touchless</>}
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 flex items-center gap-1 mb-1.5">
              <MessageSquare className="w-3 h-3" />
              Add a comment <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="e.g. No brushes at all, great pressure wash..."
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none text-gray-700 placeholder-gray-400"
            />
            <div className="text-right text-xs text-gray-400 mt-0.5">{comment.length}/500</div>
          </div>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-[#0F2744] hover:bg-[#1a3a5c] text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit Feedback'}
            </button>
            <button
              onClick={() => { setStep('idle'); setSelectedVote(null); setComment(''); setError(null); }}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="flex items-start gap-3 py-2">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-800">Thanks for your feedback!</p>
            <p className="text-xs text-gray-500 mt-0.5">Your report helps keep our directory accurate for everyone.</p>
          </div>
        </div>
      )}

      {step === 'already_submitted' && (
        <div className="flex items-start gap-3 py-2">
          <CheckCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-800">You&apos;ve already verified this location</p>
            <p className="text-xs text-gray-500 mt-0.5">You can submit another verification in 30 days. Thanks for contributing!</p>
          </div>
        </div>
      )}
    </div>
  );
}
