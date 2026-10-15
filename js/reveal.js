// 稀有卡揭曉動畫（使用者分鏡、3D 投影粒子）：紅卡 1.6 秒、紫卡 2.0 秒、黑卡 2.4 秒、啦啦隊 2.3 秒
// 紅紫黑播完後接「人物破框」後半段；教練沿用紅紫卡；啦啦隊播完停在展示畫面
import { cardSVG } from './card.js';
let stage, bg, fx, fxb, world, cardEl, front, rim, title, shadowEl, backimg, flashDiv, ctxB, ctxF, ctxFB;
let W = 0, H = 0, SC = 1, CW = 200, ECO = false;
const DPR = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), lerp=(a,b,t)=>a+(b-a)*t, seg=(t,a,b)=>clamp((t-a)/(b-a),0,1);
const ease={out:t=>1-Math.pow(1-t,3), in:t=>t*t*t, io:t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2, back:t=>{const c=1.9;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2)}};
// 發光圓點貼圖（預先畫好，疊加混合）
const sprites={};
function sprite(col){ if(sprites[col]) return sprites[col]; const c=document.createElement('canvas'); c.width=c.height=64; const g=c.getContext('2d'); const gr=g.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0,'#fff'); gr.addColorStop(.18,col); gr.addColorStop(.45,col.replace(')',',.35)').replace('rgb','rgba')); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64); return sprites[col]=c; }
// 3D 投影：z 越大越遠
const FOCAL=520; function proj(x,y,z){ const f=FOCAL/(FOCAL+z); return [W/2+x*f*SC, H*.48+y*f*SC, f]; }
let P=[];
function emit(o){ if(ECO&&Math.random()<.5) return; P.push(Object.assign({x:0,y:0,z:0,vx:0,vy:0,vz:0,g:0,drag:1,life:1,age:0,size:6,col:'rgb(255,120,40)',trail:0,att:null},o)); }
function stepParticles(ctx,dt){
  ctx.globalCompositeOperation='lighter';
  for(const p of P){ p.age+=dt;
    if(p.att){ const k=p.att; p.vx+=(-p.x)*k*dt; p.vy+=(-p.y)*k*dt; p.vz+=(-p.z)*k*dt; }
    p.vy+=p.g*dt; p.vx*=Math.pow(p.drag,dt*60); p.vy*=Math.pow(p.drag,dt*60); p.vz*=Math.pow(p.drag,dt*60);
    const ox=p.x,oy=p.y,oz=p.z; p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
    if(p.z<-FOCAL+40) p.age=p.life;
    const a=clamp(1-p.age/p.life,0,1); if(a<=0) continue;
    const [sx,sy,f]=proj(p.x,p.y,p.z), s=p.size*f*SC;
    if(p.trail){ const [tx,ty]=proj(ox-p.vx*p.trail,oy-p.vy*p.trail,oz-p.vz*p.trail); ctx.strokeStyle=p.col.replace('rgb','rgba').replace(')',','+(a*.8)+')'); ctx.lineWidth=Math.max(1,s*.35); ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(sx,sy); ctx.stroke(); }
    if(p.shape==='petal'){ ctx.save(); ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=a*.95; ctx.translate(sx,sy); ctx.rotate(p.age*p.spin+p.r0); ctx.scale(1,Math.abs(Math.cos(p.age*p.flut+p.r0))*.8+.2); const g=ctx.createLinearGradient(-s,0,s,0); g.addColorStop(0,'#FFE6F0'); g.addColorStop(1,p.col); ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(0,0,s*1.1,s*.6,0,0,6.28); ctx.fill(); ctx.restore(); ctx.globalCompositeOperation='lighter'; continue; }
    if(p.shape==='heart'){ ctx.save(); ctx.globalAlpha=a; ctx.translate(sx,sy); ctx.scale(s/16,s/16); ctx.fillStyle=p.col; ctx.shadowColor=p.col; ctx.shadowBlur=12; ctx.beginPath(); ctx.moveTo(0,5); ctx.bezierCurveTo(-14,-6,-6,-16,0,-8); ctx.bezierCurveTo(6,-16,14,-6,0,5); ctx.fill(); ctx.restore(); continue; }
    ctx.globalAlpha=a; ctx.drawImage(sprite(p.col),sx-s,sy-s,s*2,s*2); ctx.globalAlpha=1; }
  P=P.filter(p=>p.age<p.life);
  ctx.globalCompositeOperation='source-over';
}
// 3D 圓環（可傾斜）：在平面上取點投影
function ring3d(ctx,r,tiltX,tiltZ,col,width,alpha,z0=0){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle=col; ctx.globalAlpha=alpha; ctx.lineWidth=width; ctx.shadowColor=col; ctx.shadowBlur=18; ctx.beginPath();
  for(let i=0;i<=72;i++){ const t=i/72*Math.PI*2; let x=Math.cos(t)*r, y=Math.sin(t)*r, z=0; const cy=Math.cos(tiltX), sy=Math.sin(tiltX); [y,z]=[y*cy-z*sy,y*sy+z*cy]; const cz=Math.cos(tiltZ), sz=Math.sin(tiltZ); [x,y]=[x*cz-y*sz,x*sz+y*cz]; const [px,py]=proj(x,y,z+z0); i?ctx.lineTo(px,py):ctx.moveTo(px,py); }
  ctx.stroke(); ctx.restore(); }
function heart3d(ctx,scale,prog,tiltX,tiltY,col,width,alpha,fill){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle=col; ctx.lineWidth=width; ctx.globalAlpha=alpha; ctx.shadowColor=col; ctx.shadowBlur=22; ctx.beginPath(); const N=120, M=Math.max(2,Math.floor(N*prog)); let head=null;
  for(let i=0;i<=M;i++){ const t=i/N*Math.PI*2; let x=16*Math.pow(Math.sin(t),3)*scale, y=-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*scale, z=0;
    const cy=Math.cos(tiltX), sy=Math.sin(tiltX); [y,z]=[y*cy-z*sy,y*sy+z*cy]; const cyy=Math.cos(tiltY), syy=Math.sin(tiltY); [x,z]=[x*cyy+z*syy,-x*syy+z*cyy]; const [px,py]=proj(x,y-scale*2,z); i?ctx.lineTo(px,py):ctx.moveTo(px,py); head=[px,py]; }
  if(fill&&prog>=1){ ctx.closePath(); ctx.fillStyle=fill; ctx.fill(); } ctx.stroke(); ctx.restore(); return head; }
function glow(ctx,x,y,r,stops,op='lighter'){ ctx.save(); ctx.globalCompositeOperation=op; const g=ctx.createRadialGradient(x,y,0,x,y,r); stops.forEach(([o,c])=>g.addColorStop(o,c)); ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2); ctx.restore(); }
function rays(ctx,x,y,n,len,rot,col,alpha,w=.07){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.translate(x,y); ctx.rotate(rot); for(let i=0;i<n;i++){ ctx.rotate(Math.PI*2/n); const g=ctx.createLinearGradient(0,0,len,0); g.addColorStop(0,col.replace(')',','+alpha+')').replace('rgb','rgba')); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(len,-len*w); ctx.lineTo(len,len*w); ctx.closePath(); ctx.fill(); } ctx.restore(); }
function bolt(ctx,x0,y0,x1,y1,col,w,jit,alpha){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle=col; ctx.globalAlpha=alpha; ctx.lineWidth=w; ctx.shadowColor=col; ctx.shadowBlur=14; ctx.beginPath(); ctx.moveTo(x0,y0); const n=9; for(let i=1;i<=n;i++){ const k=i/n; ctx.lineTo(lerp(x0,x1,k)+(i<n?(Math.random()-.5)*jit:0),lerp(y0,y1,k)+(i<n?(Math.random()-.5)*jit:0)); } ctx.stroke(); ctx.lineWidth=w*.35; ctx.strokeStyle='#fff'; ctx.stroke(); ctx.restore(); }
function streak(ctx,x,y,len,thick,col,alpha){ ctx.save(); ctx.globalCompositeOperation='lighter'; const g=ctx.createLinearGradient(x-len,0,x+len,0); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(.5,col.replace(')',','+alpha+')').replace('rgb','rgba')); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.fillRect(x-len,y-thick/2,len*2,thick); ctx.fillStyle=`rgba(255,255,255,${alpha})`; ctx.fillRect(x-len*.4,y-thick*.12,len*.8,thick*.24); ctx.restore(); }
function pillars(ctx,cx,n,spread,h,col,alpha,t){ ctx.save(); ctx.globalCompositeOperation='lighter'; for(let i=0;i<n;i++){ const x=cx+(i-(n-1)/2)*spread, w=10+8*Math.sin(t*4+i); const g=ctx.createLinearGradient(0,H,0,H-h); g.addColorStop(0,col.replace(')',','+alpha+')').replace('rgb','rgba')); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.fillRect(x-w/2,H-h,w,h); } ctx.restore(); }
function aurora(ctx,cx,cy,t,cols,alpha){ ctx.save(); ctx.globalCompositeOperation='lighter'; cols.forEach((col,i)=>{ ctx.strokeStyle=col.replace(')',','+alpha+')').replace('rgb','rgba'); ctx.lineWidth=34-i*8; ctx.shadowColor=col; ctx.shadowBlur=50; ctx.filter='blur(6px)'; ctx.beginPath(); for(let k=0;k<=40;k++){ const u=k/40, x=cx-W*.36+u*W*.72, y=cy-H*.18+Math.sin(u*4.2+t*(1.4+i*.5)+i*1.7)*H*(.06+i*.025)+Math.sin(u*9+t*3)*H*.012; k?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.globalAlpha=Math.sin(Math.PI*Math.min(1,1)); ctx.stroke(); ctx.filter='none'; }); ctx.restore(); }
// 卡片／鏡頭控制
function setCard({x=0,y=0,z=0,rx=0,ry=0,rz=0,s=1,op=1}){ cardEl.style.transform=`translate3d(${x}px,${y}px,${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s})`; cardEl.style.opacity=op;
  const spec=Math.abs(Math.sin(ry*Math.PI/180)); cardEl.querySelectorAll('.spec').forEach(e=>{ e.style.setProperty('--so',(.15+spec*.75).toFixed(2)); e.style.setProperty('--sa',(100+ry*.4)+'deg'); }); }
function setCam({z=0,rx=0,rz=0,sx=0,sy=0}){ world.style.transform=`translate(${sx}px,${sy}px) translateZ(${z}px) rotateX(${rx}deg) rotateZ(${rz}deg)`; fx.style.transform=bg.style.transform=fxb.style.transform=`translate(${sx}px,${sy}px) rotate(${rz}deg)`; }
function shake(t,a,b,amp){ if(t<a||t>b) return [0,0,0]; const k=1-(t-a)/(b-a); return [Math.sin(t*170)*amp*k, Math.cos(t*130)*amp*k*.7, Math.sin(t*90)*amp*.08*k]; }
function setTitle(t,a,b,text,cls,mode){ title.className='title '+cls; title.textContent=text; const k=seg(t,a,b); if(k<=0){ title.style.opacity=0; return; }
  const e=ease.back(k); title.style.opacity=clamp(k*2,0,1); title.style.transform=mode==='flip'?`perspective(500px) rotateX(${(1-e)*80}deg) scale(${lerp(1.6,1,e)})`:`scale(${lerp(1.8,1,e)})`; title.style.filter=mode==='blur'?`blur(${(1-k)*8}px)`:''; }
// 疊在卡片上的覆蓋層（閃光時用）


// ======================= 三套動畫 =======================
const DEMOS={
 red:{T:1.6, init(){ backimg.style.filter=''; rim.className='rim r-rim'; },
  frame(t,dt){
    const c=ctxF, cb=ctxB; cb.fillStyle=`rgba(0,0,0,${lerp(0,.85,seg(t,0,.1))})`; cb.clearRect(0,0,W,H); cb.fillRect(0,0,W,H);
    const [cx,cy]=proj(0,0,0);
    // 0–0.25 能量核心＋火星吸附
    if(t<.25){ if(Math.random()<.9) for(let i=0;i<4;i++){ const a=Math.random()*6.28, r=300+Math.random()*150, z=Math.random()*600-300; emit({x:Math.cos(a)*r,y:Math.sin(a)*r*.7,z,att:22,drag:.92,life:.35,size:5,col:'rgb(255,110,30)',trail:.05}); } }
    const coreK=seg(t,0,.25)*(1-seg(t,.25,.33)); if(coreK>0){ glow(c,cx,cy,90*coreK*SC,[[0,'rgba(255,240,200,.95)'],[.2,'rgba(255,90,20,.9)'],[.5,'rgba(140,10,0,.6)'],[1,'rgba(0,0,0,0)']]); rays(c,cx,cy,10,140*coreK*SC,t*3,'rgb(255,80,20)',.35*coreK); }
    // 0.25–0.55 燃燒圓環＋卡牌升起（殘影）
    if(t>=.25&&t<.6){ const k=ease.out(seg(t,.25,.55)); ring3d(c,lerp(30,330,k),0,0,'rgb(255,120,30)',lerp(14,2,k),1-k); ring3d(c,lerp(20,260,k),1.25,0,'rgb(255,200,90)',lerp(10,1,k),(1-k)*.9,0);
      for(let i=0;i<10;i++){ const a=Math.random()*6.28, r=lerp(30,300,k); emit({x:Math.cos(a)*r,y:Math.sin(a)*r,z:Math.random()*60-30,vy:-60-Math.random()*90,life:.45,size:7,col:Math.random()<.5?'rgb(255,90,20)':'rgb(255,190,70)',drag:.97}); } }
    const rise=ease.out(seg(t,.25,.55));
    if(t>=.27&&t<.55){ for(let g=1;g<=3;g++){ const kk=ease.out(seg(t-g*.035,.25,.55)); const [gx,gy]=proj(0,lerp(260,0,kk),lerp(500,0,kk)); c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=.22/g; c.fillStyle='rgb(255,50,10)'; const w=W*.31*FOCAL/(FOCAL+lerp(500,0,kk)); c.fillRect(gx-w/2,gy-w*.67,w,w*1.33); c.restore(); } }
    // 0.55–0.85 翻轉＋衝擊波
    const flipK=ease.io(seg(t,.55,.72)), ry=lerp(0,180,flipK);
    if(t>=.7&&t<.73&&!this.burst){ this.burst=1; for(let i=0;i<260;i++){ const a=Math.random()*6.28, el=(Math.random()-.5)*2.4, sp=380+Math.random()*700; emit({vx:Math.cos(a)*Math.cos(el)*sp,vy:Math.sin(el)*sp*.8,vz:Math.sin(a)*Math.cos(el)*sp,g:420,drag:.94,life:.7+Math.random()*.5,size:4+Math.random()*5,col:['rgb(255,220,140)','rgb(255,120,30)','rgb(255,60,20)'][i%3],trail:.03}); } }
    const sk=seg(t,.7,.95); if(sk>0&&sk<1){ ring3d(c,lerp(40,520,ease.out(sk)),0,0,'rgb(255,230,160)',lerp(18,1,sk),1-sk); ring3d(c,lerp(40,600,ease.out(sk)),1.35,0,'rgb(255,110,30)',lerp(22,1,sk),1-sk,40);
      rays(c,cx,cy,16,lerp(80,500,ease.out(sk))*SC,.3,'rgb(255,200,110)',.55*(1-sk),.05); glow(c,cx,cy,lerp(60,380,sk)*SC,[[0,`rgba(255,255,230,${1-sk})`],[.3,`rgba(255,170,60,${.8*(1-sk)})`],[1,'rgba(0,0,0,0)']]); }
    // 0.85–1.2 放大回彈；之後火星飄散
    let s=1; if(t>=.85&&t<1.2){ const k=seg(t,.85,1.2); s=k<.4?lerp(1,1.15,ease.out(k/.4)):lerp(1.15,1,ease.back((k-.4)/.6)); }
    if(t>1.0) if(Math.random()<.6) emit({x:(Math.random()-.5)*400,y:200,z:Math.random()*300-100,vy:-80-Math.random()*60,vx:(Math.random()-.5)*30,life:1.2,size:4,col:'rgb(255,140,40)',drag:.99});
    stepParticles(c,dt);
    const [sx,sy,rz]=shake(t,.7,.9,9); setCam({z:lerp(-120,0,ease.out(seg(t,.2,.7))),sx,sy,rz});
    setCard({y:lerp(260,0,rise),z:lerp(500,0,rise),ry,s,op:t<.27?0:1});
    rim.style.opacity=seg(t,.85,.95); shadowEl.style.opacity=seg(t,.4,.6)*.8;
    cardEl.style.filter=(t>.7&&t<.8)?'drop-shadow(-5px 0 rgba(255,0,60,.8)) drop-shadow(5px 0 rgba(0,200,255,.6))':'';
    // 1.2–1.6 光澤＋文字
    const sh=seg(t,1.2,1.55); cardEl.querySelectorAll('.front .spec').forEach(e=>{ e.style.setProperty('--so',sh>0&&sh<1?.8:0); e.style.backgroundPosition=`${lerp(-150,150,sh)}% 0`; });
    setTitle(t,1.2,1.45,'紅卡！','t-red');
  }},
 purple:{T:2.0, init(){ backimg.style.filter='sepia(1) hue-rotate(225deg) saturate(2.2) brightness(.9)'; rim.className='rim p-rim'; this.stars=[]; for(let i=0;i<220;i++) this.stars.push({x:(Math.random()-.5)*1400,y:(Math.random()-.5)*900,z:Math.random()*2400}); this.shards=Array.from({length:30},(_,i)=>({a:i/14*6.28,r:110+Math.random()*80,y:(Math.random()-.5)*260,rot:Math.random()*6,sp:1+Math.random()})); },
  frame(t,dt){
    const c=ctxF, cb=ctxB, cfb=ctxFB; const neb=seg(t,0,.3);
    cb.clearRect(0,0,W,H); cb.fillStyle='#05010C'; cb.globalAlpha=neb; cb.fillRect(0,0,W,H); cb.globalAlpha=1;
    // 星雲（緩慢流動的大型柔光）
    for(const [ox,oy,r,col] of [[.3,.4,.55,'rgba(150,60,220,'],[.7,.6,.6,'rgba(70,20,170,'],[.55,.3,.45,'rgba(220,90,200,']]){ const x=W*(ox+Math.sin(t*.8+ox*9)*.04), y=H*(oy+Math.cos(t*.7+oy*7)*.04); glow(cb,x,y,W*r,[[0,col+(.55*neb)+')'],[1,'rgba(0,0,0,0)']],'lighter'); }
    // 星光從深處飛向鏡頭（3D 隧道感），0.3 秒後聚集到中央
    const warp=1-seg(t,.25,.5); cb.save(); cb.globalCompositeOperation='lighter';
    for(const s of this.stars){ const oz=s.z; s.z-=dt*(1600*warp+60); if(s.z<1){ s.z+=2400; } const [x1,y1,f1]=proj(s.x,s.y,s.z), [x0,y0]=proj(s.x,s.y,Math.min(2400,oz+40*warp)); const conv=seg(t,.15,.4); const X=lerp(x1,W/2,conv*.85), Y=lerp(y1,H*.48,conv*.85);
      cb.strokeStyle=`rgba(220,190,255,${.8*f1})`; cb.lineWidth=Math.max(1,2.4*f1); cb.beginPath(); cb.moveTo(lerp(x0,W/2,conv*.85),lerp(y0,H*.48,conv*.85)); cb.lineTo(X,Y); cb.stroke(); }
    cb.restore();
    stage.querySelectorAll('.side').forEach(e=>{ e.style.opacity=.9; e.style.filter=`brightness(${lerp(1,.12,neb)}) saturate(${lerp(1,.3,neb)})`; });
    // 時空裂縫（鋸齒邊緣、發光）
    const [cx,cy]=proj(0,0,0); const rk=seg(t,.3,.5), open=seg(t,.5,.62)*(1-seg(t,.75,1.0));
    if(rk>0&&t<1.05){ const h=H*.42*ease.out(rk), w=(4+open*W*.12); c.save(); c.globalCompositeOperation='lighter'; c.shadowColor='#B070FF'; c.shadowBlur=30;
      c.fillStyle='rgba(240,225,255,.95)'; c.beginPath(); c.moveTo(cx,cy-h); for(let i=0;i<=12;i++){ const yy=cy-h+i*(2*h/12); c.lineTo(cx+w*(.5+Math.sin(i*2.3+t*30)*.25)*(1-Math.abs(i-6)/7),yy);} for(let i=12;i>=0;i--){ const yy=cy-h+i*(2*h/12); c.lineTo(cx-w*(.5+Math.cos(i*1.9+t*27)*.25)*(1-Math.abs(i-6)/7),yy);} c.closePath(); c.fill();
      glow(c,cx,cy,W*.35*(.4+open),[[0,'rgba(200,140,255,.5)'],[1,'rgba(0,0,0,0)']]); c.restore(); }
    // 水晶碎片：在 3D 中繞裂縫旋轉，翻正時向四周（包括鏡頭）炸開
    const blast=ease.out(seg(t,1.02,1.4));
    if(t>.32&&t<1.5){ const items=this.shards.map(s=>{ const a=s.a+t*s.sp; let x=Math.cos(a)*s.r, z=Math.sin(a)*s.r, y=s.y; x*=1+blast*5; y*=1+blast*3; z=z-blast*900; return {s,x,y,z}; }).sort((p,q)=>q.z-p.z);
      for(const {s,x,y,z} of items){ const [px,py,f]=proj(x,y,z); const sz=16*f*SC*(1+blast*.5); c.save(); c.globalAlpha=clamp(seg(t,.32,.45)*(1-seg(t,1.3,1.5)),0,1); c.translate(px,py); c.rotate(s.rot+t*3); c.fillStyle=`hsl(${270+Math.sin(t*4+s.a)*30},90%,${70+20*Math.sin(t*5+s.a)}%)`; c.shadowColor='#C890FF'; c.shadowBlur=12; c.beginPath(); c.moveTo(0,-sz); c.lineTo(sz*.6,0); c.lineTo(0,sz*1.2); c.lineTo(-sz*.6,0); c.closePath(); c.fill(); c.restore(); } }
    // 三層星環（傾斜軌道、符文）
    const rk2=seg(t,.6,.85), shrink=lerp(1,.8,ease.io(seg(t,1.55,2)));
    if(rk2>0){ const rr=[[175,1.15,.3,'rgb(220,180,255)'],[215,1.3,-.5,'rgb(170,120,255)'],[255,.95,.9,'rgb(240,200,255)']];
      rr.forEach(([r,tx,tz,col],i)=>{ ring3d(cfb,r*ease.back(rk2)*shrink,tx+Math.sin(t+i)*.08,tz+t*(i%2?-.8:.6),col,2,.75*rk2,0);
        // 符文點
        cfb.save(); cfb.globalCompositeOperation='lighter'; cfb.fillStyle=col; cfb.font=`${12*SC}px serif`; for(let k=0;k<10;k++){ const a=k/10*6.28+t*(i%2?-.8:.6); let x=Math.cos(a)*r*shrink*ease.back(rk2), y=Math.sin(a)*r*shrink*ease.back(rk2), z=0; const cy2=Math.cos(tx), sy2=Math.sin(tx); [y,z]=[y*cy2,y*sy2]; const [px,py,f]=proj(x,y,z); cfb.globalAlpha=rk2*f; cfb.fillText('ᚠᚱᚨᛟᛞᚷᛉᚹᛗᛊ'[k],px,py); } cfb.restore(); }); }
    // 卡牌從裂縫推出 → 停頓 → 翻轉（中段慢動作）→ 懸浮傾斜
    const push=ease.out(seg(t,.6,.9)); let ry=0; if(t>.97){ const k=seg(t,.97,1.15); ry=180*(k<.5?ease.out(k*2)*.45:.45+.55*ease.in((k-.5)*2)); }
    const hover=seg(t,1.15,1.3); const rx=Math.sin(t*3)*5*hover, rz=Math.sin(t*2.2)*2.5*hover; const ryw=Math.sin(t*2.6)*7*hover;
    if(t>=1.13&&t<1.16&&!this.burst){ this.burst=1; for(let i=0;i<200;i++){ const a=Math.random()*6.28, el=(Math.random()-.5)*2.6, sp=300+Math.random()*700; emit({vx:Math.cos(a)*Math.cos(el)*sp,vy:Math.sin(el)*sp*.8,vz:-Math.abs(Math.sin(a))*sp,drag:.95,life:.9,size:4+Math.random()*4,col:i%2?'rgb(230,210,255)':'rgb(170,110,255)',trail:.03}); } }
    const fk=seg(t,1.13,1.45); if(fk>0&&fk<1){ glow(c,cx,cy,lerp(80,520,fk)*SC,[[0,`rgba(255,255,255,${1-fk})`],[.3,`rgba(220,200,255,${.8*(1-fk)})`],[.6,`rgba(150,80,255,${.4*(1-fk)})`],[1,'rgba(0,0,0,0)']]); ring3d(c,lerp(40,480,ease.out(fk)),1.2,.2,'rgb(230,215,255)',lerp(10,1,fk),1-fk); }
    if(t>1.55) if(Math.random()<.5) emit({x:(Math.random()-.5)*600,y:(Math.random()-.5)*400,z:Math.random()*400,life:1.4,size:2.5,col:'rgb(230,210,255)'});
    // ＋ 裂縫張開的衝擊與吸入
    const ro=seg(t,.48,.7); if(ro>0&&ro<1){ ring3d(cfb,lerp(30,460,ease.out(ro)),0,0,'rgb(200,150,255)',lerp(16,1,ro),1-ro); if(Math.random()<.9) for(let i=0;i<6;i++){ const a=Math.random()*6.28, r=380; emit({x:Math.cos(a)*r,y:Math.sin(a)*r*.8,z:Math.random()*500-200,att:16,drag:.9,life:.4,size:3,col:'rgb(200,160,255)',trail:.06}); } }
    // ＋ 裂縫邊緣的紫色電弧
    if(t>.4&&t<.95&&Math.random()<.55){ const side=Math.random()<.5?-1:1, yy=cy+(Math.random()-.5)*H*.6; bolt(c,cx+side*6,yy,cx+side*(W*.12+Math.random()*W*.2),yy+(Math.random()-.5)*H*.2,'#C890FF',3,26,.9); }
    // ＋ 翻正瞬間：全畫面銀紫白光、八道電弧、鏡頭重擊
    const pf=seg(t,1.13,1.38); if(pf>0&&pf<1){ flashDiv.style.opacity=1; flashDiv.style.background=`radial-gradient(circle at 50% 48%, rgba(255,255,255,${(1-pf)}), rgba(220,200,255,${.8*(1-pf)}) 35%, rgba(120,60,220,${.4*(1-pf)}) 60%, rgba(0,0,0,0) 85%)`;
      if(pf<.6) for(let i=0;i<8;i++){ const a=i/8*6.28+t; bolt(c,cx,cy,cx+Math.cos(a)*W*.48,cy+Math.sin(a)*H*.48,'#D8B0FF',4,40,(1-pf)); }
      streak(c,cx,cy,W*.7,H*.06,'rgb(220,190,255)',.9*(1-pf)); } else if(t>1.0) flashDiv.style.opacity=0;
    // ＋ 卡片背後的極光緞帶
    const au=seg(t,1.2,1.5); if(au>0) aurora(cfb,cx,cy,t,['rgb(170,110,255)','rgb(110,200,255)','rgb(255,140,230)'],.22*au);
    stepParticles(c,dt);
    const punch=t>1.13?Math.exp(-(t-1.13)*9)*110:0; const [psx,psy,prz]=shake(t,1.13,1.4,8);
    setCam({z:lerp(-80,120,ease.io(seg(t,.3,.62)))-lerp(0,140,ease.io(seg(t,.62,1.1)))+punch,rx:lerp(4,0,seg(t,0,1)),sx:psx,sy:psy,rz:prz});
    cardEl.style.filter=(t>1.13&&t<1.22)?'drop-shadow(-6px 0 rgba(255,0,200,.8)) drop-shadow(6px 0 rgba(0,220,255,.7))':'';
    setCard({z:lerp(-900,0,push),s:lerp(.3,1,push)*(t>1.13&&t<1.3?1.04:1),ry:ry+ryw,rx,rz,op:t<.6?0:clamp((t-.6)*10,0,1)});
    rim.style.opacity=seg(t,1.15,1.3); shadowEl.style.opacity=hover*.6;
    setTitle(t,1.55,1.85,'紫卡！','t-pur','blur');
  }},
 black:{T:2.4, init(){ backimg.src=BACKS.legend; backimg.style.filter='';   // 黑卡專用黑金卡背（不再用濾鏡把特殊卡背壓暗）
    rim.className='rim k-rim'; this.dust=Array.from({length:90},()=>({x:Math.random(),y:Math.random(),v:20+Math.random()*40})); },
  frame(t,dt){
    const c=ctxF, cb=ctxB, cfb=ctxFB;
    // 0–0.35 色彩消失、背景粒子減速停止
    const freeze=seg(t,0,.35); cb.clearRect(0,0,W,H); cb.fillStyle='#000'; cb.globalAlpha=lerp(.3,1,freeze); cb.fillRect(0,0,W,H); cb.globalAlpha=1;
    stage.style.filter=t<.35?`grayscale(${freeze})`:''; const speed=1-ease.out(freeze);
    cb.save(); cb.globalCompositeOperation='lighter'; for(const d of this.dust){ d.y-=d.v*speed*dt/H*3; if(d.y<0) d.y+=1; cb.globalAlpha=lerp(.8,.25,freeze)*(t>1.2?0:1); cb.drawImage(sprite(t<.35?'rgb(140,180,255)':'rgb(150,150,150)'),d.x*W-3,d.y*H-3,6,6);} cb.restore();
    const [cx,cy]=proj(0,0,0);
    // 0.35–0.7 光點→日蝕＋日冕＋空間扭曲
    const ek=ease.out(seg(t,.35,.7)), split=ease.in(seg(t,.7,.95)), eAlpha=1-seg(t,.95,1.05);
    if(t>.35&&t<1.05){ const R=W*.16*ek+2;
      // 空間扭曲：一圈圈向外的漣漪
      for(let i=0;i<5;i++){ const k=((t*.9+i/5)%1); cfb.save(); cfb.globalCompositeOperation='lighter'; cfb.strokeStyle=`rgba(255,210,120,${.12*(1-k)*eAlpha})`; cfb.lineWidth=2; cfb.beginPath(); cfb.ellipse(cx,cy,R*(1.2+k*2.5),R*(1.2+k*2.5)*.92,0,0,6.28); cfb.stroke(); cfb.restore(); }
      // 日冕：抖動的放射狀光絲
      cfb.save(); cfb.globalCompositeOperation='lighter'; for(let i=0;i<90;i++){ const a=i/90*6.28+t*.4, l=R*(1.12+.35*Math.abs(Math.sin(i*7.3+t*9))*ek); cfb.strokeStyle=`rgba(255,${190+Math.random()*50|0},90,${.55*eAlpha})`; cfb.lineWidth=1.5; cfb.beginPath(); cfb.moveTo(cx+Math.cos(a)*R*.98,cy+Math.sin(a)*R*.98); cfb.lineTo(cx+Math.cos(a)*l,cy+Math.sin(a)*l); cfb.stroke(); } cfb.restore();
      glow(cfb,cx,cy,R*1.5,[[.6,'rgba(0,0,0,0)'],[.66,`rgba(255,220,130,${.9*eAlpha})`],[.75,`rgba(255,160,40,${.35*eAlpha})`],[1,'rgba(0,0,0,0)']]);
      // 黑色圓盤：從中央左右裂開
      cfb.save(); cfb.fillStyle='#000'; cfb.globalAlpha=eAlpha; const off=split*R*1.5; cfb.beginPath(); cfb.arc(cx-off,cy,R,Math.PI/2,Math.PI*1.5); cfb.fill(); cfb.beginPath(); cfb.arc(cx+off,cy,R,-Math.PI/2,Math.PI/2); cfb.fill(); cfb.restore(); }
    // 0.7–1.0 黑金卡背慢轉 → 1.0–1.1 凝結 → 快速翻正
    let ry=0; if(t>.7) ry=lerp(0,38,ease.out(seg(t,.7,1.0))); if(t>1.1) ry=lerp(38,180,ease.in(seg(t,1.1,1.22)));
    if(t>=1.21&&t<1.24&&!this.burst){ this.burst=1; for(let i=0;i<520;i++){ const a=Math.random()*6.28, el=(Math.random()-.5)*2.6, sp=300+Math.random()*1100; emit({vx:Math.cos(a)*Math.cos(el)*sp,vy:Math.sin(el)*sp*.8,vz:Math.sin(a)*Math.cos(el)*sp,drag:.93,g:150,life:1+Math.random()*.6,size:3+Math.random()*5,col:i%3?'rgb(255,215,120)':'rgb(255,255,235)',trail:.035}); } }
    const fk=seg(t,1.21,1.6);
    if(fk>0&&fk<1){ flashDiv.style.background=`radial-gradient(circle at 50% 48%, rgba(255,255,255,${1-fk}), rgba(255,236,190,${.85*(1-fk)}) 30%, rgba(0,0,0,0) 70%)`; flashDiv.style.opacity=1;
      for(let i=0;i<3;i++){ const k=clamp(fk*1.4-i*.12,0,1); if(k>0&&k<1) ring3d(c,lerp(40,560,ease.out(k)),[0,1.2,.6][i],[0,.3,-.7][i],'rgb(255,215,120)',lerp(14,1,k),1-k); } }
    else flashDiv.style.opacity=0;
    // 1.25 起：巨大日冕＋神聖幾何光環
    const ck=ease.out(seg(t,1.25,1.65));
    if(ck>0){ rays(cfb,cx,cy,48,W*.55*ck,t*.15,'rgb(255,200,100)',.22*ck,.035); rays(cfb,cx,cy,12,W*.45*ck,-t*.25,'rgb(255,240,190)',.25*ck,.02);
      cfb.save(); cfb.globalCompositeOperation='lighter'; cfb.strokeStyle=`rgba(255,215,130,${.55*ck})`; cfb.lineWidth=1.6; cfb.shadowColor='#FFC040'; cfb.shadowBlur=10;
      for(const [n,r,sp] of [[6,.36,.25],[3,.42,-.18],[8,.3,.32]]){ cfb.beginPath(); for(let i=0;i<=n;i++){ const a=i/n*6.28+t*sp; const x=cx+Math.cos(a)*W*r*ck, y=cy+Math.sin(a)*W*r*ck*.9; i?cfb.lineTo(x,y):cfb.moveTo(x,y);} cfb.stroke(); }
      cfb.beginPath(); cfb.arc(cx,cy,W*.4*ck,0,6.28); cfb.stroke(); cfb.restore(); }
    // 1.65–2.0 聚光燈
    const sp=seg(t,1.65,1.9); if(sp>0){ c.save(); c.globalCompositeOperation='lighter'; const g=c.createLinearGradient(cx,0,cx,H); g.addColorStop(0,`rgba(255,240,200,${.35*sp})`); g.addColorStop(1,'rgba(0,0,0,0)'); c.fillStyle=g; c.beginPath(); c.moveTo(cx-W*.05,0); c.lineTo(cx+W*.05,0); c.lineTo(cx+W*.22,H); c.lineTo(cx-W*.22,H); c.closePath(); c.fill(); c.restore(); }
    // 四角雕刻依序點亮
    if(t>1.65&&t<2.05){ const cw=CW, ch=cw*1.333; const pts=[[-1,-1],[1,-1],[1,1],[-1,1]]; pts.forEach(([sx,sy],i)=>{ const k=seg(t,1.65+i*.08,1.8+i*.08)*(1-seg(t,1.85+i*.08,2.05+i*.08)); if(k>0){ glow(c,cx+sx*cw/2,cy+sy*ch/2,W*.07*k,[[0,'rgba(255,255,240,1)'],[.3,'rgba(255,215,120,.7)'],[1,'rgba(0,0,0,0)']]); rays(c,cx+sx*cw/2,cy+sy*ch/2,4,W*.09*k,.78,'rgb(255,240,200)',.8*k,.03);} }); }
    if(t>2.0) if(Math.random()<.7) emit({x:(Math.random()-.5)*360,y:220,z:Math.random()*200,vy:-90-Math.random()*60,life:1.4,size:4,col:'rgb(255,210,110)',drag:.995});
    // ＋ 日蝕成形時的心跳脈衝（暗角收縮＋金色脈衝環）
    for(const hb of [.5,.82]){ const k=seg(t,hb,hb+.25); if(k>0&&k<1){ ring3d(cfb,lerp(W*.2,W*.75,ease.out(k)),0,0,'rgb(255,200,100)',lerp(8,1,k),.6*(1-k)); } }
    if(t>.35&&t<1.2){ const v=.35+.25*Math.max(0,Math.sin((t-.35)*13)); cfb.save(); const g=cfb.createRadialGradient(cx,cy,W*.15,cx,cy,W*.7); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,`rgba(0,0,0,${v})`); cfb.fillStyle=g; cfb.fillRect(0,0,W,H); cfb.restore(); }
    // ＋ 日珥：日冕邊緣的金色弧形火焰
    if(t>.5&&t<1.0){ const R=W*.16*ek; cfb.save(); cfb.globalCompositeOperation='lighter'; for(let i=0;i<5;i++){ const a=i*1.26+t*.6, h=R*(.25+.2*Math.sin(t*6+i)); const x0=cx+Math.cos(a)*R, y0=cy+Math.sin(a)*R, x1=cx+Math.cos(a+.35)*R, y1=cy+Math.sin(a+.35)*R; cfb.strokeStyle=`rgba(255,180,60,${.7*eAlpha})`; cfb.lineWidth=3; cfb.shadowColor='#FF9A20'; cfb.shadowBlur=14; cfb.beginPath(); cfb.moveTo(x0,y0); cfb.bezierCurveTo(cx+Math.cos(a)*(R+h*2),cy+Math.sin(a)*(R+h*2),cx+Math.cos(a+.35)*(R+h*2),cy+Math.sin(a+.35)*(R+h*2),x1,y1); cfb.stroke(); } cfb.restore(); }
    // ＋ 翻正：橫向與縱向的鏡頭光斑、平躺的地面衝擊環
    const kf=seg(t,1.21,1.7); if(kf>0&&kf<1){ streak(c,cx,cy,W*.95,H*.05,'rgb(255,220,140)',1-kf); c.save(); c.translate(cx,cy); c.rotate(Math.PI/2); streak(c,0,0,H*.6,W*.02,'rgb(255,240,200)',.7*(1-kf)); c.restore();
      ring3d(c,lerp(60,900,ease.out(kf)),1.45,0,'rgb(255,200,90)',lerp(26,2,kf),1-kf,120); }
    // ＋ 卡片背後穿出的體積光束（慢慢旋轉）
    const gr=seg(t,1.25,1.5)*(1-seg(t,2.3,2.4)*.5); if(gr>0) rays(c,cx,cy,18,W*.9,t*.12,'rgb(255,230,170)',.18*gr,.025);
    // ＋ 金色光柱從底部升起
    const pl=seg(t,1.35,1.75); if(pl>0) pillars(cfb,cx,7,W*.13,H*lerp(.2,1,ease.out(pl)),'rgb(255,210,110)',.28*pl,t);
    // ＋ 「黑卡！」落地的衝擊
    if(t>=2.12&&t<2.15&&!this.tb){ this.tb=1; for(let i=0;i<80;i++){ const a=Math.random()*6.28; emit({x:0,y:-300,z:0,vx:Math.cos(a)*500,vy:Math.sin(a)*160,drag:.9,life:.6,size:3,col:'rgb(255,230,160)',trail:.03}); } }
    const tk=seg(t,2.12,2.4); if(tk>0&&tk<1){ const [tx,ty]=proj(0,-300,0); ring3d(c,lerp(20,300,ease.out(tk)),1.3,0,'rgb(255,220,140)',lerp(8,1,tk),1-tk,0); }
    stepParticles(c,dt);
    const s=t<1.21?.95:lerp(1.25,1,ease.io(seg(t,1.25,1.65)));
    const [sx,sy,rz]=shake(t,1.21,1.55,12); const thump=[.5,.82].reduce((a,hb)=>a+(t>hb?Math.exp(-(t-hb)*14)*35:0),0); const push=t>1.0&&t<1.21?lerp(0,90,ease.in(seg(t,1.0,1.21))):0;
    setCam({z:lerp(0,60,ease.io(seg(t,.35,1.2)))-lerp(0,60,ease.io(seg(t,1.25,1.8)))+thump+push-(t>1.21?Math.exp(-(t-1.21)*6)*120:0),sx,sy,rz});
    cardEl.style.filter=(t>1.21&&t<1.3)?'drop-shadow(-7px 0 rgba(255,60,0,.8)) drop-shadow(7px 0 rgba(0,200,255,.7)) brightness(1.6)':'';
    setCard({ry,s,op:t<.75?0:clamp((t-.75)*8,0,1)});
    rim.style.opacity=seg(t,1.7,1.9); shadowEl.style.opacity=seg(t,1.3,1.6)*.5;
    setTitle(t,2.0,2.3,'黑卡！','t-blk','flip');
  }},
 cheer:{T:2.3, init(){ backimg.style.filter=''; rim.className='rim c-rim'; },
  frame(t,dt){
    const c=ctxF, cb=ctxB, cfb=ctxFB; const [cx,cy]=proj(0,0,0); const sc=SC;
    // 第一幕：變暗、粉金光點、心跳一（粉色光粒向外擴散）、夢幻柔焦
    cb.clearRect(0,0,W,H); cb.fillStyle=`rgba(20,6,18,${lerp(0,.82,seg(t,0,.2))})`; cb.fillRect(0,0,W,H);
    const soft=seg(t,0,.3); if(soft>0){ const g=cb.createRadialGradient(cx,cy,W*.25,cx,cy,W*.75); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,`rgba(255,170,210,${.28*soft})`); cb.fillStyle=g; cb.fillRect(0,0,W,H); }
    const dot=seg(t,0,.12)*(1-seg(t,.55,.75)); if(dot>0) glow(c,cx,cy,70*sc*(.6+.4*Math.sin(t*18)*.2+dot*.6),[[0,'rgba(255,250,240,.95)'],[.25,'rgba(255,200,220,.8)'],[.6,'rgba(255,210,150,.25)'],[1,'rgba(0,0,0,0)']]);
    if(t>=.1&&!this.hb1){ this.hb1=1; for(let i=0;i<70;i++){ const a=Math.random()*6.28, el=(Math.random()-.5)*1.6, sp=180+Math.random()*260; emit({vx:Math.cos(a)*Math.cos(el)*sp,vy:Math.sin(el)*sp*.8,vz:Math.sin(a)*Math.cos(el)*sp,drag:.94,life:.9,size:4,col:i%3?'rgb(255,170,210)':'rgb(255,225,170)'}); } }
    const p1=seg(t,.1,.45); if(p1>0&&p1<1) ring3d(c,lerp(20,260,ease.out(p1)),0,0,'rgb(255,180,215)',lerp(8,1,p1),.7*(1-p1));
    // 第二幕：香檳金光絲畫出心形 → 半透明愛心光環、珍珠白光、花瓣與星塵
    const draw=ease.io(seg(t,.3,.58)), ringA=1-seg(t,1.85,2.3)*.85;
    if(t>.3){ const head=heart3d(cfb,9*sc*1.15/sc,draw,Math.sin(t*1.3)*.15,Math.sin(t*.9)*.25,'rgb(255,226,170)',3.5,ringA,`rgba(255,190,220,${.12*seg(t,.58,.7)})`);
      if(draw<1&&head) glow(c,head[0],head[1],26*sc,[[0,'rgba(255,255,255,1)'],[.3,'rgba(255,230,180,.8)'],[1,'rgba(0,0,0,0)']]); }
    const pearl=seg(t,.5,.65)*(1-seg(t,1.0,1.2)); if(pearl>0) glow(c,cx,cy,110*sc*pearl,[[0,'rgba(255,255,255,.9)'],[.4,'rgba(240,235,255,.5)'],[1,'rgba(0,0,0,0)']]);
    if(t>.5&&t<1.05&&Math.random()<.7) for(let i=0;i<2;i++){ const a=Math.random()*6.28; emit({x:Math.cos(a)*20,y:Math.sin(a)*20,z:0,vx:Math.cos(a)*(80+Math.random()*120),vy:Math.sin(a)*(60+Math.random()*90)-20,vz:-Math.random()*200,g:30,drag:.985,life:1.6,size:9,col:'rgb(255,150,195)',shape:'petal',spin:2+Math.random()*3,flut:5+Math.random()*4,r0:Math.random()*6}); emit({x:(Math.random()-.5)*160,y:(Math.random()-.5)*160,z:Math.random()*200-100,vy:-20,life:1,size:2.5,col:'rgb(255,225,160)'}); }
    // 第三幕：卡背從愛心中央緩緩浮現（珍珠虹彩邊、輕微傾斜）
    const rise=ease.out(seg(t,.65,1.0));
    // 第四幕：優雅翻轉，將翻正前慢動作；第二聲心跳＋三色柔光、花瓣與小愛心綻放
    let ry=0; if(t>1.0){ const k=seg(t,1.0,1.3); ry=180*(k<.55?ease.in(k/.55)*.42:.42+.58*ease.out((k-.55)/.45)); }
    if(t>=1.22&&!this.hb2){ this.hb2=1; for(let i=0;i<110;i++){ const a=Math.random()*6.28, el=(Math.random()-.5)*2, sp=160+Math.random()*420; const kind=i%3; emit({vx:Math.cos(a)*Math.cos(el)*sp,vy:Math.sin(el)*sp*.8,vz:Math.sin(a)*Math.cos(el)*sp-120,g:kind===0?40:0,drag:.95,life:1.3+Math.random()*.5,size:kind===0?10:kind===1?9:4,col:kind===0?'rgb(255,160,205)':kind===1?'rgb(255,120,180)':'rgb(255,230,170)',shape:kind===0?'petal':kind===1?'heart':null,spin:3,flut:6,r0:Math.random()*6}); } }
    const bl=seg(t,1.22,1.6); if(bl>0&&bl<1){ glow(c,cx,cy,lerp(60,420,ease.out(bl))*sc,[[0,`rgba(255,255,255,${.95*(1-bl)})`],[.3,`rgba(255,190,220,${.7*(1-bl)})`],[.6,`rgba(255,215,150,${.35*(1-bl)})`],[1,'rgba(0,0,0,0)']]); ring3d(c,lerp(40,380,ease.out(bl)),1.1,0,'rgb(255,200,225)',lerp(8,1,bl),.8*(1-bl)); }
    // 第五幕：108% → 100%；背後雙層愛心光環；四角鑽石星芒；香檳金光線從左上滑過
    const lay=seg(t,1.3,1.6); if(lay>0){ heart3d(cfb,12.5,1,0,t*.6,'rgb(255,190,220)',2.2,.55*lay*ringA,`rgba(255,180,215,${.06*lay*ringA})`); heart3d(cfb,15.5,1,.15,-t*.45,'rgb(255,226,170)',1.6,.4*lay*ringA); }
    if(t>1.45&&t<2.3){ const cw=CW, ch=cw*1.333; [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx2,sy2],i)=>{ const k=Math.max(0,Math.sin((t-1.45)*5-i*.8)); if(k>0){ const x=cx+sx2*cw/2, y=cy+sy2*ch/2; rays(c,x,y,4,W*.05*k,.78,'rgb(255,255,255)',.9*k,.06); glow(c,x,y,W*.03*k,[[0,'rgba(255,255,255,1)'],[1,'rgba(0,0,0,0)']]); } }); }
    // 第六幕：櫻花瓣緩緩飄落、金色星塵
    if(t>1.85&&Math.random()<.35) emit({x:(Math.random()-.5)*700,y:-320,z:Math.random()*400-100,vy:60+Math.random()*30,vx:20,life:2.2,size:8,col:'rgb(255,175,205)',shape:'petal',spin:1.5,flut:3,r0:Math.random()*6});
    if(t>1.85&&Math.random()<.4) emit({x:(Math.random()-.5)*500,y:(Math.random()-.5)*300,z:Math.random()*300,life:1.2,size:2.2,col:'rgb(255,226,170)'});
    stepParticles(c,dt);
    let s=1; if(t>1.3){ const k=seg(t,1.3,1.6); s=lerp(1.08,1,ease.out(k)); }
    setCam({z:lerp(0,50,ease.io(seg(t,1.0,1.3)))});
    const tilt=(1-seg(t,1.0,1.1)); setCard({z:lerp(-500,0,rise),y:lerp(30,0,rise),s:lerp(.4,1,rise)*s,ry,rx:8*tilt+Math.sin(t*2)*2*seg(t,1.3,1.5),rz:-4*tilt,op:t<.65?0:clamp((t-.65)*6,0,1)});
    rim.style.opacity=t>.7?.85:0; shadowEl.style.opacity=0;
    const sw=seg(t,1.45,1.85); cardEl.querySelectorAll('.front .spec').forEach(e=>{ e.style.setProperty('--so',sw>0&&sw<1?.7:0); e.style.setProperty('--sa','135deg'); e.style.backgroundPosition=`${lerp(-150,150,sw)}% 0`; });
    setTitle(t,1.85,2.15,'心動降臨 ♡','t-cheer','flip');
  }},
};

const BACKS = { special: 'img/backs/special.webp', normal: 'img/backs/normal.webp', coach: 'img/backs/coach.webp', cheer: 'img/backs/cheer.webp', legend: 'img/backs/legend.webp' };
export function reveal(card, kind, { packKind = 'special', eco = false, keep = false } = {}) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !document.createElement('canvas').getContext) return resolve();
    ECO = eco; P = [];
    const ov = document.createElement('div'); ov.className = 'rv';
    const thick = Array.from({ length: 6 }, (_, i) => `<div class="thick" style="transform:translateZ(-${i + 1}px)"></div>`).join('');
    ov.innerHTML = `<canvas class="rv-bg"></canvas><canvas class="rv-fxb"></canvas>
      <div class="world">${kind === 'purple' ? '<div class="side" style="left:8%"></div><div class="side" style="left:20%;top:56%"></div><div class="side" style="right:20%;top:56%"></div><div class="side" style="right:8%"></div>' : ''}
        <div class="shadow"></div><div class="card">${thick}<div class="face back"><img alt=""><div class="spec"></div></div><div class="face front">${cardSVG(card, { animate: true, fx: true })}<div class="spec"></div></div><div class="rim"></div></div></div>
      <canvas class="rv-fx"></canvas><div class="title"></div><div class="rv-flash"></div><div class="rv-name"></div>`;
    document.body.appendChild(ov);
    stage = ov; bg = ov.querySelector('.rv-bg'); fxb = ov.querySelector('.rv-fxb'); fx = ov.querySelector('.rv-fx');
    world = ov.querySelector('.world'); cardEl = ov.querySelector('.card'); front = ov.querySelector('.front'); rim = ov.querySelector('.rim');
    title = ov.querySelector('.title'); shadowEl = ov.querySelector('.shadow'); backimg = ov.querySelector('.back img'); flashDiv = ov.querySelector('.rv-flash');
    ctxB = bg.getContext('2d'); ctxF = fx.getContext('2d'); ctxFB = fxb.getContext('2d');
    const r = ov.getBoundingClientRect(); W = r.width; H = r.height; SC = H / 412; CW = cardEl.offsetWidth;
    for (const c of [bg, fx, fxb]) { c.width = W * DPR; c.height = H * DPR; c.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0); }
    backimg.src = BACKS[kind === 'cheer' ? 'cheer' : packKind] || BACKS.special;
    ov.querySelectorAll('.side').forEach(e => { e.style.backgroundImage = `url(${backimg.src})`; });
    const D = DEMOS[kind]; D.burst = 0; D.tb = 0; D.hb1 = 0; D.hb2 = 0; D.init();
    if (packKind !== 'special' && kind !== 'cheer') backimg.style.filter = '';
    const name = card.kind === 'cheer' ? card.name : card.kind === 'coach' ? `教練 ${card.name}` : '';
    const nameEl = ov.querySelector('.rv-name'); nameEl.textContent = name;
    let t0 = performance.now(), last = t0, raf = 0, skipTo = 0, done = false;
    const hold = card.kind ? 1.2 : .25;   // 教練、啦啦隊停在展示畫面；球員接著播人物破框
    const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); ov.classList.add('out'); setTimeout(() => { ov.remove(); resolve(); }, 260); };
    // keep：揭曉完成後不關閉，讓人物破框直接疊在同一個場景上演出（由呼叫端關閉）
    let handed = false;
    const handle = { hideCard() { cardEl.style.visibility = 'hidden'; title.style.opacity = 0; }, close() { if (done) return; done = true; cancelAnimationFrame(raf); ov.classList.add('out'); setTimeout(() => ov.remove(), 260); } };
    ov.addEventListener('click', () => { const t = (performance.now() - t0) / 1000 + skipTo; if (t < D.T) skipTo += D.T - t; else if (!keep) finish(); });
    const loop = (now) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now; const t = Math.min(keep ? D.T : D.T + hold, (now - t0) / 1000 + skipTo);
      ctxF.clearRect(0, 0, W, H); ctxFB.clearRect(0, 0, W, H); D.frame(t, dt);
      if (keep) { if (t >= D.T && !handed) { handed = true; resolve(handle); } raf = requestAnimationFrame(loop); return; }
      if (t >= D.T) nameEl.classList.add('on');
      if (t >= D.T + hold) return finish();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
}
