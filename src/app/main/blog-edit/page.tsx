'use client';

import { marked } from 'marked';
import initSqlJs from 'sql.js';
import { useEffect, useMemo, useState } from 'react';

type Repo = {
  id: number;
  full_name: string;
  default_branch: string;
  permissions?: { push?: boolean; admin?: boolean; maintain?: boolean };
};

type PostMeta = {
  slug: string;
  title: string;
  description: string;
  tags: string;
  refs: string;
  links: string;
  folder: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
};

type Tab = 'editor' | 'posts' | 'settings';

type Settings = {
  owner: string;
  repo: string;
  branch: string;
  baseDir: string;
  sqlitePath: string;
};

const LS_TOKEN = 'blogedit:github-token';
const LS_SETTINGS = 'blogedit:settings';

const defaultSettings: Settings = {
  owner: 'x-does',
  repo: 'blog',
  branch: 'main',
  baseDir: 'blogs',
  sqlitePath: 'blog.sqlite',
};

function toSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function splitCsv(input: string) {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getApiBase(ownerRepo: string) {
  return `https://api.github.com/repos/${ownerRepo}`;
}

async function gh<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

async function getTextFile(token: string, ownerRepo: string, path: string, branch: string) {
  const data = await gh<{ content?: string; encoding?: string }>(
    token,
    `${getApiBase(ownerRepo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
  );
  if (!data.content || data.encoding !== 'base64') return null;
  return atob(data.content.replace(/\n/g, ''));
}

async function getBinaryFile(token: string, ownerRepo: string, path: string, branch: string) {
  const data = await gh<{ content?: string; encoding?: string }>(
    token,
    `${getApiBase(ownerRepo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
  );
  if (!data.content || data.encoding !== 'base64') return null;
  const b = atob(data.content.replace(/\n/g, ''));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
}

async function getFileSha(token: string, ownerRepo: string, path: string, branch: string) {
  const data = await gh<{ sha?: string }>(
    token,
    `${getApiBase(ownerRepo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
  );
  return data.sha;
}

async function putFile(
  token: string,
  ownerRepo: string,
  path: string,
  branch: string,
  contentBase64: string,
  message: string,
  sha?: string,
) {
  return gh(
    token,
    `${getApiBase(ownerRepo)}/contents/${encodeURIComponent(path)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: contentBase64,
        branch,
        sha,
      }),
    },
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export default function BlogEditPage() {
  const [tab, setTab] = useState<Tab>('editor');
  const [token, setToken] = useState('');
  const [authedUser, setAuthedUser] = useState('');
  const [repos, setRepos] = useState<Repo[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [refs, setRefs] = useState('');
  const [links, setLinks] = useState('');
  const [markdown, setMarkdown] = useState('# New post\n\nStart writing...');
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const preview = useMemo(() => ({ __html: marked.parse(markdown) as string }), [markdown]);

  useEffect(() => {
    const t = localStorage.getItem(LS_TOKEN);
    const s = localStorage.getItem(LS_SETTINGS);
    if (t) setToken(t);
    if (s) {
      try {
        setSettings({ ...defaultSettings, ...(JSON.parse(s) as Partial<Settings>) });
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    localStorage.setItem(LS_TOKEN, token);
  }, [token]);

  useEffect(() => {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === 'BLOG_EDIT_AUTH_SUCCESS' && ev.data.token) {
        setToken(String(ev.data.token));
        setMsg('✅ Authenticated with GitHub (token saved in browser).');
      } else if (ev.data?.type === 'BLOG_EDIT_AUTH_ERROR') {
        setMsg(`❌ Auth error: ${String(ev.data.error || 'unknown')}`);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function startAuth() {
    window.open('/api/blog-edit/auth/start', 'blogedit-auth', 'width=640,height=760');
  }

  async function loadRepos() {
    if (!token) return;
    setLoading(true);
    try {
      const me = await gh<{ login: string }>(token, 'https://api.github.com/user');
      setAuthedUser(me.login);

      const list = await gh<Repo[]>(
        token,
        'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
      );

      const writable = list.filter((r) => r.permissions?.push || r.permissions?.admin || r.permissions?.maintain);
      setRepos(writable);
      setMsg(`Loaded ${writable.length} writable repos.`);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : 'failed to load repos'}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadPostsFromRepo() {
    if (!token) return;
    setLoading(true);
    setMsg('');

    try {
      const ownerRepo = `${settings.owner}/${settings.repo}`;
      const SQL = await initSqlJs({ locateFile: (f) => `/vendor/${f}` });

      const sqliteBytes = await getBinaryFile(token, ownerRepo, settings.sqlitePath, settings.branch);

      if (!sqliteBytes) {
        setPosts([]);
        setMsg('No sqlite found yet in target repo.');
        return;
      }

      const db = new SQL.Database(sqliteBytes);
      const stmt = db.prepare('SELECT slug, title, description, tags, refs, links, folder, filename, createdAt, updatedAt FROM posts ORDER BY updatedAt DESC');
      const items: PostMeta[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as unknown as PostMeta;
        items.push(row);
      }
      stmt.free();
      db.close();

      setPosts(items);
      setMsg(`Loaded ${items.length} posts from ${ownerRepo}/${settings.sqlitePath}`);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : 'failed to load posts'}`);
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!token) {
      setMsg('Please auth with GitHub first.');
      return;
    }
    if (!title.trim() || !markdown.trim()) {
      setMsg('Title and markdown are required.');
      return;
    }

    setLoading(true);
    setMsg('Publishing...');

    try {
      const ownerRepo = `${settings.owner}/${settings.repo}`;
      const slug = toSlug(title);
      const postPath = `${settings.baseDir}/${slug}/blog.md`;
      const now = new Date().toISOString();

      const SQL = await initSqlJs({ locateFile: (f) => `/vendor/${f}` });
      const sqliteBytes = await getBinaryFile(token, ownerRepo, settings.sqlitePath, settings.branch);
      const db = sqliteBytes ? new SQL.Database(sqliteBytes) : new SQL.Database();

      db.run(`
        CREATE TABLE IF NOT EXISTS posts (
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

      const existing = db.exec(`SELECT createdAt FROM posts WHERE slug = ${JSON.stringify(slug)} LIMIT 1`);
      const createdAt =
        existing.length > 0 && existing[0].values.length > 0
          ? String(existing[0].values[0][0])
          : now;

      db.run(
        `INSERT INTO posts (slug,title,description,tags,refs,links,folder,filename,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(slug) DO UPDATE SET
          title=excluded.title,
          description=excluded.description,
          tags=excluded.tags,
          refs=excluded.refs,
          links=excluded.links,
          folder=excluded.folder,
          filename=excluded.filename,
          updatedAt=excluded.updatedAt`,
        [
          slug,
          title.trim(),
          description.trim(),
          tags.trim(),
          refs.trim(),
          links.trim(),
          `${settings.baseDir}/${slug}`,
          'blog.md',
          createdAt,
          now,
        ],
      );

      const sqliteOut = db.export();
      db.close();

      const postSha = await getFileSha(token, ownerRepo, postPath, settings.branch).catch(() => undefined);
      const sqliteSha = await getFileSha(token, ownerRepo, settings.sqlitePath, settings.branch).catch(() => undefined);

      await putFile(
        token,
        ownerRepo,
        postPath,
        settings.branch,
        btoa(unescape(encodeURIComponent(markdown))),
        `blog: publish ${slug}`,
        postSha,
      );

      await putFile(
        token,
        ownerRepo,
        settings.sqlitePath,
        settings.branch,
        bytesToBase64(sqliteOut),
        `blog: update sqlite index for ${slug}`,
        sqliteSha,
      );

      setMsg(`✅ Published ${slug} to ${ownerRepo}`);
      await loadPostsFromRepo();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : 'publish failed'}`);
    } finally {
      setLoading(false);
    }
  }

  const filtered = posts.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [p.title, p.description, p.tags, p.refs, p.links, p.slug].some((v) => (v || '').toLowerCase().includes(q));
  });

  return (
    <section className="py-10">
      <h1 className="font-display text-5xl font-bold text-[#f3edff]">Blog Edit</h1>
      <p className="mt-2 text-[#b9accf]">
        Public editor UI. Read access for everyone. Write/publish only for authenticated GitHub users with repo push access.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={() => setTab('editor')} className={btn(tab === 'editor')}>Editor</button>
        <button onClick={() => setTab('posts')} className={btn(tab === 'posts')}>Posts</button>
        <button onClick={() => setTab('settings')} className={btn(tab === 'settings')}>Settings</button>
      </div>

      <div className="mt-6 rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-4 text-sm text-[#c7bbdc]">
        <div>Auth user: <strong>{authedUser || 'not authenticated'}</strong></div>
        <div>Target: <strong>{settings.owner}/{settings.repo}</strong> @ <strong>{settings.branch}</strong></div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={startAuth} className={btn(false)} disabled={loading}>Auth with GitHub</button>
          <button onClick={loadRepos} className={btn(false)} disabled={!token || loading}>Load writable repos</button>
          <button onClick={loadPostsFromRepo} className={btn(false)} disabled={!token || loading}>Load posts from repo</button>
          <button
            onClick={() => {
              localStorage.removeItem(LS_TOKEN);
              setToken('');
              setAuthedUser('');
              setMsg('Logged out locally.');
            }}
            className={btn(false)}
            disabled={loading}
          >
            Clear local token
          </button>
        </div>
        {msg ? <div className="mt-3 text-[#d8c9ef]">{msg}</div> : null}
      </div>

      {tab === 'editor' && (
        <div className="mt-6 grid gap-3">
          <input className={input} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className={input} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <input className={input} placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
          <input className={input} placeholder="Refs/blog slugs (comma separated)" value={refs} onChange={(e) => setRefs(e.target.value)} />
          <input className={input} placeholder="Links (comma separated URLs)" value={links} onChange={(e) => setLinks(e.target.value)} />
          <div className="grid gap-3 md:grid-cols-2">
            <textarea className={textarea} value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
            <div className="rounded-lg border border-[#7f6b9d]/25 bg-[#0f0b17] p-3" dangerouslySetInnerHTML={preview} />
          </div>
          <button onClick={publish} className={btn(false)} disabled={!token || loading}>Publish to selected repo</button>
        </div>
      )}

      {tab === 'posts' && (
        <div className="mt-6">
          <div className="mb-3 flex gap-2">
            <input className={input} placeholder="Search posts" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="grid gap-3">
            {filtered.map((p) => (
              <article key={p.slug} className="rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-4">
                <h3 className="text-xl font-semibold text-[#efe8ff]">{p.title}</h3>
                <p className="mt-1 text-[#c7bbdc]">{p.description}</p>
                <div className="mt-2 text-sm text-[#ad9fc5]">tags: {p.tags || '-'} | refs: {p.refs || '-'} | links: {p.links || '-'}</div>
                <div className="mt-1 text-xs text-[#9c8db7]">{p.folder}/{p.filename} · updated {p.updatedAt}</div>
              </article>
            ))}
            {filtered.length === 0 ? <div className="text-[#b9accf]">No posts.</div> : null}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="mt-6 grid gap-3">
          <label className={label}>Owner
            <input className={input} value={settings.owner} onChange={(e) => setSettings((s) => ({ ...s, owner: e.target.value.trim() }))} />
          </label>
          <label className={label}>Repo
            <input className={input} value={settings.repo} onChange={(e) => setSettings((s) => ({ ...s, repo: e.target.value.trim() }))} />
          </label>
          <label className={label}>Branch
            <input className={input} value={settings.branch} onChange={(e) => setSettings((s) => ({ ...s, branch: e.target.value.trim() }))} />
          </label>
          <label className={label}>Blogs base directory
            <input className={input} value={settings.baseDir} onChange={(e) => setSettings((s) => ({ ...s, baseDir: e.target.value.trim() }))} />
          </label>
          <label className={label}>SQLite path
            <input className={input} value={settings.sqlitePath} onChange={(e) => setSettings((s) => ({ ...s, sqlitePath: e.target.value.trim() }))} />
          </label>

          {repos.length > 0 && (
            <div className="rounded-lg border border-[#7f6b9d]/25 bg-[#110d19]/45 p-3">
              <div className="mb-2 text-sm text-[#bfb2d4]">Quick select writable repo:</div>
              <select
                className={input}
                onChange={(e) => {
                  const full = e.target.value;
                  if (!full) return;
                  const [owner, repo] = full.split('/');
                  const selected = repos.find((r) => r.full_name === full);
                  setSettings((s) => ({ ...s, owner, repo, branch: selected?.default_branch || s.branch }));
                }}
                defaultValue=""
              >
                <option value="">-- choose --</option>
                {repos.map((r) => (
                  <option key={r.id} value={r.full_name}>{r.full_name} ({r.default_branch})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function btn(active: boolean) {
  return `rounded-lg border px-3 py-2 text-sm ${
    active
      ? 'border-[#a58ac8]/50 bg-[#231934] text-white'
      : 'border-[#7f6b9d]/25 bg-[#1a1328] text-[#efe8ff] hover:border-[#a58ac8]/40'
  }`;
}

const input =
  'w-full rounded-lg border border-[#7f6b9d]/25 bg-[#130f1d] px-3 py-2 text-[#efe8ff] outline-none';
const textarea =
  'min-h-[360px] rounded-lg border border-[#7f6b9d]/25 bg-[#130f1d] p-3 text-[#efe8ff] outline-none';
const label = 'grid gap-1 text-sm text-[#c8bcdd]';
