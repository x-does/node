'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type RelatedPost = {
  slug: string;
  title: string;
  description: string;
  updatedAt: string;
  sharedTags: string[];
};

function formatDisplayDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function RelatedPostsCarousel({ posts }: { posts: RelatedPost[] }) {
  const items = useMemo(() => posts.filter((post) => post.sharedTags.length > 0), [posts]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (items.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;

  const activePost = items[activeIndex] ?? items[0];

  return (
    <section className="mx-auto mt-10 max-w-[66ch] rounded-2xl border border-[#7f6b9d]/25 bg-[#120d1b]/85 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9f8bca]">Keep reading</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#f3edff]">Related posts</h2>
          <p className="mt-2 text-sm text-[#c6badb]">More posts that share at least one tag with this article.</p>
        </div>

        {items.length > 1 ? (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              aria-label="Previous related post"
              onClick={() => setActiveIndex((current) => (current - 1 + items.length) % items.length)}
              className="rounded-full border border-[#7f6b9d]/35 px-3 py-1.5 text-sm text-[#f3edff] transition hover:border-[#b59cff] hover:bg-[#241635]"
            >
              ← Prev
            </button>
            <button
              type="button"
              aria-label="Next related post"
              onClick={() => setActiveIndex((current) => (current + 1) % items.length)}
              className="rounded-full border border-[#7f6b9d]/35 px-3 py-1.5 text-sm text-[#f3edff] transition hover:border-[#b59cff] hover:bg-[#241635]"
            >
              Next →
            </button>
          </div>
        ) : null}
      </div>

      <div className="relative mt-5 overflow-hidden rounded-2xl border border-[#7f6b9d]/18 bg-[#171022]/88">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {items.map((post) => (
            <div key={post.slug} className="min-w-full p-5 sm:p-6">
              <div className="flex flex-wrap gap-2">
                {post.sharedTags.map((tag) => (
                  <span
                    key={`${post.slug}-${tag}`}
                    className="rounded-full border border-[#7f6b9d]/35 bg-[#1f1730] px-2.5 py-1 text-xs text-[#d7caf0]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              <h3 className="mt-4 text-xl font-semibold text-[#f7f2ff]">{post.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#cfc3e5]">{post.description || 'No description provided.'}</p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs uppercase tracking-[0.22em] text-[#9e8eb8]">
                  Updated {formatDisplayDate(post.updatedAt)}
                </span>
                <Link
                  href={`/blog/${post.slug}`}
                  className="inline-flex items-center justify-center rounded-full border border-[#8f74c5] bg-[#241635] px-4 py-2 text-sm font-medium text-[#f7f2ff] transition hover:border-[#c2a7ff] hover:bg-[#311d4b]"
                >
                  Read this post →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {items.length > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {items.map((post, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={`${post.slug}-dot`}
                type="button"
                aria-label={`Show related post ${index + 1}`}
                aria-pressed={isActive}
                onClick={() => setActiveIndex(index)}
                className={[
                  'h-2.5 rounded-full transition-all duration-200',
                  isActive ? 'w-8 bg-[#c8afff]' : 'w-2.5 bg-[#5d4a7d] hover:bg-[#8f74c5]',
                ].join(' ')}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
