const {createScopedThreejs}=require('../lib/three-mini');
const createWebScene=require('../lib/web-scene');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

// One scoped renderer per native Canvas. No DOM globals or external downloads.
module.exports=function NativeWebScene(canvas,width,height,ratio,state,options={}){
  const THREE=createScopedThreejs(canvas);
  // r108 uses explicit BufferGeometry names; the website's current Three version
  // uses these buffer implementations under the shorter Geometry names.
  THREE.SphereGeometry=THREE.SphereBufferGeometry;
  THREE.PlaneGeometry=THREE.PlaneBufferGeometry;
  THREE.CylinderGeometry=THREE.CylinderBufferGeometry;
  const host={clientWidth:width,clientHeight:height,dataset:{}};
  const Base=createWebScene(THREE,{
    createCanvas:()=>wx.createOffscreenCanvas({type:'2d',width:1,height:1}),
    now:()=>Date.now(),pixelRatio:Math.min(ratio||1,1.6),reduced:!!options.reduced
  });
  class Scene extends Base{
    newCanvas(){this.canvas=canvas;}
    bindPointer(){} // Native touch events are forwarded by the Page.
    enableFallback(){this.destroy();throw Error('Native WebGL is unavailable');}
    resize(w,h){if(w>0&&h>0){host.clientWidth=w;host.clientHeight=h;this.width=0;}}
    start(){if(this.active)return;this.active=true;this.lastTime=0;this.frame();}
    frame(){if(!this.active)return;const now=Date.now();try{if(!this.lastFrame||now-this.lastFrame>=30){this.lastFrame=now;this.render(now);}}catch(error){this.stop();if(options.onError)options.onError(error);else throw error;return;}this.frameId=canvas.requestAnimationFrame(()=>this.frame());}
    stop(){this.active=false;if(this.frameId)canvas.cancelAnimationFrame(this.frameId);this.frameId=null;this.pointer=null;}
    reset(){this.resetRotation();}
    clear(){this.clearFloor();}
    touchStart(x,y){const b=this.smokeBounds;this.pointer={x,y,smoke:!!b&&x>=b.x-18&&x<=b.x+b.width+18&&y>=b.y-18&&y<=b.y+b.height+18};}
    touchMove(x,y){if(!this.pointer)return;const dx=x-this.pointer.x,dy=y-this.pointer.y;if(this.pointer.smoke){const p=this.smokePosition||this.defaultSmokePosition();this.smokePosition={x:clamp(p.x+dx/host.clientWidth,.16,.84),y:clamp(p.y+dy/host.clientHeight,.18,.8)};}else this.rotate(dx*.009,dy*.008);this.pointer.x=x;this.pointer.y=y;}
    touchEnd(){this.pointer=null;}
    destroy(){
      this.stop();
      const geometries=new Set(),materials=new Set(),textures=new Set();
      if(this.scene)this.scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){materials.add(material);for(const key of ['map','bumpMap'])if(material[key])textures.add(material[key]);}});
      for(const item of geometries)item.dispose();for(const item of materials)item.dispose();for(const item of textures)item.dispose();
      if(this.smokeMap&&!textures.has(this.smokeMap))this.smokeMap.dispose();
      if(this.renderer)this.renderer.dispose();
    }
  }
  const scene=new Scene(host,state,null,()=>{});
  // The adapter's Three revision predates the colorSpace API.
  scene.renderer.outputEncoding=THREE.sRGBEncoding;
  scene.nutTexture.encoding=THREE.sRGBEncoding;
  scene.scene.traverse(object=>{if(object.material&&object.material.map)object.material.map.encoding=THREE.sRGBEncoding;});
  return scene;
};
