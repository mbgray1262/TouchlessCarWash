'use client';

import { useEffect, useState } from 'react';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getTodayKey(): string {
  return DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
}

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

function getOpenStatus(hours: Record<string, string> | null): 'open' | 'closed' | null {
  if (!hours) return null;
  const todayKey = getTodayKey();
  const todayHours = hours[todayKey];
  if (!todayHours) return 'closed';
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

interface OpenStatusBadgeProps {
  hours: Record<string, string> | null;
  className?: string;
}

export function OpenStatusBadge({ hours, className = '' }: OpenStatusBadgeProps) {
  const [status, setStatus] = useState<'open' | 'closed' | null>(null);

  useEffect(() => {
    setStatus(getOpenStatus(hours));
  }, [hours]);

  if (!status) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        status === 'open' ? 'text-green-600' : 'text-gray-400'
      } ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'open' ? 'bg-green-500' : 'bg-gray-300'}`} />
      {status === 'open' ? 'Open Now' : 'Closed'}
    </span>
  );
}
