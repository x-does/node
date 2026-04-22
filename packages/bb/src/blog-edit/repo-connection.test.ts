import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRepositoryInput,
  describePublishTarget,
  describeRepoWorkflowState,
  describeRepoWorkspace,
  getSettingsForSelectedRepo,
} from './repo-connection';

test('parseRepositoryInput accepts owner/repo syntax', () => {
  assert.deepEqual(parseRepositoryInput('x-does/blog'), {
    owner: 'x-does',
    repo: 'blog',
  });
});

test('parseRepositoryInput accepts GitHub URLs and strips .git', () => {
  assert.deepEqual(parseRepositoryInput('https://github.com/x-does/blog.git'), {
    owner: 'x-does',
    repo: 'blog',
  });
});

test('parseRepositoryInput trims whitespace and trailing slash', () => {
  assert.deepEqual(parseRepositoryInput('  https://github.com/x-does/blog/  '), {
    owner: 'x-does',
    repo: 'blog',
  });
});

test('parseRepositoryInput strips .git even when the pasted URL ends with a slash', () => {
  assert.deepEqual(parseRepositoryInput('https://github.com/x-does/blog.git/'), {
    owner: 'x-does',
    repo: 'blog',
  });
});

test('getSettingsForSelectedRepo keeps existing publish settings while swapping repo and default branch', () => {
  assert.deepEqual(
    getSettingsForSelectedRepo(
      {
        owner: 'x-does',
        repo: 'blog',
        branch: 'main',
        baseDir: 'blogs',
        sqlitePath: 'blog.sqlite',
      },
      'sav/new-blog',
      { default_branch: 'trunk' },
    ),
    {
      owner: 'sav',
      repo: 'new-blog',
      branch: 'trunk',
      baseDir: 'blogs',
      sqlitePath: 'blog.sqlite',
    },
  );
});

test('describePublishTarget shows repo, branch, sqlite, and draft file path', () => {
  assert.deepEqual(
    describePublishTarget({
      owner: 'x-does',
      repo: 'blog',
      branch: 'main',
      baseDir: 'blogs',
      sqlitePath: 'blog.sqlite',
      slug: 'new-post',
    }),
    {
      ownerRepo: 'x-does/blog',
      branchLabel: 'main',
      baseDirLabel: 'blogs',
      sqliteLabel: 'blog.sqlite',
      postPath: 'blogs/new-post/blog.md',
    },
  );
});

test('describePublishTarget falls back to a draft slug when slug is empty', () => {
  assert.equal(
    describePublishTarget({
      owner: 'x-does',
      repo: 'blog',
      branch: 'main',
      baseDir: 'blogs',
      sqlitePath: 'blog.sqlite',
      slug: '',
    }).postPath,
    'blogs/draft-post/blog.md',
  );
});

test('describeRepoWorkspace summarizes the selected workspace with tighter target details', () => {
  assert.deepEqual(
    describeRepoWorkspace({
      owner: 'x-does',
      repo: 'blog',
      branch: 'main',
      baseDir: 'content/posts',
      sqlitePath: 'data/blog.sqlite',
      hasToken: true,
      hasLoadedRepos: true,
    }),
    {
      ownerRepo: 'x-does/blog',
      detailLine: 'main branch • content/posts • data/blog.sqlite',
      nextStep: 'Switch workspaces below, or keep publishing from this repo.',
    },
  );
});

test('describeRepoWorkspace prompts for GitHub auth before browsing writable repos', () => {
  assert.deepEqual(
    describeRepoWorkspace({
      owner: 'x-does',
      repo: 'blog',
      branch: 'main',
      baseDir: 'content/posts',
      sqlitePath: 'data/blog.sqlite',
      hasToken: false,
      hasLoadedRepos: false,
    }).nextStep,
    'Connect GitHub to browse writable repos, or paste a repository locator.',
  );
});

test('describeRepoWorkspace prompts to load repositories after auth is ready', () => {
  assert.deepEqual(
    describeRepoWorkspace({
      owner: 'x-does',
      repo: 'blog',
      branch: 'main',
      baseDir: 'content/posts',
      sqlitePath: 'data/blog.sqlite',
      hasToken: true,
      hasLoadedRepos: false,
    }).nextStep,
    'Load writable repos to browse workspace cards, or paste a repository locator.',
  );
});

test('describeRepoWorkflowState explains the disconnected auth state', () => {
  assert.deepEqual(
    describeRepoWorkflowState({
      ownerRepo: 'x-does/blog',
      hasToken: false,
      hasLoadedRepos: false,
      selectedRepoIsListed: false,
    }),
    {
      tone: 'info',
      badge: 'Connect GitHub',
      headline: 'Publishing is pointed at x-does/blog, but GitHub auth is still disconnected.',
      detail: 'Connect GitHub to browse writable repositories, publish changes, and sync the selected workspace with one click.',
      primaryAction: 'connect',
      primaryActionLabel: 'Connect GitHub',
    },
  );
});

test('describeRepoWorkflowState explains the load repos state after auth', () => {
  assert.deepEqual(
    describeRepoWorkflowState({
      ownerRepo: 'x-does/blog',
      hasToken: true,
      hasLoadedRepos: false,
      selectedRepoIsListed: false,
    }),
    {
      tone: 'info',
      badge: 'Load repos',
      headline: 'GitHub is connected. Load writable repositories to confirm that x-does/blog is the right workspace.',
      detail: 'You can keep using the manual locator, but loading repos makes it easier to switch workspaces and open posts without touching advanced settings.',
      primaryAction: 'loadRepos',
      primaryActionLabel: 'Load writable repos',
    },
  );
});

test('describeRepoWorkflowState explains manual locator targets separately', () => {
  assert.deepEqual(
    describeRepoWorkflowState({
      ownerRepo: 'sav/manual-blog',
      hasToken: true,
      hasLoadedRepos: true,
      selectedRepoIsListed: false,
    }),
    {
      tone: 'info',
      badge: 'Manual target',
      headline: 'sav/manual-blog is currently selected via the manual locator.',
      detail: 'Refresh posts to verify this target, or choose a repository card below if you want to switch back to a known writable workspace.',
      primaryAction: 'refreshPosts',
      primaryActionLabel: 'Refresh posts',
    },
  );
});

test('describeRepoWorkflowState explains the connected happy path', () => {
  assert.deepEqual(
    describeRepoWorkflowState({
      ownerRepo: 'x-does/blog',
      hasToken: true,
      hasLoadedRepos: true,
      selectedRepoIsListed: true,
    }),
    {
      tone: 'success',
      badge: 'Workspace ready',
      headline: 'x-does/blog is selected and ready for create, update, and delete actions.',
      detail:
        'Use Refresh posts to sync the current repo, then keep publishing from the editor without revisiting advanced settings.',
      primaryAction: 'refreshPosts',
      primaryActionLabel: 'Refresh posts',
    },
  );
});
