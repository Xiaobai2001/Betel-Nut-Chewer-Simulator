const config=require('../../config');
Page({
  data:{user:null,mode:'login',username:'',password:'',displayName:'',busy:false,error:'',configured:!!config.apiBase,version:config.version},
  onLoad(){this.client=getApp().client;this.unsubscribe=this.client.subscribe(()=>this.update());this.update();},
  onShow(){if(this.client){this.update();this.client.refresh();}},
  onUnload(){if(this.unsubscribe)this.unsubscribe();},
  update(){this.setData({user:this.client.user,expired:this.client.expired,pending:this.client.pendingCount,syncError:this.client.syncError,sound:this.client.preferences.sound,reducedMotion:this.client.preferences.reducedMotion});},
  input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
  mode(e){this.setData({mode:e.currentTarget.dataset.mode,error:'',password:''});},
  async submit(){
    if(this.data.busy)return;
    const {username,password,displayName,mode}=this.data;
    if(!/^[a-zA-Z0-9_]{3,24}$/.test(username)||password.length<8||password.length>128||displayName.length>24){this.setData({error:'账号为 3–24 位字母、数字或下划线，密码 8–128 位，昵称最多 24 字。'});return;}
    this.setData({busy:true,error:''});
    try{await this.client.login(mode,{username,password,displayName});this.setData({password:''});wx.showToast({title:'已登录原账号',icon:'none'});}catch(e){this.setData({error:e.message});}finally{this.setData({busy:false});}
  },
  async sync(){if(this.data.busy)return;this.setData({busy:true,error:''});try{await this.client.refresh();}catch(e){this.setData({error:e.message});}finally{this.setData({busy:false});}},
  async logout(){if(this.data.busy)return;this.setData({busy:true,error:''});try{await this.client.logout();}catch(e){this.setData({error:e.message});}finally{this.setData({busy:false});}},
  preference(e){try{this.client.setPreference(e.currentTarget.dataset.field,e.detail.value);}catch(error){this.setData({error:error.message});}},
  guide(){wx.switchTab({url:'/pages/guide/index'});}
});
