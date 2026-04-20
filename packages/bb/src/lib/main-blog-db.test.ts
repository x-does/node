import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { loadMainBlogPosts } from './main-blog-db';

function makeSqliteFile() {
  const file = path.join(os.tmpdir(), `main-blog-db-test-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
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
    'remote-test-post',
    'Remote Test Post',
    'Loaded through remote fallback',
    'test,remote',
    'alpha,beta',
    'https://example.com',
    'blogs/remote-test-post',
    'blog.md',
    '2026-04-20T08:00:00.000Z',
    '2026-04-20T08:05:00.000Z',
  );
  db.close();
  return file;
}

test('loadMainBlogPosts falls back to GitHub sqlite contents when no local sqlite file exists', async () => {
  const sqliteFile = makeSqliteFile();
  const sqliteBytes = fs.readFileSync(sqliteFile);
  const originalFetch = globalThis.fetch;
  const originalBlogSqlitePath = process.env.BLOG_SQLITE_PATH;
  const originalGithubPat = process.env.GITHUB_PAT;
  const originalGithubToken = process.env.GITHUB_TOKEN;

  process.env.BLOG_SQLITE_PATH = path.join(os.tmpdir(), `definitely-missing-${Date.now()}.sqlite`);
  process.env.GITHUB_PAT = 'test-token';
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
