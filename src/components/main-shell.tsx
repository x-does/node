import Link from 'next/link';

type MenuItem = {
  label: string;
  href?: string;
  external?: boolean;
  disabled?: boolean;
};

export const MENU: MenuItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Interactive/apps', disabled: true },
  { label: 'Youtube', href: 'https://youtube.com/@x-does', external: true },
  { label: 'Blog', href: '/blog' },
  { label: 'Blog editor', disabled: true },
  { label: 'XD License', disabled: true },
  { label: 'Sponsors', disabled: true },
];

const SOCIALS = [
  { label: 'x', href: 'https://x.com/xdoes' },
  { label: 'github', href: 'https://github.com/x-does' },
  { label: 'youtube', href: 'https://youtube.com/@x-does' },
];

const basePillClassName =
  'rounded-full border px-3 py-1.5 text-sm transition-colors';
const activePillClassName =
  `${basePillClassName} border-[#7f6b9d]/20 text-[#c8bcdd] hover:border-[#a58ac8]/45 hover:text-white`;
const disabledPillClassName =
  `${basePillClassName} inline-flex cursor-not-allowed items-center gap-2 border-[#7f6b9d]/12 text-[#8f82a8] opacity-75`;

export function InlineMenu({ hideHome = false }: { hideHome?: boolean }) {
  const items = hideHome ? MENU.filter((item) => item.label !== 'Home') : MENU;

  return (
    <nav className="text-sm leading-7 text-[#c8bcdd]">
      <div className="flex w-full flex-col items-stretch gap-y-1">
        {items.map((item) => {
          if (item.disabled) {
            return (
              <span key={item.label} aria-disabled="true" className="block w-full text-[#8f82a8]">
                {item.label} Soon
              </span>
            );
          }

          if (item.external) {
            return (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="block w-full transition-colors hover:text-white"
              >
                {item.label}
              </a>
            );
          }

          return (
            <Link key={item.label} href={item.href!} className="block w-full transition-colors hover:text-white">
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function MainShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#07060b] text-[#efeafc]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(143,113,196,0.08),transparent_45%),radial-gradient(circle_at_78%_68%,rgba(143,113,196,0.06),transparent_42%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10 sm:py-10">
        <main className="flex-1">{children}</main>

        <footer className="mt-8 flex flex-col items-end space-y-4 border-t border-[#7f6b9d]/20 pt-4 text-right">
          <div className="flex flex-wrap justify-end gap-3 text-xs lowercase text-[#ac9cc4]">
            {SOCIALS.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="hover:text-white">
                {s.label}
              </a>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}
