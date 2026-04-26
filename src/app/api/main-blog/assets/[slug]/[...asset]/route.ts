import { NextRequest } from 'next/server';

import { loadMainBlogAsset } from '@/lib/main-blog-db';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string; asset: string[] }>;

function contentDisposition(fileName: string) {
  const safeName = fileName.replace(/[\r\n"]/g, '_') || 'asset';
  return `inline; filename="${safeName}"`;
}

export async function GET(_request: NextRequest, context: { params: Params }) {
  const { slug, asset } = await context.params;
  const safeSegments = asset.filter((part) => part && part !== '.' && part !== '..');
  if (!slug || safeSegments.length === 0 || safeSegments.length !== asset.length) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const relativePath = `blogs/${slug}/assets/${safeSegments.join('/')}`;
  const loaded = await loadMainBlogAsset(relativePath);
  if (!loaded) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response(new Uint8Array(loaded.bytes), {
    status: 200,
    headers: {
      'Content-Type': loaded.contentType,
      'Content-Disposition': contentDisposition(safeSegments[safeSegments.length - 1]),
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  });
}
