import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BlogCodeCopyController } from '../../blog-edit/code-copy';
import { renderBlogMediaMarkdown } from '../../blog-edit/media';
import { loadMainBlogMarkdown, loadMainBlogPostBySlug } from '../../lib/main-blog-db';

function splitCsv(input: string) {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

type Params = Promise<{ slug: string }>;

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = await loadMainBlogPostBySlug(slug);
  if (!post) notFound();

  const markdown = await loadMainBlogMarkdown(post);
  if (!markdown) notFound();

  const html = renderBlogMediaMarkdown(post.slug, markdown);

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

      <div className="preview blog-post-preview mx-auto mt-8 max-w-[66ch] rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.2)] sm:p-6" dangerouslySetInnerHTML={{ __html: html }} />

      <div className="mx-auto mt-5 max-w-[66ch] border-t border-[#7f6b9d]/18 pt-4 text-sm text-[#ad9fc5]">
        <div>updated: {post.updatedAt}</div>
        <div>
          source file: <code>{post.folder}/{post.filename}</code>
        </div>
      </div>
    </article>
  );
}
