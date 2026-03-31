import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.product.upsert({
    where: { slug: 'node-revenue-audit' },
    update: {},
    create: {
      slug: 'node-revenue-audit',
      title: 'Node Revenue Audit',
      description:
        'A tracked, thorough review of your automation stack, revenue loops, and growth blockers. You get a concrete action plan delivered via Telegram. Ideal for founders running AI agents, bots, or automated funnels who suspect they are leaking money.',
      price: 299,
      currency: 'USD',
      type: 'service',
      status: 'active',
      ctaUrl: '/audit',
      ctaLabel: 'Start the audit',
      featured: true,
      sortOrder: 1,
    },
  });

  await prisma.product.upsert({
    where: { slug: 'landing-page-build' },
    update: {},
    create: {
      slug: 'landing-page-build',
      title: 'Landing Page Build',
      description:
        'A production-ready Next.js landing page shipped in days. Includes responsive design, dark mode, analytics tracking, and deployment to your hosting. Perfect for launching a new product or service fast.',
      price: 499,
      currency: 'USD',
      type: 'service',
      status: 'active',
      ctaUrl: '/audit',
      ctaLabel: 'Discuss your project',
      featured: true,
      sortOrder: 2,
    },
  });

  await prisma.product.upsert({
    where: { slug: 'growth-tracker-template' },
    update: {},
    create: {
      slug: 'growth-tracker-template',
      title: 'Growth Tracker Template',
      description:
        'A lightweight open-source analytics dashboard template. Track page views, conversion events, and funnel health without the bloat of enterprise tools. Clone, configure, deploy.',
      type: 'free',
      status: 'active',
      featured: true,
      sortOrder: 3,
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
