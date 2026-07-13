#!/usr/bin/env node
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');

const requiredNodeMajor = 22;
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);

const paths = {
  packageJson: path.join(root, 'package.json'),
  serverEntry: path.join(root, 'server', 'index.mjs'),
  clientDir: path.join(root, 'client'),
  envExample: path.join(root, '.env.example'),
  distDir: path.join(root, 'dist'),
  notes: path.join(root, 'dist', 'DEPLOYMENT_NOTES.txt'),
};

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function status(ok, label, detail = '') {
  const mark = ok ? '✓' : '!';
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function ensureEnvExample() {
  if (await exists(paths.envExample)) return false;

  const content = `# DefinitelyNotPong runtime configuration\n# Copy to .env for local development or set these in your host dashboard.\nNODE_ENV=development\nHOST=0.0.0.0\nPORT=8080\n# Comma-separated browser origins allowed to open WebSocket connections.\n# Leave empty during local development, set explicitly in production.\nALLOWED_ORIGINS=\n`;

  await writeFile(paths.envExample, content, 'utf8');
  return true;
}

async function writeDeploymentNotes() {
  await mkdir(paths.distDir, { recursive: true });
  const content = `DefinitelyNotPong deployment notes\n\nThis project is a Node 22+ Express/WebSocket application. It is not a static-only site.\n\nDeploy the repository source or a copied project directory to a Node-capable host, install production dependencies, and start with:\n\n  npm ci --omit=dev\n  npm start\n\nRequired runtime settings:\n  NODE_ENV=production\n  HOST=0.0.0.0\n  PORT=<port provided by your host, or 8080 on a VPS/container>\n  ALLOWED_ORIGINS=<comma-separated https origins, optional but recommended>\n\nFor Hostinger, use Node.js application hosting when available, or a VPS with Node 22+/Docker and a reverse proxy that supports WebSocket upgrade headers. Static FTP hosting cannot run the WebSocket server.\n`;
  await writeFile(paths.notes, content, 'utf8');
}

console.log('DefinitelyNotPong site/deployment helper\n');
status(nodeMajor >= requiredNodeMajor, `Node ${requiredNodeMajor}+`, `current ${process.versions.node}`);

const packageOk = await exists(paths.packageJson);
const serverOk = await exists(paths.serverEntry);
const clientOk = await exists(paths.clientDir);
status(packageOk, 'package.json present');
status(serverOk, 'server/index.mjs present', serverOk ? 'npm start target exists' : 'npm start will fail until this file exists');
status(clientOk, 'client/ directory present', clientOk ? 'static files can be served by the Node app' : 'add browser files before deployment');

const envCreated = await ensureEnvExample();
status(true, envCreated ? 'created .env.example' : '.env.example already present');

await writeDeploymentNotes();
status(true, 'wrote dist/DEPLOYMENT_NOTES.txt');

console.log('\nNext steps:');
console.log('1. Run npm install (or npm ci) on Node 22+.');
console.log('2. Run npm run dev for local development or npm start for production mode.');
console.log('3. Deploy to a Node/WebSocket-capable host. Do not upload only client/ to static FTP hosting.');

if (!serverOk || !clientOk || nodeMajor < requiredNodeMajor) {
  console.log('\nThis helper completed with warnings. Fix the items marked with ! before deploying.');
}
