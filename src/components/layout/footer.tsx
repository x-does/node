import Link from 'next/link';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Blog', href: '/blog' },
  { label: 'Store', href: '/store' },
  { label: 'Apps', href: '/apps' },
  { label: 'Audit', href: '/audit' },
];

const RESOURCE_LINKS = [
  { label: 'Health Check', href: '/api/health' },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <div className="font-display text-lg font-bold text-foreground">
              node<span className="text-accent">.xdoes</span>
            </div>
            <p className="mt-2 max-w-xs text-sm text-muted">
              Services, products, and free releases from the build team.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-subtle">Navigation</h4>
            <div className="mt-3 flex flex-col gap-2">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-subtle">Resources</h4>
            <div className="mt-3 flex flex-col gap-2">
              {RESOURCE_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-center text-sm text-subtle">
          &copy; {new Date().getFullYear()} xdoes. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
