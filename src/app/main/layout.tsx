const MENU = ['Interactive/apps', 'Youtube', 'Blog', 'XD License', 'Sponsors'];

const SOCIALS = [
  { label: 'x', href: 'https://x.com/xdoes' },
  { label: 'github', href: 'https://github.com/x-does' },
  { label: 'youtube', href: 'https://youtube.com/@x-does' },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#07060b] text-[#efeafc]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(143,113,196,0.08),transparent_45%),radial-gradient(circle_at_78%_68%,rgba(143,113,196,0.06),transparent_42%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10 sm:py-10">
        <main className="flex-1">{children}</main>

        <footer className="mt-8 space-y-4 border-t border-[#7f6b9d]/20 pt-4">
          <nav className="flex flex-wrap gap-2 text-sm text-[#c8bcdd]">
            {MENU.map((item) => (
              <span
                key={item}
                className="cursor-not-allowed rounded-full border border-[#7f6b9d]/20 px-3 py-1.5 text-[#c8bcdd]/70"
                aria-disabled="true"
              >
                {item}
              </span>
            ))}
          </nav>

          <div className="flex flex-wrap gap-3 text-xs lowercase text-[#ac9cc4]">
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
