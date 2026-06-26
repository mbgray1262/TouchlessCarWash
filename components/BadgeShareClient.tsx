'use client';

/**
 * "Share your win" block on the badge-claim page. Removes the friction that
 * stops proud owners from posting: a ready-made caption (one-tap copy) + one-
 * click share buttons to Facebook / X / LinkedIn (sharing the owner's own
 * listing URL, which carries a real OG photo card) + a downloadable badge image
 * for Instagram (where you can't share a link). Build-once: every current and
 * future trophy winner gets this automatically. Drives referral traffic (see
 * the Facebook spike that sent ~100 US visitors from a single owner post).
 */

import { useState } from 'react';
import { Copy, Check, Download, Share2 } from 'lucide-react';

interface BadgeShareClientProps {
  listingSlug: string;
  listingName: string;
  listingUrl: string;
  rank: number;
  metroName: string;
  year: number;
}

export function BadgeShareClient({
  listingSlug,
  listingName,
  listingUrl,
  rank,
  metroName,
  year,
}: BadgeShareClientProps) {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const placement =
    rank <= 3
      ? `the #${rank} Best Touchless Car Wash in ${metroName}`
      : `one of the Top 10 Touchless Car Washes in ${metroName}`;
  // Caption WITHOUT the URL (the share intents append the link themselves; the
  // copy button adds it on its own line for paste-in-place posting).
  const caption = `🏆 We're proud to be ranked ${placement} for ${year} by Touchless Car Wash Finder! Thank you to all our customers — come experience the touchless difference. 🚗✨`;
  const captionWithUrl = `${caption}\n\n${listingUrl}`;

  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(listingUrl)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(listingUrl)}`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(listingUrl)}`;

  const openShare = (url: string) =>
    window.open(url, '_blank', 'noopener,noreferrer,width=620,height=640');

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(captionWithUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = captionWithUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Download the SVG badge as a file (handy for Instagram / printed posts).
  const downloadImage = async () => {
    try {
      const res = await fetch(`/api/badge/${listingSlug}?theme=light`);
      const svg = await res.text();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${listingSlug}-touchless-award-badge.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2500);
    } catch {
      /* no-op — non-critical */
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-1">
        <Share2 className="w-5 h-5 text-[#22C55E]" />
        <h3 className="text-lg font-bold text-[#0F2744]">Share your win with your customers</h3>
      </div>
      <p className="text-sm text-gray-600 mb-5">
        Let your customers know — it takes one click. Posting your ranking is a great way to
        celebrate the team and bring more drivers through the door.
      </p>

      {/* Pre-written caption */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
        {captionWithUrl}
      </div>
      <button
        onClick={copyCaption}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 px-4 py-2 text-sm font-semibold text-[#0F2744] transition-colors"
      >
        {copied ? <><Check className="w-4 h-4 text-[#22C55E]" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy caption</>}
      </button>

      {/* One-click share buttons */}
      <div className="mt-5 flex flex-wrap gap-2.5">
        <button
          onClick={() => openShare(fbUrl)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#1877F2' }}
        >
          <Share2 className="w-4 h-4" /> Share on Facebook
        </button>
        <button
          onClick={() => openShare(xUrl)}
          className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Share2 className="w-4 h-4" /> Share on X
        </button>
        <button
          onClick={() => openShare(liUrl)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#0A66C2' }}
        >
          <Share2 className="w-4 h-4" /> Share on LinkedIn
        </button>
        <button
          onClick={downloadImage}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 px-4 py-2.5 text-sm font-semibold text-[#0F2744] transition-colors"
        >
          {downloaded ? <><Check className="w-4 h-4 text-[#22C55E]" /> Downloaded</> : <><Download className="w-4 h-4" /> Download image (for Instagram)</>}
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Facebook &amp; LinkedIn pull your photo and details automatically — just paste the caption.
      </p>
    </div>
  );
}
