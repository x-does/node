import test from 'node:test';
import assert from 'node:assert/strict';

import { describeDeleteAction, getPostContentPath } from './post-management';

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
