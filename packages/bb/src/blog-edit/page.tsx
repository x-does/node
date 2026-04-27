'use client';

import Link from 'next/link';
import initSqlJs from 'sql.js';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { isGitHubApiConflictError, isGitHubApiNotFoundError } from './github-api';
import {
  type BlogAsset,
  buildAssetPath,
  buildMediaMarkdown,
  getAssetDirectory,
  getEditorAccessState,
  listAssetTreeRows,
  normalizeGitHubAssetEntries,
  renderBlogMediaMarkdown,
  resolveBlogAssetUrl,
  toAssetSlug,
} from './media';
import { describeDeleteAction, describePublishAction, getPostContentPath } from './post-management';
import {
  type RepoConnectionSettings,
  describePublishTarget,
  describeRepoWorkflowState,
  describeRepoWorkspace,
  getSettingsForSelectedRepo,
  parseRepositoryInput,
} from './repo-connection';

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

type Tab = 'editor' | 'posts';
type ViewMode = 'split' | 'edit' | 'preview';

type WorkspaceAccordionCard = {
  key: 'workspace';
  eyebrow: string;
  title: string;
  summary: string;
  detail?: string;
  isOpen: boolean;
  onToggle: () => void;
};

type ToastTone = 'success' | 'error' | 'info';

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  message: string;
};

type Settings = RepoConnectionSettings;

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

type GitHubContentEntry = {
  name: string;
  path: string;
  type: string;
  size?: number;
  sha?: string;
};

async function getFileSha(token: string, ownerRepo: string, path: string, branch: string) {
  const data = await gh<{ sha?: string }>(
    token,
    `${getApiBase(ownerRepo)}/contents/${encodeGitHubContentPath(path)}?ref=${encodeURIComponent(branch)}`,
  );
  return data.sha;
}

async function listGitHubDirectory(token: string, ownerRepo: string, path: string, branch: string) {
  try {
    const data = await gh<GitHubContentEntry[] | GitHubContentEntry>(
      token,
      `${getApiBase(ownerRepo)}/contents/${encodeGitHubContentPath(path)}?ref=${encodeURIComponent(branch)}`,
    );
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (isGitHubApiNotFoundError(error)) return [];
    throw error;
  }
}

async function listGitHubFilesRecursively(token: string, ownerRepo: string, path: string, branch: string): Promise<GitHubContentEntry[]> {
  const entries = await listGitHubDirectory(token, ownerRepo, path, branch);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (entry.type === 'dir') return listGitHubFilesRecursively(token, ownerRepo, entry.path, branch);
      return [entry];
    }),
  );
  return nested.flat();
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

async function deleteFile(token: string, ownerRepo: string, path: string, branch: string, message: string, sha: string) {
  return gh(token, `${getApiBase(ownerRepo)}/contents/${encodeGitHubContentPath(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, branch, sha }),
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

function buildSqliteWithoutPost({
  SQL,
  sqliteBytes,
  slug,
}: {
  SQL: Awaited<ReturnType<typeof loadSqlEngine>>;
  sqliteBytes: Uint8Array | null;
  slug: string;
}) {
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

  db.run('DELETE FROM posts WHERE slug = ?', [slug]);

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

async function deletePostFromSqliteWithRetry(args: {
  SQL: Awaited<ReturnType<typeof loadSqlEngine>>;
  token: string;
  ownerRepo: string;
  branch: string;
  sqlitePath: string;
  slug: string;
}) {
  let sqliteBytes = await getBinaryFile(args.token, args.ownerRepo, args.sqlitePath, args.branch);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sqliteSha = await getFileSha(args.token, args.ownerRepo, args.sqlitePath, args.branch).catch(() => undefined);
    const sqliteOut = buildSqliteWithoutPost({ ...args, sqliteBytes });

    try {
      await putFile(
        args.token,
        args.ownerRepo,
        args.sqlitePath,
        args.branch,
        bytesToBase64(sqliteOut),
        `blog: remove ${args.slug} from sqlite index`,
        sqliteSha,
      );
      return;
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
  const [tab, setTab] = useState<Tab>('posts');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [fullscreen, setFullscreen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [didAutoLoadWorkspace, setDidAutoLoadWorkspace] = useState(false);

  const [token, setToken] = useState('');
  const [authedUser, setAuthedUser] = useState('');
  const [repos, setRepos] = useState<Repo[]>([]);
  const [hasLoadedRepos, setHasLoadedRepos] = useState(false);
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
  const [postAssets, setPostAssets] = useState<BlogAsset[]>([]);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [selectedAssetPath, setSelectedAssetPath] = useState('');
  const [replaceAssetPath, setReplaceAssetPath] = useState('');
  const [query, setQuery] = useState('');
  const [repoQuery, setRepoQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Ready to publish.');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const nextToastIdRef = useRef(0);
  const toastTimersRef = useRef<Map<number, number>>(new Map());
  const imagePickerRef = useRef<HTMLInputElement | null>(null);
  const workspaceRevisionRef = useRef(0);

  const deferredMarkdown = useDeferredValue(markdown);

  const activeDraftSlug = activeSlug || toAssetSlug(title) || 'draft-post';
  const previewHtml = useMemo(
    () => renderBlogMediaMarkdown(activeDraftSlug, preprocessMarkdownForPreview(deferredMarkdown)),
    [activeDraftSlug, deferredMarkdown],
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
    if (!token || didAutoLoadWorkspace || loading) return;
    setDidAutoLoadWorkspace(true);
    void (async () => {
      await loadRepos();
      await loadPostsFromRepo();
    })();
  }, [token, didAutoLoadWorkspace, loading]);

  useEffect(() => {
    if (!requestedSlug) return;
    const existing = posts.find((post) => post.slug === requestedSlug);
    if (existing) {
      void (async () => {
        await openPostInEditor(existing);
        setRequestedSlug('');
      })();
      return;
    }

    if (loading) return;

    void (async () => {
      await loadPostsFromRepo();
      setRequestedSlug('');
    })();
  }, [requestedSlug, posts, loading]);

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      toastTimersRef.current.clear();
    };
  }, []);

  function dismissToast(id: number) {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function pushToast(tone: ToastTone, message: string) {
    const title = tone === 'success' ? 'Success' : tone === 'error' ? 'Something went wrong' : 'Heads up';
    pushToastWithTitle(tone, title, message);
  }

  function pushToastWithTitle(tone: ToastTone, title: string, message: string) {
    const id = nextToastIdRef.current + 1;
    nextToastIdRef.current = id;
    setToasts((current) => [...current, { id, tone, title, message }]);
    const timer = window.setTimeout(() => {
      toastTimersRef.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
    toastTimersRef.current.set(id, timer);
  }

  function updateStatus(message: string) {
    setStatusText(message);
  }

  function notify(tone: ToastTone, message: string, status = message, title?: string) {
    updateStatus(status);
    if (title) {
      pushToastWithTitle(tone, title, message);
      return;
    }
    pushToast(tone, message);
  }

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === 'BLOG_EDIT_AUTH_SUCCESS' && ev.data.token) {
        setToken(String(ev.data.token));
        notify('success', 'Authenticated with GitHub. Token saved in this browser.', 'GitHub connected.');
      } else if (ev.data?.type === 'BLOG_EDIT_AUTH_ERROR') {
        notify('error', `Auth error: ${String(ev.data.error || 'unknown')}`, 'GitHub auth failed.');
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

  function resetEditorDraft(clearPosts = false) {
    setActiveSlug('');
    setTitle('');
    setDescription('');
    setTags('');
    setRefs('');
    setLinks('');
    setMarkdown('# New post\n\nStart writing...');
    setPostAssets([]);
    setSelectedAssetPath('');
    setReplaceAssetPath('');
    setAssetsOpen(false);
    if (clearPosts) {
      setPosts([]);
    }
  }

  function invalidateWorkspaceSelection() {
    workspaceRevisionRef.current += 1;
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

  async function loadAssetsForSlug(slug: string, target = settings) {
    if (!token || !slug) {
      setPostAssets([]);
      setSelectedAssetPath('');
      return [];
    }

    const ownerRepo = `${target.owner}/${target.repo}`;
    const assetDirectory = getAssetDirectory(slug, target.baseDir);
    const entries = await listGitHubFilesRecursively(token, ownerRepo, assetDirectory, target.branch);
    const assets = normalizeGitHubAssetEntries(entries, assetDirectory);
    setPostAssets(assets);
    setSelectedAssetPath((current) => (assets.some((asset) => asset.relativePath === current) ? current : assets[0]?.relativePath || ''));
    return assets;
  }

  function upsertPostAsset(asset: BlogAsset) {
    setPostAssets((current) => {
      const without = current.filter((item) => item.relativePath !== asset.relativePath);
      return [...without, asset].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    });
    setSelectedAssetPath(asset.relativePath);
    setAssetsOpen(true);
  }

  async function uploadAssetFile(file: File, options: { replaceRelativePath?: string } = {}) {
    if (!token) {
      notify('error', 'Connect GitHub before uploading media.', 'Media upload blocked.', 'Upload blocked');
      return;
    }
    const slug = activeSlug || toAssetSlug(title);
    if (!slug) {
      notify('error', 'Add a title first so the asset folder can be created from the post slug.', 'Media upload blocked.', 'Upload blocked');
      return;
    }

    setLoading(true);
    const ownerRepo = `${settings.owner}/${settings.repo}`;
    const assetPath = options.replaceRelativePath
      ? `${getAssetDirectory(slug, settings.baseDir)}/${options.replaceRelativePath.replace(/^\/+/, '')}`
      : buildAssetPath(slug, file.name, settings.baseDir);
    const safeName = assetPath.split('/').pop() || file.name;
    updateStatus(`Uploading ${file.name} to ${assetPath}...`);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const sha = await getFileSha(token, ownerRepo, assetPath, settings.branch).catch((error) => {
        if (isGitHubApiNotFoundError(error)) return undefined;
        throw error;
      });
      await putFile(
        token,
        ownerRepo,
        assetPath,
        settings.branch,
        bytesToBase64(buffer),
        options.replaceRelativePath ? `blog: replace asset ${slug}/${options.replaceRelativePath}` : `blog: upload asset ${slug}/${file.name}`,
        sha,
      );
      const relativePath = assetPath.slice(`${getAssetDirectory(slug, settings.baseDir)}/`.length);
      const updatedSha = await getFileSha(token, ownerRepo, assetPath, settings.branch).catch(() => sha);
      upsertPostAsset({ name: safeName, relativePath, repoPath: assetPath, size: buffer.byteLength, sha: updatedSha, type: 'file' });
      if (!options.replaceRelativePath) {
        insertAtCursor(buildMediaMarkdown({ slug, fileName: relativePath, mimeType: file.type || 'application/octet-stream' }));
      }
      notify(
        'success',
        options.replaceRelativePath
          ? `Replaced ${options.replaceRelativePath} with ${file.name} in ${assetPath}.`
          : `Uploaded ${file.name} to ${assetPath} and embedded it in the editor.`,
        `Uploaded media to ${assetPath}.`,
        options.replaceRelativePath ? 'Asset replaced' : 'Media uploaded',
      );
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'media upload failed', 'Media upload failed.', 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  async function onPickMedia(file: File) {
    await uploadAssetFile(file);
  }

  async function onPickReplacement(file: File) {
    if (!replaceAssetPath) return;
    await uploadAssetFile(file, { replaceRelativePath: replaceAssetPath });
    setReplaceAssetPath('');
  }

  function insertAssetReference(asset: BlogAsset) {
    const mimeType = asset.name.match(/\.(?:png|jpe?g|gif|webp|avif|svg)$/i)
      ? 'image/*'
      : asset.name.match(/\.(?:mp4|webm|mov)$/i)
        ? 'video/*'
        : 'application/octet-stream';
    insertAtCursor(buildMediaMarkdown({ slug: activeDraftSlug, fileName: asset.relativePath, mimeType }));
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
      notify('error', 'Could not detect a YouTube video ID in the URL.', 'Unable to insert YouTube embed.');
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
    updateStatus('Loading writable repos...');
    try {
      const me = await gh<{ login: string }>(token, 'https://api.github.com/user');
      setAuthedUser(me.login);
      const list = await gh<Repo[]>(
        token,
        'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
      );
      const writable = list.filter((r) => r.permissions?.push || r.permissions?.admin || r.permissions?.maintain);
      setRepos(writable);
      setHasLoadedRepos(true);
      notify('success', `Loaded ${writable.length} writable repos.`, `Showing ${writable.length} writable repos.`);
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'failed to load repos', 'Failed to load writable repos.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPostsFromRepo(target = settings) {
    const requestRevision = workspaceRevisionRef.current;
    setLoading(true);
    updateStatus(`Loading posts from ${target.owner}/${target.repo}...`);

    try {
      const ownerRepo = `${target.owner}/${target.repo}`;
      const SQL = await loadSqlEngine();
      let sqliteBytes: Uint8Array | null = null;

      if (token) {
        sqliteBytes = await getBinaryFile(token, ownerRepo, target.sqlitePath, target.branch);
      } else {
        const res = await fetch(`/api/main-blog/posts?limit=100&cb=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load public blog index (${res.status}).`);
        const data = (await res.json()) as { ok?: boolean; posts?: Array<Record<string, unknown>> };
        const items = Array.isArray(data.posts)
          ? data.posts.map((item) => ({
              slug: String(item.slug || ''),
              title: String(item.title || ''),
              description: String(item.description || ''),
              tags: String(item.tags || ''),
              refs: String(item.refs || ''),
              links: String(item.links || ''),
              folder: String(item.folder || `${target.baseDir}/${String(item.slug || '')}`),
              filename: String(item.filename || 'blog.md'),
              createdAt: String(item.createdAt || ''),
              updatedAt: String(item.updatedAt || ''),
            }))
          : [];
        if (requestRevision !== workspaceRevisionRef.current) {
          return;
        }
        setPosts(items);
        updateStatus(`Loaded ${items.length} posts from the public blog index.`);

        if (requestedSlug) {
          const requestedPost = items.find((item) => item.slug === requestedSlug);
          if (requestedPost) {
            await openPostInEditor(requestedPost, target);
            return;
          }
        }
        return;
      }

      if (!sqliteBytes) {
        if (requestRevision !== workspaceRevisionRef.current) {
          return;
        }
        setPosts([]);
        notify('info', 'No sqlite index found yet in the selected repo.', 'No sqlite index found yet in the selected repo.');
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

      if (requestRevision !== workspaceRevisionRef.current) {
        return;
      }
      setPosts(items);
      updateStatus(`Loaded ${items.length} posts from ${ownerRepo}/${target.sqlitePath}.`);

      if (requestedSlug) {
        const requestedPost = items.find((item) => item.slug === requestedSlug);
        if (requestedPost) {
          await openPostInEditor(requestedPost, target);
          return;
        }
      }
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'failed to load posts', 'Failed to load posts.');
    } finally {
      setLoading(false);
    }
  }

  async function openPostInEditor(post: PostMeta, target = settings) {
    const requestRevision = workspaceRevisionRef.current;
    setLoading(true);
    updateStatus(`Opening ${post.slug}...`);
    try {
      const ownerRepo = `${target.owner}/${target.repo}`;
      const postPath = getPostContentPath(post);
      let file: string | null = null;
      let loadedAssets: BlogAsset[] = [];

      if (token) {
        file = await getTextFile(token, ownerRepo, postPath, target.branch);
        loadedAssets = await loadAssetsForSlug(post.slug, target);
      } else {
        const res = await fetch(`/api/main-blog/post/${encodeURIComponent(post.slug)}?cb=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          file = await res.text();
        }
      }

      if (!file) {
        if (requestRevision !== workspaceRevisionRef.current) {
          return;
        }
        notify('error', `Could not load ${postPath} from ${ownerRepo}.`, 'Could not load the selected post.');
        return;
      }

      const parsed = parseBlogDocument(file);
      if (requestRevision !== workspaceRevisionRef.current) {
        return;
      }
      setTitle(post.title || parsed.title);
      setDescription(post.description || parsed.description);
      setTags(post.tags || parsed.tags);
      setRefs(post.refs || parsed.refs);
      setLinks(post.links || parsed.links);
      setMarkdown(parsed.markdown);
      setActiveSlug(post.slug);
      setAssetsOpen(loadedAssets.length > 0);
      if (token) {
        setTab('editor');
        notify('success', `Loaded ${post.slug} into the editor.`, `Editing ${post.slug}.`);
      } else {
        setTab('posts');
        notify('info', `Loaded ${post.slug} for preview data, but editor controls stay locked until GitHub auth is connected.`, 'Connect GitHub to edit this post.', 'Editor locked');
      }
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'failed to open post', 'Failed to open post.');
    } finally {
      setLoading(false);
    }
  }

  function applySelectedRepo(full: string, shouldLoadPosts = false) {
    if (loading) return;
    if (!full) return;
    const selected = repos.find((r) => r.full_name === full);
    const nextSettings = getSettingsForSelectedRepo(settings, full, selected);
    invalidateWorkspaceSelection();
    resetEditorDraft(true);
    setSettings(nextSettings);
    setTab(shouldLoadPosts ? 'posts' : 'editor');
    notify(
      'success',
      shouldLoadPosts
        ? `Selected ${full}${selected?.default_branch ? ` on ${selected.default_branch}` : ''} and cleared the editor so you can load posts from the new workspace.`
        : `Selected ${full}${selected?.default_branch ? ` on ${selected.default_branch}` : ''} and reset the editor to a fresh draft for this workspace.`,
      `Selected repo: ${full}${selected?.default_branch ? ` @ ${selected.default_branch}` : ''}. Editor state reset for the new workspace.`,
      'Repository selected',
    );
    if (shouldLoadPosts) {
      void loadPostsFromRepo(nextSettings);
    }
  }

  function applyRepoLocator() {
    if (loading) return;
    const parsed = parseRepositoryInput(repoLocator);
    if (!parsed) {
      notify('error', 'Enter owner/repo or a full GitHub repo URL.', 'Repository locator is invalid.', 'Invalid repository locator');
      return;
    }

    invalidateWorkspaceSelection();
    resetEditorDraft(true);
    setSettings((s) => ({ ...s, owner: parsed.owner, repo: parsed.repo }));
    setTab('editor');
    notify(
      'success',
      `Selected ${parsed.owner}/${parsed.repo} and reset the editor to a fresh draft. Review the target card, then load posts or publish from this workspace.`,
      `Selected repo: ${parsed.owner}/${parsed.repo}. Editor state reset for the new workspace.`,
      'Repository selected',
    );
  }

  function startNewDraft() {
    if (!token) {
      notify('error', 'Connect GitHub before starting an editable draft.', 'GitHub auth is required before editing.', 'Editor locked');
      return;
    }
    resetEditorDraft();
    setTab('editor');
    notify('info', 'Started a fresh draft in the editor.', 'Started a fresh draft.', 'Draft ready');
  }

  async function publish() {
    if (!token) {
      notify('error', 'Please auth with GitHub first.', 'GitHub auth is required before publishing.', 'Publish blocked');
      return;
    }
    if (!title.trim() || !markdown.trim()) {
      notify('error', 'Title and markdown are required.', 'Title and markdown are required.', 'Publish blocked');
      return;
    }

    setLoading(true);
    updateStatus('Publishing...');

    try {
      const ownerRepo = `${settings.owner}/${settings.repo}`;
      const nextSlug = toSlug(title);
      const slug = activeSlug || nextSlug;
      if (!slug) {
        notify('error', 'A valid slug could not be generated from the title.', 'Slug generation failed.', 'Publish blocked');
        return;
      }
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
      const publishCopy = describePublishAction({
        slug,
        ownerRepo,
        created: !postSha,
        bootstrappedSqlite: isBootstrapPublish,
      });

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

      setActiveSlug(slug);
      await loadAssetsForSlug(slug);
      notify('success', publishCopy.successMessage, publishCopy.statusMessage, publishCopy.successTitle);
      await loadPostsFromRepo();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'publish failed', 'Publish failed.', 'Publish failed');
    } finally {
      setLoading(false);
    }
  }

  async function deletePost(post: PostMeta) {
    if (!token) {
      notify('error', 'GitHub auth is required before deleting a post.', 'GitHub auth is required before deleting.', 'Delete blocked');
      return;
    }

    const ownerRepo = `${settings.owner}/${settings.repo}`;
    const deleteCopy = describeDeleteAction(post, ownerRepo, settings.branch);
    const confirmed = window.confirm(deleteCopy.confirmMessage);
    if (!confirmed) return;

    setLoading(true);
    updateStatus(`Deleting ${post.slug}...`);

    try {
      const postSha = await getFileSha(token, ownerRepo, deleteCopy.postPath, settings.branch);
      if (!postSha) {
        throw new Error(`Could not find the latest file SHA for ${deleteCopy.postPath}.`);
      }
      await deleteFile(
        token,
        ownerRepo,
        deleteCopy.postPath,
        settings.branch,
        `blog: delete ${post.slug}`,
        postSha,
      );

      const SQL = await loadSqlEngine();
      await deletePostFromSqliteWithRetry({
        SQL,
        token,
        ownerRepo,
        branch: settings.branch,
        sqlitePath: settings.sqlitePath,
        slug: post.slug,
      });

      setPosts((current) => current.filter((item) => item.slug !== post.slug));
      if (activeSlug === post.slug) {
        resetEditorDraft();
      }
      notify('success', deleteCopy.successMessage, `Deleted ${post.slug}.`, `Deleted ${post.slug}`);
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'delete failed', 'Delete failed.', 'Delete failed');
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
    slug: activeSlug || toSlug(title) || 'draft-post',
  });
  const selectedRepoLabel = `${settings.owner}/${settings.repo}`;
  const selectedRepoCard = repos.find((repo) => repo.full_name === selectedRepoLabel);
  const hasWritableRepos = repos.length > 0;
  const selectedRepoIsListed = Boolean(selectedRepoCard);
  const repoWorkspace = describeRepoWorkspace({
    ...settings,
    hasToken: Boolean(token),
    hasLoadedRepos,
    hasWritableRepos,
    selectedRepoIsListed,
  });
  const selectedPostMeta = posts.find((post) => post.slug === activeSlug);
  const selectedAsset = postAssets.find((asset) => asset.relativePath === selectedAssetPath);
  const assetRows = listAssetTreeRows(postAssets);
  const editorAccess = getEditorAccessState({ token, loading });
  const workspaceSwitcherTitle = hasLoadedRepos ? 'Switch workspace' : 'Choose workspace';
  const workspaceSwitcherDescription = hasLoadedRepos
    ? 'Choose from writable repositories below, or paste a repository locator when needed.'
    : 'Load writable repositories, or paste a repository locator to keep moving.';
  const hasSavedAuth = Boolean(token);
  const workspaceAccordionCards: WorkspaceAccordionCard[] = [
    {
      key: 'workspace',
      eyebrow: 'Workspace',
      title: publishTarget.ownerRepo,
      summary: activeSlug ? `Editing target: ${selectedPostMeta?.title || activeSlug}` : 'No post selected',
      detail: hasSavedAuth
        ? `${filteredRepos.length} repo option${filteredRepos.length === 1 ? '' : 's'} ready.`
        : 'Connect GitHub or use a repo locator.',
      isOpen: workspaceOpen,
      onToggle: () => setWorkspaceOpen((open) => !open),
    },
  ];

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 overflow-auto bg-[#07060c] p-6' : ''}>
      <section className="py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-[#f3edff] sm:text-5xl">Post Editor</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (!editorAccess.canOpenEditor) {
                  notify('error', editorAccess.reason, 'GitHub auth is required before editing.', 'Editor locked');
                  return;
                }
                setTab('editor');
              }}
              className={btn(tab === 'editor')}
              aria-pressed={tab === 'editor'}
              aria-disabled={!editorAccess.canOpenEditor}
              disabled={!editorAccess.canOpenEditor}
              title={!editorAccess.canOpenEditor ? editorAccess.reason : undefined}
            >
              Editor
            </button>
            <button type="button" onClick={() => setTab('posts')} className={btn(tab === 'posts')} aria-pressed={tab === 'posts'} disabled={loading}>Posts</button>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/55 p-4 text-sm text-[#c7bbdc]">
          <div className="grid gap-3">
            {workspaceAccordionCards.map((card) => (
              <div key={card.key} className="w-full text-xs text-[#cdbfe4]">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-[#7f6b9d]/20 bg-[#0d0a15]/80 px-3 py-3 text-left"
                  onClick={card.onToggle}
                  aria-expanded={card.isOpen}
                >
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8ea6e8]">{card.eyebrow}</div>
                    <div className="mt-1 text-sm font-semibold text-[#efe8ff]">{card.title}</div>
                    <div className="mt-1 text-[#cdbfe4]">{card.summary}</div>
                    {card.detail ? <div className="mt-1 text-[11px] text-[#8f80aa]">{card.detail}</div> : null}
                  </div>
                  <span className="text-lg text-[#cdbfe4]" aria-hidden="true">{card.isOpen ? '−' : '+'}</span>
                </button>

                {card.key === 'workspace' && card.isOpen ? (
                  <div className="mt-3 space-y-3 rounded-xl border border-[#7f6b9d]/20 bg-[#0d0a15]/65 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[#8ea6e8]">Repository</div>
                        <div className="mt-1 font-medium text-[#efe8ff]">{publishTarget.ownerRepo}</div>
                      </div>
                      <div className="rounded-lg border border-[#7f6b9d]/15 bg-[#0d0a15]/70 px-3 py-2 text-right">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[#8ea6e8]">Status</div>
                        <div className="mt-1 font-semibold text-[#efe8ff]">{loading ? 'Working…' : 'Ready'}</div>
                      </div>
                    </div>
                    <div className="text-xs text-[#8f80aa]">{statusText}</div>

                    <div className="border-t border-[#7f6b9d]/15 pt-3">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[#8ea6e8]">{workspaceSwitcherTitle}</div>
                            <div className="mt-1 text-[#aa9ac5]">{workspaceSwitcherDescription}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className={miniBtn} onClick={() => setRepoQuery('')} disabled={!repoQuery}>Clear search</button>
                            <button type="button" className={miniBtn} onClick={loadRepos} disabled={!token || loading}>Reload repos</button>
                          </div>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                          <input
                            className={input}
                            placeholder="Search writable repos"
                            value={repoQuery}
                            onChange={(e) => setRepoQuery(e.target.value)}
                            disabled={!hasLoadedRepos}
                          />
                          <div className="rounded-lg border border-dashed border-[#7f6b9d]/20 px-3 py-2 text-[11px] text-[#8f80aa]">
                            {hasLoadedRepos ? 'Repo cards below update as you search.' : 'Repo cards appear here after writable repos load.'}
                          </div>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                          <input
                            className={input}
                            placeholder="x-does/blog or https://github.com/x-does/blog"
                            value={repoLocator}
                            onChange={(e) => setRepoLocator(e.target.value)}
                          />
                          <button type="button" className={miniBtn} onClick={applyRepoLocator} disabled={loading}>Use locator</button>
                        </div>

                        {hasLoadedRepos ? (
                          <div className="grid gap-2 md:grid-cols-2">
                            {filteredRepos.slice(0, 8).map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                className={`rounded-xl border p-3 text-left transition hover:border-[#a58ac8]/55 hover:bg-[#171123] ${
                                  publishTarget.ownerRepo === r.full_name
                                    ? 'border-[#a58ac8]/60 bg-[#171123]'
                                    : 'border-[#7f6b9d]/25 bg-[#110d19]/45'
                                }`}
                                onClick={() => applySelectedRepo(r.full_name, true)}
                                disabled={loading}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <strong className="text-[#efe8ff]">{r.full_name}</strong>
                                  <span className="rounded-full border border-[#7f6b9d]/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#aa9ac5]">{r.default_branch}</span>
                                  {r.private ? <span className="rounded-full border border-[#7f6b9d]/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#aa9ac5]">private</span> : null}
                                </div>
                                {r.description ? <div className="mt-1 text-xs text-[#b9accf]">{r.description}</div> : null}
                                <div className="mt-2 text-xs text-[#8ea6e8]">{publishTarget.ownerRepo === r.full_name ? 'Selected workspace' : 'Select repo and load posts'}</div>
                              </button>
                            ))}
                            {filteredRepos.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-[#7f6b9d]/25 p-3 text-xs text-[#b9accf]">
                                No writable repos match that search. You can still paste owner/repo above.
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-[#7f6b9d]/25 p-3 text-xs text-[#b9accf]">
                            Load writable repos to browse targets, or keep using the repository locator above.
                          </div>
                        )}

                        {filteredRepos.length > 8 ? (
                          <div className="text-xs text-[#9c8db7]">Showing first 8 matches here. Narrow search if you need a different repo.</div>
                        ) : null}

                        <div className="grid gap-3 md:grid-cols-3">
                          <label className={label}>Branch<input className={input} value={settings.branch} onChange={(e) => setSettings((s) => ({ ...s, branch: e.target.value.trim() }))} /></label>
                          <label className={label}>Blogs base directory<input className={input} value={settings.baseDir} onChange={(e) => setSettings((s) => ({ ...s, baseDir: e.target.value.trim() }))} /></label>
                          <label className={label}>SQLite path<input className={input} value={settings.sqlitePath} onChange={(e) => setSettings((s) => ({ ...s, sqlitePath: e.target.value.trim() }))} /></label>
                        </div>
                        <div className="text-xs text-[#8f80aa]">{repoWorkspace.settingsHint}</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toastClassName(toast.tone)}`}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="font-semibold text-white">{toast.title}</div>
                  <div className="mt-1 text-white/85">{toast.message}</div>
                </div>
                <button type="button" className="text-xs text-white/80 hover:text-white" onClick={() => dismissToast(toast.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>

        {tab === 'editor' && !editorAccess.canOpenEditor ? (
          <div className="mt-6 rounded-xl border border-amber-400/35 bg-amber-950/25 p-4 text-sm text-amber-100" role="status">
            {editorAccess.reason}
          </div>
        ) : null}

        {tab === 'editor' && editorAccess.canOpenEditor && (
          <div className={`mt-6 grid gap-3 ${editorAccess.disabled ? 'pointer-events-none opacity-60' : ''}`} aria-busy={editorAccess.disabled}>
            <div className="rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-3 text-sm text-[#c7bbdc]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#8ea6e8]">Post details</div>
                  <div className="mt-1 text-xs text-[#aa9ac5]">{activeSlug ? `Editing ${activeSlug}` : 'Write a new post and publish it into the selected workspace.'}</div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <input className={input} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <input className={input} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
                <input className={input} placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
                <input className={input} placeholder="Refs/blog slugs (comma separated, or use @slug in content)" value={refs} onChange={(e) => setRefs(e.target.value)} />
              </div>
              <div className="mt-3">
                <input className={input} placeholder="Links (comma separated URLs)" value={links} onChange={(e) => setLinks(e.target.value)} />
              </div>
            </div>

            <div className="sticky top-3 z-10 rounded-lg border border-[#7f6b9d]/25 bg-[#0d0a15]/95 p-3 text-xs backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#8ea6e8]">Formatting toolbar</div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n# Heading 1\n')} disabled={editorAccess.disabled}>H1</button>
                <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n## Heading 2\n')} disabled={editorAccess.disabled}>H2</button>
                <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n### Heading 3\n')} disabled={editorAccess.disabled}>H3</button>
                <button type="button" className={miniBtn} onClick={() => wrapSelection('**', '**')} disabled={editorAccess.disabled}>Bold</button>
                <button type="button" className={miniBtn} onClick={() => wrapSelection('_', '_')} disabled={editorAccess.disabled}>Italic</button>
                <button type="button" className={miniBtn} onClick={() => wrapSelection('`', '`')} disabled={editorAccess.disabled}>Code</button>
                <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n> Quote\n')} disabled={editorAccess.disabled}>Quote</button>
                <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n- List item\n- List item\n')} disabled={editorAccess.disabled}>List</button>
                <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n- [ ] Task\n- [x] Done\n')} disabled={editorAccess.disabled}>Tasks</button>
                <button type="button" className={miniBtn} onClick={() => imagePickerRef.current?.click()} disabled={editorAccess.disabled}>Upload media</button>
                <button type="button" className={miniBtn} onClick={onInsertLink} disabled={editorAccess.disabled}>Link</button>
                <button type="button" className={miniBtn} onClick={onInsertYouTube} disabled={editorAccess.disabled}>YouTube</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#aa9ac5]">
                <span>More inserts:</span>
                <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n```ts\nconsole.log("code block")\n```\n')} disabled={editorAccess.disabled}>Code block</button>
                <button type="button" className={miniBtn} onClick={() => insertAtCursor('\n1. First\n2. Second\n')} disabled={editorAccess.disabled}>Numbered list</button>
                <button type="button" className={miniBtn} onClick={onInsertImageUrl} disabled={editorAccess.disabled}>Image URL</button>
                <button type="button" className={miniBtn} onClick={onInsertRef} disabled={editorAccess.disabled}>@ref</button>
              </div>
              <input ref={imagePickerRef} type="file" accept="image/*,video/*,audio/*,application/pdf,text/plain,.md,.pdf" className="hidden" disabled={editorAccess.disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickMedia(f); e.currentTarget.value = ''; }} />
            </div>

            <details
              className="rounded-xl border border-[#7f6b9d]/25 bg-[#110d19]/45 p-3 text-sm text-[#c7bbdc]"
              open={assetsOpen}
              onToggle={(e) => setAssetsOpen(e.currentTarget.open)}
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8ea6e8]">Post assets</div>
                    <div className="mt-1 text-xs text-[#aa9ac5]">
                      {activeDraftSlug ? `${postAssets.length} file${postAssets.length === 1 ? '' : 's'} in ${getAssetDirectory(activeDraftSlug, settings.baseDir)}` : 'Select or title a post to manage assets.'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={miniBtn} onClick={(e) => { e.preventDefault(); void loadAssetsForSlug(activeDraftSlug); }} disabled={editorAccess.disabled || !activeDraftSlug}>Refresh</button>
                    <button type="button" className={miniBtn} onClick={(e) => { e.preventDefault(); imagePickerRef.current?.click(); }} disabled={editorAccess.disabled}>Upload</button>
                  </div>
                </div>
              </summary>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.75fr)]">
                <div className="rounded-lg border border-[#7f6b9d]/20 bg-[#0d0a15]/70 p-2">
                  {assetRows.length > 0 ? (
                    <div className="grid gap-1">
                      {assetRows.map((row) => {
                        const asset = row.kind === 'file' ? postAssets.find((item) => item.relativePath === row.path) : undefined;
                        return (
                          <button
                            key={row.key}
                            type="button"
                            className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs ${
                              selectedAssetPath === row.path ? 'bg-[#241a36] text-white' : 'text-[#cdbfe4] hover:bg-[#171123]'
                            }`}
                            style={{ paddingLeft: `${8 + row.depth * 18}px` }}
                            onClick={() => row.kind === 'file' && setSelectedAssetPath(row.path)}
                            disabled={row.kind === 'folder'}
                          >
                            <span>{row.kind === 'folder' ? '▸' : '•'} {row.label}</span>
                            {asset?.size ? <span className="text-[10px] text-[#8f80aa]">{Math.ceil(asset.size / 1024)} KB</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-[#7f6b9d]/25 p-3 text-xs text-[#9c8db7]">
                      No files found yet. Upload media to create this post's assets folder in GitHub.
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-[#7f6b9d]/20 bg-[#0d0a15]/70 p-3 text-xs text-[#cdbfe4]">
                  {selectedAsset ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[#8ea6e8]">Selected file</div>
                        <div className="mt-1 break-all font-semibold text-[#efe8ff]">{selectedAsset.relativePath}</div>
                        <div className="mt-1 break-all text-[#8f80aa]">{selectedAsset.repoPath}</div>
                      </div>
                      {selectedAsset.name.match(/\.(?:png|jpe?g|gif|webp|avif|svg)$/i) ? (
                        <img src={resolveBlogAssetUrl(activeDraftSlug, `assets/${selectedAsset.relativePath}`)} alt={selectedAsset.name} className="max-h-48 w-full rounded-lg border border-[#7f6b9d]/20 object-contain" />
                      ) : selectedAsset.name.match(/\.(?:mp4|webm|mov)$/i) ? (
                        <video controls src={resolveBlogAssetUrl(activeDraftSlug, `assets/${selectedAsset.relativePath}`)} className="max-h-48 w-full rounded-lg border border-[#7f6b9d]/20" />
                      ) : selectedAsset.name.match(/\.(?:mp3|wav|ogg)$/i) ? (
                        <audio controls src={resolveBlogAssetUrl(activeDraftSlug, `assets/${selectedAsset.relativePath}`)} className="w-full" />
                      ) : (
                        <a href={resolveBlogAssetUrl(activeDraftSlug, `assets/${selectedAsset.relativePath}`)} target="_blank" rel="noreferrer" className="text-[#c6a8ff] underline">Open preview/download</a>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={miniBtn} onClick={() => insertAssetReference(selectedAsset)} disabled={editorAccess.disabled}>Insert reference</button>
                        <label className={`${miniBtn} cursor-pointer`}>
                          Replace
                          <input type="file" accept="image/*,video/*,audio/*,application/pdf,text/plain,.md,.pdf" className="hidden" disabled={editorAccess.disabled} onClick={() => setReplaceAssetPath(selectedAsset.relativePath)} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickReplacement(f); e.currentTarget.value = ''; }} />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[#9c8db7]">Pick a file in the tree to preview, insert, or replace it.</div>
                  )}
                </div>
              </div>
            </details>

            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" className={btn(viewMode === 'split')} onClick={() => setViewMode('split')} aria-pressed={viewMode === 'split'}>Split</button>
              <button type="button" className={btn(viewMode === 'edit')} onClick={() => setViewMode('edit')} aria-pressed={viewMode === 'edit'}>Editor only</button>
              <button type="button" className={btn(viewMode === 'preview')} onClick={() => setViewMode('preview')} aria-pressed={viewMode === 'preview'}>Preview only</button>
            </div>

            <div className={viewMode === 'split' ? 'grid gap-3 md:grid-cols-2' : 'grid gap-3'}>
              {showEditor ? (
                <textarea ref={editorRef} className={textarea} value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
              ) : null}
              {showPreview ? (
                <div className="preview rounded-lg border border-[#7f6b9d]/25 bg-[#0f0b17] p-3" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : null}
            </div>

            <button type="button" onClick={publish} className={btn(false)} disabled={!token || loading}>Publish to selected repo</button>
          </div>
        )}

        {tab === 'posts' && (
          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input className={input} placeholder="Search posts" value={query} onChange={(e) => setQuery(e.target.value)} />
              <span className="text-xs text-[#9c8db7]">{filtered.length} shown · {posts.length} total</span>
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
                      <button type="button" className={btn(false)} onClick={() => void openPostInEditor(p)} disabled={!token || loading} title={!token ? editorAccess.reason : undefined}>Edit post</button>
                      <Link href={`/blog/${encodeURIComponent(p.slug)}`} className="rounded-lg border border-[#7f6b9d]/25 bg-[#110d19]/35 px-3 py-2 text-[#cdbfe4] hover:text-white">
                        View live
                      </Link>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-500/35 bg-rose-950/25 px-3 py-2 text-rose-100 hover:border-rose-400/55 hover:bg-rose-900/35 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void deletePost(p)}
                        disabled={!token || loading}
                      >
                        Delete
                      </button>
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
      </section>

    </div>
  );
}

function btn(active: boolean) {
  return `rounded-lg border px-3 py-2 text-sm ${
    active
      ? 'border-[#a58ac8]/60 bg-[#241a36] text-white'
      : 'border-[#7f6b9d]/30 bg-[#1a1328] text-[#efe8ff] hover:border-[#a58ac8]/50 disabled:cursor-not-allowed disabled:opacity-50'
  }`;
}

function toastClassName(tone: ToastTone) {
  switch (tone) {
    case 'success':
      return 'border-emerald-400/50 bg-emerald-950/90 text-emerald-50';
    case 'error':
      return 'border-rose-400/50 bg-rose-950/90 text-rose-50';
    default:
      return 'border-sky-400/50 bg-sky-950/90 text-sky-50';
  }
}


const miniBtn = 'rounded border border-[#7f6b9d]/35 bg-[#1a1328] px-2 py-1 text-[#e9deff] hover:border-[#a58ac8]/60 disabled:cursor-not-allowed disabled:opacity-50';
const input = 'w-full rounded-lg border border-[#7f6b9d]/30 bg-[#130f1d] px-3 py-2 text-[#efe8ff] outline-none disabled:cursor-not-allowed disabled:opacity-50';
const textarea = 'min-h-[420px] rounded-lg border border-[#7f6b9d]/30 bg-[#130f1d] p-3 text-[#efe8ff] outline-none disabled:cursor-not-allowed disabled:opacity-50';
const label = 'grid gap-1 text-sm text-[#c8bcdd]';

export { BlogEditApp };
