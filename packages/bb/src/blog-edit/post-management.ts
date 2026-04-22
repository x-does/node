export type ManagedPost = {
  slug: string;
  title: string;
  folder: string;
  filename: string;
};

export function getPostContentPath(post: Pick<ManagedPost, 'folder' | 'filename'>) {
  return `${post.folder}/${post.filename}`;
}

export function describeDeleteAction(post: ManagedPost, ownerRepo: string, branch: string) {
  const title = post.title.trim() || post.slug;
  const postPath = getPostContentPath(post);
  return {
    title,
    postPath,
    confirmLabel: `Delete “${title}”?`,
    confirmMessage: `This permanently removes ${postPath} from ${ownerRepo} on ${branch} and removes ${post.slug} from the sqlite index. This cannot be undone.`,
    successMessage: `Deleted ${post.slug} from ${ownerRepo} and removed it from the sqlite index.`,
  };
}
