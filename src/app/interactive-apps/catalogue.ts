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
];
