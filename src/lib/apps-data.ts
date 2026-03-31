export interface AppInfo {
  slug: string;
  title: string;
  description: string;
  longDescription?: string;
  status: 'live' | 'beta' | 'coming-soon';
  url?: string;
  tags: string[];
}

export const apps: AppInfo[] = [
  {
    slug: 'openclaw',
    title: 'OpenClaw',
    description:
      'Coordinated AI C-suite for building and running small internet businesses.',
    longDescription:
      'OpenClaw is a multi-agent orchestration framework that models a full C-suite — CEO, CTO, CFO, CMO, CSO, CRO — coordinating via Telegram and file-based workflows. Built for founders who want to move faster without hiring faster.',
    status: 'beta',
    tags: ['ai', 'agents', 'orchestration'],
  },
  {
    slug: 'growth-tracker',
    title: 'Growth Tracker',
    description:
      'Lightweight analytics and growth metrics dashboard for small teams.',
    longDescription:
      'A focused analytics tool that surfaces the metrics that matter for early-stage products. Page views, conversion events, and funnel health — without the bloat of enterprise analytics platforms.',
    status: 'coming-soon',
    tags: ['analytics', 'growth', 'dashboard'],
  },
];

export function getAppBySlug(slug: string): AppInfo | undefined {
  return apps.find((a) => a.slug === slug);
}
