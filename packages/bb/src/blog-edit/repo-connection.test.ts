import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRepositoryInput,
  describePublishTarget,
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

test('describeRepoWorkspace summarizes the selected workspace when repos are loaded', () => {
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
      detailLine: 'Branch main • Base dir content/posts • SQLite data/blog.sqlite',
      nextStep: 'Pick a repository from the list, or paste a repository locator to switch workspaces.',
    },
  );
});

test('describeRepoWorkspace prompts for a token before repo data is available', () => {
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
    'Add a GitHub token to load writable repositories or paste a repository locator.',
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
    'Load writable repositories, or paste a repository locator to choose a different workspace.',
  );
});
