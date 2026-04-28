export type CatalogueItem = {
  title: string;
  href: string;
  description: string;
  status: 'live' | 'reference' | 'external';
  tags: string[];
  external?: boolean;
};

export const catalogueItems: CatalogueItem[] = [
  {
    title: 'Blog editor',
    href: '/blog-edit',
    description: 'Write, edit, preview, and publish XDOES posts into the GitHub-backed blog index.',
    status: 'live',
    tags: ['blog', 'publishing', 'editor', 'github', 'sqlite'],
  },
  {
    title: 'Blog',
    href: '/blog',
    description: 'Read the public XDOES posts and experiments published from the editor workflow.',
    status: 'live',
    tags: ['writing', 'posts', 'publishing'],
  },
  {
    title: 'XD License',
    href: '/xd-license',
    description: 'Reference terms for using, remixing, and sharing XDOES work with attribution.',
    status: 'reference',
    tags: ['license', 'terms', 'reference'],
  },
  {
    title: 'Sponsors',
    href: '/sponsors',
    description: 'Sponsor and partner information for placements around XDOES projects.',
    status: 'reference',
    tags: ['sponsors', 'partners', 'contact'],
  },
  {
    title: 'YouTube',
    href: 'https://youtube.com/@x-does',
    description: 'XDOES videos, demos, and public project updates on the main channel.',
    status: 'external',
    tags: ['video', 'channel', 'youtube'],
    external: true,
  },
];
