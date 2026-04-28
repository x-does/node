import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BlogCodeCopyController } from '../../blog-edit/code-copy';
import { renderBlogMediaMarkdown } from '../../blog-edit/media';
import { loadMainBlogMarkdown, loadMainBlogPostBySlug, loadMainBlogPosts } from '../../lib/main-blog-db';
import type { MainBlogRow } from '../../lib/types';
import { RelatedPostsCarousel } from '../related-posts-carousel';

function splitCsv(input: string) {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

type RelatedPost = {
  slug: string;
  title: string;
  description: string;
  updatedAt: string;
  sharedTags: string[];
};

function getRelatedPosts(post: MainBlogRow, allPosts: MainBlogRow[]) {
  const maxPosts = 5;
  const candidates = allPosts.filter((candidate) => candidate.slug !== post.slug);
  const currentTags = new Set(splitCsv(post.tags).map((tag) => tag.toLowerCase()));
  const preferredTagCount = Math.ceil(maxPosts / 2);

  const sameTagPosts = candidates
    .map((candidate) => {
      const sharedTags = splitCsv(candidate.tags).filter((tag) => currentTags.has(tag.toLowerCase()));
      return {
        slug: candidate.slug,
        title: candidate.title,
        description: candidate.description,
        updatedAt: candidate.updatedAt,
        sharedTags,
        score: sharedTags.length,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });

  const selected = new Map<string, RelatedPost>();

  for (const candidate of sameTagPosts.slice(0, preferredTagCount)) {
    selected.set(candidate.slug, {
      slug: candidate.slug,
      title: candidate.title,
      description: candidate.description,
      updatedAt: candidate.updatedAt,
      sharedTags: candidate.sharedTags,
    });
  }

  for (const candidate of candidates.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))) {
    if (selected.size >= maxPosts) break;
    if (selected.has(candidate.slug)) continue;

    const sharedTags = splitCsv(candidate.tags).filter((tag) => currentTags.has(tag.toLowerCase()));
    selected.set(candidate.slug, {
      slug: candidate.slug,
      title: candidate.title,
      description: candidate.description,
      updatedAt: candidate.updatedAt,
      sharedTags,
    });
  }

  return [...selected.values()].slice(0, maxPosts);
}

type Params = Promise<{ slug: string }>;

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = await loadMainBlogPostBySlug(slug);
  if (!post) notFound();

  const markdown = await loadMainBlogMarkdown(post);
  if (!markdown) notFound();

  const html = renderBlogMediaMarkdown(post.slug, markdown);
  const allPosts = await loadMainBlogPosts(undefined, 200);
  const relatedPosts = getRelatedPosts(post, allPosts);

  return (
    <article className="mx-auto max-w-[860px] py-10">
      <BlogCodeCopyController />
      <div className="mx-auto max-w-[66ch]">
        <h1 className="font-display text-4xl font-bold text-[#f3edff] sm:text-5xl">{post.title}</h1>
        <p className="mt-3 text-[#c6badb]">{post.description || 'No description.'}</p>
      </div>

      <div className="mx-auto mt-4 flex max-w-[66ch] flex-wrap gap-2 text-xs">
        {splitCsv(post.tags).map((tag) => (
          <span key={`tag-${post.slug}-${tag}`} className="rounded-full border border-[#7f6b9d]/35 px-2 py-1 text-[#c7bbdc]">
            #{tag}
          </span>
        ))}
        {splitCsv(post.refs).map((ref) => (
          <Link
            key={`ref-${post.slug}-${ref}`}
            href={`/blog?q=${encodeURIComponent(ref)}`}
            className="rounded-full border border-[#6d86c7]/35 px-2 py-1 text-[#bed1ff] hover:border-[#8ea6e8]"
          >
            @{ref}
          </Link>
        ))}
      </div>

      <div className="preview blog-post-preview mx-auto mt-8 max-w-[66ch] rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.2)] sm:p-6">
        <div dangerouslySetInnerHTML={{ __html: html }} />

        <div className="mt-8 border-t border-[#7f6b9d]/18 pt-4 text-sm text-[#ad9fc5]">
          <div>updated: {post.updatedAt}</div>
          <div>
            source file: <code>{post.folder}/{post.filename}</code>
          </div>
        </div>

        <div className="mt-8 border-t border-[#7f6b9d]/18 pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9f8bca]">Keep reading</p>
          <RelatedPostsCarousel posts={relatedPosts} />
        </div>
      </div>
    </article>
  );
}
