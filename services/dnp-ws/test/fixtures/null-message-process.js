import { once } from 'node:events';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

import { createDnpWsServer } from '../../src/server.js';

const room={id:'r1',code:'ABC234',mode:'private',status:'waiting',adminPlayerId:'p1',scoreLeft:0,scoreRight:0,ballX:.5,ballY:.5,ballVx:.42,ballVy:.17,version:1,lastTickAt:new Date(),players:[{id:'p1',roomId:'r1',name:'One',joinOrder:1,slotIndex:0,inputPosition:.5,inputSeq:0,lastSeenAt:new Date(),leftAt:null}]};
const adapter={loadRoom:async()=>structuredClone(room),checkpoint:async()=>({version:2}),refresh:async()=>structuredClone(room),ready:async()=>true};
const app=createDnpWsServer({adapter,secret:'secret',allowedOrigins:['https://node.xdoes.space']});

try{
  app.server.listen(0,'127.0.0.1');
  await once(app.server,'listening');
  const {port}=app.server.address();
  for(const payload of ['null','[]','true','42','"text"']){
    const client=new WebSocket(`ws://127.0.0.1:${port}/rooms/ABC234`,{origin:'https://node.xdoes.space'});
    await once(client,'open');
    client.send(payload);
    const [closeCode]=await once(client,'close');
    assert.equal(closeCode,4400,payload);
  }
  const response=await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(response.status,200);
  process.stdout.write('survived\n');
}finally{
  await app.close();
}
