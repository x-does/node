import Link from 'next/link';

const MENU = [
  {
    label: 'Interactive/apps',
    href: '/apps',
    note: 'coming soon',
    external: false,
  },
  {
    label: 'Youtube',
    href: 'https://youtube.com/@x-does',
    note: 'youtube.com/@x-does',
    external: true,
  },
  {
    label: 'Blog',
    href: '/blog',
    note: null,
    external: false,
  },
  {
    label: 'XD License',
    href: '/xd-license',
    note: null,
    external: false,
  },
  {
    label: 'Sponsors',
    href: '/sponsors',
    note: null,
    external: false,
  },
];

const SOCIALS = [
  { label: 'x', href: 'https://x.com/xdoes', external: true },
  { label: 'github', href: 'https://github.com/x-does', external: true },
  { label: 'youtube', href: 'https://youtube.com/@x-does', external: true },
];

export const metadata = {
  title: 'X Does Shit',
  description: 'Main portal for xdoes.',
};

export default function MainPage() {
  return (
    <section className="relative isolate overflow-hidden px-6 py-10 sm:px-10 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col justify-between gap-10">
        <div className="grid flex-1 gap-12 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.28em] text-subtle">xdoes</p>
            <h1 className="font-display text-6xl font-black leading-[0.85] text-foreground sm:text-7xl md:text-8xl lg:text-9xl">
              <span className="block">X</span>
              <span className="block">Does</span>
              <span className="block">Shit</span>
            </h1>
          </div>

          <nav aria-label="Main" className="w-full md:w-[22rem]">
            <ul className="space-y-2">
              {MENU.map((item) => {
                const content = (
                  <>
                    <span className="truncate">{item.label}</span>
                    <span className="ml-3 text-subtle">↗</span>
                  </>
                );

                return (
                  <li key={item.label}>
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center justify-between rounded-xl border border-border bg-surface/70 px-4 py-3 text-lg text-foreground transition hover:border-border-bright hover:bg-surface-raised"
                      >
                        {content}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className="group flex items-center justify-between rounded-xl border border-border bg-surface/70 px-4 py-3 text-lg text-foreground transition hover:border-border-bright hover:bg-surface-raised"
                      >
                        {content}
                      </Link>
                    )}
                    {item.note ? <p className="px-2 pt-1 text-xs text-subtle">{item.note}</p> : null}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm text-subtle">
          {SOCIALS.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target={social.external ? '_blank' : undefined}
              rel={social.external ? 'noreferrer' : undefined}
              className="rounded-full border border-border px-3 py-1.5 lowercase transition hover:border-border-bright hover:text-foreground"
            >
              {social.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
