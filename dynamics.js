/* Bead motion: elastic gathering, contact response and stored-tension release.
 * Matter velocities use pixels per 1/60 second; forces use mass * pixels/ms².
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BeadDynamics=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const STEP=1000/120,TAU=Math.PI*2;
 const PHYSICS=Object.freeze({
  frictionAir:.004,friction:.012,frictionStatic:.018,restitution:.83,
  wallRestitution:.78,spring:.000055,damping:.00072,maxForceAcceleration:.0018,
  maxSpeed:18,dragSpring:.00044,dragDamping:.00215
 });
 const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
 const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
 function noise(id){
  let hash=2166136261;for(const c of id){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0)/4294967296;
 }
 class Controller{
  constructor(Matter,{center=320,radius=256,reducedMotion=false}={}){
   this.Matter=Matter;this.center=center;this.radius=radius;this.reducedMotion=reducedMotion;
   this.engine=Matter.Engine.create({gravity:{x:0,y:0,scale:0},positionIterations:10,velocityIterations:10,enableSleeping:false});
   this.beads=[];this.targets=[];this.mode='strung';this.age=0;this.detour=null;this.settled=true;
  }
  bodyOptions(){return {...PHYSICS,density:.0015,slop:.015};}
  configure(beads,targets,{reset=false}={}){
   this.beads=beads;this.targets=targets;this.detour=null;this.age=0;
   beads.forEach((b,i)=>{
    Object.assign(b.body,{frictionAir:PHYSICS.frictionAir,friction:PHYSICS.friction,frictionStatic:PHYSICS.frictionStatic,restitution:PHYSICS.restitution});
    this.Matter.Sleeping.set(b.body,false);
    b.stuckTime=0;b.detourCooldown=0;
    if(reset||!Number.isFinite(b.stress))b.stress=this.mode==='strung'?this.restStress(i):0;
    this.contain(b);
   });
  }
  restStress(index){
   const t=this.targets[index];if(!t||this.beads.length<2)return 0;
   // A short virtual elastic loop stores preload even when every bead is at rest.
   const R=Math.hypot(t.x-this.center,t.y-this.center);
   return clamp(R*.058,3.5,11);
  }
  setMode(mode,{restore=false}={}){
   if(!restore&&mode===this.mode)return;
   this.mode=mode;this.age=0;this.detour=null;
   this.beads.forEach(b=>{b.stuckTime=0;this.Matter.Sleeping.set(b.body,false);});
   if(mode==='loose'&&!restore)this.releaseTension();
   if(restore)this.beads.forEach((b,i)=>{b.stress=mode==='strung'?this.restStress(i):0;});
  }
  releaseTension(){
   const {Body}=this.Matter;
   this.beads.forEach((b,i)=>{
    const p=b.body.position,v=b.body.velocity;
    let a=Math.atan2(p.y-this.center,p.x-this.center);
    if(Math.hypot(p.x-this.center,p.y-this.center)<2)a=i*2.39996;
    const seed=noise(b.id),twist=(seed-.5)*2.3;
    const stored=clamp(b.stress||0,0,12);
    const speed=stored*(.84+noise(b.id+'release')*.52)*Math.sqrt(21/b.radius)*(this.reducedMotion?.32:1);
    // Radial release plus uneven tangential recoil breaks the ring's symmetry.
    const norm=Math.hypot(1,twist);
    Body.setVelocity(b.body,{
     x:v.x+(Math.cos(a)-Math.sin(a)*twist)*speed/norm,
     y:v.y+(Math.sin(a)+Math.cos(a)*twist)*speed/norm
    });
    Body.setAngularVelocity(b.body,b.body.angularVelocity+(seed-.5)*.14);
    b.stress=0;this.limitSpeed(b);
   });
  }
  contain(b){
   const {Body}=this.Matter,p=b.body.position,v=b.body.velocity;
   const dx=p.x-this.center,dy=p.y-this.center,d=Math.hypot(dx,dy),limit=this.radius-b.radius-3;
   if(d<=limit||d===0)return;
   const nx=dx/d,ny=dy/d,out=v.x*nx+v.y*ny;
   Body.setPosition(b.body,{x:this.center+nx*limit,y:this.center+ny*limit});
   if(out>0)Body.setVelocity(b.body,{x:v.x-(1+PHYSICS.wallRestitution)*out*nx,y:v.y-(1+PHYSICS.wallRestitution)*out*ny});
  }
  limitSpeed(b){
   const v=b.body.velocity,speed=Math.hypot(v.x,v.y);
   if(speed>PHYSICS.maxSpeed)this.Matter.Body.setVelocity(b.body,{x:v.x*PHYSICS.maxSpeed/speed,y:v.y*PHYSICS.maxSpeed/speed});
  }
  spring(b,target,k=PHYSICS.spring,damping=PHYSICS.damping,maxAcceleration=PHYSICS.maxForceAcceleration){
   const p=b.body.position,v=b.body.velocity;
   let ax=(target.x-p.x)*k-v.x*damping,ay=(target.y-p.y)*k-v.y*damping;
   const magnitude=Math.hypot(ax,ay);
   if(magnitude>maxAcceleration){ax*=maxAcceleration/magnitude;ay*=maxAcceleration/magnitude;}
   this.Matter.Body.applyForce(b.body,p,{x:ax*b.body.mass,y:ay*b.body.mass});
  }
  startDetour(b,index){
   const p=b.body.position,t=this.targets[index],R=Math.hypot(t.x-this.center,t.y-this.center);
   const biggest=Math.max(...this.beads.filter(other=>other!==b).map(other=>other.radius),b.radius);
   const clearance=b.radius+biggest+12;
   const inside=R-clearance,outside=R+clearance;
   let lane=inside;
   if(lane<b.radius+12){
    if(outside+b.radius>this.radius-6)return;
    lane=outside;
   }
   this.detour={id:b.id,index,lane,angle:Math.atan2(p.y-this.center,p.x-this.center),targetAngle:Math.atan2(t.y-this.center,t.x-this.center),phase:'radial',age:0};
   b.stuckTime=0;b.detourCooldown=1800;
  }
  detourTarget(dt){
   const d=this.detour,b=this.beads.find(b=>b.id===d?.id);
   if(!d||!b)return null;
   d.age+=dt;
   const p=b.body.position,radial=Math.hypot(p.x-this.center,p.y-this.center);
   if(d.phase==='radial'&&Math.abs(radial-d.lane)<Math.max(7,b.radius*.45))d.phase='arc';
   if(d.phase==='arc'){
    const angle=Math.atan2(p.y-this.center,p.x-this.center),remaining=angleDelta(angle,d.targetAngle);
    d.angle=angle+clamp(remaining,-.3,.3);
    if(Math.abs(remaining)*d.lane<Math.max(6,b.radius*.4))d.phase='dock';
   }
   const goal=d.phase==='dock'?this.targets[d.index]:{x:this.center+Math.cos(d.angle)*d.lane,y:this.center+Math.sin(d.angle)*d.lane};
   if((d.phase==='dock'&&Math.hypot(p.x-goal.x,p.y-goal.y)<3)||d.age>4200){
    this.detour=null;b.stuckTime=0;return this.targets[d.index];
   }
   return goal;
  }
  step(dt=STEP,drag=null){
   this.age+=dt;
   const guide=this.detourTarget(dt);
   let worst=null,worstScore=0,maxError=0,maxSpeed=0;
   this.beads.forEach((b,i)=>{
    const target=this.targets[i],p=b.body.position,v=b.body.velocity;
    b.detourCooldown=Math.max(0,(b.detourCooldown||0)-dt);
    if(drag?.id===b.id){
     this.spring(b,drag.target,PHYSICS.dragSpring,PHYSICS.dragDamping,.012);
     b.stuckTime=0;return;
    }
    if(this.mode==='strung'&&target){
     const error=Math.hypot(target.x-p.x,target.y-p.y),speed=Math.hypot(v.x,v.y);
     maxError=Math.max(maxError,error);maxSpeed=Math.max(maxSpeed,speed);
     const active=this.detour?.id===b.id;
     const strength=this.detour&&!active ? .55 : 1;
     const ramp=this.reducedMotion?1:Math.min(1,.25+this.age/380);
     this.spring(b,active&&guide?guide:target,PHYSICS.spring*strength*ramp,this.reducedMotion?.0011:PHYSICS.damping);
     b.stress+=(this.restStress(i)+Math.min(error*.08,5)-b.stress)*(1-Math.exp(-dt/280));
     if(error>Math.max(8,b.radius*.65)&&speed<.28)b.stuckTime=(b.stuckTime||0)+dt;
     else b.stuckTime=0;
     if(!drag&&!this.detour&&!b.detourCooldown&&b.stuckTime>520){
      const score=error/b.radius;
      if(score>worstScore){worst=b;worstScore=score;}
     }
    }
    this.limitSpeed(b);
   });
   if(worst)this.startDetour(worst,this.beads.indexOf(worst));
   this.Matter.Engine.update(this.engine,dt);
   this.beads.forEach(b=>{this.contain(b);this.limitSpeed(b);});
   this.settled=this.mode==='strung'&&!drag&&!this.detour&&maxError<1.1&&maxSpeed<.055;
  }
 }
 return {Controller,PHYSICS,STEP};
});
