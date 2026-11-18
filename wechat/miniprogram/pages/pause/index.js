const header=require('../../utils/header');
Page({
  data:{running:false,completed:false,seconds:60,phase:'准备好了',error:'',reduced:false},
  onLoad(){this.client=getApp().client;this.unsubscribe=this.client.subscribe(()=>this.update());this.update();},
  onShow(){this.update();},
  onHide(){this.stop();if(this.sounds)this.sounds.stop();},
  onUnload(){this.onHide();if(this.unsubscribe)this.unsubscribe();},
  update(){
    const owner=this.client.user?String(this.client.user.id):'guest';
    if(this.owner!==undefined&&this.owner!==owner){this.stop();this.setData({completed:false});}
    this.owner=owner;this.setData(Object.assign(header.data(this.client),{reduced:this.client.preferences.reducedMotion}));
  },
  goAccount:header.goAccount,
  toggleSound(){header.toggleSound(this);},
  start(){
    if(this.data.running)return;
    try{if(!this.client.perform('putDown'))return;this.setData({running:true,completed:false,seconds:60,phase:'轻轻吸气',error:''});this.started=Date.now();this.timer=setInterval(()=>this.tick(),200);}
    catch(error){this.setData({error:error.message});}
  },
  tick(){
    if(!this.data.running)return;
    const elapsed=(Date.now()-this.started)/1000;
    if(elapsed>=60){
      this.stop();
      try{if(this.client.perform('breathDone')){this.setData({completed:true,seconds:0,phase:'完成了'});wx.showToast({title:'完成一次呼吸练习',icon:'none'});}}
      catch(error){this.setData({error:error.message});}
    }else this.setData({seconds:Math.ceil(60-elapsed),phase:elapsed%10<4?'轻轻吸气':'缓缓呼气'});
  },
  stop(){clearInterval(this.timer);this.timer=null;if(this.data.running)this.setData({running:false,seconds:60,phase:'准备好了'});}
});
