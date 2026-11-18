const config=require('../../config');
const header=require('../../utils/header');
Page({
  data:{contact:config.contact,version:config.version},
  onLoad(){this.client=getApp().client;this.unsubscribe=this.client.subscribe(()=>this.update());this.update();},
  onShow(){this.update();},
  onHide(){if(this.sounds)this.sounds.stop();},
  onUnload(){this.onHide();if(this.unsubscribe)this.unsubscribe();},
  update(){this.setData(header.data(this.client));},
  goAccount:header.goAccount,
  toggleSound(){header.toggleSound(this);}
});
