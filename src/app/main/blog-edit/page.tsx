'use client';

import { marked } from 'marked';
import initSqlJs from 'sql.js';
import { useEffect, useMemo, useRef, useState } from 'react';

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
type ViewMode = 'split' | 'edit' | 'preview';

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

async function loadSqlEngine() {
  const tryFetch = async (url: string) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  };

  const wasmBinary = (await tryFetch('/vendor/sql-wasm-browser.wasm')) || (await tryFetch('/vendor/sql-wasm.wasm'));
  if (!wasmBinary) throw new Error('Unable to load sql.js wasm.');

  const wasmBuffer = wasmBinary.buffer.slice(
    wasmBinary.byteOffset,
    wasmBinary.byteOffset + wasmBinary.byteLength,
  ) as ArrayBuffer;

  return initSqlJs({ wasmBinary: wasmBuffer });
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
  return gh(token, `${getApiBase(ownerRepo)}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: contentBase64, branch, sha }),
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function preprocessMarkdownForPreview(md: string) {
  return md.replace(/(^|\s)@([a-z0-9-]{2,})/gi, '$1[@$2](/main/blog?q=$2)');
}

export default function BlogEditPage() {
  const [tab, setTab] = useState<Tab>('editor');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [fullscreen, setFullscreen] = useState(false);

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

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);

  const preview = useMemo(
    () => ({ __html: marked.parse(preprocessMarkdownForPreview(markdown)) as string }),
    [markdown],
  );

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
    if (token) localStorage.setItem(LS_TOKEN, token);
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

    function onKey(e: KeyboardEvent) {
      // quick switch when Ctrl+Shift is pressed together
      if ((e.key === 'Shift' && e.ctrlKey) || (e.key === 'Control' && e.shiftKey)) {
        setFullscreen((v) => !v);
        setViewMode((v) => (v === 'edit' ? 'preview' : 'edit'));
      }
    }

    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  function startAuth() {
    window.open('/api/blog-edit/auth/start', 'blogedit-auth', 'width=640,height=760');
  }

  function wrapSelection(before: string, after = '') {
    const el = editorRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = markdown.slice(start, end) || 'text';
    const next = `${markdown.slice(0, start)}${before}${selected}${after}${markdown.slice(end)}`;
    setMarkdown(next);
  }

  function insertAtCursor(text: string) {
    const el = editorRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${markdown.slice(0, start)}${text}${markdown.slice(end)}`;
    setMarkdown(next);
  }

  async function onPickImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      insertAtCursor(`\n![${file.name}](${src})\n`);
    };
    reader.readAsDataURL(file);
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
      const SQL = await loadSqlEngine();
      const sqliteBytes = await getBinaryFile(token, ownerRepo, settings.sqlitePath, settings.branch);

      if (!sqliteBytes) {
        setPosts([]);
        setMsg('No sqlite found yet in target repo.');
        return;
      }

      const db = new SQL.Database(sqliteBytes);
      const stmt = db.prepare(
        'SELECT slug, title, description, tags, refs, links, folder, filename, createdAt, updatedAt FROM posts ORDER BY updatedAt DESC',
      );
      const items: PostMeta[] = [];
      while (stmt.step()) items.push(stmt.getAsObject() as unknown as PostMeta);
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
    if (!token) return setMsg('Please auth with GitHub first.');
    if (!title.trim() || !markdown.trim()) return setMsg('Title and markdown are required.');

    setLoading(true);
    setMsg('Publishing...');

    try {
      const ownerRepo = `${settings.owner}/${settings.repo}`;
      const slug = toSlug(title);
      const postPath = `${settings.baseDir}/${slug}/blog.md`;
      const now = new Date().toISOString();

      const extractedRefs = Array.from(
        new Set(Array.from(markdown.matchAll(/(^|\s)@([a-z0-9-]{2,})/gi)).map((m) => m[2].toLowerCase())),
      );
      const mergedRefs = Array.from(new Set([...refs.split(',').map((x) => x.trim()).filter(Boolean), ...extractedRefs])).join(', ');

      const SQL = await loadSqlEngine();
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
      const createdAt = existing.length > 0 && existing[0].values.length > 0 ? String(existing[0].values[0][0]) : now;

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
          mergedRefs,
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
    <div className={fullscreen ? 'fixed inset-0 z-50 overflow-auto bg-[#0a0811] p-6' : ''}>
      <section className="py-10">
        <h1 className="text-5xl font-black text-[#f3edff]">Blog Editor App</h1>
        <p className="mt-2 text-[#b9accf]">
          Standalone editor app under /main. Auth users can publish; viewers can read.
          <span className="ml-2 rounded border border-[#7f6b9d]/30 px-2 py-0.5 text-xs">Ctrl+Shift: quick edit/preview fullscreen switch</span>
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
            <button onClick={() => setFullscreen((v) => !v)} className={btn(false)} disabled={loading}>Toggle fullscreen</button>
            <button onClick={() => { localStorage.removeItem(LS_TOKEN); setToken(''); setAuthedUser(''); setMsg('Logged out locally.'); }} className={btn(false)} disabled={loading}>Clear local token</button>
          </div>
          {msg ? <div className="mt-3 text-[#d8c9ef]">{msg}</div> : null}
        </div>

        {tab === 'editor' && (
          <div className="mt-6 grid gap-3">
            <input className={input} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className={input} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <input className={input} placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <input className={input} placeholder="Refs/blog slugs (comma separated, or use @slug in content)" value={refs} onChange={(e) => setRefs(e.target.value)} />
            <input className={input} placeholder="Links (comma separated URLs)" value={links} onChange={(e) => setLinks(e.target.value)} />

            <div className="flex flex-wrap gap-2 rounded-lg border border-[#7f6b9d]/25 bg-[#0f0b17] p-2 text-xs">
              <button className={miniBtn} onClick={() => wrapSelection('**', '**')}>Bold</button>
              <button className={miniBtn} onClick={() => wrapSelection('_', '_')}>Italic</button>
              <button className={miniBtn} onClick={() => insertAtCursor('\n## Heading\n')}>Header</button>
              <button className={miniBtn} onClick={() => insertAtCursor('\nParagraph text\n')}>Paragraph</button>
              <button className={miniBtn} onClick={() => wrapSelection('<u>', '</u>')}>Underline</button>
              <button className={miniBtn} onClick={() => wrapSelection('<mark>', '</mark>')}>Highlight</button>
              <button className={miniBtn} onClick={() => wrapSelection('<span style="color:#c8a2ff">', '</span>')}>Color</button>
              <button className={miniBtn} onClick={() => wrapSelection('<span style="font-family:Georgia,serif">', '</span>')}>Font</button>
              <button className={miniBtn} onClick={() => wrapSelection('[', '](https://example.com)')}>Link</button>
              <button className={miniBtn} onClick={() => insertAtCursor('\n```ts\nconsole.log("code block")\n```\n')}>Code block</button>
              <button className={miniBtn} onClick={() => insertAtCursor('\n<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video" frameborder="0" allowfullscreen></iframe>\n')}>YouTube</button>
              <button className={miniBtn} onClick={() => imagePickerRef.current?.click()}>Image</button>
              <input ref={imagePickerRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.currentTarget.value = ''; }} />
            </div>

            <div className="flex gap-2 text-sm">
              <button className={btn(viewMode === 'split')} onClick={() => setViewMode('split')}>Split</button>
              <button className={btn(viewMode === 'edit')} onClick={() => setViewMode('edit')}>Editor only</button>
              <button className={btn(viewMode === 'preview')} onClick={() => setViewMode('preview')}>Preview only</button>
            </div>

            {(viewMode === 'split' || viewMode === 'edit') && (viewMode === 'split' ? (
              <div className="grid gap-3 md:grid-cols-2">
                <textarea ref={editorRef} className={textarea} value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
                <div className="rounded-lg border border-[#7f6b9d]/25 bg-[#0f0b17] p-3" dangerouslySetInnerHTML={preview} />
              </div>
            ) : (
              <textarea ref={editorRef} className={textarea} value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
            ))}

            {viewMode === 'preview' && (
              <div className="rounded-lg border border-[#7f6b9d]/25 bg-[#0f0b17] p-3" dangerouslySetInnerHTML={preview} />
            )}

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
            <label className={label}>Owner<input className={input} value={settings.owner} onChange={(e) => setSettings((s) => ({ ...s, owner: e.target.value.trim() }))} /></label>
            <label className={label}>Repo<input className={input} value={settings.repo} onChange={(e) => setSettings((s) => ({ ...s, repo: e.target.value.trim() }))} /></label>
            <label className={label}>Branch<input className={input} value={settings.branch} onChange={(e) => setSettings((s) => ({ ...s, branch: e.target.value.trim() }))} /></label>
            <label className={label}>Blogs base directory<input className={input} value={settings.baseDir} onChange={(e) => setSettings((s) => ({ ...s, baseDir: e.target.value.trim() }))} /></label>
            <label className={label}>SQLite path<input className={input} value={settings.sqlitePath} onChange={(e) => setSettings((s) => ({ ...s, sqlitePath: e.target.value.trim() }))} /></label>

            {repos.length > 0 && (
              <div className="rounded-lg border border-[#7f6b9d]/25 bg-[#110d19]/45 p-3">
                <div className="mb-2 text-sm text-[#bfb2d4]">Quick select writable repo</div>
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
    </div>
  );
}

function btn(active: boolean) {
  return `rounded-lg border px-3 py-2 text-sm ${
    active
      ? 'border-[#a58ac8]/60 bg-[#241a36] text-white'
      : 'border-[#7f6b9d]/30 bg-[#1a1328] text-[#efe8ff] hover:border-[#a58ac8]/50'
  }`;
}

const miniBtn = 'rounded border border-[#7f6b9d]/35 bg-[#1a1328] px-2 py-1 text-[#e9deff] hover:border-[#a58ac8]/60';
const input = 'w-full rounded-lg border border-[#7f6b9d]/30 bg-[#130f1d] px-3 py-2 text-[#efe8ff] outline-none';
const textarea = 'min-h-[420px] rounded-lg border border-[#7f6b9d]/30 bg-[#130f1d] p-3 text-[#efe8ff] outline-none';
const label = 'grid gap-1 text-sm text-[#c8bcdd]';
