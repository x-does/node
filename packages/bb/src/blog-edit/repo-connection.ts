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
  settings: RepoConnectionSettings & {
    hasToken: boolean;
    hasLoadedRepos: boolean;
    hasWritableRepos: boolean;
    selectedRepoIsListed: boolean;
  },
) {
  let nextStep = 'Refresh posts when you want to sync this workspace, or choose another repo below.';
  if (!settings.hasToken) {
    nextStep = 'Connect GitHub to browse writable repos, or keep using the repository locator.';
  } else if (!settings.hasLoadedRepos) {
    nextStep = 'Load writable repos to confirm this workspace, or keep using the repository locator.';
  } else if (!settings.hasWritableRepos) {
    nextStep = 'Refresh posts to verify this target, or reload writable repos after updating GitHub access.';
  } else if (!settings.selectedRepoIsListed) {
    nextStep = 'Refresh posts to verify this target, or switch back to a listed writable repo below.';
  }

  return {
    ownerRepo: `${settings.owner}/${settings.repo}`,
    selectionLabel: settings.selectedRepoIsListed ? 'Selected workspace' : 'Manual target',
    selectionDetail: settings.selectedRepoIsListed
      ? 'Chosen from your writable repo list.'
      : settings.hasLoadedRepos && !settings.hasWritableRepos
        ? 'Using the repository locator because no writable repo cards were returned.'
        : 'Typed in with the repository locator instead of a repo card.',
    publishDetail: `${settings.branch} branch • ${settings.baseDir} • ${settings.sqlitePath}`,
    nextStep,
    settingsHint: 'Advanced settings stay focused on branch and path overrides.',
  };
}

export function describeRepoWorkflowState(args: {
  ownerRepo: string;
  hasToken: boolean;
  hasLoadedRepos: boolean;
  hasWritableRepos: boolean;
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

  if (!args.hasWritableRepos) {
    return {
      tone: 'info' as const,
      badge: 'No writable repos',
      headline: `GitHub is connected, but no writable repositories were returned. ${args.ownerRepo} remains selected via the manual locator.`,
      detail: 'Refresh posts to verify this workspace, or reload repos after updating GitHub access.',
      primaryAction: 'refreshPosts' as const,
      primaryActionLabel: 'Refresh posts',
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

