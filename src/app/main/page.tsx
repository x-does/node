import Link from 'next/link';

const MENU = [
  { label: 'Interactive/apps', href: '/main/interactive-apps' },
  { label: 'Youtube', href: 'https://youtube.com/@x-does', external: true },
  { label: 'Blog', href: '/main/blog' },
  { label: 'Blog editor', href: '/main/blog-edit' },
  { label: 'XD License', href: '/main/xd-license' },
  { label: 'Sponsors', href: '/main/sponsors' },
];

export const metadata = {
  title: 'X Does Shit',
  description: 'Main portal for xdoes.',
};

export default function MainPage() {
  return (
    <section className="grid min-h-[70vh] gap-12 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-[#b4a6cc]">xdoes</p>
        <h1 className="font-display text-6xl font-black leading-[0.85] text-[#f3edff] sm:text-7xl md:text-8xl lg:text-9xl">
          <span className="block">X</span>
          <span className="block">Does</span>
          <span className="block">Shit</span>
        </h1>
      </div>

      <nav aria-label="Main sections" className="w-full md:w-[24rem]">
        <ul className="space-y-2">
          {MENU.map((item) => (
            <li key={item.label}>
              {item.external ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-between rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 px-4 py-3 text-left text-lg text-[#e7dcff] transition hover:border-[#a58ac8]/60 hover:bg-[#1b1429]"
                >
                  <span>{item.label}</span>
                  <span className="text-xs uppercase tracking-[0.18em] text-[#b9a6d8]">open ↗</span>
                </a>
              ) : (
                <Link
                  href={item.href}
                  className="flex w-full items-center justify-between rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 px-4 py-3 text-left text-lg text-[#e7dcff] transition hover:border-[#a58ac8]/60 hover:bg-[#1b1429]"
                >
                  <span>{item.label}</span>
                  <span className="text-xs uppercase tracking-[0.18em] text-[#b9a6d8]">open</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
