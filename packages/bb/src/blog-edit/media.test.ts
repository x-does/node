import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAssetPath,
  buildMediaMarkdown,
  getEditorAccessState,
  listAssetTreeRows,
  normalizeGitHubAssetEntries,
  renderBlogMediaMarkdown,
  sanitizeAssetFileName,
} from './media';

test('sanitizeAssetFileName keeps safe names and normalizes unsafe characters', () => {
  assert.equal(sanitizeAssetFileName('My Demo Image (Final).PNG'), 'my-demo-image-final.png');
  assert.equal(sanitizeAssetFileName('../../secret.pdf'), 'secret.pdf');
  assert.equal(sanitizeAssetFileName('docs/Spec Sheet.PDF'), 'docs/spec-sheet.pdf');
  assert.equal(sanitizeAssetFileName(''), 'asset');
});

test('buildAssetPath stores uploads under the post asset folder', () => {
  assert.equal(buildAssetPath('Hello World!', 'My Demo Image.PNG'), 'blogs/hello-world/assets/my-demo-image.png');
});

test('buildMediaMarkdown emits inline image/video and downloadable file markdown', () => {
  assert.equal(
    buildMediaMarkdown({ slug: 'hello-world', fileName: 'hero.png', mimeType: 'image/png' }),
    '\n![hero.png](assets/hero.png)\n',
  );
  assert.equal(
    buildMediaMarkdown({ slug: 'hello-world', fileName: 'clip.mp4', mimeType: 'video/mp4' }),
    '\n<video controls src="assets/clip.mp4"></video>\n',
  );
  assert.equal(
    buildMediaMarkdown({ slug: 'hello-world', fileName: 'spec.pdf', mimeType: 'application/pdf' }),
    '\n[Download spec.pdf](assets/spec.pdf)\n',
  );
});

test('renderBlogMediaMarkdown rewrites post-relative asset links for reader pages', () => {
  const html = renderBlogMediaMarkdown('hello-world', '![Hero](assets/hero.png)\n\n<video controls src="assets/clip.mp4"></video>\n\n[Spec](assets/spec.pdf)');
  assert.match(html, /src="\/api\/main-blog\/assets\/hello-world\/hero\.png"/);
  assert.match(html, /src="\/api\/main-blog\/assets\/hello-world\/clip\.mp4"/);
  assert.match(html, /href="\/api\/main-blog\/assets\/hello-world\/spec\.pdf"/);
  assert.match(html, /<a href="\/api\/main-blog\/assets\/hello-world\/spec\.pdf" download>Spec<\/a>/);
});

test('renderBlogMediaMarkdown wraps YouTube iframes for responsive sizing', () => {
  const html = renderBlogMediaMarkdown(
    'hello-world',
    '<iframe width="560" height="315" src="https://www.youtube.com/embed/demo" title="YouTube video" frameborder="0" allowfullscreen></iframe>',
  );

  assert.match(html, /<div class="blog-media-embed blog-media-embed--youtube">/);
  assert.match(html, /<iframe[^>]+src="https:\/\/www\.youtube\.com\/embed\/demo"/);
});

test('normalizeGitHubAssetEntries returns sorted post-relative files only', () => {
  assert.deepEqual(
    normalizeGitHubAssetEntries(
      [
        { name: 'hero.png', path: 'blogs/hello-world/assets/hero.png', type: 'file', size: 42, sha: 'a' },
        { name: 'nested', path: 'blogs/hello-world/assets/nested', type: 'dir' },
        { name: 'notes.txt', path: 'blogs/hello-world/assets/docs/notes.txt', type: 'file', size: 10, sha: 'b' },
        { name: 'other.png', path: 'blogs/other/assets/other.png', type: 'file', size: 4, sha: 'c' },
      ],
      'blogs/hello-world/assets',
    ),
    [
      {
        name: 'notes.txt',
        relativePath: 'docs/notes.txt',
        repoPath: 'blogs/hello-world/assets/docs/notes.txt',
        size: 10,
        sha: 'b',
        type: 'file',
      },
      {
        name: 'hero.png',
        relativePath: 'hero.png',
        repoPath: 'blogs/hello-world/assets/hero.png',
        size: 42,
        sha: 'a',
        type: 'file',
      },
    ],
  );
});

test('listAssetTreeRows includes compact folder rows before nested files', () => {
  assert.deepEqual(
    listAssetTreeRows([
      { name: 'notes.txt', relativePath: 'docs/notes.txt', repoPath: 'blogs/hello-world/assets/docs/notes.txt', type: 'file' },
      { name: 'hero.png', relativePath: 'hero.png', repoPath: 'blogs/hello-world/assets/hero.png', type: 'file' },
    ]),
    [
      { key: 'folder:docs', kind: 'folder', label: 'docs', depth: 0, path: 'docs' },
      { key: 'file:docs/notes.txt', kind: 'file', label: 'notes.txt', depth: 1, path: 'docs/notes.txt' },
      { key: 'file:hero.png', kind: 'file', label: 'hero.png', depth: 0, path: 'hero.png' },
    ],
  );
});

test('getEditorAccessState blocks editor interactions until authenticated', () => {
  assert.deepEqual(getEditorAccessState({ token: '', loading: false }), {
    canOpenEditor: false,
    disabled: true,
    reason: 'Connect GitHub to unlock editor controls.',
  });
  assert.deepEqual(getEditorAccessState({ token: 'token', loading: true }), {
    canOpenEditor: true,
    disabled: true,
    reason: 'Working… editor controls are temporarily disabled.',
  });
});
