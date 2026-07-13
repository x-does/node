const path = require('node:path');
const { pathToFileURL } = require('node:url');
const express = require('express');
const { createServer } = require('node:http');
const next = require('next');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.HOST = process.env.HOST || '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';

const dir = path.join(__dirname);
const app = express();
const server = createServer(app);
const hostname = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT);
const dnpBasePath = process.env.DNP_BASE_PATH || '/dnp';
const noStore = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0';
let dnpInstance;

app.use(dnpBasePath, (_req, res, nextMiddleware) => {
  res.setHeader('Cache-Control', noStore);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  nextMiddleware();
});

async function mountDefinitelyNotPong() {
  try {
    const dnpEntry = path.join(__dirname, 'vendor', 'dnp', 'server', 'index.mjs');
    const { createDefinitelyNotPongServer } = await import(pathToFileURL(dnpEntry).href);

    dnpInstance = createDefinitelyNotPongServer({
      app,
      server,
      basePath: dnpBasePath,
    });
  } catch (error) {
    console.error('DNP unavailable; continuing with Next-only runtime', error);
  }
}

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref?.();

  const closeServer = () => {
    server.close((error) => {
      if (error) {
        console.error(error);
        process.exit(1);
      }
      process.exit(0);
    });
  };

  if (dnpInstance?.shutdown) {
    dnpInstance.shutdown(closeServer);
    return;
  }

  closeServer();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main() {
  await mountDefinitelyNotPong();

  const nextApp = next({ dev: false, hostname, port, dir });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();

  app.all(/.*/, (req, res) => handle(req, res));

  server.listen(port, hostname, () => {
    console.log(`server listening on http://${hostname}:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
