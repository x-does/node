#!/usr/bin/env node
import { access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const clientDir = path.join(root, 'client');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.avif']);
const styleExtensions = new Set(['.css']);
const scriptExtensions = new Set(['.js', '.mjs']);

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

if (!(await exists(clientDir))) {
  console.log('No client/ directory found. Nothing to summarize yet.');
  console.log('This helper reports static asset counts and sizes after the browser client exists.');
  process.exit(0);
}

const files = await walk(clientDir);
const summary = {
  totalFiles: files.length,
  totalBytes: 0,
  images: { count: 0, bytes: 0 },
  styles: { count: 0, bytes: 0 },
  scripts: { count: 0, bytes: 0 },
  other: { count: 0, bytes: 0 },
};

const largest = [];

for (const file of files) {
  const info = await stat(file);
  const ext = path.extname(file).toLowerCase();
  summary.totalBytes += info.size;

  let bucket = 'other';
  if (imageExtensions.has(ext)) bucket = 'images';
  else if (styleExtensions.has(ext)) bucket = 'styles';
  else if (scriptExtensions.has(ext)) bucket = 'scripts';

  summary[bucket].count += 1;
  summary[bucket].bytes += info.size;
  largest.push({ file: path.relative(root, file), bytes: info.size });
}

largest.sort((a, b) => b.bytes - a.bytes);

console.log('DefinitelyNotPong static asset summary');
console.log('----------------------------------------');
console.log(`Files: ${summary.totalFiles}`);
console.log(`Total size: ${formatBytes(summary.totalBytes)}`);
console.log(`Images: ${summary.images.count} (${formatBytes(summary.images.bytes)})`);
console.log(`Stylesheets: ${summary.styles.count} (${formatBytes(summary.styles.bytes)})`);
console.log(`Scripts: ${summary.scripts.count} (${formatBytes(summary.scripts.bytes)})`);
console.log(`Other: ${summary.other.count} (${formatBytes(summary.other.bytes)})`);

if (largest.length > 0) {
  console.log('\nLargest files:');
  for (const item of largest.slice(0, 10)) {
    console.log(`- ${item.file}: ${formatBytes(item.bytes)}`);
  }
}

console.log('\nNote: this is a static asset inventory, not a screenshot or visual regression test.');
