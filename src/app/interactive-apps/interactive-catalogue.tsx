'use client';

import { useMemo, useState } from 'react';

import type { CatalogueItem } from './catalogue';

const statusClassNames: Record<CatalogueItem['status'], string> = {
  live: 'border-emerald-300/20 text-emerald-200/90',
  reference: 'border-[#9c82c8]/25 text-[#d7c8f5]',
  external: 'border-sky-300/20 text-sky-200/90',
};

export function InteractiveCatalogue({ items }: { items: CatalogueItem[] }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => {
      const searchableText = [item.title, item.description, item.status, ...item.tags].join(' ').toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [items, normalizedQuery]);

  return (
    <div className="mt-8 space-y-5">
      <label className="block" htmlFor="interactive-search">
        <span className="mb-2 block text-xs uppercase tracking-[0.24em] text-[#9f91ba]">Search tools</span>
        <input
          id="interactive-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by app, tag, or status..."
          className="w-full rounded-2xl border border-[#7f6b9d]/20 bg-[#0b0811]/70 px-4 py-3 text-sm text-[#f3edff] outline-none transition placeholder:text-[#77698f] focus:border-[#b598df]/50 focus:bg-[#100c18]"
        />
      </label>

      <div className="flex items-center justify-between border-b border-[#7f6b9d]/15 pb-3 text-xs uppercase tracking-[0.2em] text-[#8f82a8]">
        <span>{filteredItems.length} {filteredItems.length === 1 ? 'tool' : 'tools'}</span>
        <span>interactive index</span>
      </div>

      {filteredItems.length > 0 ? (
        <ul className="divide-y divide-[#7f6b9d]/14 overflow-hidden rounded-2xl border border-[#7f6b9d]/18 bg-[#0f0c17]/35">
          {filteredItems.map((item) => (
            <li key={item.title}>
              <a
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noreferrer' : undefined}
                className="group block px-4 py-4 transition-colors hover:bg-[#1a1324]/65 sm:px-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-[#f3edff] transition-colors group-hover:text-white">
                        {item.title}
                      </h2>
                      <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.18em] ${statusClassNames[item.status]}`}>
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#b9accf]">{item.description}</p>
                  </div>
                  <span className="text-sm text-[#a995c8] transition-colors group-hover:text-white">
                    Open<span aria-hidden="true"> →</span>
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-[#7f6b9d]/14 px-2.5 py-1 text-xs text-[#9f91ba]">
                      {tag}
                    </span>
                  ))}
                </div>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-[#7f6b9d]/18 bg-[#0f0c17]/35 p-6 text-sm text-[#b9accf]">
          No tools matched “{query}”. Try `blog`, `editor`, `license`, or `video`.
        </div>
      )}
    </div>
  );
}
