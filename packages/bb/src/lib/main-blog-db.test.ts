import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { loadMainBlogPosts } from './main-blog-db';

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
    if (originalBlogSqlitePath === undefined) {
      delete process.env.BLOG_SQLITE_PATH;
    } else {
      process.env.BLOG_SQLITE_PATH = originalBlogSqlitePath;
    }
    if (originalGithubPat === undefined) {
      delete process.env.GITHUB_PAT;
    } else {
      process.env.GITHUB_PAT = originalGithubPat;
    }
    if (originalGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalGithubToken;
    }
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
    if (originalBlogSqlitePath === undefined) {
      delete process.env.BLOG_SQLITE_PATH;
    } else {
      process.env.BLOG_SQLITE_PATH = originalBlogSqlitePath;
    }
    if (originalGithubPat === undefined) {
      delete process.env.GITHUB_PAT;
    } else {
      process.env.GITHUB_PAT = originalGithubPat;
    }
    if (originalGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalGithubToken;
    }
    fs.rmSync(staleLocal, { force: true });
    fs.rmSync(remoteSqlite, { force: true });
    fs.rmSync(path.join(os.tmpdir(), 'xdoes-blog-remote-preferred-sha.sqlite'), { force: true });
  }
});
