'use client';

import { useEffect } from 'react';

/**
 * Belt-and-suspenders for the admin tool. AnalyticsScripts already excludes the
 * Monumetric / AdSense loaders from /admin on a fresh page load — but if you
 * navigate from a public page to /admin in the SAME tab, Monumetric's script is
 * still alive in memory and injects ad iframes into the admin DOM (a hard refresh
 * clears them). This guard removes any ad-network iframe (and Monumetric's own
 * wrapper) while on admin, so no self-served impressions ever render here.
 * Admin has no legitimate ads, so removing ad iframes is always safe.
 */
const AD_HOST_RE = /(googlesyndication|doubleclick|2mdn|adnxs|monu\.delivery|monumetric|amazon-adsystem|pubmatic|rubiconproject|adsafeprotected|criteo|playwire|adservice)/i;

export function AdminAdGuard() {
  useEffect(() => {
    const strip = () => {
      document.querySelectorAll('iframe').forEach((f) => {
        if (AD_HOST_RE.test(f.getAttribute('src') || '')) f.remove();
      });
      document
        .querySelectorAll('[id^="mncmp"],[id^="monumetric"],[class*="monumetric"]')
        .forEach((el) => el.remove());
    };
    strip();
    const obs = new MutationObserver(strip);
    obs.observe(document.body, { childList: true, subtree: true });
    const iv = window.setInterval(strip, 1500);
    return () => {
      obs.disconnect();
      window.clearInterval(iv);
    };
  }, []);
  return null;
}
