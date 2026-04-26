import { marked } from 'marked';

export type EditorAccessState = {
  canOpenEditor: boolean;
  disabled: boolean;
  reason: string;
};

export type GitHubAssetEntry = {
  name: string;
  path: string;
  type: string;
  size?: number;
  sha?: string;
};

export type BlogAsset = {
  name: string;
  relativePath: string;
  repoPath: string;
  type: 'file';
  size?: number;
  sha?: string;
};

export type AssetTreeRow =
  | { key: string; kind: 'folder'; label: string; depth: number; path: string }
  | { key: string; kind: 'file'; label: string; depth: number; path: string };

export function sanitizeAssetFileName(fileName: string) {
  const segments = fileName.split(/[\\/]+/).filter(Boolean);
  const normalizedSegments = (segments.length > 0 ? segments : ['asset'])
    .filter((segment) => segment !== '.' && segment !== '..')
    .map((segment) =>
      segment
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/-+\./g, '.')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean);
  return normalizedSegments.join('/') || 'asset';
}

export function toAssetSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'draft-post';
}

export function getAssetDirectory(slugInput: string, baseDir = 'blogs') {
  return `${baseDir.replace(/^\/+|\/+$/g, '')}/${toAssetSlug(slugInput)}/assets`;
}

export function buildAssetPath(slugInput: string, fileName: string, baseDir = 'blogs') {
  return `${getAssetDirectory(slugInput, baseDir)}/${sanitizeAssetFileName(fileName)}`;
}

function normalizeRepoPath(path: string) {
  return path.replace(/^\/+|\/+$/g, '');
}

export function normalizeGitHubAssetEntries(entries: GitHubAssetEntry[], assetDirectory: string): BlogAsset[] {
  const root = `${normalizeRepoPath(assetDirectory)}/`;
  return entries
    .filter((entry) => entry.type === 'file')
    .map((entry) => ({ ...entry, path: normalizeRepoPath(entry.path) }))
    .filter((entry) => entry.path.startsWith(root))
    .map((entry) => {
      const relativePath = entry.path.slice(root.length);
      return {
        name: entry.name || relativePath.split('/').pop() || relativePath,
        relativePath,
        repoPath: entry.path,
        size: entry.size,
        sha: entry.sha,
        type: 'file' as const,
      };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function listAssetTreeRows(assets: Pick<BlogAsset, 'relativePath' | 'name' | 'repoPath' | 'type'>[]): AssetTreeRow[] {
  const rows: AssetTreeRow[] = [];
  const seenFolders = new Set<string>();

  assets
    .slice()
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .forEach((asset) => {
      const parts = asset.relativePath.split('/').filter(Boolean);
      parts.slice(0, -1).forEach((part, index) => {
        const path = parts.slice(0, index + 1).join('/');
        if (seenFolders.has(path)) return;
        seenFolders.add(path);
        rows.push({ key: `folder:${path}`, kind: 'folder', label: part, depth: index, path });
      });
      const label = parts[parts.length - 1] || asset.name;
      rows.push({ key: `file:${asset.relativePath}`, kind: 'file', label, depth: Math.max(parts.length - 1, 0), path: asset.relativePath });
    });

  return rows;
}

export function buildMediaMarkdown({
  slug,
  fileName,
  mimeType,
}: {
  slug: string;
  fileName: string;
  mimeType: string;
}) {
  const safeName = sanitizeAssetFileName(fileName);
  const url = `assets/${safeName}`;
  if (mimeType.startsWith('image/')) {
    return `\n![${safeName}](${url})\n`;
  }
  if (mimeType.startsWith('video/')) {
    return `\n<video controls src="${url}"></video>\n`;
  }
  return `\n[Download ${safeName}](${url})\n`;
}

export function resolveBlogAssetUrl(slug: string, assetUrl: string) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(assetUrl)) return assetUrl;
  const cleaned = assetUrl.replace(/^\.\//, '');
  if (!cleaned.startsWith('assets/')) return assetUrl;
  const assetName = cleaned.slice('assets/'.length);
  return `/api/main-blog/assets/${encodeURIComponent(toAssetSlug(slug))}/${assetName
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

function addDownloadToAssetLinks(slug: string, html: string) {
  return html.replace(/<a\s+([^>]*href="([^"]+)"[^>]*)>/gi, (match, attrs, href) => {
    const resolved = resolveBlogAssetUrl(slug, href);
    if (resolved === href || !href.replace(/^\.\//, '').startsWith('assets/')) return match;
    const withoutHref = String(attrs).replace(/href="[^"]+"/i, `href="${resolved}"`);
    return `<a ${withoutHref} download>`;
  });
}

function rewriteMediaSources(slug: string, html: string) {
  return html.replace(/(<(?:img|video|source)\b[^>]*\s+src=")([^"]+)("[^>]*>)/gi, (_match, before, src, after) => {
    return `${before}${resolveBlogAssetUrl(slug, src)}${after}`;
  });
}

export function renderBlogMediaMarkdown(slug: string, markdown: string) {
  const html = marked.parse(markdown, { gfm: true, breaks: true }) as string;
  return addDownloadToAssetLinks(slug, rewriteMediaSources(slug, html));
}

export function getEditorAccessState({ token, loading }: { token: string; loading: boolean }): EditorAccessState {
  if (!token) {
    return {
      canOpenEditor: false,
      disabled: true,
      reason: 'Connect GitHub to unlock editor controls.',
    };
  }
  if (loading) {
    return {
      canOpenEditor: true,
      disabled: true,
      reason: 'Working… editor controls are temporarily disabled.',
    };
  }
  return { canOpenEditor: true, disabled: false, reason: '' };
}
