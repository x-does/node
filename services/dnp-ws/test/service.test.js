import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';

import { createDnpWsServer } from '../src/server.js';
import { RoomHub } from '../src/room-hub.js';
import { issueTicket } from '../src/ticket.js';

const room = { id: 'r1', code: 'ABC234', mode: 'private', status: 'playing', adminPlayerId: 'p1', scoreLeft: 0, scoreRight: 0, ballX: .5, ballY: .5, ballVx: .42, ballVy: .17, version: 1, lastTickAt: new Date(), players: [{ id: 'p1', roomId: 'r1', name: 'One', joinOrder: 1, slotIndex: 0, inputPosition: .5, inputSeq: 0, lastSeenAt: new Date(), leftAt: null }] };

async function fixture() {
  const adapter = { loadRoom: async () => structuredClone(room), checkpoint: async () => {}, refresh: async () => structuredClone(room) };
  const app = createDnpWsServer({ adapter, secret: 'secret', allowedOrigins: ['https://node.xdoes.space'], idleMs: 20 });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const { port } = app.server.address();
  return { app, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}` };
}

test('healthz is isolated and reports ok', async () => {
  const { app, base } = await fixture();
  const response = await fetch(`${base}/healthz`);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, service: 'dnp-ws' });
  await app.close();
});

test('enforces origin, room path and first-message ticket authentication', async () => {
  const { app, ws } = await fixture();
  const denied = new WebSocket(`${ws}/rooms/ABC234`, { origin: 'https://evil.example' });
  denied.on('error', () => {});
  const [, response] = await once(denied, 'unexpected-response'); assert.equal(response.statusCode, 403);
  const client = new WebSocket(`${ws}/rooms/ABC234`, { origin: 'https://node.xdoes.space' }); await once(client, 'open');
  client.send(JSON.stringify({ type: 'input', seq: 1, position: .7 }));
  const [code] = await once(client, 'close'); assert.equal(code, 4401);
  await app.close();
});

test('authenticates, sequence-checks input and broadcasts snapshots from one hub', async () => {
  const { app, ws } = await fixture();
  const client = new WebSocket(`${ws}/rooms/ABC234`, { origin: 'https://node.xdoes.space' }); await once(client, 'open');
  const messages = []; client.on('message', (data) => messages.push(JSON.parse(data)));
  client.send(JSON.stringify({ type: 'auth', ticket: issueTicket({ roomCode: 'ABC234', playerId: 'p1' }, 'secret') }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  client.send(JSON.stringify({ type: 'input', seq: 2, position: .8 }));
  client.send(JSON.stringify({ type: 'input', seq: 1, position: .1 }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const snapshot = messages.findLast((message) => message.type === 'snapshot');
  assert.ok(snapshot); assert.equal(snapshot.room.players[0].input, .8); assert.equal(app.registry.size, 1);
  client.close(); await once(client, 'close'); await new Promise((resolve) => setTimeout(resolve, 40)); assert.equal(app.registry.size, 0);
  await app.close();
});

test('serializes authentication while lazy hub loading and never adds a ghost client', async () => {
  let resolveLoad;
  const adapter = { loadRoom: async () => new Promise(resolve => { resolveLoad=()=>resolve(structuredClone(room)); }), checkpoint: async () => {}, refresh: async () => structuredClone(room) };
  const app = createDnpWsServer({ adapter, secret: 'secret', allowedOrigins: ['https://node.xdoes.space'], idleMs: 1000 });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const { port }=app.server.address();
  const client=new WebSocket(`ws://127.0.0.1:${port}/rooms/ABC234`,{origin:'https://node.xdoes.space'}); await once(client,'open');
  const ticket=issueTicket({roomCode:'ABC234',playerId:'p1'},'secret');
  client.send(JSON.stringify({type:'auth',ticket}));
  client.send(JSON.stringify({type:'input',seq:1,position:.9}));
  client.send(JSON.stringify({type:'auth',ticket}));
  const closing=new WebSocket(`ws://127.0.0.1:${port}/rooms/ABC234`,{origin:'https://node.xdoes.space'}); await once(closing,'open');
  closing.send(JSON.stringify({type:'auth',ticket:issueTicket({roomCode:'ABC234',playerId:'p1'},'secret')}));
  closing.close(); await once(closing,'close');
  await new Promise(resolve=>setTimeout(resolve,5)); resolveLoad();
  await new Promise(resolve=>setTimeout(resolve,20));
  const hub=await app.registry.get('ABC234');
  assert.equal(client.readyState,WebSocket.OPEN); assert.equal(hub.clients.size,1); assert.equal(hub.state.players[0].inputSeq,0);
  client.close(); await once(client,'close'); await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(hub.clients.size,0);
  await app.close();
});

test('shutdown quiesces timers and retries a slow conflicted final checkpoint before closing the adapter', async () => {
  const fresh=structuredClone(room); fresh.version=2;
  let checkpoints=0,adapterClosed=false;
  const adapter={loadRoom:async()=>structuredClone(room),refresh:async()=>structuredClone(fresh),checkpoint:async(_state,expected)=>{checkpoints++;await new Promise(resolve=>setTimeout(resolve,30));if(checkpoints===1){const error=new Error('conflict');error.code='DNP_CONFLICT';throw error;}return {version:expected+1,playerSeqs:{p1:1}};},close:async()=>{adapterClosed=true;}};
  const app=createDnpWsServer({adapter,secret:'secret',allowedOrigins:['https://node.xdoes.space']});
  app.server.listen(0,'127.0.0.1'); await once(app.server,'listening'); const {port}=app.server.address();
  const client=new WebSocket(`ws://127.0.0.1:${port}/rooms/ABC234`,{origin:'https://node.xdoes.space'}); await once(client,'open');
  client.send(JSON.stringify({type:'auth',ticket:issueTicket({roomCode:'ABC234',playerId:'p1'},'secret')}));
  await new Promise(resolve=>setTimeout(resolve,10)); client.send(JSON.stringify({type:'input',seq:1,position:.7}));
  await new Promise(resolve=>setTimeout(resolve,5)); await app.close();
  assert.equal(checkpoints,2); assert.equal(adapterClosed,true);
});

test('shutdown rejects racing upgrades before they can authenticate or load another hub', async () => {
  let releaseCheckpoint;
  let checkpointStartedResolve;
  const checkpointStarted=new Promise(resolve=>{checkpointStartedResolve=resolve;});
  const checkpointRelease=new Promise(resolve=>{releaseCheckpoint=resolve;});
  const loaded=[];
  const adapter={
    loadRoom:async code=>{loaded.push(code);const loadedRoom=structuredClone(room);loadedRoom.code=code;return loadedRoom;},
    refresh:async()=>structuredClone(room),
    checkpoint:async(_state,expected)=>{checkpointStartedResolve();await checkpointRelease;return {version:expected+1,playerSeqs:{p1:1}};},
    close:async()=>{},
  };
  const app=createDnpWsServer({adapter,secret:'secret',allowedOrigins:['https://node.xdoes.space'],hubOptions:{autoStart:false}});
  app.server.listen(0,'127.0.0.1'); await once(app.server,'listening'); const {port}=app.server.address();
  const first=new WebSocket(`ws://127.0.0.1:${port}/rooms/ABC234`,{origin:'https://node.xdoes.space'}); await once(first,'open');
  const authenticated=once(first,'message');
  first.send(JSON.stringify({type:'auth',ticket:issueTicket({roomCode:'ABC234',playerId:'p1'},'secret')}));
  await authenticated;
  first.send(JSON.stringify({type:'input',seq:1,position:.7}));
  const hub=await app.registry.get('ABC234');
  while(!hub.dirty) await new Promise(resolve=>setTimeout(resolve,1));

  const closing=app.close();
  await checkpointStarted;

  const racing=new WebSocket(`ws://127.0.0.1:${port}/rooms/XYZ234`,{origin:'https://node.xdoes.space'});
  racing.on('error',()=>{});
  const racingResult=await new Promise(resolve=>{
    racing.once('unexpected-response',(_request,response)=>resolve({kind:'rejected',status:response.statusCode}));
    racing.once('error',()=>resolve({kind:'rejected'}));
    racing.once('close',()=>resolve({kind:'rejected'}));
    racing.once('open',()=>{
      racing.send(JSON.stringify({type:'auth',ticket:issueTicket({roomCode:'XYZ234',playerId:'p1'},'secret')}));
      resolve({kind:'opened'});
    });
  });

  assert.equal(racingResult.kind,'rejected');
  assert.deepEqual(loaded,['ABC234']);
  assert.equal(app.registry.has('XYZ234'),false);
  releaseCheckpoint();
  await closing;
  assert.equal(app.server.listening,false);
});

test('shutdown remains idempotent and preserves aggregate errors while still closing the adapter', async () => {
  let checkpoints=0,adapterCloses=0;
  const adapter={loadRoom:async()=>structuredClone(room),refresh:async()=>structuredClone(room),checkpoint:async()=>{checkpoints++;throw new Error('database unavailable');},close:async()=>{adapterCloses++;throw new Error('adapter close failed');}};
  const app=createDnpWsServer({adapter,secret:'secret',allowedOrigins:['https://node.xdoes.space'],hubOptions:{autoStart:false,finalCheckpointAttempts:3,finalCheckpointBackoffMs:1}});
  const hub=await new RoomHub('ABC234',adapter,()=>{},1000,{autoStart:false,finalCheckpointAttempts:3,finalCheckpointBackoffMs:1}).init();
  app.registry.set('ABC234',hub);
  hub.markDirty();
  const firstClose=app.close(),secondClose=app.close();
  assert.strictEqual(secondClose,firstClose);
  await assert.rejects(firstClose,error=>{
    assert.ok(error instanceof AggregateError);
    assert.match(error.message,/failed to close dnp-ws server/i);
    assert.equal(error.errors.length,2);
    return true;
  });
  assert.equal(checkpoints,3); assert.equal(hub.dirty,true); assert.equal(hub.stopped,false); assert.equal(hub.quiesced,true); assert.equal(adapterCloses,1);
});
