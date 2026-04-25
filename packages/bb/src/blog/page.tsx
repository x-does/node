import Link from 'next/link';
import { loadMainBlogPosts } from '../lib/main-blog-db';

type SearchParams = Promise<{ q?: string }>;

export const metadata = {
  title: 'Main Blog',
  description: 'Latest xdoes posts loaded from blog sqlite index.',
};

function splitCsv(input: string) {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function BlogPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = (sp.q || '').trim();
  const posts = await loadMainBlogPosts(q, 100);

  return (
    <section className="py-10">
      <div>
        <h1 className="font-display text-5xl font-bold text-[#f3edff]">X-Does Pages</h1>
      </div>

      <form method="GET" className="mt-6 flex w-full gap-2" role="search" aria-label="Search indexed blog posts">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title, tags, refs, links..."
          autoComplete="off"
          className="w-full rounded-lg border border-[#7f6b9d]/25 bg-[#110d19]/45 px-3 py-2 text-[#efe8ff] outline-none focus-visible:ring-2 focus-visible:ring-[#a58ac8]/60"
        />
        <button type="submit" className="rounded-lg border border-[#7f6b9d]/25 bg-[#1a1328] px-4 py-2 text-[#efe8ff] hover:border-[#a58ac8]/60">Search</button>
      </form>

      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[#a796c3]">{posts.length} post{posts.length === 1 ? '' : 's'} indexed</p>

      <div className="mt-7 grid gap-3">
        {posts.length === 0 ? (
          <div className="rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/35 p-4 text-[#b7aacd]">No posts found for this query.</div>
        ) : (
          posts.map((post) => (
            <article
              key={post.slug}
              className="group relative rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-4 transition hover:border-[#a58ac8]/45 hover:bg-[#171124]/55"
            >
              <Link
                href={`/blog/${encodeURIComponent(post.slug)}`}
                aria-label={`Open post ${post.title}`}
                className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a58ac8]/60"
              />

              <div className="pointer-events-none relative z-10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-[#efe8ff] transition group-hover:text-white">
                      {post.title}
                    </h2>
                    <p className="mt-2 text-[#c6badb]">{post.description || 'No description.'}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {splitCsv(post.tags).map((tag) => (
                    <span key={`tag-${post.slug}-${tag}`} className="rounded-full border border-[#7f6b9d]/35 px-2 py-1 text-[#c7bbdc]">
                      #{tag}
                    </span>
                  ))}
                  {splitCsv(post.refs).map((ref) => (
                    <Link
                      key={`ref-${post.slug}-${ref}`}
                      href={`/blog?q=${encodeURIComponent(ref)}`}
                      className="pointer-events-auto rounded-full border border-[#6d86c7]/35 px-2 py-1 text-[#bed1ff] hover:border-[#8ea6e8]"
                    >
                      @{ref}
                    </Link>
                  ))}
                </div>

                <div className="mt-3 text-sm text-[#ad9fc5]">
                  <div>links: {post.links || '-'}</div>
                  <div>
                    source file: <code>{post.folder}/{post.filename}</code>
                  </div>
                  <div>updated: {post.updatedAt}</div>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}


export default BlogPage;
