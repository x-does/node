import { MysqlAdapter } from './database.js';
import { createDnpWsServer } from './server.js';
import { installGracefulShutdown } from './shutdown.js';
import { serviceConfig } from './config.js';

const secret = process.env.DNP_WS_TICKET_SECRET;
if (!secret) throw new Error('DNP_WS_TICKET_SECRET is required');
const config = serviceConfig();
const app = createDnpWsServer({
  adapter: new MysqlAdapter(),
  secret,
  allowedOrigins: config.allowedOrigins,
  ...config.limits,
  hubOptions: config.hubOptions,
});
installGracefulShutdown({ app });
app.server.listen(config.port, () => console.log(`dnp-ws listening on ${config.port}`));
