'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'tcwf_compare';
const MAX_COMPARE = 3;

function readCompare(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCompare(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // storage full or unavailable
  }
}

export function useCompare() {
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    setCompareIds(readCompare());
  }, []);

  const toggle = useCallback((listingId: string) => {
    setCompareIds((prev) => {
      const removing = prev.includes(listingId);
      let next: string[];
      if (removing) {
        next = prev.filter((id) => id !== listingId);
      } else if (prev.length >= MAX_COMPARE) {
        // At max — don't add
        return prev;
      } else {
        next = [...prev, listingId];
      }
      writeCompare(next);
      window.dispatchEvent(new Event('compare-changed'));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    writeCompare([]);
    setCompareIds([]);
    window.dispatchEvent(new Event('compare-changed'));
  }, []);

  const isComparing = useCallback(
    (listingId: string) => compareIds.includes(listingId),
    [compareIds],
  );

  const isFull = compareIds.length >= MAX_COMPARE;

  // Listen for changes from other components
  useEffect(() => {
    const handler = () => setCompareIds(readCompare());
    window.addEventListener('compare-changed', handler);
    return () => window.removeEventListener('compare-changed', handler);
  }, []);

  return { compareIds, toggle, clear, isComparing, isFull, count: compareIds.length };
}
