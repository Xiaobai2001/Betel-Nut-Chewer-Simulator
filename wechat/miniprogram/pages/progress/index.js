const { today } = require('../../utils/client');
const { dayShift } = require('../../lib/progress');
const money = cents => (cents / 100).toFixed(2);
Page({
  data: { stats:null, guest:true, busy:false, error:'', day:today(), firstDay:dayShift(today(),-6), lastDay:today(), nutFree:false, smokeFree:false, tiers:['50 档 · 10 颗','100 档 · 15 颗','200 档 · 20 颗'], tierIndex:0, nutPrice:'', nutsPerDay:'', smokePrice:'', cigarettesPerDay:'' },
  onLoad(){this.client=getApp().client;this.unsubscribe=this.client.subscribe(()=>this.update());this.update();this.loadBaseline();},
  onShow(){if(!this.client)return;this.update();this.client.refresh().then(()=>this.loadBaseline());},
  onUnload(){if(this.unsubscribe)this.unsubscribe();},
  update(){
    const stats=this.client.stats, owner=this.client.user?String(this.client.user.id):'guest';
    const changed=this.owner!==owner; if(changed){this.owner=owner;this.formDirty=false;this.checkDirty=false;this.setData({day:today()});}
    const packs=stats?stats.progress.packs.map(pack=>Object.assign({},pack,{icons:Array.from({length:Math.min(pack.whole,6)},(_,i)=>i),dots:Array.from({length:pack.capacity},(_,i)=>({id:i,filled:i<pack.remainder}))})):[];
    const box=stats&&stats.progress.cigaretteBoxes;
    const achievements=stats?stats.progress.achievements.map(a=>Object.assign({},a,{percent:Math.min(100,Math.round(a.value/a.target*100))})):[];
    const savings=stats&&stats.savings;
    this.setData({stats,guest:!this.client.user,pending:this.client.pendingCount,syncError:this.client.syncError,packs,box,boxIcons:box?Array.from({length:Math.min(box.whole,6)},(_,i)=>i):[],boxDots:box?Array.from({length:20},(_,i)=>({id:i,filled:i<box.remainder})):[],achievements,saved:savings&&savings.configured?money(savings.totalCents):'',savedToday:savings&&savings.configured?money(savings.todayCents):'',firstDay:dayShift(today(),-6),lastDay:today()});
    if(!this.checkDirty)this.loadDay();
    if(changed)this.loadBaseline();
  },
  loadDay(){const row=this.client.stats&&this.client.stats.progress.calendar.find(r=>r.day===this.data.day);this.setData({nutFree:!!(row&&row.nutFree),smokeFree:!!(row&&row.smokeFree),recorded:!!(row&&row.recorded)});},
  selectDay(e){this.checkDirty=false;this.setData({day:e.detail.value});this.loadDay();},
  switchCheck(e){this.checkDirty=true;this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
  async task(action,success){if(this.data.busy)return;this.setData({busy:true,error:''});try{await action();if(success)wx.showToast({title:success,icon:'none'});}catch(e){this.setData({error:e.message});}finally{this.setData({busy:false});}},
  checkin(){const {day,nutFree,smokeFree}=this.data;this.task(async()=>{await this.client.checkin({day,nutFree,smokeFree});this.checkDirty=false;this.loadDay();},'打卡已保存');},
  refresh(){this.task(()=>this.client.refresh());},
  loadBaseline(){if(this.formDirty)return;const b=this.client.stats&&this.client.stats.savings.baseline;this.setData({tierIndex:b?[50,100,200].indexOf(b.nutTier):0,nutPrice:b?money(b.nutPriceCents):'',nutsPerDay:b?String(b.nutsPerDay):'',smokePrice:b?money(b.smokePriceCents):'',cigarettesPerDay:b?String(b.cigarettesPerDay):''});},
  input(e){this.formDirty=true;this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
  tier(e){this.formDirty=true;this.setData({tierIndex:Number(e.detail.value)});},
  saveSavings(){
    const d=this.data,price=value=>/^\d{1,5}(\.\d{1,2})?$/.test(value)?Math.round(Number(value)*100):NaN,count=value=>/^\d{1,3}$/.test(value)?Number(value):NaN;
    const baseline={nutTier:[50,100,200][d.tierIndex],nutPriceCents:price(d.nutPrice),nutsPerDay:count(d.nutsPerDay),smokePriceCents:price(d.smokePrice),cigarettesPerDay:count(d.cigarettesPerDay)};
    this.task(async()=>{await this.client.saveSavings(baseline);this.formDirty=false;this.loadBaseline();},'省钱基准已保存');
  },
  clearSavings(){this.task(async()=>{await this.client.saveSavings(null);this.formDirty=false;this.loadBaseline();},'已清除省钱基准');}
});
