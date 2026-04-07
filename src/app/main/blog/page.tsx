import Link from 'next/link';
import { loadMainBlogPosts } from '@/lib/main-blog-db';

type SearchParams = Promise<{ q?: string }>;

export const metadata = {
  title: 'Main Blog',
  description: 'Latest xdoes posts loaded from blog sqlite index.',
};

export default async function MainBlogPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = (sp.q || '').trim();
  const posts = loadMainBlogPosts(q, 100);

  return (
    <section className="py-10">
      <h1 className="font-display text-5xl font-bold text-[#f3edff]">Blog</h1>
      <p className="mt-3 text-[#b9accf]">Latest posts from the standalone blog repository sqlite index.</p>

      <form method="GET" className="mt-6 flex max-w-2xl gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title, tags, refs, links..."
          className="w-full rounded-lg border border-[#7f6b9d]/25 bg-[#110d19]/45 px-3 py-2 text-[#efe8ff] outline-none"
        />
        <button className="rounded-lg border border-[#7f6b9d]/25 bg-[#1a1328] px-4 py-2 text-[#efe8ff]">Search</button>
      </form>

      <div className="mt-7 grid gap-3">
        {posts.length === 0 ? (
          <div className="rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/35 p-4 text-[#b7aacd]">No posts found.</div>
        ) : (
          posts.map((post) => (
            <article key={post.slug} className="rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-4">
              <h2 className="text-2xl font-semibold text-[#efe8ff]">{post.title}</h2>
              <p className="mt-2 text-[#c6badb]">{post.description || 'No description.'}</p>
              <div className="mt-3 text-sm text-[#ad9fc5]">
                <div>tags: {post.tags || '-'}</div>
                <div>refs: {post.refs || '-'}</div>
                <div>
                  source file: <code>{post.folder}/{post.filename}</code>
                </div>
                <div>updated: {post.updatedAt}</div>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="mt-8">
        <Link href="/main" className="text-sm text-[#b9accf] hover:text-white">← Back to main</Link>
      </div>
    </section>
  );
}
