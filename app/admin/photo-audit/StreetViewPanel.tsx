'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, MapPin } from 'lucide-react';

interface StreetViewPanelProps {
  latitude: number;
  longitude: number;
  businessName?: string;
}

export function StreetViewPanel({ latitude, longitude, businessName }: StreetViewPanelProps) {
  const [collapsed, setCollapsed] = useState(true);

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
          <div className="flex items-center justify-between px-4 py-2 bg-white border-t">
            <span className="text-xs text-gray-500">Navigate to best view, then <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px] font-mono">⌘+Shift+4</kbd> to screenshot &amp; <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px] font-mono">⌘V</kbd> to paste</span>
            <a
              href={fullViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
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
