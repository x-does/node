import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standaloneDir = path.join(root, '.next', 'standalone');
const templateServer = path.join(root, 'scripts', 'templates', 'hostinger-server.cjs');
const runtimeServer = path.join(standaloneDir, 'server.js');
const sourceDnp = path.join(root, 'vendor', 'dnp');
const runtimeDnp = path.join(standaloneDir, 'vendor', 'dnp');
const sourceNextStatic = path.join(root, '.next', 'static');
const runtimeNextStatic = path.join(standaloneDir, '.next', 'static');
const sourcePublic = path.join(root, 'public');
const runtimePublic = path.join(standaloneDir, 'public');
const sourceNodeModules = path.join(root, 'node_modules');
const runtimeNodeModules = path.join(standaloneDir, 'node_modules');

const runtimeDependencies = ['express', 'ws', 'nanoid', 'dotenv'];
const copiedPackages = new Set();

async function readPackageJson(packageDir) {
  const raw = await readFile(path.join(packageDir, 'package.json'), 'utf8');
  return JSON.parse(raw);
}

function packagePath(baseNodeModules, packageName) {
  return path.join(baseNodeModules, ...packageName.split('/'));
}

async function copyInstalledOptional(packageName) {
  try {
    await readPackageJson(packagePath(sourceNodeModules, packageName));
    await copyPackageRecursive(packageName);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function copyPackageRecursive(packageName) {
  if (copiedPackages.has(packageName)) return;
  copiedPackages.add(packageName);

  const sourceDir = packagePath(sourceNodeModules, packageName);
  const destinationDir = packagePath(runtimeNodeModules, packageName);
  const pkg = await readPackageJson(sourceDir);

  await mkdir(path.dirname(destinationDir), { recursive: true });
  await rm(destinationDir, { recursive: true, force: true });
  await cp(sourceDir, destinationDir, {
    recursive: true,
    dereference: true,
    filter: (source) => !source.includes(`${path.sep}.cache${path.sep}`),
  });

  const dependencies = Object.keys(pkg.dependencies || {});
  const optionalDependencies = Object.keys(pkg.optionalDependencies || {});
  for (const dependency of dependencies) {
    await copyPackageRecursive(dependency);
  }
  for (const dependency of optionalDependencies) {
    await copyInstalledOptional(dependency);
  }
}

async function main() {
  await mkdir(standaloneDir, { recursive: true });

  await cp(templateServer, runtimeServer);

  await rm(runtimeNextStatic, { recursive: true, force: true });
  await mkdir(path.dirname(runtimeNextStatic), { recursive: true });
  await cp(sourceNextStatic, runtimeNextStatic, { recursive: true, dereference: true });

  await rm(runtimePublic, { recursive: true, force: true });
  await cp(sourcePublic, runtimePublic, { recursive: true, dereference: true });

  await rm(runtimeDnp, { recursive: true, force: true });
  await mkdir(path.dirname(runtimeDnp), { recursive: true });
  await cp(sourceDnp, runtimeDnp, {
    recursive: true,
    dereference: true,
    filter: (source) => {
      const relative = path.relative(sourceDnp, source);
      const parts = relative.split(path.sep);
      return !parts.includes('.git') && !parts.includes('node_modules') && !parts.includes('.env');
    },
  });

  await mkdir(runtimeNodeModules, { recursive: true });
  for (const dependency of runtimeDependencies) {
    await copyPackageRecursive(dependency);
  }

  console.log(`Prepared Hostinger runtime at ${standaloneDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
