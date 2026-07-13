import test from 'node:test';
import assert from 'node:assert/strict';
import { advance } from '../src/simulation.js';

const fixtures = [
  {
    name:'free movement uses the canonical 30Hz stepping', ms:100,
    room:{status:'playing',scores:{left:0,right:0},ball:{x:.5,y:.5,vx:.42,vy:.17},players:[]},
    expected:{scores:{left:0,right:0},ball:{x:.542,y:.517,vx:.42,vy:.17}},
  },
  {
    name:'side paddle changes angle and accelerates', ms:34,
    room:{status:'playing',scores:{left:0,right:0},ball:{x:.071,y:.38,vx:-.42,vy:0},players:[{slotIndex:0,input:.3}]},
    expected:{scores:{left:0,right:0},ball:{x:.07624524618688186,y:.38292307768811584,vx:.42619095216952124,vy:.17194574635975524}},
  },
  {
    name:'goal resets canonical serve', ms:34,
    room:{status:'playing',scores:{left:0,right:0},ball:{x:-.02,y:.5,vx:-.42,vy:.17},players:[]},
    expected:{scores:{left:0,right:1},ball:{x:.50714,y:.502023,vx:.42,vy:.11900000000000001}},
  },
];

for (const fixture of fixtures) test(fixture.name,()=>{
  const result=advance(structuredClone(fixture.room),fixture.ms);
  assert.deepEqual(result.scores,fixture.expected.scores);
  for(const key of ['x','y','vx','vy']) assert.ok(Math.abs(result.ball[key]-fixture.expected.ball[key])<1e-9,`${key}: ${result.ball[key]}`);
});
