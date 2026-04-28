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

function cardsPerPageForWidth(width: number) {
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export function RelatedPostsCarousel({ posts }: { posts: RelatedPost[] }) {
  const items = useMemo(() => posts.slice(0, 5), [posts]);
  const [activePage, setActivePage] = useState(0);
  const [cardsPerPage, setCardsPerPage] = useState(1);

  useEffect(() => {
    const sync = () => setCardsPerPage(cardsPerPageForWidth(window.innerWidth));
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const pages = useMemo(() => {
    const result: RelatedPost[][] = [];
    for (let index = 0; index < items.length; index += cardsPerPage) {
      result.push(items.slice(index, index + cardsPerPage));
    }
    return result;
  }, [items, cardsPerPage]);

  useEffect(() => {
    setActivePage(0);
  }, [cardsPerPage, items.length]);

  useEffect(() => {
    if (pages.length <= 1) return;
    const timer = window.setInterval(() => {
      setActivePage((current) => (current + 1) % pages.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [pages.length]);

  if (items.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="overflow-hidden rounded-2xl">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${activePage * 100}%)` }}
        >
          {pages.map((page, pageIndex) => (
            <div key={`page-${pageIndex}`} className="grid min-w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {page.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group flex min-h-[170px] flex-col justify-between rounded-2xl border border-[#7f6b9d]/20 bg-[#171022]/88 p-4 transition hover:border-[#b59cff] hover:bg-[#1d1530]"
                >
                  <div>
                    {post.sharedTags.length > 0 ? (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {post.sharedTags.map((tag) => (
                          <span
                            key={`${post.slug}-${tag}`}
                            className="rounded-full border border-[#7f6b9d]/35 bg-[#211732] px-2.5 py-1 text-[11px] text-[#d7caf0]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <h2 className="text-lg font-semibold text-[#f7f2ff] transition group-hover:text-white">{post.title}</h2>
                    <p className="mt-2 line-clamp-4 text-sm leading-6 text-[#cfc3e5]">
                      {post.description || 'Open this post.'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      {pages.length > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {pages.map((_, index) => {
            const isActive = index === activePage;
            return (
              <button
                key={`page-dot-${index}`}
                type="button"
                aria-label={`Show related post page ${index + 1}`}
                aria-pressed={isActive}
                onClick={() => setActivePage(index)}
                className={[
                  'h-2.5 rounded-full transition-all duration-200',
                  isActive ? 'w-8 bg-[#c8afff]' : 'w-2.5 bg-[#5d4a7d] hover:bg-[#8f74c5]',
                ].join(' ')}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
