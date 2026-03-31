import { Card, CardTitle, CardBody } from '@/components/ui/card';
import { Section } from '@/components/ui/section';

const offerings = [
  {
    title: 'Services',
    body: 'Fast, practical web work: landing pages, proof-of-concept builds, automation, and public dashboards that make progress visible.',
  },
  {
    title: 'Products',
    body: 'Small tools and reusable web products designed to ship quickly, learn quickly, and evolve into something people actually pay for.',
  },
  {
    title: 'Free releases',
    body: 'Useful utilities, templates, and open experiments that build trust, attract users, and create a path to future paid offers.',
  },
];

export function Offerings() {
  return (
    <Section
      id="offerings"
      heading="What we offer"
      subheading="Clear categories. No clutter. No internal-only links on the public page."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {offerings.map((item) => (
          <Card key={item.title} hover>
            <CardTitle>{item.title}</CardTitle>
            <CardBody>{item.body}</CardBody>
          </Card>
        ))}
      </div>
    </Section>
  );
}
