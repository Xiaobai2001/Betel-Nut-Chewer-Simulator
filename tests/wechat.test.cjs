const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Client,today}=require('../wechat/miniprogram/utils/client');
const platform=require('./wechat-platform.cjs');
const config={apiBase:'',allowInsecureDevelopment:false};
const baseline={nutTier:50,nutPriceCents:5000,nutsPerDay:3,smokePriceCents:2000,cigarettesPerDay:10};
test('native guest package attribution, real checkins and savings survive relaunch without implicit abstinence',async()=>{
  const wx=platform(),c=new Client(wx,config);
  for(const [tier,capacity] of [[50,10],[100,15],[200,20]]){
    c.perform('pack',tier);if(c.state.nut)c.perform('discard');
    for(let n=0;n<capacity;n++){assert(c.perform('take'));assert(c.perform('chew'));assert(c.perform('discard'));}
  }
  for(let n=0;n<21;n++){assert(c.perform('light'));assert(c.perform('inhale'));c.perform('extinguish');}
  assert.deepEqual(c.stats.progress.packs.map(p=>p.whole),[1,1,1]);assert.equal(c.stats.progress.cigaretteBoxes.whole,1);assert.equal(c.stats.progress.cigaretteBoxes.remainder,1);
  assert.equal(c.stats.progress.real.recordedDays,0);assert.equal(c.stats.savings.totalCents,null);
  await c.saveSavings(baseline);assert.equal(c.stats.savings.totalCents,0);
  await c.checkin({day:today(),nutFree:true,smokeFree:true});assert.equal(c.stats.savings.totalCents,2500);
  const next=new Client(wx,config);assert.equal(next.stats.total.nuts_started,45);assert.equal(next.stats.savings.totalCents,2500);assert.equal(wx.calls.length,0);
  await next.checkin({day:today(),nutFree:false,smokeFree:true});assert.equal(next.stats.savings.totalCents,1000);
});
test('storage failure rolls back visible model and never pretends a record was saved',()=>{
  const wx=platform(),c=new Client(wx,config);wx.failStorage=true;assert.throws(()=>c.perform('chew'),/存储/);assert.equal(c.state.nut.bites,0);assert.equal(c.stats.total.bites,0);
});
test('public HTTP and release localhost are refused; default guest has no request side effects',async()=>{
  const wx=platform();await assert.rejects(new Client(wx,config).api('session'),/尚未配置/);
  await assert.rejects(new Client(wx,{apiBase:'http://101.201.68.203:8081',allowInsecureDevelopment:true}).api('session'),/HTTPS/);
  wx.getAccountInfoSync=()=>({miniProgram:{envVersion:'release'}});
  await assert.rejects(new Client(wx,{apiBase:'http://127.0.0.1:4180',allowInsecureDevelopment:true}).api('session'),/HTTPS/);assert.equal(wx.calls.length,0);
});
test('unacknowledged and malformed server replies preserve all queued events',async()=>{
  const wx=platform(),c=new Client(wx,config);c.session={user:{id:'9007199254740993'},token:'x'};c.perform('chew');c.api=async()=>({});assert.equal(await c.flush(),false);assert.equal(c.pendingCount,1);assert.match(c.syncError,/未确认/);
  c.api=async()=>{c.perform('spit');return {ackSeq:1};};assert.equal(await c.flush(),true);assert.equal(c.pendingCount,1);assert.equal(c.pending(c.user.id)[0].seq,2);
});
test('an expired account with a queue can reauthenticate, while switching accounts preserves ownership',async()=>{
  const wx=platform(),c=new Client(wx,config),a={id:'9007199254740992',username:'a'},b={id:'9007199254740993',username:'b'};
  c.session={user:a,token:'old'};c.perform('chew');c.expired=true;
  c.api=async route=>route==='login'?{user:b,token:'other'}:{ok:true};await assert.rejects(c.login('login',{}),/原账号/);assert.equal(c.user.id,a.id);assert.equal(c.pendingCount,1);
  c.api=async(route,body)=>route==='login'?{user:a,token:'fresh'}:route==='events-v2'?{ackSeq:body.events.at(-1).seq}:Object.assign(c.guestStats(),{accountId:a.id});
  await c.login('login',{});assert.equal(c.session.token,'fresh');assert.equal(c.pendingCount,0);assert.equal(c.expired,false);
});
test('page modules execute without DOM, preserve edited checkins across sync updates, and hide timers',async()=>{
  const wx=platform(),client=new Client(wx,config);wx.showToast=()=>{};wx.getWindowInfo=()=>({windowWidth:390,windowHeight:844,pixelRatio:3,statusBarHeight:44});
  global.wx=wx;global.getApp=()=>({client});
  const load=name=>{let def;global.Page=value=>def=value;const file=path.resolve('wechat/miniprogram/pages',name,'index.js');delete require.cache[file];require(file);def.data=structuredClone(def.data);def.setData=function(value){Object.assign(this.data,value);};def.onLoad?.();return def;};
  const p=load('progress');p.switchCheck({currentTarget:{dataset:{field:'nutFree'}},detail:{value:true}});client.emit();assert.equal(p.data.nutFree,true);
  p.setData({nutPrice:'50',nutsPerDay:'3',smokePrice:'20',cigarettesPerDay:'10'});p.saveSavings();await new Promise(resolve=>setImmediate(resolve));assert.equal(client.stats.savings.configured,true);p.onUnload();
  const account=load('account');account.input({currentTarget:{dataset:{field:'password'}},detail:{value:'dummy'}});assert.equal(account.data.password,'dummy');account.onUnload();
  load('guide');const index=load('index');index.primary();assert.equal(index.data.bites,1);index.toggleAuto();assert(index.autoTimer);index.onHide();assert.equal(index.autoTimer,null);assert.equal(index.burnTimer,null);index.onUnload();
  delete global.wx;delete global.getApp;delete global.Page;
});
test('source includes all native pages, resolvable imports, no template condition literals or unsupported HTML',()=>{
  const root=path.resolve('wechat/miniprogram'),app=JSON.parse(fs.readFileSync(path.join(root,'app.json')));
  for(const page of app.pages){for(const suffix of ['.js','.wxml','.wxss','.json'])assert(fs.existsSync(path.join(root,page+suffix)));const markup=fs.readFileSync(path.join(root,page+'.wxml'),'utf8');assert(!/wx:(?:if|elif|for)="(?!\{\{)/.test(markup));assert(!/<(?:br|div|span|script)\b/.test(markup));}
  for(const file of fs.readdirSync(root,{recursive:true}).filter(x=>x.endsWith('.js'))){const source=fs.readFileSync(path.join(root,file),'utf8');new vm.Script(source,{filename:file});for(const [,request] of source.matchAll(/require\(['"]([^'"]+)['"]\)/g))assert(fs.existsSync(path.resolve(root,path.dirname(file),request+'.js')),file+': '+request);}
});
