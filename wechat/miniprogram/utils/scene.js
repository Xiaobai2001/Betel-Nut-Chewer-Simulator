const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const random = n => { const value=Math.sin(n*127.1+31.7)*43758.5453; return value-Math.floor(value); };
class Scene {
  constructor(canvas,width,height,ratio,state) {
    this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.state=state;
    this.width=width; this.height=height; this.ratio=Math.min(ratio||1,2);
    canvas.width=Math.round(width*this.ratio); canvas.height=Math.round(height*this.ratio);
    this.yaw=-.25; this.pitch=.25; this.zoom=1; this.smokePosition=null;
    this.chewAt=-10000; this.smokeAt=-10000; this.flights=[]; this.puffs=[]; this.last=0;
    this.reduced=false; this.active=false; this.pointer=null; this.frame=this.frame.bind(this);
    this.mesh=[];
    for(let a=0;a<18;a++) for(let b=0;b<36;b++) this.mesh.push([[a,b],[a+1,b],[a+1,b+1],[a,b+1]]);
  }
  start(){if(this.active)return;this.active=true;this.last=0;this.frame(Date.now());}
  stop(){this.active=false;if(this.raf)this.canvas.cancelAnimationFrame(this.raf);this.pointer=null;}
  destroy(){this.stop();}
  resize(width,height){this.width=width;this.height=height;this.canvas.width=Math.round(width*this.ratio);this.canvas.height=Math.round(height*this.ratio);}
  reset(){this.yaw=-.25;this.pitch=.25;this.zoom=1;this.smokePosition=null;}
  setZoom(value){this.zoom=clamp(value,.65,1.8);}
  clear(){this.flights=[];}
  chew(){this.chewAt=Date.now();}
  exhale(){const now=Date.now();for(let i=0;i<28;i++)this.puffs.push({x:this.width*.56,y:this.height*.64,vx:(random(i+now)-.5)*45,vy:-25-random(i+4)*35,age:-i*.025,life:2.3,size:10+random(i)*13});}
  spit(whole,nut){
    const count=whole?16:28;
    for(let i=0;i<count;i++)this.flights.push({x:this.width*.38,y:this.height*.43,vx:(random(i+this.flights.length)-.5)*this.width*.65,vy:-this.height*(.3+random(i+3)*.3),age:0,whole:whole&&i===0,nut:nut&&Object.assign({},nut),spin:random(i+6)*5,landed:false});
    this.flights=this.flights.slice(-90);
  }
  touchStart(x,y){const b=this.smokeBounds;this.pointer={x,y,smoke:!!b&&x>b.x-18&&x<b.x+b.w+18&&y>b.y-18&&y<b.y+b.h+18};}
  touchMove(x,y){
    if(!this.pointer)return;
    const dx=x-this.pointer.x,dy=y-this.pointer.y;
    if(this.pointer.smoke){const p=this.smokePosition||{x:.76,y:.65};this.smokePosition={x:clamp(p.x+dx/this.width,.18,.84),y:clamp(p.y+dy/this.height,.16,.83)};}
    else {this.yaw+=dx*.012;this.pitch=clamp(this.pitch+dy*.012,-Math.PI,Math.PI);}
    this.pointer.x=x;this.pointer.y=y;
  }
  touchEnd(){this.pointer=null;}
  turn(p,yaw,pitch){
    const x=p.x*Math.cos(yaw)+p.z*Math.sin(yaw),z=-p.x*Math.sin(yaw)+p.z*Math.cos(yaw);
    return {x,y:p.y*Math.cos(pitch)-z*Math.sin(pitch),z:p.y*Math.sin(pitch)+z*Math.cos(pitch)};
  }
  drawNut(x,y,scale,nut,yaw,pitch,bite){
    if(!nut)return;
    const ctx=this.ctx,w=nut.wear/100,vertices=[];
    for(let a=0;a<=18;a++){
      vertices[a]=[];
      for(let b=0;b<=36;b++){
        const theta=a/18*Math.PI,phi=b/36*Math.PI*2,noise=1+.025*Math.sin(theta*54+phi*7),r=Math.sin(theta)*noise;
        vertices[a][b]=this.turn({x:Math.cos(theta)*1.3*(1+w*.18),y:r*Math.cos(phi)*.53*(1-w*.64)*(1-bite*.15),z:r*Math.sin(phi)*.58*(1-w*.15)},yaw,pitch);
      }
    }
    const faces=this.mesh.map((indices,i)=>{const points=indices.map(p=>vertices[p[0]][p[1]]);return{points,i,z:points.reduce((s,p)=>s+p.z,0)/4};}).sort((a,b)=>a.z-b.z);
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    for(const face of faces){
      const p=face.points;
      const ax=p[1].x-p[0].x,ay=p[1].y-p[0].y,az=p[1].z-p[0].z,bx=p[2].x-p[0].x,by=p[2].y-p[0].y,bz=p[2].z-p[0].z;
      const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,len=Math.hypot(nx,ny,nz)||1;
      const shade=.63+.32*Math.abs((nx*-.3+ny*-.5+nz*.8)/len)+random(face.i)*.11;
      const brown=[174,131,76].map(v=>Math.round(v*shade*(1-w*.34)));
      ctx.beginPath();p.forEach((v,i)=>{const f=1+v.z*.06;i?ctx.lineTo(v.x*f,v.y*f):ctx.moveTo(v.x*f,v.y*f);});ctx.closePath();ctx.fillStyle='rgb('+brown.join(',')+')';ctx.fill();
      ctx.strokeStyle='rgba(64,38,16,.13)';ctx.lineWidth=.009;ctx.stroke();
    }
    // Longitudinal fibres remain on the visible half of the rotated shell.
    for(let b=0;b<85;b++){
      const phi=b/85*Math.PI*2;ctx.beginPath();let drawing=false;
      for(let a=1;a<40;a++){
        const t=a/40*Math.PI,r=Math.sin(t)*(1+.026*Math.sin(t*27+b));
        const p=this.turn({x:Math.cos(t)*1.31*(1+w*.18),y:r*Math.cos(phi)*.54*(1-w*.64),z:r*Math.sin(phi)*.59*(1-w*.15)},yaw,pitch);
        if(p.z<0){drawing=false;continue;}const f=1+p.z*.06;
        if(!drawing){ctx.moveTo(p.x*f,p.y*f);drawing=true;}else ctx.lineTo(p.x*f,p.y*f);
      }
      ctx.strokeStyle=b%3?'rgba(235,203,144,.48)':'rgba(65,39,19,.55)';ctx.lineWidth=.007+(b%4)*.002;ctx.stroke();
    }
    if(w>.05)for(let i=0;i<Math.round(45*w);i++){
      const angle=random(i+10)*Math.PI*2,start=this.turn({x:Math.cos(angle)*1.18,y:Math.sin(angle)*.26,z:.1},yaw,pitch);
      ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.quadraticCurveTo(start.x*1.15,start.y*1.3-.08,start.x*(1.18+random(i)*.15),start.y*1.5+(random(i+9)-.5)*.25);ctx.strokeStyle='#b58e57';ctx.lineWidth=.008;ctx.stroke();
    }
    ctx.restore();
  }
  drawSmoke(now,dt){
    const ctx=this.ctx,c=this.state.cigarette,w=this.width,h=this.height,p=this.smokePosition||{x:.76,y:.65},x=p.x*w,y=p.y*h;
    const s=Math.min(h*.43,w*.28)/180,tip=-120+c.used*122,filter=65;
    this.smokeBounds={x:x+tip*s,y:y-12*s,w:(filter-tip)*s,h:24*s};
    ctx.save();ctx.translate(x,y);ctx.rotate(-.08);ctx.scale(s,s);
    const paper=ctx.createLinearGradient(0,-7,0,7);paper.addColorStop(0,'#fdfdf6');paper.addColorStop(.45,'#e8e8df');paper.addColorStop(1,'#cdd0c5');ctx.fillStyle=paper;ctx.fillRect(tip,-7,140-c.used*122,14);
    const filterColor=ctx.createLinearGradient(0,-7,0,7);filterColor.addColorStop(0,'#eed0a1');filterColor.addColorStop(1,'#b68a54');ctx.fillStyle=filterColor;ctx.fillRect(20,-7,45,14);
    for(let i=0;i<65;i++){ctx.fillStyle='#83552c33';ctx.fillRect(21+random(i)*43,-6+random(i+5)*11,1,1);}
    if(c.used>0||c.lit){ctx.fillStyle='#8e8a7d';ctx.fillRect(tip-4,-7,7,14);}
    if(c.lit){ctx.shadowColor='#ed9d4d';ctx.shadowBlur=c.holding?14:5;ctx.fillStyle=c.holding?'#fbaf59':'#c98143';ctx.fillRect(tip,-7,3,14);}
    ctx.restore();
    if(c.lit&&now-this.smokeAt>180){this.smokeAt=now;this.puffs.push({x:x+tip*s,y:y-8*s,vx:-5,vy:-18,age:0,life:2,size:3});}
    this.puffs=this.puffs.filter(puff=>{puff.age+=dt;if(puff.age<0)return true;if(puff.age>puff.life)return false;puff.x+=puff.vx*dt;puff.y+=puff.vy*dt;const r=puff.size+puff.age*15;ctx.save();ctx.globalAlpha=.22*(1-puff.age/puff.life);const g=ctx.createRadialGradient(puff.x,puff.y,0,puff.x,puff.y,r);g.addColorStop(0,'#929c8a');g.addColorStop(1,'rgba(146,156,138,0)');ctx.fillStyle=g;ctx.fillRect(puff.x-r,puff.y-r,r*2,r*2);ctx.restore();return true;}).slice(-75);
  }
  frame(){
    if(!this.active)return;
    const now=Date.now();if(this.last&&now-this.last<30){this.raf=this.canvas.requestAnimationFrame(this.frame);return;}
    const dt=this.last?Math.min(.05,(now-this.last)/1000):0;this.last=now;
    const ctx=this.ctx,w=this.width,h=this.height;ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.fillStyle='#f7f8f4';ctx.fillRect(0,0,w,h);
    const ground=ctx.createLinearGradient(0,h*.4,0,h);ground.addColorStop(0,'rgba(235,239,226,0)');ground.addColorStop(1,'#e9eddf');ctx.fillStyle=ground;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.fillStyle='#b0bc9922';ctx.beginPath();ctx.ellipse(w*.36,h*.76,w*.17,h*.025,0,0,Math.PI*2);ctx.fill();ctx.restore();
    const age=(now-this.chewAt)/460,bite=this.reduced?0:age>0&&age<1?Math.sin(age*Math.PI):0,scale=Math.min(h*.52,w*.49)/2.6*this.zoom;
    this.drawNut(w*.36,h*.40+bite*3,scale,this.state.nut,this.yaw,this.pitch,bite);
    for(const f of this.flights){
      f.age+=dt;
      if(!f.landed){f.vy+=h*1.7*dt;f.x+=f.vx*dt;f.y+=f.vy*dt;if(f.y>h*.85){f.y=h*.85;if(f.whole&&!f.bounced){f.vy*=-.22;f.bounced=true;}else f.landed=true;}}
      if(f.whole)this.drawNut(f.x,f.y,scale*.23,f.nut,f.spin+f.age,f.age,.1);
      else {ctx.fillStyle='#916b3f';ctx.beginPath();ctx.ellipse(f.x,f.y,3.5,1.3,f.spin,0,Math.PI*2);ctx.fill();}
    }
    this.drawSmoke(now,dt);this.raf=this.canvas.requestAnimationFrame(this.frame);
  }
}
module.exports=Scene;
