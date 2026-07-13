import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { RoomHub, MAX_INPUT_SEQ } from '../src/room-hub.js';
import { createHubRegistry } from '../src/server.js';
import { issueTicket, verifyTicket, TicketNonceStore } from '../src/ticket.js';

const baseRoom = () => ({ id:'r1',code:'ABC234',mode:'private',status:'playing',adminPlayerId:'p1',scoreLeft:0,scoreRight:0,ballX:.5,ballY:.5,ballVx:.42,ballVy:.17,version:1,lastTickAt:new Date(),players:[{id:'p1',roomId:'r1',name:'One',joinOrder:1,slotIndex:0,inputPosition:.5,inputSeq:0,lastSeenAt:new Date(),leftAt:null},{id:'p2',roomId:'r1',name:'Two',joinOrder:2,slotIndex:1,inputPosition:.5,inputSeq:0,lastSeenAt:new Date(),leftAt:null}] });
class FakeWs extends EventEmitter { constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];this.closed=[];} send(value){this.sent.push(JSON.parse(value));} close(code,reason){this.closed.push([code,reason]);this.readyState=3;} }
const wait = (ms=0) => new Promise(resolve=>setTimeout(resolve,ms));

test('hub registry serializes concurrent room creation and removes only the same hub', async () => {
  let loads=0;
  const adapter={loadRoom:async()=>{loads++;await wait(10);return baseRoom();},refresh:async()=>baseRoom(),checkpoint:async()=>({version:2,players:[]})};
  const registry=createHubRegistry({adapter,idleMs:1000});
  const [a,b,c]=await Promise.all([registry.get('ABC234'),registry.get('ABC234'),registry.get('ABC234')]);
  assert.equal(a,b); assert.equal(b,c); assert.equal(loads,1); assert.equal(registry.hubs.size,1);
  a.stop(); registry.delete('ABC234',{}); assert.equal(registry.hubs.size,1);
  registry.delete('ABC234',a); assert.equal(registry.hubs.size,0);
});

test('ticket nonce is validated and consumed once until expiry', () => {
  const now=10_000;
  const ticket=issueTicket({roomCode:'ABC234',playerId:'p1'},'secret',{now,nonce:'abcdefghijklmnop'});
  assert.equal(verifyTicket(ticket,'secret','ABC234',now)?.nonce,'abcdefghijklmnop');
  const store=new TicketNonceStore();
  const claims=verifyTicket(ticket,'secret','ABC234',now);
  assert.equal(store.consume(claims,now),true);
  assert.equal(store.consume(claims,now+1),false);
  assert.equal(store.size,1);
  assert.equal(store.consume({...claims,nonce:'qrstuvwxyzABCDEF',exp:now+50},now+31_000),true);
  assert.equal(store.size,1);
  const malformed=issueTicket({roomCode:'ABC234',playerId:'p1'},'secret',{now,nonce:'x'});
  assert.equal(verifyTicket(malformed,'secret','ABC234',now),null);
});

test('checkpoint uses expected version, advances version and preserves newer input during an in-flight write', async () => {
  let resolveWrite;
  const calls=[];
  const adapter={loadRoom:async()=>baseRoom(),refresh:async()=>baseRoom(),checkpoint:async(state,expected,players)=>{calls.push({expected,players:structuredClone(players)});await new Promise(r=>resolveWrite=r);return {version:expected+1,playerSeqs:Object.fromEntries(players.map(p=>[p.id,p.inputSeq]))};}};
  const hub=await new RoomHub('ABC234',adapter,()=>{},1000,{autoStart:false}).init();
  const ws=new FakeWs(); hub.add(ws,{playerId:'p1'});
  hub.input(ws,{type:'input',seq:1,position:.7});
  const writing=hub.checkpoint(); await wait();
  hub.input(ws,{type:'input',seq:2,position:.8});
  resolveWrite(); await writing;
  assert.equal(calls[0].expected,1); assert.equal(hub.state.version,2); assert.equal(hub.dirty,true);
  assert.equal(hub.state.players[0].inputSeq,2);
  hub.stop();
});

test('checkpoint conflict resyncs without losing dirty local inputs', async () => {
  const fresh=baseRoom(); fresh.version=3; fresh.scoreLeft=9; fresh.players[0].inputSeq=1; fresh.players[0].inputPosition=.2;
  let checkpoints=0;
  const adapter={loadRoom:async()=>baseRoom(),refresh:async()=>structuredClone(fresh),checkpoint:async()=>{checkpoints++;const error=new Error('conflict');error.code='DNP_CONFLICT';throw error;}};
  const hub=await new RoomHub('ABC234',adapter,()=>{},1000,{autoStart:false}).init();
  const ws=new FakeWs(); hub.add(ws,{playerId:'p1'}); hub.input(ws,{type:'input',seq:2,position:.8});
  await hub.checkpoint();
  assert.equal(checkpoints,1); assert.equal(hub.state.version,3); assert.equal(hub.state.scoreLeft,9);
  assert.equal(hub.state.players[0].inputSeq,2); assert.equal(hub.state.players[0].inputPosition,.8); assert.equal(hub.dirty,true);
  hub.stop();
});

test('final checkpoint retries an optimistic conflict until state is clean', async () => {
  const fresh=baseRoom(); fresh.version=2; fresh.players[0].inputSeq=0;
  let checkpoints=0;
  const adapter={loadRoom:async()=>baseRoom(),refresh:async()=>structuredClone(fresh),checkpoint:async(_state,expected)=>{checkpoints++;if(checkpoints===1){const error=new Error('conflict');error.code='DNP_CONFLICT';throw error;}return {version:expected+1,playerSeqs:{p1:1}};}};
  const hub=await new RoomHub('ABC234',adapter,()=>{},1000,{autoStart:false}).init();
  const ws=new FakeWs(); hub.add(ws,{playerId:'p1'}); hub.input(ws,{type:'input',seq:1,position:.7});
  await hub.checkpointUntilClean();
  assert.equal(checkpoints,2); assert.equal(hub.dirty,false); assert.equal(hub.state.version,3);
  hub.stop();
});

test('shutdown retries a transient checkpoint error while quiesced and only stops once clean', async () => {
  let checkpoints=0;
  const adapter={loadRoom:async()=>baseRoom(),refresh:async()=>baseRoom(),checkpoint:async(_state,expected)=>{checkpoints++;if(checkpoints===1)throw new Error('temporary database outage');return {version:expected+1,playerSeqs:{p1:1}};}};
  const hub=await new RoomHub('ABC234',adapter,()=>{},1000,{autoStart:false,finalCheckpointAttempts:3,finalCheckpointBackoffMs:1}).init();
  const ws=new FakeWs(); hub.add(ws,{playerId:'p1'}); hub.input(ws,{type:'input',seq:1,position:.7});
  await hub.shutdown();
  assert.equal(checkpoints,2); assert.equal(hub.dirty,false); assert.equal(hub.quiesced,true); assert.equal(hub.stopped,true);
});

test('idle cleanup quiesces a playing hub so a slow final checkpoint can remove it', async () => {
  let removed=0,checkpoints=0;
  const adapter={loadRoom:async()=>baseRoom(),refresh:async()=>baseRoom(),checkpoint:async(_state,expected)=>{checkpoints++;await wait(30);return {version:expected+1,playerSeqs:{}};}};
  const hub=await new RoomHub('ABC234',adapter,()=>{removed++;},0).init();
  const ws=new FakeWs(); hub.add(ws,{playerId:'p1'});
  await wait(20); hub.remove(ws);
  await wait(80);
  assert.equal(checkpoints,1); assert.equal(hub.dirty,false); assert.equal(hub.stopped,true); assert.equal(removed,1);
});

test('reconnect during quiesced idle finalization keeps the hub active and resumes simulation timers', async () => {
  let resolveWrite;
  let removed=0;
  const adapter={loadRoom:async()=>baseRoom(),refresh:async()=>baseRoom(),checkpoint:async(_state,expected)=>{await new Promise(resolve=>resolveWrite=resolve);return {version:expected+1,playerSeqs:{p1:1}};}};
  const hub=await new RoomHub('ABC234',adapter,()=>{removed++;},0).init();
  const first=new FakeWs(); hub.add(first,{playerId:'p1'}); hub.input(first,{type:'input',seq:1,position:.7}); hub.remove(first);
  await wait();
  const mutationWhileQuiesced=hub.mutation;
  await wait(25); assert.equal(hub.mutation,mutationWhileQuiesced);
  const second=new FakeWs(); assert.equal(hub.add(second,{playerId:'p1'}),true);
  resolveWrite(); await wait(35);
  assert.equal(hub.stopped,false); assert.equal(removed,0); assert.equal(hub.clients.size,1); assert.equal(hub.clients.has(second),true);
  assert.ok(hub.mutation>mutationWhileQuiesced);
  hub.stop();
});

test('snapshot broadcast evicts a persistently backpressured client without affecting healthy clients', async () => {
  const adapter={loadRoom:async()=>baseRoom(),refresh:async()=>baseRoom(),checkpoint:async()=>({version:2,playerSeqs:{}})};
  const hub=await new RoomHub('ABC234',adapter,()=>{},1000,{autoStart:false,maxBufferedAmount:100,maxBackpressureStrikes:2}).init();
  const slow=new FakeWs(),healthy=new FakeWs(); slow.bufferedAmount=101;
  hub.add(slow,{playerId:'p1'}); hub.add(healthy,{playerId:'p2'});
  hub.broadcastNow();
  assert.equal(hub.clients.has(slow),true); assert.equal(slow.sent.length,0); assert.equal(healthy.sent.length,1);
  hub.broadcastNow();
  assert.equal(hub.clients.has(slow),false); assert.equal(slow.closed[0][0],4410); assert.equal(healthy.sent.length,2);
  hub.stop();
});

test('safe refresh checkpoints dirty state, revokes removed sockets and broadcasts fresh admin state', async () => {
  const fresh=baseRoom(); fresh.version=3; fresh.adminPlayerId='p2'; fresh.players[0].leftAt=new Date();
  const order=[];
  const adapter={loadRoom:async()=>baseRoom(),checkpoint:async(_state,expected)=>{order.push('checkpoint');return {version:expected+1,playerSeqs:{p1:1}};},refresh:async()=>{order.push('refresh');return structuredClone(fresh);}};
  const hub=await new RoomHub('ABC234',adapter,()=>{},1000,{autoStart:false}).init();
  const one=new FakeWs(),two=new FakeWs(); hub.add(one,{playerId:'p1'});hub.add(two,{playerId:'p2'});
  hub.input(one,{type:'input',seq:1,position:.7});
  await hub.syncExternal(true);
  assert.deepEqual(order,['checkpoint','refresh']);
  assert.equal(one.closed[0][0],4403); assert.equal(hub.clients.has(one),false);
  assert.equal(two.sent.at(-1).room.adminPlayerId,'p2');
  hub.stop();
});

test('input seq is a bounded DB integer and presence writes are throttled', async () => {
  let presence=0;
  const adapter={loadRoom:async()=>baseRoom(),refresh:async()=>baseRoom(),checkpoint:async(_s,e)=>({version:e+1,playerSeqs:{}}),touchPresence:async ids=>{presence++;assert.deepEqual(ids,['p1']);}};
  const hub=await new RoomHub('ABC234',adapter,()=>{},1000,{autoStart:false,presenceMs:100}).init();
  const ws=new FakeWs(); hub.add(ws,{playerId:'p1'});
  hub.input(ws,{type:'input',seq:MAX_INPUT_SEQ+1,position:.7}); assert.equal(hub.state.players[0].inputSeq,0);
  hub.input(ws,{type:'input',seq:MAX_INPUT_SEQ,position:.7}); assert.equal(hub.state.players[0].inputSeq,MAX_INPUT_SEQ);
  await hub.touchPresence(1000); await hub.touchPresence(1050); await hub.touchPresence(1101);
  assert.equal(presence,2); hub.stop();
});
