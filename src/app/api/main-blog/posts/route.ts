import { NextRequest, NextResponse } from 'next/server';
import { loadMainBlogPosts } from '@/lib/main-blog-db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || undefined;
  const limitParam = Number(request.nextUrl.searchParams.get('limit') || 20);
  const posts = await loadMainBlogPosts(q, limitParam);
  return NextResponse.json({ ok: true, count: posts.length, posts }, { headers: { 'Cache-Control': 'no-store' } });
}
