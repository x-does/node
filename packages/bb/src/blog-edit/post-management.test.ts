import test from 'node:test';
import assert from 'node:assert/strict';

import { describeDeleteAction, describePublishAction, getPostContentPath } from './post-management';

test('getPostContentPath joins folder and filename', () => {
  assert.equal(
    getPostContentPath({ folder: 'blogs/hello-world', filename: 'blog.md' }),
    'blogs/hello-world/blog.md',
  );
});

test('describeDeleteAction produces explicit destructive copy', () => {
  assert.deepEqual(
    describeDeleteAction(
      {
        slug: 'hello-world',
        title: 'Hello World',
        folder: 'blogs/hello-world',
        filename: 'blog.md',
      },
      'x-does/blog',
      'main',
    ),
    {
      title: 'Hello World',
      postPath: 'blogs/hello-world/blog.md',
      confirmLabel: 'Delete “Hello World”?',
      confirmMessage:
        'This permanently removes blogs/hello-world/blog.md from x-does/blog on main and removes hello-world from the sqlite index. This cannot be undone.',
      successMessage: 'Deleted hello-world from x-does/blog and removed it from the sqlite index.',
    },
  );
});

test('describeDeleteAction falls back to slug when title is blank', () => {
  assert.equal(
    describeDeleteAction(
      {
        slug: 'draft-post',
        title: '   ',
        folder: 'blogs/draft-post',
        filename: 'blog.md',
      },
      'x-does/blog',
      'trunk',
    ).confirmLabel,
    'Delete “draft-post”?',
  );
});

test('describePublishAction uses create wording when publishing a new post', () => {
  assert.deepEqual(
    describePublishAction({
      slug: 'new-post',
      ownerRepo: 'x-does/blog',
      created: true,
      bootstrappedSqlite: true,
    }),
    {
      actionLabel: 'create',
      successTitle: 'Created new-post',
      successMessage: 'Created new-post in x-does/blog. Created the sqlite index automatically as part of the same publish.',
      statusMessage: 'Created new-post.',
    },
  );
});

test('describePublishAction uses update wording for existing posts without bootstrap copy', () => {
  assert.deepEqual(
    describePublishAction({
      slug: 'existing-post',
      ownerRepo: 'x-does/blog',
      created: false,
      bootstrappedSqlite: false,
    }),
    {
      actionLabel: 'update',
      successTitle: 'Updated existing-post',
      successMessage: 'Updated existing-post in x-does/blog.',
      statusMessage: 'Updated existing-post.',
    },
  );
});
