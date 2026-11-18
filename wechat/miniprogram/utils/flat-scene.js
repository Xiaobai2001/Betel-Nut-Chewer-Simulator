const createVisuals=require('../lib/web-visuals');

// Native Canvas nodes have no DOM clientWidth/clientHeight. Keep those measurements
// in a small facade while delegating drawing to the original website renderer.
function surface(node,width,height){
  const ctx=node.getContext('2d');
  if(!ctx.roundRect)ctx.roundRect=function(x,y,w,h,radius){
    const values=Array.isArray(radius)?radius:[radius,radius,radius,radius];
    const [a,b,c,d]=values.map(value=>Math.min(value,w/2,h/2));
    this.moveTo(x+a,y);this.lineTo(x+w-b,y);this.quadraticCurveTo(x+w,y,x+w,y+b);
    this.lineTo(x+w,y+h-c);this.quadraticCurveTo(x+w,y+h,x+w-c,y+h);
    this.lineTo(x+d,y+h);this.quadraticCurveTo(x,y+h,x,y+h-d);
    this.lineTo(x,y+a);this.quadraticCurveTo(x,y,x+a,y);this.closePath();
  };
  return {node,clientWidth:width,clientHeight:height,getContext:()=>ctx,
    get width(){return node.width;},set width(value){node.width=value;},
    get height(){return node.height;},set height(value){node.height=value;}};
}
module.exports=function FlatScene(main,smoke,state,ratio,reduced){
  const mainSurface=surface(main.node,main.width,main.height),smokeSurface=surface(smoke.node,smoke.width,smoke.height);
  const Visuals=createVisuals({pixelRatio:ratio||1,now:()=>Date.now(),reduced:!!reduced});
  class Scene extends Visuals{
    resize(width,height,smokeWidth,smokeHeight){
      if(width>0&&height>0){this.main.clientWidth=width;this.main.clientHeight=height;}
      if(smokeWidth>0&&smokeHeight>0){this.smoke.clientWidth=smokeWidth;this.smoke.clientHeight=smokeHeight;}
    }
    start(){if(this.active)return;this.active=true;this.lastFrame=0;this.frame();}
    frame(){if(!this.active)return;const now=Date.now();if(!this.lastFrame||now-this.lastFrame>=30){this.lastFrame=now;this.draw(now);}this.frameId=main.node.requestAnimationFrame(()=>this.frame());}
    stop(){this.active=false;if(this.frameId)main.node.cancelAnimationFrame(this.frameId);this.frameId=null;}
    destroy(){this.stop();this.particles=[];this.ejected=[];this.clouds=[];}
  }
  return new Scene(mainSurface,smokeSurface,state);
};
