'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, ChevronDown, ChevronUp, MapPin } from 'lucide-react';

interface StreetViewPanelProps {
  latitude: number;
  longitude: number;
  apiKey: string;
  onCapture: (panoId: string, heading: number, url: string) => void;
}

export function StreetViewPanel({ latitude, longitude, apiKey, onCapture }: StreetViewPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Load Google Maps JS API
  useEffect(() => {
    if (typeof google !== 'undefined' && google.maps) {
      setMapsLoaded(true);
      return;
    }

    // Check if script is already loading
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existing) {
      existing.addEventListener('load', () => setMapsLoaded(true));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=streetView`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, [apiKey]);

  // Initialize Street View when expanded
  useEffect(() => {
    if (collapsed || !mapsLoaded || !containerRef.current) return;
    if (panoramaRef.current) return; // Already initialized

    panoramaRef.current = new google.maps.StreetViewPanorama(containerRef.current, {
      position: { lat: latitude, lng: longitude },
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
      addressControl: false,
      showRoadLabels: false,
      motionTracking: false,
      motionTrackingControl: false,
    });
  }, [collapsed, mapsLoaded, latitude, longitude]);

  // Reset panorama when coordinates change
  useEffect(() => {
    if (panoramaRef.current && !collapsed) {
      panoramaRef.current.setPosition({ lat: latitude, lng: longitude });
      panoramaRef.current.setPov({ heading: 0, pitch: 0 });
    }
  }, [latitude, longitude, collapsed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      panoramaRef.current = null;
    };
  }, []);

  const handleCapture = useCallback(async () => {
    if (!panoramaRef.current || !containerRef.current) return;
    setCapturing(true);

    const pano = panoramaRef.current.getPano();
    const pov = panoramaRef.current.getPov();
    const heading = Math.round(pov.heading * 100) / 100;

    // Try to capture the canvas directly from the interactive panorama (high-res)
    const canvas = containerRef.current.querySelector('canvas') as HTMLCanvasElement | null;
    if (canvas) {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        onCapture(pano, heading, dataUrl);
        setCapturing(false);
        return;
      } catch {
        // Canvas capture failed (tainted by cross-origin) — fall back to Static API
      }
    }

    // Fallback: use Static API at max unsigned size
    const pitch = Math.round(pov.pitch * 100) / 100;
    const zoom = panoramaRef.current.getZoom?.() ?? (pov as unknown as Record<string, number>).zoom ?? 1;
    const fov = Math.round(180 / Math.pow(2, zoom));
    const thumbUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x640&pano=${pano}&heading=${heading}&pitch=${pitch}&fov=${fov}&key=${apiKey}`;

    onCapture(pano, heading, thumbUrl);
    setCapturing(false);
  }, [apiKey, onCapture]);

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
          <div ref={containerRef} className="w-full h-[350px] bg-gray-200" />
          <div className="flex items-center justify-between px-4 py-2 bg-white border-t">
            <span className="text-xs text-gray-500">Navigate to the best view, then capture</span>
            <button
              onClick={handleCapture}
              disabled={capturing || !mapsLoaded}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <Camera className="w-4 h-4" />
              Capture Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
