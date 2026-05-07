'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';

interface ChainBadgeClaimClientProps {
  chainName: string;
  awardLabel: string;
  awardEmoji: string;
  badgeSvgUrl: string;
  chainUrl: string;
  year: number;
}

export function ChainBadgeClaimClient({
  chainName,
  awardLabel,
  awardEmoji,
  badgeSvgUrl,
  chainUrl,
  year,
}: ChainBadgeClaimClientProps) {
  const [copied, setCopied] = useState(false);

  const title = `${chainName} — ${awardEmoji} ${awardLabel} ${year} | Touchless Car Wash Finder`;
  const altText = `${chainName} — ${awardLabel} ${year} Award | Touchless Car Wash Finder`;
  const embedCode = `<a href="${chainUrl}" target="_blank" rel="noopener" title="${title}">\n  <img src="${badgeSvgUrl}" alt="${altText}" width="240" height="100" style="border:0;max-width:100%;height:auto;">\n</a>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = embedCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-8">
      {/* Badge preview */}
      <div className="flex items-center justify-center p-12 rounded-xl border-2 border-dashed bg-gray-800 border-gray-600">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={badgeSvgUrl}
          alt={altText}
          width={240}
          height={100}
          className="drop-shadow-sm"
        />
      </div>

      {/* Embed code */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#0F2744] uppercase tracking-wide">
            Embed Code
          </h3>
          <Button
            onClick={handleCopy}
            size="sm"
            className={`transition-all ${
              copied
                ? 'bg-[#22C55E] hover:bg-[#22C55E] text-white'
                : 'bg-[#0F2744] hover:bg-[#0F2744]/90 text-white'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-1.5" />
                Copy Code
              </>
            )}
          </Button>
        </div>
        <div className="relative">
          <pre className="bg-gray-900 text-gray-300 p-4 rounded-lg text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-all font-mono">
            {embedCode}
          </pre>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-[#0F2744] mb-4">
          How to add this badge to your website
        </h3>
        <ol className="space-y-3 text-sm text-gray-700">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0F2744] text-white flex items-center justify-center text-xs font-bold">1</span>
            <span>Click <strong>&quot;Copy Code&quot;</strong> to copy the HTML embed code above.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0F2744] text-white flex items-center justify-center text-xs font-bold">2</span>
            <span>Paste the code into your website&apos;s HTML — your homepage footer, locations page, or about page work great.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0F2744] text-white flex items-center justify-center text-xs font-bold">3</span>
            <span>The badge automatically links back to your chain&apos;s listing on Touchless Car Wash Finder.</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
