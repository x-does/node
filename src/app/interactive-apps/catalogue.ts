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
    title: 'Vid Aider',
    href: 'https://x-does.github.io/vid-aider/',
    description: 'Browser studio for loading 3D assets, controlling groups, spinning loops, and exporting video-friendly captures.',
    status: 'external',
    tags: ['video', '3d', 'stl', 'obj', 'gltf', 'webm'],
    external: true,
  },
  {
    title: 'DefinitelyNotPong',
    href: 'https://github.com/x-does/DNP',
    description: 'Authoritative Node.js multiplayer Pong with WebSocket rooms, random 1v1 matchmaking, single-player AI, and up to 12 players.',
    status: 'external',
    tags: ['game', 'pong', 'multiplayer', 'websocket', 'node', 'canvas'],
    external: true,
  },
];
