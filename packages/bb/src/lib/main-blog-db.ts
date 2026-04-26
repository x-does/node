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

function latestCachedTempSqlitePath() {
  const files = fs
    .readdirSync(os.tmpdir(), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^xdoes-blog-.*\.sqlite$/.test(entry.name))
    .map((entry) => path.join(os.tmpdir(), entry.name))
    .map((file) => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files[0]?.file || null;
}

function usableGitHubToken() {
  const token = (process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '').trim();
  if (!token) return null;
  if (token.includes('...')) return null;
  if (/[*\s]/.test(token)) return null;
  if (token.length < 20) return null;
  return token;
}

async function fetchGitHubContents(relativePath: string) {
  const token = usableGitHubToken();
  const repo = configuredGitHubRepo();
  const branch = configuredBranch();
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  const request = async (authToken?: string | null) => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'xdoes-node-blog-loader',
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    return fetch(url, { headers, cache: 'no-store' });
  };

  let res = await request(token);
  if (!res.ok && token && res.status !== 404) {
    res = await request(null);
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub contents fetch failed for ${relativePath} (${res.status}): ${text}`);
  }

  return (await res.json()) as { content?: string; encoding?: string; sha?: string };
}

export function contentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
  };
  return types[ext] || 'application/octet-stream';
}

async function fetchRemoteSqliteToTempFile() {
  const sqlitePath = configuredSqlitePath();
  const payload = await fetchGitHubContents(sqlitePath);
  if (!payload) return null;

  const payloadWithSha = payload as { content?: string; encoding?: string; sha?: string };
  if (!payloadWithSha.content || payloadWithSha.encoding !== 'base64') {
    throw new Error('GitHub blog sqlite response did not include base64 content.');
  }

  const bytes = Buffer.from(payloadWithSha.content.replace(/\n/g, ''), 'base64');
  const sha = payloadWithSha.sha || crypto.createHash('sha1').update(bytes).digest('hex');
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
  try {
    const remoteFile = await fetchRemoteSqliteToTempFile();
    if (remoteFile) return queryPosts(remoteFile, query, limit);
  } catch (error) {
    console.warn('[main-blog-db] remote sqlite fetch failed; falling back to local/cached sqlite if available', error);
  }

  const localFile = existingLocalSqlitePath();
  if (localFile) return queryPosts(localFile, query, limit);

  const cachedFile = latestCachedTempSqlitePath();
  if (cachedFile) return queryPosts(cachedFile, query, limit);

  return [];
}

export async function loadMainBlogPostBySlug(slug: string): Promise<MainBlogRow | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;

  const posts = await loadMainBlogPosts(undefined, 200);
  return posts.find((post) => post.slug === normalizedSlug) || null;
}

export function getMainBlogRelativePath(relativePath: string) {
  return relativePath
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

export async function loadMainBlogAsset(relativePath: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const normalizedPath = getMainBlogRelativePath(relativePath);
  const localCandidates = candidateLocalSqlitePaths()
    .map((file) => path.resolve(path.dirname(file), normalizedPath));

  for (const candidate of localCandidates) {
    if (fs.existsSync(candidate)) {
      return {
        bytes: fs.readFileSync(candidate),
        contentType: contentTypeForPath(normalizedPath),
      };
    }
  }

  const payload = await fetchGitHubContents(normalizedPath);
  if (!payload) return null;
  if (!payload.content || payload.encoding !== 'base64') {
    throw new Error('GitHub blog asset response did not include base64 content.');
  }

  return {
    bytes: Buffer.from(payload.content.replace(/\n/g, ''), 'base64'),
    contentType: contentTypeForPath(normalizedPath),
  };
}

export async function loadMainBlogMarkdown(row: Pick<MainBlogRow, 'folder' | 'filename'>): Promise<string | null> {
  const relativePath = getMainBlogRelativePath(`${row.folder}/${row.filename}`);
  const localCandidates = candidateLocalSqlitePaths()
    .map((file) => path.resolve(path.dirname(file), relativePath));

  for (const candidate of localCandidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8');
    }
  }

  const payload = await fetchGitHubContents(relativePath);
  if (!payload) return null;
  if (!payload.content || payload.encoding !== 'base64') {
    throw new Error('GitHub blog markdown response did not include base64 content.');
  }

  return Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8');
}
