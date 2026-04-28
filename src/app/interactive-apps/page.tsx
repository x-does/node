import { catalogueItems } from './catalogue';
import { InteractiveCatalogue } from './interactive-catalogue';

export const metadata = {
  title: 'Interactive',
  description: 'Searchable catalogue for XDOES webapps, editors, references, and experiments.',
};

export default function MainInteractiveAppsPage() {
  return (
    <section className="py-10">
      <p className="mb-4 text-xs uppercase tracking-[0.3em] text-[#b4a6cc]">xdoes tools</p>
      <div className="max-w-3xl">
        <h1 className="font-display text-5xl font-bold text-[#f3edff] sm:text-6xl">Interactive</h1>
        <p className="mt-4 text-base leading-7 text-[#b9accf]">
          Minimal launcher for the XDOES blog editor. More tools can live here later, but for now this page stays focused.
        </p>
      </div>

      <InteractiveCatalogue items={catalogueItems} />
    </section>
  );
}
