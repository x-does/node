import { catalogueItems } from './catalogue';
import { InteractiveCatalogue } from './interactive-catalogue';

export const metadata = {
  title: 'Interactive',
  description: 'XDOES blog editor launcher.',
};

export default function MainInteractiveAppsPage() {
  return (
    <section className="py-10">
      <InteractiveCatalogue items={catalogueItems} />
    </section>
  );
}
