import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { contentTypeForPath, getMainBlogRelativePath, loadMainBlogAsset, loadMainBlogPosts } from './main-blog-db';

function makeSqliteFile(filename: string, row: { slug: string; title: string; description: string }) {
  const file = path.join(os.tmpdir(), filename);
  const db = new Database(file);
  db.exec(`
    CREATE TABLE posts (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      refs TEXT DEFAULT '',
      links TEXT DEFAULT '',
      folder TEXT NOT NULL,
      filename TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  db.prepare(`
    INSERT INTO posts (slug, title, description, tags, refs, links, folder, filename, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.slug,
    row.title,
    row.description,
    'test,remote',
    'alpha,beta',
    'https://example.com',
    `blogs/${row.slug}`,
    'blog.md',
    '2026-04-20T08:00:00.000Z',
    '2026-04-20T08:05:00.000Z',
  );
  db.close();
  return file;
}

function restoreEnv(name: 'BLOG_SQLITE_PATH' | 'GITHUB_PAT' | 'GITHUB_TOKEN', value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test('getMainBlogRelativePath strips absolute and traversal-style path segments', () => {
  assert.equal(getMainBlogRelativePath('/blogs/hello-world/assets/hero.png'), 'blogs/hello-world/assets/hero.png');
  assert.equal(getMainBlogRelativePath('../blogs/./hello-world/../assets/spec.pdf'), 'blogs/hello-world/assets/spec.pdf');
});

test('contentTypeForPath returns useful media content types', () => {
  assert.equal(contentTypeForPath('hero.PNG'), 'image/png');
  assert.equal(contentTypeForPath('clip.webm'), 'video/webm');
  assert.equal(contentTypeForPath('voice.ogg'), 'audio/ogg');
  assert.equal(contentTypeForPath('spec.pdf'), 'application/pdf');
  assert.equal(contentTypeForPath('archive.bin'), 'application/octet-stream');
});

test('loadMainBlogAsset reads assets beside a configured local sqlite file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'main-blog-asset-'));
  const sqliteFile = path.join(root, 'blog.sqlite');
  const assetPath = path.join(root, 'blogs', 'hello-world', 'assets', 'hero.png');
  const originalBlogSqlitePath = process.env.BLOG_SQLITE_PATH;
  const originalGithubPat = process.env.GITHUB_PAT;
  const originalGithubToken = process.env.GITHUB_TOKEN;

  fs.writeFileSync(sqliteFile, 'placeholder sqlite');
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });
  fs.writeFileSync(assetPath, Buffer.from('fake-png'));
  process.env.BLOG_SQLITE_PATH = sqliteFile;
  delete process.env.GITHUB_PAT;
  delete process.env.GITHUB_TOKEN;

  try {
    const loaded = await loadMainBlogAsset('/blogs/hello-world/assets/hero.png');
    assert.equal(loaded?.contentType, 'image/png');
    assert.equal(loaded?.bytes.toString(), 'fake-png');
  } finally {
    restoreEnv('BLOG_SQLITE_PATH', originalBlogSqlitePath);
    restoreEnv('GITHUB_PAT', originalGithubPat);
    restoreEnv('GITHUB_TOKEN', originalGithubToken);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('loadMainBlogAsset falls back to GitHub contents when local asset is missing', async () => {
  const originalFetch = globalThis.fetch;
  const originalBlogSqlitePath = process.env.BLOG_SQLITE_PATH;
  const originalGithubPat = process.env.GITHUB_PAT;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  let requestedUrl = '';

  process.env.BLOG_SQLITE_PATH = path.join(os.tmpdir(), `definitely-missing-${Date.now()}-asset.sqlite`);
  delete process.env.GITHUB_PAT;
  delete process.env.GITHUB_TOKEN;

  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        encoding: 'base64',
        content: Buffer.from('remote-asset').toString('base64'),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const loaded = await loadMainBlogAsset('blogs/hello-world/assets/spec.pdf');
    assert.match(requestedUrl, /contents\/blogs\/hello-world\/assets\/spec\.pdf/);
    assert.equal(loaded?.contentType, 'application/pdf');
    assert.equal(loaded?.bytes.toString(), 'remote-asset');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('BLOG_SQLITE_PATH', originalBlogSqlitePath);
    restoreEnv('GITHUB_PAT', originalGithubPat);
    restoreEnv('GITHUB_TOKEN', originalGithubToken);
  }
});

test('loadMainBlogPosts falls back to GitHub sqlite contents when no local sqlite file exists, even without a token', async () => {
  const sqliteFile = makeSqliteFile(`main-blog-db-test-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`, {
    slug: 'remote-test-post',
    title: 'Remote Test Post',
    description: 'Loaded through remote fallback',
  });
  const sqliteBytes = fs.readFileSync(sqliteFile);
  const originalFetch = globalThis.fetch;
  const originalBlogSqlitePath = process.env.BLOG_SQLITE_PATH;
  const originalGithubPat = process.env.GITHUB_PAT;
  const originalGithubToken = process.env.GITHUB_TOKEN;

  process.env.BLOG_SQLITE_PATH = path.join(os.tmpdir(), `definitely-missing-${Date.now()}.sqlite`);
  delete process.env.GITHUB_PAT;
  delete process.env.GITHUB_TOKEN;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        encoding: 'base64',
        content: sqliteBytes.toString('base64'),
        sha: 'remote-test-sha',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const posts = await loadMainBlogPosts('Remote Test', 10);
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.slug, 'remote-test-post');
    assert.equal(posts[0]?.title, 'Remote Test Post');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('BLOG_SQLITE_PATH', originalBlogSqlitePath);
    restoreEnv('GITHUB_PAT', originalGithubPat);
    restoreEnv('GITHUB_TOKEN', originalGithubToken);
    fs.rmSync(sqliteFile, { force: true });
    fs.rmSync(path.join(os.tmpdir(), 'xdoes-blog-remote-test-sha.sqlite'), { force: true });
  }
});

test('loadMainBlogPosts prefers fresher remote sqlite over stale local sqlite', async () => {
  const staleLocal = makeSqliteFile(`main-blog-db-local-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`, {
    slug: 'stale-local-post',
    title: 'Stale Local Post',
    description: 'Should not win when remote sqlite is available',
  });
  const remoteSqlite = makeSqliteFile(`main-blog-db-remote-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`, {
    slug: 'fresh-remote-post',
    title: 'Fresh Remote Post',
    description: 'Should win over stale local sqlite',
  });
  const remoteBytes = fs.readFileSync(remoteSqlite);
  const originalFetch = globalThis.fetch;
  const originalBlogSqlitePath = process.env.BLOG_SQLITE_PATH;
  const originalGithubPat = process.env.GITHUB_PAT;
  const originalGithubToken = process.env.GITHUB_TOKEN;

  process.env.BLOG_SQLITE_PATH = staleLocal;
  delete process.env.GITHUB_PAT;
  delete process.env.GITHUB_TOKEN;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        encoding: 'base64',
        content: remoteBytes.toString('base64'),
        sha: 'remote-preferred-sha',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const posts = await loadMainBlogPosts(undefined, 10);
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.slug, 'fresh-remote-post');
    assert.equal(posts[0]?.title, 'Fresh Remote Post');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('BLOG_SQLITE_PATH', originalBlogSqlitePath);
    restoreEnv('GITHUB_PAT', originalGithubPat);
    restoreEnv('GITHUB_TOKEN', originalGithubToken);
    fs.rmSync(staleLocal, { force: true });
    fs.rmSync(remoteSqlite, { force: true });
    fs.rmSync(path.join(os.tmpdir(), 'xdoes-blog-remote-preferred-sha.sqlite'), { force: true });
  }
});

test('loadMainBlogPosts ignores masked GitHub tokens so public repo fetches still work', async () => {
  const remoteSqlite = makeSqliteFile(`main-blog-db-masked-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`, {
    slug: 'public-fetch-post',
    title: 'Public Fetch Post',
    description: 'Should load without sending masked auth',
  });
  const remoteBytes = fs.readFileSync(remoteSqlite);
  const originalFetch = globalThis.fetch;
  const originalBlogSqlitePath = process.env.BLOG_SQLITE_PATH;
  const originalGithubPat = process.env.GITHUB_PAT;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  let seenAuthorization: string | null = null;

  process.env.BLOG_SQLITE_PATH = path.join(os.tmpdir(), `definitely-missing-${Date.now()}-masked.sqlite`);
  process.env.GITHUB_PAT = 'ghp_wj...MEp6';
  delete process.env.GITHUB_TOKEN;

  globalThis.fetch = (async (_input, init) => {
    const headers = new Headers(init?.headers);
    seenAuthorization = headers.get('authorization');
    return new Response(
      JSON.stringify({
        encoding: 'base64',
        content: remoteBytes.toString('base64'),
        sha: 'remote-masked-sha',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const posts = await loadMainBlogPosts(undefined, 10);
    assert.equal(seenAuthorization, null);
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.slug, 'public-fetch-post');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('BLOG_SQLITE_PATH', originalBlogSqlitePath);
    restoreEnv('GITHUB_PAT', originalGithubPat);
    restoreEnv('GITHUB_TOKEN', originalGithubToken);
    fs.rmSync(remoteSqlite, { force: true });
    fs.rmSync(path.join(os.tmpdir(), 'xdoes-blog-remote-masked-sha.sqlite'), { force: true });
  }
});
