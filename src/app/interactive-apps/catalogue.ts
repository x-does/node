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
    title: 'DefinitelyNotPong',
    href: '/dnp',
    description: 'Live multiplayer paddle arena with browser and phone controls, mounted directly into the site runtime.',
    status: 'live',
    tags: ['game', 'multiplayer', 'websocket', 'live'],
  },
  {
    title: 'Blog editor',
    href: '/blog-edit',
    description: 'Write, edit, preview, and publish XDOES posts into the GitHub-backed blog index.',
    status: 'live',
    tags: ['blog', 'publishing', 'editor', 'github', 'sqlite'],
  },
  {
    title: 'Vid Aider',
    href: 'https://x-does.github.io/vid-aider/',
    description: 'Browser studio for loading 3D assets, controlling groups, spinning loops, and exporting video-friendly captures.',
    status: 'external',
    tags: ['video', '3d', 'stl', 'obj', 'gltf', 'webm'],
    external: true,
  },
];
