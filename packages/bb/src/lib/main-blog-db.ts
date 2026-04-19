import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import type { MainBlogRow } from './types';

function sqlitePath() {
  if (process.env.BLOG_SQLITE_PATH) {
    return process.env.BLOG_SQLITE_PATH;
  }
  return path.resolve(process.cwd(), '../blog/blog.sqlite');
}

export function loadMainBlogPosts(query?: string, limit = 50): MainBlogRow[] {
  const file = sqlitePath();
  if (!fs.existsSync(file)) return [];

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
