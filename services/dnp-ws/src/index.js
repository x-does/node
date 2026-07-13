import { MysqlAdapter } from './database.js';
import { createDnpWsServer } from './server.js';
import { installGracefulShutdown } from './shutdown.js';
const secret=process.env.DNP_WS_TICKET_SECRET;const origins=(process.env.ALLOWED_ORIGINS||'https://node.xdoes.space').split(',').map(v=>v.trim()).filter(Boolean);if(!secret)throw new Error('DNP_WS_TICKET_SECRET is required');const app=createDnpWsServer({adapter:new MysqlAdapter(),secret,allowedOrigins:origins});installGracefulShutdown({app});const port=Number(process.env.PORT||3000);app.server.listen(port,()=>console.log(`dnp-ws listening on ${port}`));
