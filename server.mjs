import express from 'express';
import { createServer } from 'node:http';
import next from 'next';

import { createDefinitelyNotPongServer } from './vendor/dnp/server/index.mjs';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || process.env.HOSTNAME || '0.0.0.0';
const port = Number(process.env.PORT || 3000);

const nextApp = next({ dev, hostname, port });
const handle = nextApp.getRequestHandler();

await nextApp.prepare();

const app = express();
const server = createServer(app);

createDefinitelyNotPongServer({
  app,
  server,
  basePath: process.env.DNP_BASE_PATH || '/dnp',
  allowedOrigins: (process.env.DNP_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
});

app.use((req, res) => {
  handle(req, res);
});

server.listen(port, hostname, () => {
  console.log(`> XDOES ready on http://${hostname}:${port}`);
  console.log(`> DefinitelyNotPong mounted at ${process.env.DNP_BASE_PATH || '/dnp'}`);
});
