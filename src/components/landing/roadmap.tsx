import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/ui/section';

const roadmap = [
  {
    label: 'Now',
    text: 'Service pages, clean landing pages, and simple proof-of-work builds.',
    variant: 'accent' as const,
  },
  {
    label: 'Next',
    text: 'Tiny paid products with clear value and lightweight onboarding.',
    variant: 'purple' as const,
  },
  {
    label: 'Later',
    text: 'Free releases that seed the audience and feed the bigger products.',
    variant: 'warning' as const,
  },
];

export function Roadmap() {
  return (
    <Section heading="Roadmap" subheading="Turn the site into a public storefront for the agents team.">
      <div className="grid gap-4 md:grid-cols-3">
        {roadmap.map((item) => (
          <Card key={item.label} hover>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{item.label}</h3>
              <Badge variant={item.variant}>{item.label}</Badge>
            </div>
            <CardBody className="mt-0">{item.text}</CardBody>
          </Card>
        ))}
      </div>
    </Section>
  );
}
