import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Badge } from '@/components/ui/badge';
import { getAllPosts, getPostBySlug } from '@/lib/mdx';
import { formatDate } from '@/lib/utils';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: 'Post Not Found' };
  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/blog" className="text-sm text-accent transition-colors hover:text-accent-bright">
        &larr; Back to blog
      </Link>

      <div className="mt-6 flex flex-wrap gap-2">
        {post.tags.map((tag) => (
          <Badge key={tag} variant="accent">{tag}</Badge>
        ))}
      </div>

      <h1 className="mt-4 font-display text-3xl font-bold leading-tight text-foreground md:text-4xl">
        {post.title}
      </h1>
      <time className="mt-3 block text-sm text-subtle">{formatDate(post.date)}</time>

      <div className="prose prose-invert mt-10 max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-muted prose-a:text-accent prose-a:no-underline hover:prose-a:text-accent-bright prose-strong:text-foreground prose-code:text-accent-bright prose-pre:bg-surface prose-pre:border prose-pre:border-border">
        <MDXRemote source={post.content} />
      </div>
    </article>
  );
}
