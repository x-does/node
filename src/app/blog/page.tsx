import type { Metadata } from 'next';
import { Section } from '@/components/ui/section';
import { PostCard } from '@/components/blog/post-card';
import { getAllPosts } from '@/lib/mdx';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Updates, guides, and build logs from the xdoes team.',
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <Section heading="Blog" subheading="Updates, guides, and build logs from the team.">
      {posts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface-overlay p-8 text-center">
          <p className="text-muted">No posts yet. Check back soon.</p>
        </div>
      )}
    </Section>
  );
}
