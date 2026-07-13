#!/usr/bin/env node
import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);

const checks = [
  ['package.json', 'project manifest'],
  ['package-lock.json', 'locked dependencies for npm ci'],
  ['server/index.mjs', 'Node server entry used by npm start'],
  ['Dockerfile', 'optional VPS/container deployment'],
  ['docker-compose.yml', 'optional VPS/container deployment'],
];

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function listMissingProductionFiles() {
  const missing = [];
  for (const [relativePath, description] of checks) {
    if (!(await exists(relativePath))) missing.push(`${relativePath} (${description})`);
  }
  return missing;
}

function printHeading(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

console.log('DefinitelyNotPong Hostinger deployment helper');
console.log('This script is intentionally non-destructive: it does not upload files, change DNS, or call Hostinger APIs.');

if (nodeMajor < 22) {
  console.warn(`\nWarning: Node ${process.versions.node} detected. Deploy with Node 22 or newer.`);
}

const missing = await listMissingProductionFiles();
if (missing.length > 0) {
  printHeading('Preflight warnings');
  for (const item of missing) console.warn(`! Missing ${item}`);
}

const rootEntries = await readdir(root, { withFileTypes: true });
const hasPython = rootEntries.some((entry) => entry.isFile() && /\.py$/u.test(entry.name));
if (hasPython) console.warn('! Python file detected at project root; deployment should not rely on Python.');

printHeading('Recommended Hostinger Node application settings');
console.log('Application root: the uploaded project directory');
console.log('Startup command: npm start');
console.log('Install command: npm ci --omit=dev');
console.log('Node version: 22 or newer');
console.log('Public/static directory: leave managed by the Node app unless your host requires otherwise');

printHeading('Environment variables');
console.log('NODE_ENV=production');
console.log('HOST=0.0.0.0');
console.log('PORT=<port assigned by Hostinger, or 8080 on a VPS/container>');
console.log('ALLOWED_ORIGINS=<comma-separated https origins for your app; omit or leave empty only for testing>');

printHeading('VPS alternative');
console.log('1. Install Node 22+ or Docker.');
console.log('2. Copy/clone the project to the server.');
console.log('3. Run npm ci --omit=dev && npm start, or docker compose up -d --build.');
console.log('4. Put Nginx/Caddy/Apache in front for TLS and ensure WebSocket upgrade headers are proxied.');

printHeading('Important caveat');
console.log('DefinitelyNotPong uses WebSockets. Static-only FTP hosting can serve HTML/CSS/JS, but it cannot run the realtime server. Use Hostinger Node application hosting or a VPS.');

if (missing.length === 0 && nodeMajor >= 22) {
  printHeading('Preflight result');
  console.log('Project looks ready for a Node/WebSocket-capable deployment target.');
} else {
  printHeading('Preflight result');
  console.log('Review the warnings above before deploying.');
}
