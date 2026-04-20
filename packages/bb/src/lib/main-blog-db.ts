import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

import type { MainBlogRow } from './types';

function configuredGitHubRepo() {
  return process.env.BLOG_GITHUB_REPO || 'x-does/blog';
}

function configuredBranch() {
  return process.env.BLOG_GITHUB_BRANCH || 'main';
}

function configuredSqlitePath() {
  return process.env.BLOG_SQLITE_REPO_PATH || 'blog.sqlite';
}

function candidateLocalSqlitePaths() {
  const candidates = [
    process.env.BLOG_SQLITE_PATH,
    path.resolve(process.cwd(), 'blog.sqlite'),
    path.resolve(process.cwd(), '../blog/blog.sqlite'),
    path.resolve(process.cwd(), '../../blog/blog.sqlite'),
  ].filter(Boolean) as string[];

  return [...new Set(candidates)];
}

function existingLocalSqlitePath() {
  return candidateLocalSqlitePaths().find((file) => fs.existsSync(file)) || null;
}

async function fetchRemoteSqliteToTempFile() {
  const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
  if (!token) return null;

  const repo = configuredGitHubRepo();
  const branch = configuredBranch();
  const sqlitePath = configuredSqlitePath();
  const encodedPath = sqlitePath.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'xdoes-node-blog-loader',
    },
    cache: 'no-store',
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub blog sqlite fetch failed (${res.status}): ${text}`);
  }

  const payload = (await res.json()) as { content?: string; encoding?: string; sha?: string };
  if (!payload.content || payload.encoding !== 'base64') {
    throw new Error('GitHub blog sqlite response did not include base64 content.');
  }

  const bytes = Buffer.from(payload.content.replace(/\n/g, ''), 'base64');
  const sha = payload.sha || crypto.createHash('sha1').update(bytes).digest('hex');
  const file = path.join(os.tmpdir(), `xdoes-blog-${sha}.sqlite`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, bytes);
  }
  return file;
}

function queryPosts(file: string, query?: string, limit = 50): MainBlogRow[] {
  const db = new Database(file, { readonly: true, fileMustExist: true });

  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'")
    .get() as { name: string } | undefined;

  if (!table) {
    db.close();
    return [];
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;

  let rows: MainBlogRow[];
  if (query && query.trim()) {
    const q = `%${query.trim()}%`;
    rows = db
      .prepare(
        `SELECT slug, title, description, tags, refs, links, folder, filename, createdAt, updatedAt
         FROM posts
         WHERE title LIKE ? OR description LIKE ? OR tags LIKE ? OR refs LIKE ? OR links LIKE ?
         ORDER BY updatedAt DESC
         LIMIT ?`,
      )
      .all(q, q, q, q, q, safeLimit) as MainBlogRow[];
  } else {
    rows = db
      .prepare(
        `SELECT slug, title, description, tags, refs, links, folder, filename, createdAt, updatedAt
         FROM posts
         ORDER BY updatedAt DESC
         LIMIT ?`,
      )
      .all(safeLimit) as MainBlogRow[];
  }

  db.close();
  return rows;
}

export async function loadMainBlogPosts(query?: string, limit = 50): Promise<MainBlogRow[]> {
  const localFile = existingLocalSqlitePath();
  if (localFile) return queryPosts(localFile, query, limit);

  const remoteFile = await fetchRemoteSqliteToTempFile();
  if (remoteFile) return queryPosts(remoteFile, query, limit);

  return [];
}
