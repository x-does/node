import { marked } from 'marked';

export type EditorAccessState = {
  canOpenEditor: boolean;
  disabled: boolean;
  reason: string;
};

export function sanitizeAssetFileName(fileName: string) {
  const lastSegment = fileName.split(/[\\/]+/).filter(Boolean).pop() || 'asset';
  const normalized = lastSegment
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^-+|-+$/g, '');
  return normalized || 'asset';
}

export function toAssetSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'draft-post';
}

export function buildAssetPath(slugInput: string, fileName: string, baseDir = 'blogs') {
  return `${baseDir.replace(/^\/+|\/+$/g, '')}/${toAssetSlug(slugInput)}/assets/${sanitizeAssetFileName(fileName)}`;
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
