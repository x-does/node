export type ManagedPost = {
  slug: string;
  title: string;
  folder: string;
  filename: string;
};

export type PublishActionDescription = {
  actionLabel: 'create' | 'update';
  successTitle: string;
  successMessage: string;
  statusMessage: string;
};

export function getPostContentPath(post: Pick<ManagedPost, 'folder' | 'filename'>) {
  return `${post.folder}/${post.filename}`;
}

export function describePublishAction(args: {
  slug: string;
  ownerRepo: string;
  created: boolean;
  bootstrappedSqlite: boolean;
}): PublishActionDescription {
  const actionLabel = args.created ? 'create' : 'update';
  const successTitle = `${args.created ? 'Created' : 'Updated'} ${args.slug}`;
  const baseMessage = `${args.created ? 'Created' : 'Updated'} ${args.slug} in ${args.ownerRepo}.`;

  return {
    actionLabel,
    successTitle,
    successMessage: args.bootstrappedSqlite
      ? `${baseMessage} Created the sqlite index automatically as part of the same publish.`
      : baseMessage,
    statusMessage: `${args.created ? 'Created' : 'Updated'} ${args.slug}.`,
  };
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
