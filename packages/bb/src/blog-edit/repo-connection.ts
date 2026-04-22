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
  let nextStep = 'Switch workspaces below, or keep publishing from this repo.';
  if (!settings.hasToken) {
    nextStep = 'Connect GitHub to browse writable repos, or paste a repository locator.';
  } else if (!settings.hasLoadedRepos) {
    nextStep = 'Load writable repos to browse workspace cards, or paste a repository locator.';
  }

  return {
    ownerRepo: `${settings.owner}/${settings.repo}`,
    detailLine: `${settings.branch} branch • ${settings.baseDir} • ${settings.sqlitePath}`,
    nextStep,
  };
}

export function describeRepoWorkflowState(args: {
  ownerRepo: string;
  hasToken: boolean;
  hasLoadedRepos: boolean;
  selectedRepoIsListed: boolean;
}) {
  if (!args.hasToken) {
    return {
      tone: 'info' as const,
      badge: 'Connect GitHub',
      headline: `Publishing is pointed at ${args.ownerRepo}, but GitHub auth is still disconnected.`,
      detail: 'Connect GitHub to browse writable repositories, publish changes, and sync the selected workspace with one click.',
      primaryAction: 'connect' as const,
      primaryActionLabel: 'Connect GitHub',
    };
  }

  if (!args.hasLoadedRepos) {
    return {
      tone: 'info' as const,
      badge: 'Load repos',
      headline: `GitHub is connected. Load writable repositories to confirm that ${args.ownerRepo} is the right workspace.`,
      detail: 'You can keep using the manual locator, but loading repos makes it easier to switch workspaces and open posts without touching advanced settings.',
      primaryAction: 'loadRepos' as const,
      primaryActionLabel: 'Load writable repos',
    };
  }

  if (!args.selectedRepoIsListed) {
    return {
      tone: 'info' as const,
      badge: 'Manual target',
      headline: `${args.ownerRepo} is currently selected via the manual locator.`,
      detail: 'Refresh posts to verify this target, or choose a repository card below if you want to switch back to a known writable workspace.',
      primaryAction: 'refreshPosts' as const,
      primaryActionLabel: 'Refresh posts',
    };
  }

  return {
    tone: 'success' as const,
    badge: 'Workspace ready',
    headline: `${args.ownerRepo} is selected and ready for create, update, and delete actions.`,
    detail: 'Use Refresh posts to sync the current repo, then keep publishing from the editor without revisiting advanced settings.',
    primaryAction: 'refreshPosts' as const,
    primaryActionLabel: 'Refresh posts',
  };
}

