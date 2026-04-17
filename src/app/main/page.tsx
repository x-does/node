const MENU = [
  { label: 'Interactive/apps' },
  { label: 'Youtube' },
  { label: 'Blog' },
  { label: 'Blog editor' },
  { label: 'XD License' },
  { label: 'Sponsors' },
];

export const metadata = {
  title: 'X Does',
  description: 'Main portal for xdoes.',
};

export default function MainPage() {
  return (
    <section className="grid min-h-[70vh] gap-12 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-[#b4a6cc]">xdoes</p>
        <h1 className="font-display text-6xl font-black leading-[0.9] text-[#f3edff] sm:text-7xl md:text-8xl lg:text-9xl">
          <span className="block">X</span>
          <span className="block">Does</span>
        </h1>
      </div>

      <nav aria-label="Main sections" className="w-full md:w-[26rem]">
        <ul className="space-y-2">
          {MENU.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex w-full cursor-not-allowed items-center justify-between rounded-xl border border-[#7f6b9d]/18 bg-[#0f0c17]/40 px-4 py-3 text-left text-lg text-[#bfb4d4]/75"
              >
                <span>{item.label}</span>
                <span className="text-xs uppercase tracking-[0.18em] text-[#9a8ab5]">coming soon</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
