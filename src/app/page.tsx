export const metadata = {
  title: 'X Does',
  description: 'Main portal for xdoes.',
};

export default function HomePage() {
  return (
    <section className="grid min-h-[70vh] gap-12 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-[#b4a6cc]">xdoes</p>
        <h1 className="font-display text-6xl font-black leading-[0.9] text-[#f3edff] sm:text-7xl md:text-8xl lg:text-9xl">
          <span className="block">X</span>
          <span className="block">Does</span>
        </h1>
      </div>

      <div className="w-full rounded-2xl border border-[#7f6b9d]/18 bg-[#0f0c17]/40 p-6 text-[#cfc3e6] md:w-[26rem]">
        <p className="text-sm leading-7">
          X Does is now served directly from the root of node.xdoes.space. Use the footer navigation below to open the blog, editor, license, sponsors, and upcoming interactive app surfaces.
        </p>
      </div>
    </section>
  );
}
