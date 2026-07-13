import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { installGracefulShutdown } from '../src/shutdown.js';

test('SIGTERM and SIGINT share one bounded graceful close operation', async () => {
  const processRef=new EventEmitter(); processRef.exitCode=undefined; processRef.exit=code=>{processRef.exitedWith=code;};
  let closes=0,resolveClose;
  const app={close:async()=>{closes++;await new Promise(resolve=>{resolveClose=resolve;});}};
  const controller=installGracefulShutdown({app,processRef,timeoutMs:100,logger:{error(){assert.fail('successful shutdown must not log an error');}}});
  processRef.emit('SIGTERM'); processRef.emit('SIGINT');
  assert.equal(closes,1);
  resolveClose(); await controller.done;
  assert.equal(processRef.exitCode,0); assert.equal(processRef.exitedWith,undefined);
  controller.dispose();
});

test('graceful shutdown timeout forces failure status and does not expose close errors', async () => {
  const processRef=new EventEmitter(); processRef.exitCode=undefined; processRef.exit=code=>{processRef.exitedWith=code;};
  let resolveClose; const logged=[];
  const controller=installGracefulShutdown({app:{close:()=>new Promise(resolve=>{resolveClose=resolve;})},processRef,timeoutMs:5,logger:{error(message){logged.push(message);}}});
  processRef.emit('SIGINT'); await controller.done;
  assert.equal(processRef.exitCode,1); assert.equal(processRef.exitedWith,1); assert.deepEqual(logged,['dnp-ws graceful shutdown timed out']);
  resolveClose(); await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(processRef.exitCode,1);
  controller.dispose();
});
