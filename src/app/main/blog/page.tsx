export const metadata = {
  title: 'Blog',
};

const POSTS = [
  {
    title: 'X Does: Build notes',
    excerpt: 'Short updates, experiments, and shipping logs.',
  },
  {
    title: 'What we are making next',
    excerpt: 'Roadmap snapshots from the xdoes build loop.',
  },
];

export default function MainBlogPage() {
  return (
    <section className="py-10">
      <h1 className="font-display text-5xl font-bold text-[#f3edff]">Blog</h1>
      <div className="mt-8 space-y-3">
        {POSTS.map((post) => (
          <article key={post.title} className="rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-4">
            <h2 className="text-xl font-semibold text-[#efe8ff]">{post.title}</h2>
            <p className="mt-2 text-[#b7aacd]">{post.excerpt}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
