'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Matter=require('../vendor/matter.min.js');
const {Controller,STEP}=require('../dynamics.js');

function fixture(count,{mixed=false,reversed=false,reducedMotion=false}={}){
 const motion=new Controller(Matter,{reducedMotion});
 const factor=count>30?.52:1;
 const radii=Array.from({length:count},(_,i)=>(mixed?(i%2?26.5:15.9):21.2)*factor);
 const R=count>1?(radii[0]+radii[1]+.6)/(2*Math.sin(Math.PI/count)):0;
 const targets=radii.map((_,i)=>({x:320+Math.cos(-Math.PI/2+i/count*Math.PI*2)*R,y:320+Math.sin(-Math.PI/2+i/count*Math.PI*2)*R}));
 const beads=radii.map((radius,i)=>{
  const p=targets[reversed?count-1-i:i];
  const body=Matter.Bodies.circle(p.x,p.y,radius,motion.bodyOptions());
  Matter.Composite.add(motion.engine.world,body);
  return {id:'test-'+i,radius,body};
 });
 motion.configure(beads,targets,{reset:true});
 return {motion,beads,targets};
}
function advance(motion,seconds){
 for(let i=0;i<seconds*120;i++)motion.step(STEP);
}
test('交换对径珠子后经过碰撞绕行归位',()=>{
 const {motion,beads,targets}=fixture(6);
 Matter.Body.setPosition(beads[0].body,targets[3]);
 Matter.Body.setPosition(beads[3].body,targets[0]);
 let contacts=0,detourSeen=false;
 Matter.Events.on(motion.engine,'collisionStart',e=>contacts+=e.pairs.length);
 for(let i=0;i<12*120;i++){motion.step(STEP);detourSeen ||= !!motion.detour;}
 assert(contacts>0);
 assert(detourSeen,'对称互换需要能绕过阻挡');
 assert(motion.settled,'不能一直顶住其他珠子');
 beads.forEach((b,i)=>assert(Math.hypot(b.body.position.x-targets[i].x,b.body.position.y-targets[i].y)<1.1));
});
test('混合珠径倒序与减少动画设置也能收拢',()=>{
 for(const count of [12,20,60])for(const reducedMotion of [false,true]){
  const {motion,beads}=fixture(count,{mixed:true,reversed:true,reducedMotion});
  advance(motion,14);
  assert(motion.settled,count+'颗应能归位');
  beads.forEach(b=>assert(Math.hypot(b.body.position.x-320,b.body.position.y-320)+b.radius<=254));
 }
});
test('解除成串释放张力并在三秒后保持滑行',()=>{
 const {motion,beads}=fixture(20,{mixed:true});
 motion.setMode('loose');
 assert(beads.every(b=>Math.hypot(b.body.velocity.x,b.body.velocity.y)>3));
 advance(motion,3);
 assert(beads.filter(b=>Math.hypot(b.body.velocity.x,b.body.velocity.y)>.35).length>=10);
 beads.forEach(b=>assert(Math.hypot(b.body.position.x-320,b.body.position.y-320)+b.radius<=254));
});
test('没有碰撞时一秒后仍保留大部分动量',()=>{
 const motion=new Controller(Matter,{radius:100000});
 const body=Matter.Bodies.circle(320,320,21.2,motion.bodyOptions());
 Matter.Composite.add(motion.engine.world,body);
 motion.configure([{id:'rolling',radius:21.2,body}],[{x:320,y:320}]);
 motion.setMode('loose');
 Matter.Body.setVelocity(body,{x:6,y:0});
 advance(motion,1);
 assert(body.velocity.x>4.5 && body.velocity.x<5);
});
test('连续切换及拖动中断不会遗留绕行或失控速度',()=>{
 const {motion,beads}=fixture(20,{mixed:true});
 for(let i=0;i<20;i++){
  motion.setMode(i%2?'strung':'loose');
  advance(motion,.05);
  beads.forEach(b=>{
   assert(Number.isFinite(b.body.position.x));
   assert(Math.hypot(b.body.velocity.x,b.body.velocity.y)<=18.001);
  });
 }
 motion.configure(beads,motion.targets);
 assert.equal(motion.detour,null);
 advance(motion,14);
 assert(motion.settled);
});
