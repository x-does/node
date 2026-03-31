'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function TrackPageView() {
  const pathname = usePathname();
  const tracked = useRef<string | null>(null);

  useEffect(() => {
    if (tracked.current === pathname) return;
    tracked.current = pathname;

    const body: Record<string, string> = {
      type: 'pageview',
      path: pathname,
    };

    if (document.referrer) {
      body.referrer = document.referrer;
    }

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
