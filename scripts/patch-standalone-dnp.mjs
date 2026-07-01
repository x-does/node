import { access, cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const standaloneDir = path.join(root, '.next', 'standalone');
const sourceDnp = path.join(root, 'vendor', 'dnp');
const targetDnp = path.join(standaloneDir, 'vendor', 'dnp');
const targetServer = path.join(standaloneDir, 'server.js');
const standaloneNodeModules = path.join(standaloneDir, 'node_modules');
const runtimePackages = ['dotenv', 'express', 'nanoid', 'ws'];
const copiedPackages = new Set();

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyRuntimePackage(packageName) {
  if (copiedPackages.has(packageName)) return;
  copiedPackages.add(packageName);

  const packageJsonPath = path.join(root, 'node_modules', packageName, 'package.json');
  if (!(await fileExists(packageJsonPath))) throw new Error(`Could not locate package.json for ${packageName}`);
  const packageDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(packageJsonPath, 'utf8')));

  for (const dependency of Object.keys({ ...packageJson.dependencies, ...packageJson.optionalDependencies })) {
    await copyRuntimePackage(dependency);
  }

  const targetPackageDir = path.join(standaloneNodeModules, packageName);
  await mkdir(path.dirname(targetPackageDir), { recursive: true });
  await cp(packageDir, targetPackageDir, {
    recursive: true,
    force: true,
    filter(source) {
      const relative = path.relative(packageDir, source).split(path.sep).join('/');
      return !relative.startsWith('node_modules/') && relative !== '.env';
    },
  });
}

await mkdir(standaloneDir, { recursive: true });
await cp(sourceDnp, targetDnp, {
  recursive: true,
  force: true,
  filter(source) {
    const normalized = source.split(path.sep).join('/');
    return !normalized.includes('/.git') && !normalized.includes('/node_modules') && !normalized.endsWith('/.env');
  },
});

for (const packageName of runtimePackages) {
  await copyRuntimePackage(packageName);
}

const server = String.raw`const path = require('path');
const { createServer } = require('http');
const { pathToFileURL } = require('url');
const express = require('express');
const next = require('next');

const dir = path.join(__dirname);
process.env.NODE_ENV = 'production';
process.chdir(__dirname);

const port = Number.parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOST || '0.0.0.0';
const dnpBasePath = process.env.DNP_BASE_PATH || '/dnp';

async function main() {
  const app = express();
  const server = createServer(app);
  const nextApp = next({ dev: false, dir });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();

  const dnpModuleUrl = pathToFileURL(path.join(__dirname, 'vendor', 'dnp', 'server', 'index.mjs')).href;
  const { createDefinitelyNotPongServer } = await import(dnpModuleUrl);
  const dnp = createDefinitelyNotPongServer({
    app,
    server,
    basePath: dnpBasePath,
  });

  app.use((req, res) => handle(req, res));

  server.listen(port, hostname, () => {
    console.log('[xdoes] Next + DefinitelyNotPong listening on http://' + hostname + ':' + port);
    console.log('[xdoes] DNP mounted at ' + dnpBasePath + ' with WebSocket ' + dnp.wsPath);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

await writeFile(targetServer, server, 'utf8');
console.log(`Patched standalone server with DNP mount: ${path.relative(root, targetServer)}`);
console.log(`Copied vendored DNP runtime: ${path.relative(root, targetDnp)}`);
console.log(`Copied DNP Node dependencies into standalone: ${[...copiedPackages].sort().join(', ')}`);
