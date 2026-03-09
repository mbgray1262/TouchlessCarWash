'use client';

import { useState } from 'react';

/** Old Google+ profile photo URLs (s44-p-k-no-ns-nd) are often broken/expired */
function isLikelyBrokenLogo(url: string): boolean {
  try {
    const u = new URL(url);
    // Old Google profile photos — tiny size, often default gray avatar
    if (
      (u.hostname.startsWith('lh') && u.hostname.endsWith('.googleusercontent.com')) &&
      u.pathname.includes('/AAAAAAAAAAI/')
    ) return true;
    return false;
  } catch {
    return true;
  }
}

interface LogoImageProps {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
}

export default function LogoImage({ src, alt, className, wrapperClassName }: LogoImageProps) {
  const [hidden, setHidden] = useState(() => isLikelyBrokenLogo(src));

  if (hidden) return null;

  return (
    <div className={wrapperClassName}>
      <img
        src={src}
        alt={alt}
        className={className}
        onError={() => setHidden(true)}
      />
    </div>
  );
}
