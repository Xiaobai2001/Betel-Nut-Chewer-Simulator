const Scene=require('../../utils/scene');
const Sounds=require('../../utils/audio');
Page({
  data:{wear:0,bites:0,fibers:0,pack:50,remaining:9,capacity:10,smokeRemaining:20,hasNut:true,lit:false,holding:false,used:0,sound:false,auto:false,full:false,zoom:100,sceneHeight:300,safeTop:28,packEffect:null,breathing:false,breathSeconds:60,breathPhase:'轻轻吸气',error:'',tiers:[{tier:50,name:'青椰绿',capacity:10},{tier:100,name:'秋山金',capacity:15},{tier:200,name:'夜岩黑',capacity:20}]},
  onLoad(){
    this.client=getApp().client;this.sounds=new Sounds();this.unsubscribe=this.client.subscribe(()=>this.update());
    const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();this.windowInfo=info;
    this.setData({safeTop:(info.statusBarHeight||24)+8,sceneHeight:Math.min(330,info.windowWidth*.82)});this.update();
  },
  onReady(){this.setupCanvas();},
  onShow(){if(!this.client)return;this.update();if(this.scene){this.resizeScene();this.scene.start();}this.startClock();},
  onHide(){this.stopAuto();this.stopClock();this.stopBreathing();if(this.scene)this.scene.stop();this.sounds.stop();if(this.data.full)this.toggleFull();},
  onUnload(){this.onHide();if(this.unsubscribe)this.unsubscribe();if(this.scene)this.scene.destroy();clearTimeout(this.packTimer);},
  onResize(){if(wx.getWindowInfo)this.windowInfo=wx.getWindowInfo();this.resizeScene();},
  setupCanvas(){
    const query=wx.createSelectorQuery().in(this);query.select('#scene').fields({node:true,size:true,rect:true}).exec(result=>{
      const item=result[0];if(!item||!item.node){this.setData({error:'画布初始化失败，请升级微信后重试。'});return;}
      this.canvasNode=item.node;this.scene=new Scene(item.node,item.width,item.height,this.windowInfo.pixelRatio,this.client.state);this.scene.reduced=this.client.preferences.reducedMotion;this.scene.start();
    });
  },
  resizeScene(){
    const info=this.windowInfo||{};this.setData({sceneHeight:this.data.full?Math.max(180,info.windowHeight-this.data.safeTop-260):Math.min(330,info.windowWidth*.82)});
    wx.nextTick(()=>wx.createSelectorQuery().in(this).select('#scene').boundingClientRect(rect=>{if(rect&&this.scene)this.scene.resize(rect.width,rect.height);}).exec());
  },
  update(){
    const s=this.client.state,n=s.nut,c=s.cigarette;
    if(this.scene){this.scene.state=s;this.scene.reduced=this.client.preferences.reducedMotion;}
    this.setData({wear:n?n.wear:0,bites:n?n.bites:0,fibers:n?n.fibers:0,hasNut:!!n,nutPack:n?n.pack:s.pack,pack:s.pack,remaining:s.remaining,capacity:s.capacity,smokeRemaining:s.smokeRemaining,lit:c.lit,holding:c.holding,used:Math.round(c.used*100),sound:this.client.preferences.sound,reduced:this.client.preferences.reducedMotion,accountLabel:this.client.user?'账号记录':'访客 · 本机记录',status:!n?'口中已空，休息一下':n.wear===100?'已纤维化，可以吐出':n.wear>50?'逐渐松散，颜色加深':n.wear?'纹理松动，轻微压扁':'饱满完整，尚未咀嚼'});
    if(this.autoTimer&&(!n||n.wear>=100))this.stopAuto();
  },
  run(type,value){try{const ok=this.client.perform(type,value);this.setData({error:''});return ok;}catch(error){this.stopAuto();this.stopClock();this.setData({error:error.message});return false;}},
  primary(){
    const s=this.client.state;
    if(!s.nut){if(!s.remaining&&!this.openPack(s.pack))return;if(this.run('take'))this.startClock();return;}
    if(this.run('chew')){if(this.scene)this.scene.chew();this.sounds.play('chew',this.data.sound);}
  },
  action(event){
    const type=event.currentTarget.dataset.action,nut=this.client.state.nut&&Object.assign({},this.client.state.nut);
    if(!this.run(type))return;
    if(type==='spit'||type==='discard'){if(this.scene)this.scene.spit(type==='discard',nut);this.sounds.play('spit',this.data.sound);}
    if(type==='inhale')this.sounds.play('inhale',this.data.sound);
    if(type==='exhale'){if(this.scene)this.scene.exhale();this.sounds.play('exhale',this.data.sound);}
    if(type==='light')this.startClock();
  },
  openPack(value){
    if(!this.run('pack',value))return false;
    clearTimeout(this.packTimer);this.setData({packEffect:null});
    wx.nextTick(()=>{this.setData({packEffect:{tier:value,name:{50:'青椰',100:'秋山',200:'夜岩'}[value],capacity:this.client.state.capacity}});this.packTimer=setTimeout(()=>this.setData({packEffect:null}),this.data.reduced?550:1300);});
    this.sounds.play('pack',this.data.sound);return true;
  },
  changePack(event){this.openPack(Number(event.currentTarget.dataset.tier));},
  toggleAuto(){if(this.autoTimer){this.stopAuto();return;}if(!this.data.hasNut||this.data.wear>=100)return;this.setData({auto:true});this.autoTimer=setInterval(()=>this.primary(),760);},
  stopAuto(){clearInterval(this.autoTimer);this.autoTimer=null;if(this.data.auto)this.setData({auto:false});},
  startClock(){this.stopClock();this.lastBurn=Date.now();this.burnTimer=setInterval(()=>{const now=Date.now(),ms=Math.min(1500,now-this.lastBurn);this.lastBurn=now;if(this.client.state.cigarette.lit)this.run('burn',ms);},1000);},
  stopClock(){clearInterval(this.burnTimer);this.burnTimer=null;},
  toggleSound(){try{this.client.setPreference('sound',!this.data.sound);if(this.data.sound)this.sounds.play('chew',true);else this.sounds.stop();}catch(error){this.setData({error:error.message});}},
  toggleFull(){this.setData({full:!this.data.full});if(this.data.full)wx.hideTabBar({animation:false});else wx.showTabBar({animation:false});this.resizeScene();},
  zoom(event){this.setData({zoom:event.detail.value});if(this.scene)this.scene.setZoom(event.detail.value/100);},
  reset(){if(this.scene)this.scene.reset();this.setData({zoom:100});},
  clearFloor(){if(this.scene)this.scene.clear();},
  touchStart(event){const t=event.touches[0];if(t&&this.scene)this.scene.touchStart(t.x,t.y);},
  touchMove(event){const t=event.touches[0];if(t&&this.scene)this.scene.touchMove(t.x,t.y);},
  touchEnd(){if(this.scene)this.scene.touchEnd();},
  rest(){
    this.stopAuto();this.stopBreathing();if(!this.run('putDown'))return;if(this.data.full)this.toggleFull();
    this.setData({breathing:true,breathSeconds:60,breathPhase:'轻轻吸气'});this.breathStart=Date.now();
    this.breathTimer=setInterval(()=>{const elapsed=(Date.now()-this.breathStart)/1000;if(elapsed>=60){this.stopBreathing();if(this.run('breathDone'))wx.showToast({title:'完成一次呼吸练习',icon:'none'});}else this.setData({breathSeconds:Math.ceil(60-elapsed),breathPhase:elapsed%10<4?'轻轻吸气':'慢慢呼气'});},200);
  },
  stopBreathing(){clearInterval(this.breathTimer);this.breathTimer=null;if(this.data.breathing)this.setData({breathing:false});},
  goGuide(){wx.navigateTo({url:'/pages/guide/index'});}
});
