'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Check, Copy, Sun, Moon } from 'lucide-react';

interface ChainBadgeClaimClientProps {
  rank: number;
  scopeName: string;    // e.g. "America" or "Midwest"
  badgeApiUrl: string;  // base URL without theme param
  chainUrl: string;     // link target on click-through
  chainName: string;
  year: number;
}

export function ChainBadgeClaimClient({
  rank,
  scopeName,
  badgeApiUrl,
  chainUrl,
  chainName,
  year,
}: ChainBadgeClaimClientProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [copied, setCopied] = useState(false);

  const ordinal = rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd';
  const prodBadgeUrl = `${badgeApiUrl}&theme=${theme}`;
  const previewBadgeUrl = badgeApiUrl.replace('https://touchlesscarwashfinder.com', '') + `&theme=${theme}`;
  const altText = `#${rank} Best Touchless Car Wash Chain in ${scopeName} (${year}) — Touchless Car Wash Finder`;
  const title = `${chainName} — ${ordinal} Best Touchless Car Wash Chain in ${scopeName} (${year})`;

  const embedCode = `<a href="${chainUrl}" target="_blank" rel="noopener" title="${title}">\n  <img src="${prodBadgeUrl}" alt="${altText}" width="320" height="96" style="border:0;max-width:100%;height:auto;">\n</a>`;

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
      {/* Theme selector */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-600">Badge theme:</span>
        <Tabs value={theme} onValueChange={(v) => setTheme(v as 'light' | 'dark')}>
          <TabsList>
            <TabsTrigger value="light" className="gap-1.5">
              <Sun className="w-3.5 h-3.5" /> Light
            </TabsTrigger>
            <TabsTrigger value="dark" className="gap-1.5">
              <Moon className="w-3.5 h-3.5" /> Dark
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Live badge preview */}
      <div className={`flex items-center justify-center p-10 rounded-xl border-2 border-dashed transition-colors ${
        theme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-gray-50 border-gray-200'
      }`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewBadgeUrl} alt={altText} width={320} height={96} className="drop-shadow-sm" />
      </div>

      {/* Embed code */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#0F2744] uppercase tracking-wide">Embed Code</h3>
          <Button
            onClick={handleCopy}
            size="sm"
            className={`transition-all ${copied
              ? 'bg-[#22C55E] hover:bg-[#22C55E] text-white'
              : 'bg-[#0F2744] hover:bg-[#0F2744]/90 text-white'
            }`}
          >
            {copied ? (
              <><Check className="w-4 h-4 mr-1.5" />Copied!</>
            ) : (
              <><Copy className="w-4 h-4 mr-1.5" />Copy Code</>
            )}
          </Button>
        </div>
        <pre className="bg-gray-900 text-gray-300 p-4 rounded-lg text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-all font-mono">
          {embedCode}
        </pre>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-[#0F2744] mb-4">How to add this badge to your website</h3>
        <ol className="space-y-3 text-sm text-gray-700">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0F2744] text-white flex items-center justify-center text-xs font-bold">1</span>
            <span>Choose your preferred badge theme (light or dark) above.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0F2744] text-white flex items-center justify-center text-xs font-bold">2</span>
            <span>Click <strong>&quot;Copy Code&quot;</strong> to copy the HTML embed code.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0F2744] text-white flex items-center justify-center text-xs font-bold">3</span>
            <span>Paste the code into your website&apos;s HTML — your homepage footer, locations page, or about page work great.</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
