'use client';

import Link from 'next/link';
import { marked } from 'marked';
import initSqlJs from 'sql.js';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { isGitHubApiConflictError, isGitHubApiNotFoundError } from './github-api';
import { describePublishTarget, getSettingsForSelectedRepo, parseRepositoryInput } from './repo-connection';

type Repo = {
  id: number;
  full_name: string;
  name: string;
  owner?: { login?: string };
  private?: boolean;
  description?: string | null;
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

type BlogDocument = {
  title: string;
  description: string;
  tags: string;
  refs: string;
  links: string;
  markdown: string;
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

function encodeGitHubContentPath(contentPath: string) {
  return contentPath.split('/').map(encodeURIComponent).join('/');
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
  try {
    const data = await gh<{ content?: string; encoding?: string }>(
      token,
      `${getApiBase(ownerRepo)}/contents/${encodeGitHubContentPath(path)}?ref=${encodeURIComponent(branch)}`,
    );
    if (!data.content || data.encoding !== 'base64') return null;
    const b = atob(data.content.replace(/\n/g, ''));
    return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
  } catch (error) {
    if (isGitHubApiNotFoundError(error)) return null;
    throw error;
  }
}

async function getTextFile(token: string, ownerRepo: string, path: string, branch: string) {
  try {
    const data = await gh<{ content?: string; encoding?: string }>(
      token,
      `${getApiBase(ownerRepo)}/contents/${encodeGitHubContentPath(path)}?ref=${encodeURIComponent(branch)}`,
    );
    if (!data.content || data.encoding !== 'base64') return null;
    return decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
  } catch (error) {
    if (isGitHubApiNotFoundError(error)) return null;
    throw error;
  }
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
  return gh(token, `${getApiBase(ownerRepo)}/contents/${encodeGitHubContentPath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: contentBase64, branch, sha }),
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

type PublishSqliteArgs = {
  SQL: Awaited<ReturnType<typeof loadSqlEngine>>;
  token: string;
  ownerRepo: string;
  branch: string;
  sqlitePath: string;
  slug: string;
  now: string;
  title: string;
  description: string;
  tags: string;
  refs: string;
  links: string;
  baseDir: string;
};

function buildSqliteWithPost({
  SQL,
  sqliteBytes,
  slug,
  now,
  title,
  description,
  tags,
  refs,
  links,
  baseDir,
}: Omit<PublishSqliteArgs, 'token' | 'ownerRepo' | 'branch' | 'sqlitePath'> & { sqliteBytes: Uint8Array | null }) {
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
      refs,
      links.trim(),
      `${baseDir}/${slug}`,
      'blog.md',
      createdAt,
      now,
    ],
  );

  const sqliteOut = db.export();
  db.close();
  return sqliteOut;
}

async function publishSqliteWithRetry(args: PublishSqliteArgs) {
  let sqliteBytes = await getBinaryFile(args.token, args.ownerRepo, args.sqlitePath, args.branch);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sqliteSha = await getFileSha(args.token, args.ownerRepo, args.sqlitePath, args.branch).catch(() => undefined);
    const sqliteOut = buildSqliteWithPost({ ...args, sqliteBytes });

    try {
      await putFile(
        args.token,
        args.ownerRepo,
        args.sqlitePath,
        args.branch,
        bytesToBase64(sqliteOut),
        `blog: update sqlite index for ${args.slug}`,
        sqliteSha,
      );
      return { bootstrap: !sqliteBytes };
    } catch (error) {
      lastError = error;
      if (!isGitHubApiConflictError(error) || attempt === 2) {
        throw error;
      }
      sqliteBytes = await getBinaryFile(args.token, args.ownerRepo, args.sqlitePath, args.branch);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to update sqlite index.');
}

function preprocessMarkdownForPreview(md: string) {
  return md.replace(/(^|\s)@([a-z0-9-]{2,})/gi, '$1[@$2](/blog?q=$2)');
}

function urlSafeText(text: string) {
  return text.replace(/[()]/g, '').trim();
}

function parseBlogDocument(markdown: string): BlogDocument {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const titleLine = lines.find((line) => line.trim().startsWith('# '));
  const title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : '';
  const bodyWithoutTitle = titleLine
    ? lines.filter((line, index) => index !== lines.indexOf(titleLine)).join('\n').trim()
    : normalized.trim();
  const description = bodyWithoutTitle.split('\n').find((line) => line.trim())?.trim() || '';
  const refs = Array.from(new Set(Array.from(normalized.matchAll(/(^|\s)@([a-z0-9-]{2,})/gi)).map((m) => m[2].toLowerCase()))).join(', ');
  const links = Array.from(new Set(Array.from(normalized.matchAll(/https?:\/\/[^\s)]+/gi)).map((m) => m[0]))).join(', ');

  return {
    title,
    description,
    tags: '',
    refs,
    links,
    markdown: normalized,
  };
}

const VIEW_SEQUENCE: ViewMode[] = ['split', 'edit', 'preview'];

function toggleEditPreviewMode(current: ViewMode): ViewMode {
  return current === 'preview' ? 'edit' : 'preview';
}

function cycleViewMode(current: ViewMode): ViewMode {
  return VIEW_SEQUENCE[(VIEW_SEQUENCE.indexOf(current) + 1) % VIEW_SEQUENCE.length];
}

export default function BlogEditApp() {
  const [requestedSlug, setRequestedSlug] = useState('');
  const [tab, setTab] = useState<Tab>('editor');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [fullscreen, setFullscreen] = useState(false);

  const [token, setToken] = useState('');
  const [authedUser, setAuthedUser] = useState('');
  const [repos, setRepos] = useState<Repo[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [repoLocator, setRepoLocator] = useState(`${defaultSettings.owner}/${defaultSettings.repo}`);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [refs, setRefs] = useState('');
  const [links, setLinks] = useState('');
  const [markdown, setMarkdown] = useState('# New post\n\nStart writing...');

  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [activeSlug, setActiveSlug] = useState('');
  const [query, setQuery] = useState('');
  const [repoQuery, setRepoQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);

  const deferredMarkdown = useDeferredValue(markdown);

  const preview = useMemo(
    () => ({
      __html: marked.parse(preprocessMarkdownForPreview(deferredMarkdown), {
        gfm: true,
        breaks: true,
      }) as string,
    }),
    [deferredMarkdown],
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
    setRepoLocator(`${settings.owner}/${settings.repo}`);
  }, [settings.owner, settings.repo]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const slug = new URLSearchParams(window.location.search).get('slug') || '';
    setRequestedSlug(slug.trim());
  }, []);

  useEffect(() => {
    if (!requestedSlug || !token) return;
    const existing = posts.find((post) => post.slug === requestedSlug);
    if (existing) {
      void openPostInEditor(existing);
      return;
    }

    void (async () => {
      await loadPostsFromRepo();
    })();
  }, [requestedSlug, token, posts]);

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
      if (e.repeat || e.isComposing) return;

      if (e.key === 'Escape' && fullscreen) {
        e.preventDefault();
        setFullscreen(false);
        return;
      }

      if (!e.ctrlKey || !e.shiftKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (key === 'f') {
        e.preventDefault();
        setFullscreen((v) => !v);
        return;
      }

      if (key === 'enter') {
        e.preventDefault();
        setViewMode((v) => toggleEditPreviewMode(v));
        return;
      }

      if (key === '`') {
        e.preventDefault();
        setViewMode((v) => cycleViewMode(v));
      }
    }

    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

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
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = start + before.length + selected.length;
    });
  }

  function insertAtCursor(text: string) {
    const el = editorRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${markdown.slice(0, start)}${text}${markdown.slice(end)}`;
    setMarkdown(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.selectionStart = pos;
      el.selectionEnd = pos;
    });
  }

  async function onPickImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      insertAtCursor(`\n![${urlSafeText(file.name)}](${src})\n`);
    };
    reader.readAsDataURL(file);
  }

  function onInsertImageUrl() {
    const value = window.prompt('Image URL');
    if (!value) return;
    insertAtCursor(`\n![image](${value.trim()})\n`);
  }

  function onInsertLink() {
    const value = window.prompt('URL for link', 'https://example.com');
    if (!value) return;
    wrapSelection('[', `](${value.trim()})`);
  }

  function onInsertYouTube() {
    const value = window.prompt('YouTube URL');
    if (!value) return;
    const url = value.trim();
    const matched = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
    const id = matched?.[1];
    if (!id) {
      setMsg('Could not detect a YouTube video ID in the URL.');
      return;
    }
    insertAtCursor(`\n<iframe width="560" height="315" src="https://www.youtube.com/embed/${id}" title="YouTube video" frameborder="0" allowfullscreen></iframe>\n`);
  }

  function onInsertRef() {
    const value = window.prompt('Reference slug (without @)');
    if (!value) return;
    const ref = toSlug(value);
    if (!ref) return;
    insertAtCursor(` @${ref}`);
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

  async function loadPostsFromRepo(target = settings) {
    if (!token) return;
    setLoading(true);
    setMsg('');

    try {
      const ownerRepo = `${target.owner}/${target.repo}`;
      const SQL = await loadSqlEngine();
      const sqliteBytes = await getBinaryFile(token, ownerRepo, target.sqlitePath, target.branch);

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
      setMsg(`Loaded ${items.length} posts from ${ownerRepo}/${target.sqlitePath}`);

      if (requestedSlug) {
        const requestedPost = items.find((item) => item.slug === requestedSlug);
        if (requestedPost) {
          await openPostInEditor(requestedPost, target);
          return;
        }
      }
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : 'failed to load posts'}`);
    } finally {
      setLoading(false);
    }
  }

  async function openPostInEditor(post: PostMeta, target = settings) {
    if (!token) {
      setMsg('Please auth with GitHub first.');
      return;
    }

    setLoading(true);
    setMsg(`Opening ${post.slug}...`);
    try {
      const ownerRepo = `${target.owner}/${target.repo}`;
      const postPath = `${post.folder}/${post.filename}`;
      const file = await getTextFile(token, ownerRepo, postPath, target.branch);
      if (!file) {
        setMsg(`❌ Could not load ${postPath} from ${ownerRepo}.`);
        return;
      }

      const parsed = parseBlogDocument(file);
      setTitle(post.title || parsed.title);
      setDescription(post.description || parsed.description);
      setTags(post.tags || parsed.tags);
      setRefs(post.refs || parsed.refs);
      setLinks(post.links || parsed.links);
      setMarkdown(parsed.markdown);
      setActiveSlug(post.slug);
      setTab('editor');
      setMsg(`Loaded ${post.slug} into the editor.`);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : 'failed to open post'}`);
    } finally {
      setLoading(false);
    }
  }

  function applySelectedRepo(full: string, shouldLoadPosts = false) {
    if (!full) return;
    const selected = repos.find((r) => r.full_name === full);
    const nextSettings = getSettingsForSelectedRepo(settings, full, selected);
    setSettings(nextSettings);
    setTab('editor');
    setMsg(`Connected editor to ${full}${selected?.default_branch ? ` on ${selected.default_branch}` : ''}.`);
    if (shouldLoadPosts) {
      void loadPostsFromRepo(nextSettings);
    }
  }

  function applyRepoLocator() {
    const parsed = parseRepositoryInput(repoLocator);
    if (!parsed) {
      setMsg('Enter owner/repo or a full GitHub repo URL.');
      setTab('settings');
      return;
    }

    setSettings((s) => ({ ...s, owner: parsed.owner, repo: parsed.repo }));
    setTab('editor');
    setMsg(`Connected editor to ${parsed.owner}/${parsed.repo}.`);
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
      const initialSqliteBytes = await getBinaryFile(token, ownerRepo, settings.sqlitePath, settings.branch);
      const isBootstrapPublish = !initialSqliteBytes;

      const postSha = await getFileSha(token, ownerRepo, postPath, settings.branch).catch(() => undefined);

      await putFile(
        token,
        ownerRepo,
        postPath,
        settings.branch,
        btoa(unescape(encodeURIComponent(markdown))),
        `blog: publish ${slug}`,
        postSha,
      );

      await publishSqliteWithRetry({
        SQL,
        token,
        ownerRepo,
        branch: settings.branch,
        sqlitePath: settings.sqlitePath,
        slug,
        now,
        title,
        description,
        tags,
        refs: mergedRefs,
        links,
        baseDir: settings.baseDir,
      });

      setMsg(
        `✅ Published ${slug} to ${ownerRepo}${isBootstrapPublish ? ' (created a new sqlite index automatically)' : ''}`,
      );
      await loadPostsFromRepo();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : 'publish failed'}`);
    } finally {
      setLoading(false);
    }
  }

  const filteredRepos = repos.filter((r) => {
    const q = repoQuery.trim().toLowerCase();
    if (!q) return true;
    return [r.full_name, r.name, r.owner?.login || '', r.description || ''].some((v) =>
      String(v).toLowerCase().includes(q),
    );
  });

  const filtered = posts.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [p.title, p.description, p.tags, p.refs, p.links, p.slug].some((v) => (v || '').toLowerCase().includes(q));
  });

  const showEditor = viewMode === 'split' || viewMode === 'edit';
  const showPreview = viewMode === 'split' || viewMode === 'preview';
  const publishTarget = describePublishTarget({
    ...settings,
    slug: toSlug(title) || 'draft-post',
  });

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 overflow-auto bg-[#07060c] p-6' : ''}>
      <section className="py-8">
        <h1 className="text-4xl font-black text-[#f3edff] sm:text-5xl">Blog Editor App</h1>
        <p className="mt-2 text-[#b9accf]">
          Self-contained authoring flow for /blog-edit.
          <span className="ml-2 inline-flex gap-2 rounded border border-[#7f6b9d]/30 px-2 py-0.5 text-xs">
            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> fullscreen
          </span>
          <span className="ml-2 inline-flex gap-2 rounded border border-[#7f6b9d]/30 px-2 py-0.5 text-xs">
            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> edit/preview
          </span>
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => setTab('editor')} className={btn(tab === 'editor')} aria-pressed={tab === 'editor'}>Editor</button>
          <button type="button" onClick={() => setTab('posts')} className={btn(tab === 'posts')} aria-pressed={tab === 'posts'}>Posts</button>
          <button type="button" onClick={() => setTab('settings')} className={btn(tab === 'settings')} aria-pressed={tab === 'settings'}>Settings</button>
        </div>

        <div className="mt-6 rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/55 p-4 text-sm text-[#c7bbdc]">
          <div className="flex flex-wrap items-center gap-2">
            <div>GitHub: <strong>{token ? `connected${authedUser ? ` as ${authedUser}` : ''}` : 'not connected'}</strong></div>
            <span className="rounded-full border border-[#7f6b9d]/30 px-2 py-0.5 text-xs text-[#b9accf]">
              {repos.length > 0 ? `${filteredRepos.length}/${repos.length} writable repos visible` : 'load repos to browse targets'}
            </span>
          </div>
          <div className="mt-1">Target: <strong>{publishTarget.ownerRepo}</strong> @ <strong>{publishTarget.branchLabel}</strong></div>
          <div className="mt-2 text-xs text-[#aa9ac5]">
            Connect flow: GitHub auth → choose or paste a repo → verify the target preview → publish.
          </div>
          <div className="mt-3 grid gap-2 rounded-xl border border-[#7f6b9d]/25 bg-[#0d0a15]/80 p-3 text-xs text-[#cdbfe4] md:grid-cols-2">
            <div>
              <div className="text-[#9c8db7]">Repo</div>
              <div className="font-medium text-[#efe8ff]">{publishTarget.ownerRepo}</div>
            </div>
            <div>
              <div className="text-[#9c8db7]">Branch</div>
              <div className="font-medium text-[#efe8ff]">{publishTarget.branchLabel}</div>
            </div>
            <div>
              <div className="text-[#9c8db7]">SQLite index</div>
              <div className="font-medium text-[#efe8ff]">{publishTarget.sqliteLabel}</div>
            </div>
            <div>
              <div className="text-[#9c8db7]">Next post file</div>
              <div className="font-medium text-[#efe8ff]">{publishTarget.postPath}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={startAuth} className={btn(false)} disabled={loading}>{token ? 'Re-auth with GitHub' : 'Connect GitHub'}</button>
            <button type="button" onClick={loadRepos} className={btn(false)} disabled={!token || loading}>Load writable repos</button>
            <button type="button" onClick={() => void loadPostsFromRepo()} className={btn(false)} disabled={!token || loading}>Load posts from selected repo</button>
            <button type="button" onClick={() => setTab('settings')} className={btn(tab === 'settings')} disabled={loading}>Repo settings</button>
            <button type="button" onClick={() => setFullscreen((v) => !v)} className={btn(false)} disabled={loading} title="Ctrl+Shift+F">Toggle fullscreen</button>
            <button type="button" onClick={() => { localStorage.removeItem(LS_TOKEN); setToken(''); setAuthedUser(''); setRepos([]); setRepoQuery(''); setMsg('Logged out locally.'); }} className={btn(false)} disabled={loading}>Clear local token</button>
          </div>

          {repos.length > 0 && (
            <div className="mt-4 rounded-xl border border-[#7f6b9d]/25 bg-[#0d0a15]/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[#efe8ff]">Connect to a repository</div>
                  <div className="text-xs text-[#aa9ac5]">Pick a writable repo here, or paste one in Settings if it is not listed yet.</div>
                </div>
                <button type="button" className={miniBtn} onClick={() => setRepoQuery('')} disabled={!repoQuery}>Clear search</button>
              </div>
              <input
                className={`${input} mt-3`}
                placeholder="Search writable repos by owner, repo, or description"
                value={repoQuery}
                onChange={(e) => setRepoQuery(e.target.value)}
              />
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {filteredRepos.slice(0, 12).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-3 text-left transition hover:border-[#a58ac8]/55 hover:bg-[#171123]"
                    onClick={() => applySelectedRepo(r.full_name, true)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-[#efe8ff]">{r.full_name}</strong>
                      <span className="rounded-full border border-[#7f6b9d]/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#aa9ac5]">{r.default_branch}</span>
                      {r.private ? <span className="rounded-full border border-[#7f6b9d]/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#aa9ac5]">private</span> : null}
                    </div>
                    {r.description ? <div className="mt-1 text-xs text-[#b9accf]">{r.description}</div> : null}
                    <div className="mt-2 text-xs text-[#8ea6e8]">Use this repo</div>
                  </button>
                ))}
                {filteredRepos.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#7f6b9d]/25 p-3 text-xs text-[#b9accf]">
                    No writable repos match that search. You can still type owner/repo/branch manually in Settings.
                  </div>
                ) : null}
              </div>
              {filteredRepos.length > 12 ? (
                <div className="mt-2 text-xs text-[#9c8db7]">Showing first 12 matches. Narrow search to find the exact repo faster.</div>
              ) : null}
            </div>
          )}

          {msg ? <div className="mt-3 text-[#d8c9ef]">{msg}</div> : null}
        </div>

        {tab === 'editor' && (
          <div className="mt-6 grid gap-3">
            <input className={input} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            {activeSlug ? <div className="text-xs uppercase tracking-[0.16em] text-[#8ea6e8]">Editing existing post: {activeSlug}</div> : null}
            <input className={input} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <input className={input} placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <input className={input} placeholder="Refs/blog slugs (comma separated, or use @slug in content)" value={refs} onChange={(e) => setRefs(e.target.value)} />
            <input className={input} placeholder="Links (comma separated URLs)" value={links} onChange={(e) => setLinks(e.target.value)} />

            <div className="sticky top-3 z-10 flex flex-wrap gap-2 rounded-lg border border-[#7f6b9d]/25 bg-[#0d0a15]/95 p-2 text-xs backdrop-blur">
              <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n# Heading 1\n')}>H1</button>
              <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n## Heading 2\n')}>H2</button>
              <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n### Heading 3\n')}>H3</button>
              <button type="button" className={miniBtn} onClick={() => wrapSelection('**', '**')}>Bold</button>
              <button type="button" className={miniBtn} onClick={() => wrapSelection('_', '_')}>Italic</button>
              <button type="button" className={miniBtn} onClick={() => wrapSelection('`', '`')}>Inline code</button>
              <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n```ts\nconsole.log("code block")\n```\n')}>Code block</button>
              <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n> Quote\n')}>Quote</button>
              <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n- List item\n- List item\n')}>UL</button>
              <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n1. First\n2. Second\n')}>OL</button>
              <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n- [ ] Task\n- [x] Done\n')}>Task list</button>
              <button type="button" className={miniBtn} onClick={onInsertLink}>Link</button>
              <button type="button" className={miniBtn} onClick={onInsertImageUrl}>Image URL</button>
              <button type="button" className={miniBtn} onClick={() => imagePickerRef.current?.click()}>Image file</button>
              <button type="button" className={miniBtn} onClick={onInsertYouTube}>YouTube</button>
              <button type="button" className={miniBtn} onClick={onInsertRef}>@ref</button>
              <input ref={imagePickerRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.currentTarget.value = ''; }} />
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" className={btn(viewMode === 'split')} onClick={() => setViewMode('split')} aria-pressed={viewMode === 'split'}>Split</button>
              <button type="button" className={btn(viewMode === 'edit')} onClick={() => setViewMode('edit')} aria-pressed={viewMode === 'edit'}>Editor only</button>
              <button type="button" className={btn(viewMode === 'preview')} onClick={() => setViewMode('preview')} aria-pressed={viewMode === 'preview'}>Preview only</button>
              <span className="ml-1 text-xs text-[#aa9ac5]">Ctrl+Shift+Enter toggles edit/preview · Ctrl+Shift+` cycles 3-view</span>
            </div>

            <div className={viewMode === 'split' ? 'grid gap-3 md:grid-cols-2' : 'grid gap-3'}>
              {showEditor ? (
                <textarea ref={editorRef} className={textarea} value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
              ) : null}
              {showPreview ? (
                <div className="preview rounded-lg border border-[#7f6b9d]/25 bg-[#0f0b17] p-3" dangerouslySetInnerHTML={preview} />
              ) : null}
            </div>

            <button type="button" onClick={publish} className={btn(false)} disabled={!token || loading}>Publish to selected repo</button>
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
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-[#efe8ff]">{p.title}</h3>
                      <p className="mt-1 text-[#c7bbdc]">{p.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <button type="button" className={btn(false)} onClick={() => void openPostInEditor(p)} disabled={loading}>Open in editor</button>
                      <Link href={`/blog/${encodeURIComponent(p.slug)}`} className="rounded-lg border border-[#7f6b9d]/25 bg-[#110d19]/35 px-3 py-2 text-[#cdbfe4] hover:text-white">
                        Read post
                      </Link>
                    </div>
                  </div>
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
            <div className="rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-3 text-sm text-[#c7bbdc]">
              <div className="font-semibold text-[#efe8ff]">Repository connection settings</div>
              <div className="mt-1 text-xs text-[#aa9ac5]">Paste owner/repo or a GitHub URL, then confirm the target preview before publishing.</div>
            </div>
            <div className="rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-3 text-sm text-[#c7bbdc]">
              <label className={label}>
                Repository locator
                <input
                  className={input}
                  value={repoLocator}
                  onChange={(e) => setRepoLocator(e.target.value)}
                  placeholder="x-does/blog or https://github.com/x-does/blog"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className={btn(false)} onClick={applyRepoLocator}>Apply repo locator</button>
                <span className="text-xs text-[#aa9ac5]">Branch, base dir, and sqlite path stay as-is.</span>
              </div>
            </div>
            <label className={label}>Owner<input className={input} value={settings.owner} onChange={(e) => setSettings((s) => ({ ...s, owner: e.target.value.trim() }))} /></label>
            <label className={label}>Repo<input className={input} value={settings.repo} onChange={(e) => setSettings((s) => ({ ...s, repo: e.target.value.trim() }))} /></label>
            <label className={label}>Branch<input className={input} value={settings.branch} onChange={(e) => setSettings((s) => ({ ...s, branch: e.target.value.trim() }))} /></label>
            <label className={label}>Blogs base directory<input className={input} value={settings.baseDir} onChange={(e) => setSettings((s) => ({ ...s, baseDir: e.target.value.trim() }))} /></label>
            <label className={label}>SQLite path<input className={input} value={settings.sqlitePath} onChange={(e) => setSettings((s) => ({ ...s, sqlitePath: e.target.value.trim() }))} /></label>
            <div className="rounded-xl border border-[#7f6b9d]/25 bg-[#0d0a15]/80 p-3 text-xs text-[#cdbfe4]">
              <div className="font-semibold text-[#efe8ff]">Publish target preview</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <div className="text-[#9c8db7]">Repo</div>
                  <div>{publishTarget.ownerRepo}</div>
                </div>
                <div>
                  <div className="text-[#9c8db7]">Branch</div>
                  <div>{publishTarget.branchLabel}</div>
                </div>
                <div>
                  <div className="text-[#9c8db7]">SQLite index</div>
                  <div>{publishTarget.sqliteLabel}</div>
                </div>
                <div>
                  <div className="text-[#9c8db7]">Next post file</div>
                  <div>{publishTarget.postPath}</div>
                </div>
              </div>
              <div className="mt-2 text-[#aa9ac5]">Flow: auth → choose repo → verify target → publish.</div>
            </div>

            {repos.length > 0 && (
              <div className="rounded-lg border border-[#7f6b9d]/25 bg-[#110d19]/45 p-3">
                <div className="mb-2 text-sm text-[#bfb2d4]">Quick select writable repo</div>
                <select
                  className={input}
                  onChange={(e) => {
                    const full = e.target.value;
                    if (!full) return;
                    applySelectedRepo(full, false);
                  }}
                  defaultValue=""
                >
                  <option value="">-- choose --</option>
                  {filteredRepos.map((r) => (
                    <option key={r.id} value={r.full_name}>{r.full_name} ({r.default_branch})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </section>

      <style jsx>{`
        .preview :global(h1), .preview :global(h2), .preview :global(h3) {
          color: #f3edff;
          font-weight: 800;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .preview :global(p), .preview :global(li), .preview :global(blockquote) {
          color: #d5caea;
          line-height: 1.65;
        }
        .preview :global(a) {
          color: #c6a8ff;
          text-decoration: underline;
        }
        .preview :global(pre) {
          background: #09070f;
          color: #efe8ff;
          border: 1px solid rgba(127, 107, 157, 0.3);
          border-radius: 10px;
          padding: 0.75rem;
          overflow-x: auto;
        }
        .preview :global(code) {
          background: rgba(13, 10, 21, 0.9);
          border-radius: 6px;
          padding: 0.1rem 0.3rem;
          border: 1px solid rgba(127, 107, 157, 0.2);
        }
        .preview :global(img), .preview :global(iframe) {
          max-width: 100%;
          border-radius: 10px;
          border: 1px solid rgba(127, 107, 157, 0.25);
        }
      `}</style>
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

export { BlogEditApp };
