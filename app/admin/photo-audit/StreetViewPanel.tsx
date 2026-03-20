'use client';

import { useState, useRef } from 'react';
import { ChevronDown, ChevronUp, ClipboardPaste, ExternalLink, MapPin } from 'lucide-react';

interface StreetViewPanelProps {
  latitude: number;
  longitude: number;
  businessName?: string;
}

export function StreetViewPanel({ latitude, longitude, businessName }: StreetViewPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [pasteReady, setPasteReady] = useState(false);
  const pasteZoneRef = useRef<HTMLDivElement>(null);

  // Free Google Maps embed URL — no API key or billing required
  const embedUrl = `https://maps.google.com/maps?layer=c&cbll=${latitude},${longitude}&cbp=12,0,0,0,0&output=svembed&q=${encodeURIComponent(businessName || '')}`;

  // Link to open full Street View in new tab
  const fullViewUrl = `https://www.google.com/maps/@${latitude},${longitude},3a,75y,0h,90t/data=!3m6!1e1!3m4!1s!2e0!7i16384!8i8192`;

  return (
    <div className="border rounded-lg overflow-hidden bg-gray-50">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <MapPin className="w-4 h-4 text-orange-500" />
        Street View
        {collapsed ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronUp className="w-4 h-4 ml-auto" />}
      </button>

      {!collapsed && (
        <div className="border-t">
          <iframe
            src={embedUrl}
            className="w-full h-[350px] border-0"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-white border-t">
            {/* Paste target zone — click this after taking screenshot to regain focus from iframe */}
            <div
              ref={pasteZoneRef}
              tabIndex={0}
              onClick={() => {
                setPasteReady(true);
                pasteZoneRef.current?.focus();
                setTimeout(() => setPasteReady(false), 5000);
              }}
              onFocus={() => setPasteReady(true)}
              onBlur={() => setPasteReady(false)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-sm ${
                pasteReady
                  ? 'bg-green-100 border-2 border-green-400 text-green-700 font-medium'
                  : 'bg-blue-50 border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-100'
              }`}
            >
              <ClipboardPaste className="w-4 h-4 flex-shrink-0" />
              {pasteReady
                ? 'Ready! Press ⌘V to paste screenshot'
                : 'Click here after screenshot, then ⌘V'}
            </div>
            <a
              href={fullViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors flex-shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Google Maps
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
