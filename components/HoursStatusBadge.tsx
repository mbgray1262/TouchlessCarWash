'use client';

import { useEffect, useState } from 'react';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function parseTimeToMinutes(timeStr: string): number | null {
  const clean = timeStr.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2] || '0', 10);
  const period = match[3];
  if (period === 'AM' && hours === 12) hours = 0;
  if (period === 'PM' && hours !== 12) hours += 12;
  return hours * 60 + mins;
}

function getOpenStatus(hours: Record<string, string>): 'open' | 'closed' | null {
  const dayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const todayName = DAY_ORDER[dayIndex];
  const todayKey = todayName.toLowerCase();
  const todayHours = hours[todayKey] ?? hours[todayName] ?? Object.entries(hours).find(([k]) => k.toLowerCase() === todayKey)?.[1];
  if (!todayHours || typeof todayHours !== 'string') return 'closed';
  if (todayHours.toLowerCase().includes('24') || todayHours.toLowerCase().includes('open 24')) return 'open';
  if (todayHours.toLowerCase() === 'closed') return 'closed';
  const parts = todayHours.split(/[-–]/);
  if (parts.length !== 2) return null;
  const openMins = parseTimeToMinutes(parts[0].trim());
  const closeMins = parseTimeToMinutes(parts[1].trim());
  if (openMins === null || closeMins === null) return null;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  if (closeMins < openMins) {
    return currentMins >= openMins || currentMins < closeMins ? 'open' : 'closed';
  }
  return currentMins >= openMins && currentMins < closeMins ? 'open' : 'closed';
}

export function HoursStatusBadge({ hours }: { hours: Record<string, string> }) {
  const [status, setStatus] = useState<'open' | 'closed' | null>(null);

  useEffect(() => {
    setStatus(getOpenStatus(hours));
  }, [hours]);

  if (status === 'open') {
    return (
      <span className="ml-auto text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        Open Now
      </span>
    );
  }

  if (status === 'closed') {
    return (
      <span className="ml-auto text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        Closed
      </span>
    );
  }

  return null;
}
