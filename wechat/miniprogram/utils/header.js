const Sounds=require('./audio');
exports.data=client=>({accountLabel:client.user?(client.user.displayName||client.user.username)+' · 统计':'访客 · 本机记录',sound:client.preferences.sound});
exports.goAccount=()=>wx.navigateTo({url:'/pages/account/index'});
exports.toggleSound=function(page){
  try{page.client.setPreference('sound',!page.client.preferences.sound);if(!page.sounds)page.sounds=new Sounds();if(page.client.preferences.sound)page.sounds.play('chew',true);else page.sounds.stop();}
  catch(error){wx.showToast({title:error.message,icon:'none'});}
};
