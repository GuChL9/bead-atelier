'use strict';
(() => {
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2, CENTER = 320, TRAY_RADIUS = 256, MAX_BEADS = 60;
const SIZES = [6, 8, 10, 12];
const MATERIALS = [
 {id:'rose',name:'粉水晶',kind:'crystal',color:'#d7aaa9',detail:'温柔的透粉色',crop:[42,17,302,302]},
 {id:'amethyst',name:'紫水晶',kind:'crystal',color:'#8f72af',detail:'通透紫色与天然纹理',crop:[424,16,303,303]},
 {id:'aqua',name:'海蓝宝',kind:'crystal',color:'#a2c4cb',detail:'清浅的海水蓝',crop:[808,16,304,303]},
 {id:'clear',name:'白水晶',kind:'crystal',color:'#d7ded9',detail:'清透纯净的光泽',crop:[1192,16,303,303]},
 {id:'jade',name:'翡翠',kind:'crystal',color:'#84a78d',detail:'柔润的青绿色',crop:[42,349,303,302]},
 {id:'tiger',name:'虎眼石',kind:'crystal',color:'#b68639',detail:'金棕交错的丝绢光泽',crop:[425,348,304,303]},
 {id:'obsidian',name:'黑曜石',kind:'crystal',color:'#303332',detail:'深黑与镜面光泽',crop:[808,349,303,303]},
 {id:'pearl',name:'珍珠',kind:'accent',color:'#e6dfcc',detail:'柔白的珠光',crop:[1192,349,302,303]},
 {id:'agate',name:'红玛瑙',kind:'crystal',color:'#b85238',detail:'浓郁温润的红色',crop:[41,673,303,304]},
 {id:'wood',name:'檀木',kind:'natural',color:'#9a6340',detail:'细密温暖的木纹',crop:[423,672,306,305]},
 {id:'lapis',name:'青金石',kind:'crystal',color:'#294d86',detail:'深蓝底色与金色细点',crop:[806,672,306,305]},
 {id:'gold',name:'金珠',kind:'accent',color:'#c5a24e',detail:'一颗暖金色的点缀',crop:[1191,672,303,305]}
];
const byId = Object.assign(Object.create(null), Object.fromEntries(MATERIALS.map(m => [m.id,m])));
const PRESETS = [
 {name:'一抹春色',materials:['rose','clear','jade','gold'],beads:Array.from({length:20},(_,i)=>({material:i===0||i===10?'gold':i%5===0?'jade':i%3===0?'clear':'rose',size:i===0||i===10?6:8}))},
 {name:'山海之间',materials:['aqua','clear','lapis','pearl'],beads:Array.from({length:20},(_,i)=>({material:i%5===0?'lapis':i%3===0?'pearl':i%2===0?'clear':'aqua',size:i%5===0?10:8}))},
 {name:'日落木色',materials:['wood','tiger','agate','gold'],beads:Array.from({length:18},(_,i)=>({material:i%6===0?'gold':i%4===0?'agate':i%3===0?'tiger':'wood',size:i%6===0?6:10}))}
];
const {Engine,Bodies,Body,Composite} = Matter;
const engine = Engine.create({gravity:{x:0,y:0,scale:0},positionIterations:8,velocityIterations:8,enableSleeping:true});
const canvas = $('bead-canvas'), ctx = canvas.getContext('2d');
const atlas = new Image();
atlas.src = './assets/bead-atlas.png';
let atlasReady = false, serial = 0, scale = 5.3, ringRadius = 0, addSize = 8, filter = 'all';
let selected = null, drag = null, mode = 'strung', beads = [], targets = [];
let undoStack = [], redoStack = [], saveTimer, toastTimer, lastTime = 0, accumulator = 0, lastStoreTime = 0;
const STORAGE = 'bead-atelier.draft.v1', SAVES = 'bead-atelier.collection.v1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let storageAvailable = true;
function toast(message) {
 $('toast').textContent = message; $('toast').classList.add('visible');
 clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('toast').classList.remove('visible'),3000);
}
function makeId(){return 'b'+Date.now().toString(36)+(++serial).toString(36);}
function snapshot() {
 return {version:1,name:$('design-name').value.trim()||'未命名搭配',mode,beads:beads.map(b=>({id:b.id,material:b.material,size:b.size,x:b.body.position.x,y:b.body.position.y}))};
}
function validateDesign(data) {
 if(!data || data.version!==1 || !Array.isArray(data.beads) || data.beads.length>MAX_BEADS || !['loose','strung'].includes(data.mode) || typeof data.name!=='string' || data.name.length>40) throw Error('这不是有效的珠间搭配文件');
 const ids = new Set();
 const valid = data.beads.map(b=>{
  if(!b || typeof b.material!=='string' || !byId[b.material] || !SIZES.includes(b.size) || typeof b.id!=='string' || b.id.length>100 || ids.has(b.id) || !Number.isFinite(b.x)||!Number.isFinite(b.y) || Math.abs(b.x)>10000||Math.abs(b.y)>10000) throw Error('搭配文件中的珠子数据无效');
  ids.add(b.id); return {id:b.id,material:b.material,size:b.size,x:b.x,y:b.y};
 });
 return {version:1,name:data.name.trim()||'未命名搭配',mode:data.mode,beads:valid};
}
function checkpoint(before=snapshot()){undoStack.push(before);if(undoStack.length>60)undoStack.shift();redoStack=[];updateHistory();}
function updateHistory(){$('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;}
function persist() {
 try{localStorage.setItem(STORAGE,JSON.stringify(snapshot()));storageAvailable=true;$('autosave-status').textContent='草稿已保存在此浏览器';}
 catch{storageAvailable=false;$('autosave-status').textContent='浏览器存储不可用，请导出搭配文件';}
}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(persist,600);}
function ringLayout(items) {
 const n=items.length, radii=items.map(b=>b.size/2), gap=.12;
 if(!n)return {radius:0,points:[]};
 if(n===1)return {radius:0,points:[{x:0,y:0}]};
 if(n===2){const r=(radii[0]+radii[1]+gap)/2;return {radius:r,points:[{x:0,y:-r},{x:0,y:r}]};}
 const chords=radii.map((r,i)=>r+radii[(i+1)%n]+gap);
 let lo=Math.max(...chords)/2,hi=lo*2;
 const sum=R=>chords.reduce((v,c)=>v+2*Math.asin(Math.min(1,c/(2*R))),0);
 while(sum(hi)>TAU)hi*=2;
 for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(sum(mid)>TAU)lo=mid;else hi=mid;}
 const radius=(lo+hi)/2;let angle=-Math.PI/2;
 const points=chords.map(c=>{const p={x:radius*Math.cos(angle),y:radius*Math.sin(angle)};angle+=2*Math.asin(Math.min(1,c/(2*radius)));return p;});
 return {radius,points};
}
function relayout() {
 const layout=ringLayout(beads), biggest=Math.max(6,...beads.map(b=>b.size))/2;
 ringRadius=layout.radius;const nextScale=Math.min(5.3,(TRAY_RADIUS-22)/(ringRadius+biggest||1));
 beads.forEach(b=>{
  const radius=b.size/2*nextScale;
  if(b.radius)Body.scale(b.body,radius/b.radius,radius/b.radius);
  b.radius=radius;b.body.frictionAir=.033;
 });
 scale=nextScale;targets=layout.points.map(p=>({x:CENTER+p.x*scale,y:CENTER+p.y*scale}));
 beads.forEach(b=>{keepInside(b);if(mode==='loose')Matter.Sleeping.set(b.body,false);});
}
function createBead(data) {
 const b={id:data.id||makeId(),material:data.material,size:data.size,radius:data.size/2*scale};
 b.body=Bodies.circle(data.x??CENTER,data.y??CENTER,b.radius,{restitution:.36,friction:.06,frictionStatic:.1,frictionAir:.033,density:.0015,sleepThreshold:45});
 Composite.add(engine.world,b.body);return b;
}
function endDrag(cancel=false) {
 if(!drag)return;const d=drag;drag=null;
 try{if(canvas.hasPointerCapture(d.pointerId))canvas.releasePointerCapture(d.pointerId);}catch{}
 const b=beads.find(b=>b.id===d.id);
 if(b){Body.setStatic(b.body,false);if(mode==='loose')Body.setVelocity(b.body,cancel?{x:0,y:0}:d.velocity);}
 if(!cancel&&d.moved&&mode==='strung'&&b){
  const targetAngle=(Math.atan2(b.body.position.y-CENTER,b.body.position.x-CENTER)+Math.PI/2+TAU)%TAU;
  const slots=targets.map(p=>(Math.atan2(p.y-CENTER,p.x-CENTER)+Math.PI/2+TAU)%TAU);
  let nearest=0,distance=Infinity;
  slots.forEach((a,i)=>{const diff=Math.abs(a-targetAngle),dist=Math.min(diff,TAU-diff);if(dist<distance){distance=dist;nearest=i;}});
  const old=beads.indexOf(b);beads.splice(old,1);beads.splice(nearest,0,b);relayout();
 }
 updateUI();scheduleSave();
}
function applyDesign(data,{record=false,animate=false}={}) {
 const valid=validateDesign(data);if(record)checkpoint();endDrag(true);
 Composite.clear(engine.world,false);Engine.clear(engine);
 beads=valid.beads.map(createBead);mode=valid.mode;selected=null;$('design-name').value=valid.name;
 relayout();if(mode==='strung'&&!animate)beads.forEach((b,i)=>Body.setPosition(b.body,targets[i]));
 updateUI();scheduleSave();
}
function presetDesign(p) {return {version:1,name:p.name,mode:'strung',beads:p.beads.map(b=>({...b,id:makeId(),x:CENTER,y:CENTER}))};}
function keepInside(b) {
 const p=b.body.position,dx=p.x-CENTER,dy=p.y-CENTER,len=Math.hypot(dx,dy),limit=TRAY_RADIUS-b.radius-3;
 if(len>limit&&len>0){
  const nx=dx/len,ny=dy/len,v=b.body.velocity,out=v.x*nx+v.y*ny;
  Body.setPosition(b.body,{x:CENTER+nx*limit,y:CENTER+ny*limit});
  if(out>0)Body.setVelocity(b.body,{x:v.x-1.3*out*nx,y:v.y-1.3*out*ny});
 }
}
function setMode(next) {
 if(next===mode)return;checkpoint();endDrag(true);mode=next;
 if(mode==='loose')beads.forEach((b,i)=>{
  Body.setStatic(b.body,false);
  const a=Math.atan2(b.body.position.y-CENTER,b.body.position.x-CENTER)+.35;
  Body.setVelocity(b.body,{x:Math.cos(a)*(1.6+i%3*.35),y:Math.sin(a)*(1.6+i%3*.35)});
  Matter.Sleeping.set(b.body,false);
 });
 else beads.forEach(b=>{Body.setVelocity(b.body,{x:0,y:0});Body.setAngularVelocity(b.body,0);});
 updateUI();scheduleSave();
}
function addBead(material) {
 if(beads.length>=MAX_BEADS){toast('盘中最多容纳 60 颗珠子');return;}
 checkpoint();endDrag(true);
 const a=Math.random()*TAU,r=165+Math.random()*35;
 const b=createBead({material,size:addSize,x:CENTER+Math.cos(a)*r,y:CENTER+Math.sin(a)*r});
 beads.push(b);selected=b.id;relayout();updateUI();scheduleSave();
}
function removeSelected() {
 const b=beads.find(b=>b.id===selected);if(!b)return;
 checkpoint();endDrag(true);const i=beads.indexOf(b);Composite.remove(engine.world,b.body);beads.splice(i,1);selected=beads[Math.min(i,beads.length-1)]?.id??null;relayout();updateUI();scheduleSave();
}
function moveSelected(direction) {
 const i=beads.findIndex(b=>b.id===selected);if(i<0||beads.length<2)return;
 checkpoint();endDrag(true);const j=(i+direction+beads.length)%beads.length;
 const [b]=beads.splice(i,1);beads.splice(j,0,b);relayout();updateUI();scheduleSave();
}
function drawBead(context,material,x,y,r,rotation=0,isSelected=false) {
 context.save();context.translate(x,y);
 if(isSelected){context.beginPath();context.arc(0,0,r+5,0,TAU);context.strokeStyle='#7c997c';context.lineWidth=1.7;context.stroke();}
 context.shadowColor='#31412938';context.shadowBlur=r*.32;context.shadowOffsetX=r*.08;context.shadowOffsetY=r*.18;
 context.beginPath();context.arc(0,0,r*.97,0,TAU);context.fillStyle=material.color;context.fill();
 context.shadowColor='transparent';
 context.rotate(rotation);
 if(atlasReady){const [sx,sy,sw,sh]=material.crop;context.drawImage(atlas,sx-2,sy-2,sw+4,sh+4,-r,-r,r*2,r*2);}
 else{const grad=context.createRadialGradient(-r*.35,-r*.4,1,0,0,r);grad.addColorStop(0,'#ffffff');grad.addColorStop(.25,material.color);grad.addColorStop(1,'#5f6961');context.fillStyle=grad;context.beginPath();context.arc(0,0,r,0,TAU);context.fill();}
 context.restore();
}
function paintSwatch(target,material,radius=target.width*.35){
 const c=target.getContext('2d');c.clearRect(0,0,target.width,target.height);drawBead(c,material,target.width/2,target.height/2,radius);
}
function renderCatalog(){
 const grid=$('material-grid');grid.replaceChildren();
 MATERIALS.filter(m=>filter==='all'||m.kind===filter).forEach(m=>{
  const button=document.createElement('button');button.className='material-card';button.setAttribute('aria-label','添加 '+m.name+' '+addSize+' 毫米');
  const swatch=document.createElement('canvas');swatch.width=120;swatch.height=120;swatch.setAttribute('aria-hidden','true');paintSwatch(swatch,m,45);
  const label=document.createElement('strong');label.textContent=m.name;
  const plus=document.createElement('span');plus.className='add-sign';plus.textContent='+';
  button.append(swatch,label,plus);button.addEventListener('click',()=>addBead(m.id));grid.append(button);
 });
}
function renderSizeButtons(target,value,onChange){
 target.replaceChildren();SIZES.forEach(size=>{
  const button=document.createElement('button');button.textContent=size+' mm';button.className=size===value?'active':'';
  button.setAttribute('aria-pressed',String(size===value));button.addEventListener('click',()=>onChange(size));target.append(button);
 });
}
function renderSequence(){
 const sequence=$('sequence');sequence.replaceChildren();
 beads.forEach((b,i)=>{
  const button=document.createElement('button');button.className=selected===b.id?'selected':'';
  button.setAttribute('aria-label','第 '+(i+1)+' 颗, '+byId[b.material].name+', '+b.size+' 毫米');button.setAttribute('aria-pressed',String(selected===b.id));
  const swatch=document.createElement('canvas');swatch.width=64;swatch.height=64;swatch.setAttribute('aria-hidden','true');paintSwatch(swatch,byId[b.material],22);
  button.append(swatch);button.addEventListener('click',()=>{selected=b.id;updateSelection();renderSequence();});sequence.append(button);
 });
 if(!beads.length){const p=document.createElement('p');p.className='muted';p.textContent='挑选第一颗珠子吧';sequence.append(p);}
}
function updateSelection() {
 const b=beads.find(b=>b.id===selected);
 $('selection-empty').hidden=!!b;$('selection-editor').hidden=!b;
 $('selection-index').textContent=b?'第 '+(beads.indexOf(b)+1)+' 颗 / '+beads.length:'选择一颗珠子';
 if(!b)return;
 const m=byId[b.material];$('selected-name').textContent=m.name;$('selected-detail').textContent=b.size+' mm · '+m.detail;
 paintSwatch($('selected-preview'),m,44);
 renderSizeButtons($('edit-sizes'),b.size,size=>{
  if(b.size===size)return;checkpoint();endDrag(true);b.size=size;relayout();updateUI();scheduleSave();
 });
}
function updateUI() {
 $('bead-count').textContent=beads.length;
 const avg=beads.length?beads.reduce((sum,b)=>sum+b.size,0)/beads.length:0;
 $('inner-size').replaceChildren(document.createTextNode(beads.length>=3?Math.max(0,(TAU*ringRadius-Math.PI*avg)/10).toFixed(1):'—'));
 const unit=document.createElement('small');unit.textContent=' cm';$('inner-size').append(unit);
 $('mode-strung').classList.toggle('active',mode==='strung');$('mode-loose').classList.toggle('active',mode==='loose');
 $('mode-strung').setAttribute('aria-pressed',String(mode==='strung'));$('mode-loose').setAttribute('aria-pressed',String(mode==='loose'));
 $('mode-label').textContent=mode==='strung'?'成串中':'散珠中';
 $('toggle-mode').textContent=mode==='strung'?'散开玩一会  ⤢':'收拢成串  ◌';
 $('interaction-hint').textContent=mode==='strung'?'✥  拖动珠子换位 · 点击珠子编辑':'✥  拖动珠子，感受它们轻轻碰撞';
 $('tray-caption').style.opacity=mode==='strung'&&beads.length>5?'1':beads.length===0?'1':'0';
 $('tray-caption-text').textContent=beads.length?'一颗一颗，都是你的选择':'挑选一颗，开始搭配';
 $('toggle-mode').disabled=!beads.length;
 $('export-png').disabled=!beads.length;
 updateSelection();renderSequence();updateHistory();
}
function drawTray(context){
 context.save();
 context.clearRect(0,0,640,640);
 context.shadowColor='#5d684c23';context.shadowBlur=23;context.shadowOffsetY=13;
 context.beginPath();context.arc(CENTER,CENTER,281,0,TAU);
 const rim=context.createLinearGradient(90,80,560,570);rim.addColorStop(0,'#eeeee2');rim.addColorStop(.48,'#d6dac7');rim.addColorStop(1,'#cbd0b9');context.fillStyle=rim;context.fill();context.shadowColor='transparent';
 context.beginPath();context.arc(CENTER,CENTER,276,0,TAU);context.strokeStyle='#f8f9ef';context.lineWidth=2;context.stroke();
 const inner=context.createRadialGradient(290,270,70,CENTER,CENTER,260);inner.addColorStop(0,'#e6e9d8');inner.addColorStop(.88,'#e0e4d0');inner.addColorStop(1,'#c0c8af');
 context.beginPath();context.arc(CENTER,CENTER,260,0,TAU);context.fillStyle=inner;context.fill();
 context.strokeStyle='#a5b19240';context.lineWidth=1;context.stroke();
 // Subtle grain on the functional tray surface.
 context.save();context.beginPath();context.arc(CENTER,CENTER,255,0,TAU);context.clip();context.fillStyle='#5b704a08';
 for(let i=0;i<1800;i++){const x=(i*137.137)%640,y=(i*73.673)%640;context.fillRect(x,y,.8,.8);}context.restore();
 context.beginPath();context.arc(CENTER,CENTER,235,0,TAU);context.strokeStyle='#b5bda42c';context.stroke();
 context.restore();
}
function render(context=ctx,{exporting=false}={}) {
 context.save();context.scale(context.canvas.width/640,context.canvas.width/640);drawTray(context);
 if(mode==='strung'&&beads.length>2){
  context.beginPath();beads.forEach((b,i)=>{const p=exporting?targets[i]:b.body.position;i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y);});context.closePath();context.strokeStyle='#b6ac8980';context.lineWidth=1;context.stroke();
 }
 beads.forEach((b,i)=>{
  if(drag&&b.id===drag.id)return;
  const p=exporting&&mode==='strung'?targets[i]:b.body.position;
  drawBead(context,byId[b.material],p.x,p.y,b.radius,mode==='loose'?b.body.angle*.15:0,!exporting&&selected===b.id);
 });
 if(drag){const b=beads.find(b=>b.id===drag.id);if(b)drawBead(context,byId[b.material],b.body.position.x,b.body.position.y,b.radius,0,!exporting);}
 context.restore();
}
function tick(now){
 const elapsed=Math.min(now-lastTime||16.67,50);lastTime=now;
 if(mode==='loose'){
  accumulator+=elapsed;let steps=0;
  while(accumulator>=1000/60&&steps<3){Engine.update(engine,1000/60);beads.forEach(keepInside);accumulator-=1000/60;steps++;}
  if(now-lastStoreTime>3000&&!drag){persist();lastStoreTime=now;}
 }else{
  accumulator=0;const lerp=reducedMotion?1:1-Math.exp(-elapsed/90);
  beads.forEach((b,i)=>{if(drag?.id===b.id)return;const p=b.body.position,t=targets[i];if(!t)return;Body.setPosition(b.body,{x:p.x+(t.x-p.x)*lerp,y:p.y+(t.y-p.y)*lerp});Body.setVelocity(b.body,{x:0,y:0});});
 }
 render();requestAnimationFrame(tick);
}
function pointerPosition(event){const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*640,y:(event.clientY-rect.top)/rect.height*640};}
canvas.addEventListener('pointerdown',event=>{
 if(event.button!==0||drag)return;const p=pointerPosition(event);
 let b=[...beads].reverse().find(b=>Math.hypot(b.body.position.x-p.x,b.body.position.y-p.y)<=b.radius+7);
 selected=b?.id??null;updateSelection();renderSequence();if(!b)return;
 event.preventDefault();drag={before:snapshot(),id:b.id,pointerId:event.pointerId,start:p,last:p,lastAt:event.timeStamp,moved:false,velocity:{x:0,y:0},offset:{x:b.body.position.x-p.x,y:b.body.position.y-p.y}};
 canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});Body.setStatic(b.body,true);
});
canvas.addEventListener('pointermove',event=>{
 if(!drag||drag.pointerId!==event.pointerId)return;
 const p=pointerPosition(event),b=beads.find(b=>b.id===drag.id);if(!b)return;
 if(!drag.moved&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>4){checkpoint(drag.before);drag.moved=true;}
 const dt=Math.max(8,event.timeStamp-drag.lastAt);
 drag.velocity={x:Math.max(-6,Math.min(6,(p.x-drag.last.x)*16/dt)),y:Math.max(-6,Math.min(6,(p.y-drag.last.y)*16/dt))};
 const next={x:p.x+drag.offset.x,y:p.y+drag.offset.y};
 Body.setPosition(b.body,next);keepInside(b);drag.last=p;drag.lastAt=event.timeStamp;
 if(mode==='loose')beads.forEach(other=>Matter.Sleeping.set(other.body,false));
});
canvas.addEventListener('pointerup',e=>{if(drag?.pointerId===e.pointerId)endDrag();});
canvas.addEventListener('pointercancel',()=>endDrag(true));
canvas.addEventListener('lostpointercapture',()=>{if(drag)endDrag(true);});
window.addEventListener('blur',()=>endDrag(true));
document.addEventListener('visibilitychange',()=>{lastTime=performance.now();accumulator=0;if(document.hidden){endDrag(true);persist();}});
function getSaves(){try{const value=JSON.parse(localStorage.getItem(SAVES)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
function updateSaveCount(){$('save-count').textContent=getSaves().length;}
function renderSaves(){
 const list=$('saves-list'),saves=getSaves();list.replaceChildren();
 if(!saves.length){const p=document.createElement('p');p.className='empty-saves';p.textContent='还没有保存的搭配，先串出喜欢的一串吧。';list.append(p);return;}
 saves.forEach(saved=>{
  const card=document.createElement('div');card.className='saved-card';
  const info=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');
  title.textContent=saved.design?.name||'未命名搭配';detail.textContent=(saved.design?.beads?.length??0)+' 颗 · '+new Date(saved.savedAt).toLocaleDateString('zh-CN');
  info.append(title,detail);
  const load=document.createElement('button');load.className='button';load.textContent='载入';load.addEventListener('click',()=>{try{applyDesign(saved.design,{record:true});$('saves-dialog').close();toast('已载入搭配，可撤销回到刚才的作品');}catch(e){toast(e.message);}});
  const remove=document.createElement('button');remove.className='text-button';remove.textContent='删除';remove.setAttribute('aria-label','删除保存的 '+title.textContent);remove.addEventListener('click',()=>{
   if(!confirm('删除这份已保存的搭配？当前工作台不受影响。'))return;
   try{localStorage.setItem(SAVES,JSON.stringify(getSaves().filter(s=>s.key!==saved.key)));renderSaves();updateSaveCount();toast('已删除保存的搭配');}catch{toast('删除失败，浏览器存储不可用');}
  });
  card.append(info,load,remove);list.append(card);
 });
}
$('save-design').addEventListener('click',()=>{
 if(!beads.length){toast('先挑选几颗喜欢的珠子吧');return;}
 const saved=getSaves();if(saved.length>=40){toast('最多保存 40 份，可先导出或删除旧搭配');return;}
 saved.unshift({key:makeId(),savedAt:new Date().toISOString(),design:snapshot()});
 try{localStorage.setItem(SAVES,JSON.stringify(saved));updateSaveCount();persist();toast('已保存到「我的搭配」');}catch{toast('保存失败，请导出搭配文件留存');}
});
$('open-saves').addEventListener('click',()=>{renderSaves();$('saves-dialog').showModal();});
$('help-button').addEventListener('click',()=>$('help-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('size-info').addEventListener('click',()=>toast('参考内围按圆环中心线减去平均珠径估算；混合珠径、绳结与松紧会影响实物，请勿作为精确手围。'));
$('mode-strung').addEventListener('click',()=>setMode('strung'));
$('mode-loose').addEventListener('click',()=>setMode('loose'));
$('toggle-mode').addEventListener('click',()=>setMode(mode==='strung'?'loose':'strung'));
$('clear').addEventListener('click',()=>{if(beads.length&&confirm('清空盘中所有珠子？清空后可以撤销。')){checkpoint();endDrag(true);Composite.clear(engine.world,false);beads=[];selected=null;relayout();updateUI();scheduleSave();}});
function undo(){if(!undoStack.length)return;const s=undoStack.pop();redoStack.push(snapshot());applyDesign(s);updateHistory();}
function redo(){if(!redoStack.length)return;const s=redoStack.pop();undoStack.push(snapshot());applyDesign(s);updateHistory();}
$('undo').addEventListener('click',undo);$('redo').addEventListener('click',redo);
$('remove').addEventListener('click',removeSelected);
$('duplicate').addEventListener('click',()=>{
 const b=beads.find(b=>b.id===selected);if(!b)return;
 if(beads.length>=MAX_BEADS){toast('盘中最多容纳 60 颗珠子');return;}
 checkpoint();endDrag(true);const copy=createBead({material:b.material,size:b.size,x:b.body.position.x+10,y:b.body.position.y+10});
 beads.splice(beads.indexOf(b)+1,0,copy);selected=copy.id;relayout();updateUI();scheduleSave();
});
$('move-prev').addEventListener('click',()=>moveSelected(-1));$('move-next').addEventListener('click',()=>moveSelected(1));
let nameBefore='';
$('design-name').addEventListener('focus',()=>{nameBefore=$('design-name').value;});
$('design-name').addEventListener('change',()=>{const now=$('design-name').value;if(now!==nameBefore){$('design-name').value=nameBefore;checkpoint();$('design-name').value=now;scheduleSave();}});
$('design-name').addEventListener('input',scheduleSave);
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
 filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});renderCatalog();
}));
renderSizeButtons($('add-sizes'),addSize,size=>{addSize=size;renderSizeButtons($('add-sizes'),addSize,chooseSize);renderCatalog();});
function chooseSize(size){addSize=size;renderSizeButtons($('add-sizes'),addSize,chooseSize);renderCatalog();}
PRESETS.forEach(p=>{
 const button=document.createElement('button');button.className='preset';button.setAttribute('aria-label','使用配色 '+p.name);
 const title=document.createElement('span');title.textContent=p.name;const colors=document.createElement('span');colors.className='preset-colors';
 p.materials.forEach(id=>{const dot=document.createElement('i');dot.style.background=byId[id].color;colors.append(dot);});
 button.append(title,colors);button.addEventListener('click',()=>{applyDesign(presetDesign(p),{record:true});toast('已换上「'+p.name+'」，可以撤销');});$('presets').append(button);
});
function download(blob,name) {
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function filename(){return ($('design-name').value.trim()||'珠间搭配').replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,40);}
$('export-json').addEventListener('click',()=>{download(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),filename()+'.json');toast('搭配文件已导出');});
$('import-json').addEventListener('change',async event=>{
 const file=event.target.files[0];if(!file)return;
 try{if(file.size>200000)throw Error('文件过大，请选择珠间导出的搭配文件');const data=validateDesign(JSON.parse(await file.text()));applyDesign(data,{record:true});toast('搭配已导入，可撤销');}
 catch(error){toast(error instanceof SyntaxError?'文件格式不正确，请选择搭配 JSON 文件':error.message);}
 event.target.value='';
});
$('export-png').addEventListener('click',()=>{
 if(!beads.length)return;endDrag(true);
 const out=document.createElement('canvas');out.width=1600;out.height=1760;const c=out.getContext('2d');
 c.fillStyle='#f4f4ee';c.fillRect(0,0,1600,1760);
 const scene=document.createElement('canvas');scene.width=1600;scene.height=1600;render(scene.getContext('2d'),{exporting:true});c.drawImage(scene,0,0);
 c.fillStyle='#214d43';c.textAlign='center';c.font='40px "Microsoft YaHei", sans-serif';c.fillText($('design-name').value.trim()||'我的搭配',800,1610);
 c.fillStyle='#7b8078';c.font='24px "Microsoft YaHei", sans-serif';c.fillText('珠间 · '+beads.length+' 颗珠子 · '+(mode==='strung'?'成串搭配':'散珠搭配'),800,1670);
 c.font='18px "Microsoft YaHei", sans-serif';c.fillText('材质为视觉模拟，实物色泽与尺寸可能不同',800,1718);
 out.toBlob(blob=>{if(blob){download(blob,filename()+'.png');toast('搭配图已导出');}else toast('图片导出失败，请重试');},'image/png');
});
document.addEventListener('keydown',e=>{
 if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextArea||document.querySelector('dialog[open]'))return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
 if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();removeSelected();}
 if(document.activeElement===canvas&&selected&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();moveSelected(e.key==='ArrowLeft'?-1:1);}
});
window.addEventListener('pagehide',persist);
atlas.onload=()=>{atlasReady=true;renderCatalog();renderSequence();updateSelection();};
atlas.onerror=()=>toast('珠子纹理加载失败，已使用简化预览');
if(atlas.complete&&atlas.naturalWidth)atlasReady=true;
let initial=presetDesign(PRESETS[0]);
try{const draft=localStorage.getItem(STORAGE);if(draft)initial=validateDesign(JSON.parse(draft));}
catch{toast('未能恢复旧草稿，已打开示例搭配');}
applyDesign(initial);renderCatalog();updateSaveCount();requestAnimationFrame(tick);
// Optional WebMCP support uses the same app state and actions as the visible controls.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const tools=[
  {name:'read_bracelet',description:'Read the current bracelet and bead order.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>snapshot()},
  {name:'add_bracelet_beads',description:'Add up to 20 beads of one material and size to the current bracelet.',inputSchema:{type:'object',properties:{material:{type:'string',enum:MATERIALS.map(m=>m.id)},size:{type:'integer',enum:SIZES},count:{type:'integer',minimum:1,maximum:20}},required:['material','size','count'],additionalProperties:false},annotations:{readOnlyHint:false},execute:(input)=>{
   if(!input||typeof input.material!=='string'||!byId[input.material]||!SIZES.includes(input.size)||!Number.isInteger(input.count)||input.count<1||input.count>20||beads.length+input.count>MAX_BEADS)throw Error('Invalid bead parameters or capacity exceeded');
   const oldSize=addSize;addSize=input.size;for(let i=0;i<input.count;i++)addBead(input.material);addSize=oldSize;return snapshot();
  }}
 ];
 for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
})();