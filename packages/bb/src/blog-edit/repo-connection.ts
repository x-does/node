export type RepoConnectionSettings = {
  owner: string;
  repo: string;
  branch: string;
  baseDir: string;
  sqlitePath: string;
};

export type RepoDescriptor = {
  full_name: string;
  default_branch?: string;
};

export function parseRepositoryInput(input: string) {
  const cleaned = input.trim().replace(/\/+$/g, '').replace(/\.git$/i, '');
  const fromUrl = cleaned.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  const source = fromUrl ? `${fromUrl[1]}/${fromUrl[2]}` : cleaned;
  const match = source.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export function getSettingsForSelectedRepo(
  settings: RepoConnectionSettings,
  full: string,
  selected?: Pick<RepoDescriptor, 'default_branch'>,
): RepoConnectionSettings {
  const [owner = settings.owner, repo = settings.repo] = full.split('/');
  return {
    ...settings,
    owner,
    repo,
    branch: selected?.default_branch || settings.branch,
  };
}

export function describePublishTarget(settings: RepoConnectionSettings & { slug: string }) {
  const slug = settings.slug.trim() || 'draft-post';
  return {
    ownerRepo: `${settings.owner}/${settings.repo}`,
    branchLabel: settings.branch,
    baseDirLabel: settings.baseDir,
    sqliteLabel: settings.sqlitePath,
    postPath: `${settings.baseDir}/${slug}/blog.md`,
  };
}

export function describeRepoWorkspace(
  settings: RepoConnectionSettings & { hasToken: boolean; hasLoadedRepos: boolean },
) {
  let nextStep = 'Pick a repository from the list or keep this one to continue editing.';
  if (!settings.hasToken) {
    nextStep = 'Add a GitHub token to load your repositories.';
  } else if (!settings.hasLoadedRepos) {
    nextStep = 'Load your repositories to choose where this blog post will be published.';
  }

  return {
    ownerRepo: `${settings.owner}/${settings.repo}`,
    detailLine: `Branch ${settings.branch} • Base dir ${settings.baseDir} • SQLite ${settings.sqlitePath}`,
    nextStep,
  };
}

