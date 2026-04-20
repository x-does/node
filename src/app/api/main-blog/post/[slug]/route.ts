import { NextRequest } from 'next/server';

import { loadMainBlogMarkdown, loadMainBlogPostBySlug } from '@/lib/main-blog-db';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export async function GET(_request: NextRequest, context: { params: Params }) {
  const { slug } = await context.params;
  const post = await loadMainBlogPostBySlug(slug);
  if (!post) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const markdown = await loadMainBlogMarkdown(post);
  if (!markdown) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
