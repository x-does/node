import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAssetPath,
  buildMediaMarkdown,
  getEditorAccessState,
  renderBlogMediaMarkdown,
  sanitizeAssetFileName,
} from './media';

test('sanitizeAssetFileName keeps safe names and normalizes unsafe characters', () => {
  assert.equal(sanitizeAssetFileName('My Demo Image (Final).PNG'), 'my-demo-image-final.png');
  assert.equal(sanitizeAssetFileName('../../secret.pdf'), 'secret.pdf');
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
