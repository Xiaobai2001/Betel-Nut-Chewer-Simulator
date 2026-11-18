const FlatScene=require('../../utils/flat-scene');
const FallbackScene=require('../../utils/scene');
const Sounds=require('../../utils/audio');
Page({
  data:{renderer:'2d',wear:0,bites:0,fibers:0,pack:50,remaining:9,capacity:10,smokeRemaining:20,hasNut:true,lit:false,holding:false,used:0,sound:false,auto:false,full:false,zoom:100,viewportHeight:640,pageWidth:375,bottomInset:0,compact:false,packEffect:null,error:'',tiers:[{tier:50,brand:'青 椰',name:'青椰绿',capacity:10},{tier:100,brand:'秋 山',name:'秋山金',capacity:15},{tier:200,brand:'夜 岩',name:'夜岩黑',capacity:20}]},
  onLoad(){
    this.visible=true;this.ready=false;this.sceneGeneration=0;this.switchToken=0;
    this.client=getApp().client;this.sounds=new Sounds();this.unsubscribe=this.client.subscribe(()=>this.update());
    this.fitViewport();this.update();
  },
  onReady(){this.ready=true;this.setupCanvas();},
  onShow(){if(!this.client)return;this.visible=true;this.update();this.fitViewport(()=>{if(!this.ready)return;if(this.scene){this.resizeScene();this.scene.start();}else this.setupCanvas();});this.startClock();},
  onHide(){
    this.visible=false;this.switchToken++;this.switching=false;this.stopAuto();this.stopClock();this.sounds.stop();this.releaseScene();
    if(this.data.full){this.setData({full:false,renderer:'2d',zoom:100});wx.showTabBar({animation:false});}
  },
  onUnload(){this.onHide();this.ready=false;if(this.unsubscribe)this.unsubscribe();clearTimeout(this.packTimer);},
  onPageScroll(event){if(!this.data.full&&!this.switching)this.homeScrollTop=event.scrollTop;},
  onResize(){this.fitViewport(()=>this.resizeScene());},
  fitViewport(done){
    const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();this.windowInfo=info;
    const inset=info.safeArea?info.screenHeight-info.safeArea.bottom:0;
    const bottom=this.data.full&&Number.isFinite(inset)?Math.max(0,Math.min(40,inset)):0;
    this.setData({pageWidth:info.windowWidth,viewportHeight:info.windowHeight,bottomInset:bottom,compact:info.windowHeight<560},done);
  },
  canvasSelector(){return this.data.full?(this.data.renderer==='webgl'?'#immersive-canvas':'#fallback-canvas'):'#home-canvas';},
  releaseScene(){this.sceneGeneration++;if(this.scene)this.scene.destroy();this.scene=null;},
  setupCanvas(){
    if(!this.ready||!this.visible)return;
    this.releaseScene();const generation=this.sceneGeneration,full=this.data.full,renderer=this.data.renderer;
    const query=wx.createSelectorQuery().in(this);query.select(this.canvasSelector()).fields({node:true,size:true});
    if(!full)query.select('#smoke-preview').fields({node:true,size:true});
    query.exec(result=>{
      if(generation!==this.sceneGeneration||!this.visible)return;
      const item=result[0],smoke=result[1];
      if(!item||!item.node||(!full&&(!smoke||!smoke.node))){this.setData({error:'画布初始化失败，请重新编译或升级微信后重试。'});return;}
      try{
        if(!full)this.scene=new FlatScene(item,smoke,this.client.state,this.windowInfo.pixelRatio,this.client.preferences.reducedMotion);
        else if(renderer==='webgl'){
          const WebScene=require('../../utils/webgl-scene');
          this.scene=new WebScene(item.node,item.width,item.height,this.windowInfo.pixelRatio,this.client.state,{reduced:this.client.preferences.reducedMotion,onError:()=>wx.nextTick(()=>{if(generation===this.sceneGeneration)this.canvasError();})});
        }else this.scene=new FallbackScene(item.node,item.width,item.height,this.windowInfo.pixelRatio,this.client.state);
        this.scene.reduced=this.client.preferences.reducedMotion;this.scene.start();
      }catch(error){
        this.releaseScene();
        if(full&&renderer==='webgl')this.canvasError();
        else this.setData({error:'场景初始化失败，请重新编译或升级微信后重试。'});
      }
    });
  },
  resizeScene(){
    if(!this.ready||!this.visible)return;
    const generation=this.sceneGeneration,query=wx.createSelectorQuery().in(this);
    query.select(this.canvasSelector()).boundingClientRect();if(!this.data.full)query.select('#smoke-preview').boundingClientRect();
    query.exec(result=>{if(generation!==this.sceneGeneration||!this.scene||!result[0])return;const [main,smoke]=result;this.scene.resize(main.width,main.height,smoke&&smoke.width,smoke&&smoke.height);});
  },
  canvasError(){if(this.data.full&&this.data.renderer==='webgl'){this.releaseScene();this.setData({renderer:'fallback'},()=>wx.nextTick(()=>this.setupCanvas()));}},
  update(){
    const s=this.client.state,n=s.nut,c=s.cigarette;
    if(this.scene){this.scene.state=s;this.scene.reduced=this.client.preferences.reducedMotion;}
    this.setData({bitesLabel:String(n?n.bites:0).padStart(2,'0'),sessionBites:s.totalBites,sessionSpits:s.spits,sessionDiscarded:s.discarded,wear:n?n.wear:0,bites:n?n.bites:0,fibers:n?n.fibers:0,hasNut:!!n,nutPack:n?n.pack:s.pack,pack:s.pack,remaining:s.remaining,capacity:s.capacity,smokeRemaining:s.smokeRemaining,lit:c.lit,holding:c.holding,used:Math.round(c.used*100),sound:this.client.preferences.sound,reduced:this.client.preferences.reducedMotion,accountLabel:this.client.user?(this.client.user.displayName||this.client.user.username)+' · 统计':'访客 · 本机记录',status:!n?'口中已空，休息一下':n.wear===100?'已纤维化，可以吐出':n.wear>50?'逐渐松散，颜色加深':n.wear?'纹理松动，轻微压扁':'饱满完整，尚未咀嚼'});
    if(this.autoTimer&&(!n||n.wear>=100))this.stopAuto();
  },
  run(type,value){try{const ok=this.client.perform(type,value);this.setData({error:''});return ok;}catch(error){this.stopAuto();this.stopClock();this.setData({error:error.message});return false;}},
  primary(){
    const s=this.client.state;
    if(!s.nut){if(!s.remaining&&!this.openPack(s.pack))return;if(this.run('take')){if(this.scene&&this.scene.take)this.scene.take();this.startClock();}return;}
    if(this.run('chew')){if(this.scene)this.scene.chew();this.sounds.play('chew',this.data.sound);}
  },
  action(event){
    const type=event.currentTarget.dataset.action,nut=this.client.state.nut&&Object.assign({},this.client.state.nut);
    if(!this.run(type))return;
    if(type==='spit'||type==='discard'){if(this.scene)this.scene.spit(type==='discard',nut);this.sounds.play('spit',this.data.sound);}
    if(type==='inhale'){if(this.scene&&this.scene.inhale)this.scene.inhale();this.sounds.play('inhale',this.data.sound);}
    if(type==='exhale'){if(this.scene)this.scene.exhale();this.sounds.play('exhale',this.data.sound);}
    if(type==='light')this.startClock();
  },
  openPack(value){
    if(!this.run('pack',value))return false;
    clearTimeout(this.packTimer);this.setData({packEffect:null});
    wx.nextTick(()=>{this.setData({packEffect:{tier:value,name:{50:'青椰',100:'秋山',200:'夜岩'}[value],capacity:this.client.state.capacity}});this.packTimer=setTimeout(()=>this.setData({packEffect:null}),this.data.reduced?550:1300);});
    this.sounds.play('pack',this.data.sound);return true;
  },
  refillPack(){this.openPack(this.client.state.pack);},
  changePack(event){this.openPack(Number(event.currentTarget.dataset.tier));},
  toggleAuto(){if(this.autoTimer){this.stopAuto();return;}if(!this.data.hasNut||this.data.wear>=100)return;this.setData({auto:true});this.autoTimer=setInterval(()=>this.primary(),760);},
  stopAuto(){clearInterval(this.autoTimer);this.autoTimer=null;if(this.data.auto)this.setData({auto:false});},
  startClock(){this.stopClock();this.lastBurn=Date.now();this.burnTimer=setInterval(()=>{const now=Date.now(),ms=Math.min(1500,now-this.lastBurn);this.lastBurn=now;if(this.client.state.cigarette.lit)this.run('burn',ms);},1000);},
  stopClock(){clearInterval(this.burnTimer);this.burnTimer=null;},
  toggleSound(){try{this.client.setPreference('sound',!this.data.sound);if(this.data.sound)this.sounds.play('chew',true);else this.sounds.stop();}catch(error){this.setData({error:error.message});}},
  toggleFull(){
    if(this.switching||!this.visible)return;this.switching=true;this.releaseScene();const full=!this.data.full,token=++this.switchToken;
    this.setData({full,renderer:full?'webgl':'2d',zoom:100,error:''},()=>{
      if(token!==this.switchToken||!this.visible)return;
      const complete=()=>{if(token!==this.switchToken||!this.visible)return;this.fitViewport(()=>wx.nextTick(()=>{if(token!==this.switchToken||!this.visible)return;this.switching=false;this.setupCanvas();if(!full&&wx.pageScrollTo)wx.pageScrollTo({scrollTop:this.homeScrollTop||0,duration:0});}));};
      if(full)wx.hideTabBar({animation:false,complete});else wx.showTabBar({animation:false,complete});
    });
  },
  zoom(event){this.setData({zoom:event.detail.value});if(this.scene)this.scene.setZoom(event.detail.value/100);},
  reset(){if(this.scene)this.scene.reset();this.setData({zoom:100});},
  clearFloor(){if(this.scene)this.scene.clear();},
  touchStart(event){const t=event.touches[0];if(t&&this.scene&&this.scene.touchStart)this.scene.touchStart(t.x,t.y);},
  touchMove(event){const t=event.touches[0];if(t&&this.scene&&this.scene.touchMove)this.scene.touchMove(t.x,t.y);},
  touchEnd(){if(this.scene&&this.scene.touchEnd)this.scene.touchEnd();},
  goAccount(){wx.navigateTo({url:'/pages/account/index'});},
  rest(){wx.switchTab({url:'/pages/pause/index'});},
  goGuide(){wx.switchTab({url:'/pages/guide/index'});}
});
