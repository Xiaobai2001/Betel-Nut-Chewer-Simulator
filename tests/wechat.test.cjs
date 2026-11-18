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
  load('guide').onUnload();const index=load('index');index.primary();assert.equal(index.data.bites,1);index.toggleAuto();assert(index.autoTimer);index.onHide();assert.equal(index.autoTimer,null);assert.equal(index.burnTimer,null);index.onUnload();
  delete global.wx;delete global.getApp;delete global.Page;
});
test('source includes all native pages, resolvable imports, no template condition literals or unsupported HTML',()=>{
  const root=path.resolve('wechat/miniprogram'),app=JSON.parse(fs.readFileSync(path.join(root,'app.json')));
  for(const page of app.pages){for(const suffix of ['.js','.wxml','.wxss','.json'])assert(fs.existsSync(path.join(root,page+suffix)));const markup=fs.readFileSync(path.join(root,page+'.wxml'),'utf8');assert(!/wx:(?:if|elif|for)="(?!\{\{)/.test(markup));assert(!/<(?:br|div|span|script)\b/.test(markup));}
  for(const file of fs.readdirSync(root,{recursive:true}).filter(x=>x.endsWith('.js'))){const source=fs.readFileSync(path.join(root,file),'utf8');new vm.Script(source,{filename:file});for(const [,request] of source.matchAll(/require\(['"]([^'"]+)['"]\)/g))assert(fs.existsSync(path.resolve(root,path.dirname(file),request+'.js')),file+': '+request);}
});

test('home uses 2D and mode switches preserve the same simulation and records; stale queries and hidden switches cannot resurrect scenes',()=>{
  const wx=platform(),client=new Client(wx,config),queries=[],ticks=[],tabs=[],instances=[];
  const renderer=kind=>function(...args){const scene={kind,state:kind==='2d'?args[2]:args[4],starts:0,destroyed:false,start(){this.starts++;},destroy(){this.destroyed=true;},resize(){}};instances.push(scene);return scene;};
  let def;const context={Page:value=>def=value,getApp:()=>({client}),wx,require:name=>name.endsWith('/audio')?class{stop(){} play(){}}:renderer(name.endsWith('/flat-scene')?'2d':name.endsWith('/webgl-scene')?'webgl':'fallback'),setTimeout,clearTimeout,setInterval,clearInterval};
  wx.getWindowInfo=()=>({windowWidth:390,windowHeight:670,pixelRatio:2,screenHeight:844,safeArea:{bottom:810}});
  const scrolls=[];wx.pageScrollTo=options=>scrolls.push(options.scrollTop);
  wx.nextTick=fn=>ticks.push(fn);wx.hideTabBar=options=>tabs.push(options);wx.showTabBar=options=>tabs.push(options);
  wx.createSelectorQuery=()=>{const ids=[];return {in(){return this;},select(id){ids.push(id);return this;},fields(){return this;},boundingClientRect(){return this;},exec(callback){queries.push({ids,callback});}};};
  const resolveQuery=()=>{const q=queries.shift();q.callback(q.ids.map(()=>({node:{},width:370,height:310})));return q;};
  const finishSwitch=()=>{tabs.shift().complete();while(ticks.length)ticks.shift()();};
  vm.runInNewContext(fs.readFileSync(path.resolve('wechat/miniprogram/pages/index/index.js'),'utf8'),context);
  def.data=structuredClone(def.data);def.setData=function(value,done){Object.assign(this.data,value);done?.();};
  try{
    def.onLoad();def.onReady();assert.equal(def.data.renderer,'2d');assert.deepEqual(queries[0].ids,['#home-canvas','#smoke-preview']);resolveQuery();assert.equal(def.scene.kind,'2d');
    client.perform('chew');client.perform('light');client.perform('inhale');
    const state=client.state,snapshot=JSON.stringify(state),stats=JSON.stringify(client.stats),first=def.scene;
    def.onPageScroll({scrollTop:380});def.toggleFull();assert(first.destroyed);finishSwitch();assert.deepEqual(queries[0].ids,['#immersive-canvas']);resolveQuery();assert.equal(def.scene.kind,'webgl');assert.equal(def.scene.state,state);assert.equal(def.data.bottomInset,34);
    const full=def.scene;def.toggleFull();assert(full.destroyed);finishSwitch();resolveQuery();assert.equal(def.scene.kind,'2d');assert.equal(def.scene.state,state);assert.equal(JSON.stringify(client.state),snapshot);assert.equal(JSON.stringify(client.stats),stats);assert.equal(scrolls.at(-1),380);
    // Leave a query pending, then select the other mode before it returns.
    def.setupCanvas();def.toggleFull();finishSwitch();const count=instances.length;resolveQuery();assert.equal(instances.length,count);assert.equal(def.scene,null);resolveQuery();assert.equal(def.scene.kind,'webgl');
    // A background transition must invalidate the pending native tab callback.
    def.toggleFull();const pendingTab=tabs.shift();def.onHide();pendingTab.complete();while(ticks.length)ticks.shift()();assert.equal(def.scene,null);assert.equal(def.switching,false);assert.equal(queries.length,0);
    def.onShow();resolveQuery();assert.equal(def.scene.kind,'2d');assert.equal(def.scene.state,state);assert.equal(JSON.stringify(client.stats),stats);
    def.setupCanvas();def.onHide();const hiddenCount=instances.length;resolveQuery();assert.equal(instances.length,hiddenCount);assert.equal(def.scene,null);
  }finally{def.onUnload();}
});

test('dedicated pause page records only a full minute, cancels on leave/account switch and rolls back storage failures',()=>{
  const wx=platform(),client=new Client(wx,config),timers=new Map();let now=0,next=0,def;
  wx.showToast=()=>{};
  const context={Page:value=>def=value,getApp:()=>({client}),wx,require:()=>require('../wechat/miniprogram/utils/header'),Date:{now:()=>now},setInterval:fn=>{timers.set(++next,fn);return next;},clearInterval:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync('wechat/miniprogram/pages/pause/index.js','utf8'),context);
  def.data=structuredClone(def.data);def.setData=function(value){Object.assign(this.data,value);};
  try{
    def.onLoad();client.perform('light');client.perform('chew');def.start();assert.equal(client.state.nut,null);assert.equal(client.state.cigarette.lit,false);assert.equal(timers.size,1);
    now=59999;def.tick();assert.equal(client.stats.total.breaths,0);assert.equal(def.data.seconds,1);
    now=60000;def.tick();assert.equal(client.stats.total.breaths,1);assert.equal(timers.size,0);def.tick();assert.equal(client.stats.total.breaths,1);
    def.start();const pendingTick=timers.values().next().value;now=65000;def.onHide();now=130000;pendingTick();assert.equal(client.stats.total.breaths,1);assert.equal(timers.size,0);
    def.onShow();def.start();client.session={user:{id:'9007199254740993',username:'tester'},token:'fake'};client.emit();assert.equal(timers.size,0);assert.equal(def.data.running,false);
    client.session=null;client.emit();wx.failStorage=true;def.start();assert.match(def.data.error,/存储/);assert.equal(def.data.running,false);assert.equal(timers.size,0);
  }finally{def.onUnload();}
});

test('journal total/today tabs change the metrics and package equivalents without changing records or edited forms',()=>{
  const wx=platform(),client=new Client(wx,config);let def;
  Object.assign(client.stats.total,{bites:354,nuts_started:26,nuts_50:11,nuts_100:15,cigarettes_lit:21});
  Object.assign(client.stats.today,{bites:14,nuts_started:2,nuts_50:2,nuts_100:0,cigarettes_lit:1});
  const snapshot=JSON.stringify(client.stats),dir=path.resolve('wechat/miniprogram/pages/progress');
  vm.runInNewContext(fs.readFileSync(path.join(dir,'index.js'),'utf8'),{Page:value=>def=value,getApp:()=>({client}),wx,require:name=>require(path.resolve(dir,name))});
  def.data=structuredClone(def.data);def.setData=function(value){Object.assign(this.data,value);};
  try{
    def.onLoad();assert.equal(def.data.metrics.bites,354);assert.equal(def.data.packs[0].whole,1);assert.equal(def.data.packs[1].whole,1);assert.equal(def.data.box.whole,1);
    def.switchCheck({currentTarget:{dataset:{field:'nutFree'}},detail:{value:true}});
    def.input({currentTarget:{dataset:{field:'nutPrice'}},detail:{value:'42'}});
    def.selectScope({currentTarget:{dataset:{scope:'today'}}});assert.equal(def.data.metrics.bites,14);assert.equal(def.data.packs[0].remainder,2);assert.equal(def.data.packs[1].whole,0);assert.equal(def.data.box.whole,0);assert.equal(def.data.box.remainder,1);assert.match(def.data.packageSummary,/0.2 袋.*0.05 盒/);
    assert.equal(def.data.nutFree,true);assert.equal(def.data.nutPrice,'42');assert.equal(JSON.stringify(client.stats),snapshot);
    def.selectScope({currentTarget:{dataset:{scope:'total'}}});assert.equal(def.data.metrics.bites,354);assert.match(def.data.packageSummary,/2.1 袋.*1.05 盒/);
  }finally{def.onUnload();}
});

test('website-style tabs and header/account links use valid native page routes and local icons',()=>{
  const root=path.resolve('wechat/miniprogram'),app=JSON.parse(fs.readFileSync(path.join(root,'app.json'))),tabs=app.tabBar.list.map(item=>'/'+item.pagePath);
  assert.deepEqual(app.tabBar.list.map(item=>item.text),['模拟体验','放下练习','记录与成就','使用说明']);
  for(const item of app.tabBar.list){assert(app.pages.includes(item.pagePath));for(const key of ['iconPath','selectedIconPath'])assert(fs.existsSync(path.join(root,item[key])));}
  for(const file of fs.readdirSync(root,{recursive:true}).filter(name=>name.endsWith('.js')&&!name.startsWith('lib'))){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    for(const [,method,route] of source.matchAll(/wx\.(switchTab|navigateTo)\(\{url:'([^']+)'/g)){assert(app.pages.includes(route.slice(1)),file);assert.equal(tabs.includes(route),method==='switchTab',file+' '+route);}
  }
});
