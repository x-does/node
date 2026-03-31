'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Blog', href: '/blog' },
  { label: 'Store', href: '/store' },
  { label: 'Apps', href: '/apps' },
];

interface SessionUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
}

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) setUser(data.user);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-display text-lg font-bold text-foreground">
          node<span className="text-accent">.xdoes</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm transition-colors',
                pathname === item.href ? 'text-accent-bright' : 'text-muted hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground sm:inline-flex"
              >
                {user.profilePictureUrl && (
                  <img src={user.profilePictureUrl} alt="" className="size-5 rounded-full" />
                )}
                {user.firstName || user.email.split('@')[0]}
              </Link>
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="hidden rounded-xl border border-border-bright bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-all hover:bg-surface-raised sm:inline-flex"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/api/auth/login"
              className="hidden rounded-xl bg-gradient-to-br from-accent to-purple px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 sm:inline-flex"
            >
              Sign in
            </Link>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-raised hover:text-foreground md:hidden"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" />
              ) : (
                <path d="M3 5h14M3 10h14M3 15h14" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border md:hidden">
          <nav className="flex flex-col gap-1 p-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm transition-colors',
                  pathname === item.href
                    ? 'bg-surface-raised text-accent-bright'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
                >
                  Dashboard
                </Link>
                <form action="/api/auth/logout" method="POST" className="mt-2">
                  <button
                    type="submit"
                    className="w-full rounded-xl border border-border-bright bg-surface px-4 py-2.5 text-center text-sm font-semibold text-foreground"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/api/auth/login"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-xl bg-gradient-to-br from-accent to-purple px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
