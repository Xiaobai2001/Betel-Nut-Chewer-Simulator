const assert=require('node:assert/strict');
const {Client,today}=require('../wechat/miniprogram/utils/client');
const {digestToken}=require('../server/security.cjs');
module.exports=async function(origin,pool,web){
  const native=async(route,body,token,status=200,headers={})=>{
    const response=await fetch(origin+'/api/native/'+route,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return {data,response};
  };
  const registered=await native('register',{username:'wechat_native',password:'native-test-password'},null,201);
  assert.match(registered.data.token,/^[\w-]{43}$/);assert.equal(registered.response.headers.get('set-cookie'),null);
  const id=registered.data.user.id,token=registered.data.token;
  await native('stats',undefined,null,401,{Cookie:'chew_session='+token});
  await web('stats',undefined,null,401,{Authorization:'Bearer '+token});
  await native('stats',undefined,token,403,{Origin:'https://evil.example'});
  await native('stats',undefined,token,403,{'Sec-Fetch-Site':'same-origin'});
  const platform=require('./wechat-platform.cjs'),wx=platform(),config={apiBase:origin,allowInsecureDevelopment:true},c=new Client(wx,config);
  c.perform('chew'); // Guest history must never be uploaded by login.
  await c.login('login',{username:'wechat_native',password:'native-test-password'});assert.equal(c.user.id,id);assert.equal(c.stats.total.bites,0);
  c.perform('chew');c.perform('spit');c.perform('light');c.perform('inhale');c.perform('exhale');c.perform('extinguish');
  wx.dropAfterCommit=true;assert.equal(await c.flush(),false);assert.equal(c.pendingCount,6);
  await c.refresh();assert.equal(c.pendingCount,0);assert.equal(c.stats.total.bites,1);assert.equal(c.stats.total.cigarettes_lit,1);assert.equal(c.stats.total.puffs,1);
  const browser=await web('login',{username:'wechat_native',password:'native-test-password'});assert.equal(browser.data.user.id,id);
  assert.equal((await web('stats',undefined,browser.cookie)).data.total.bites,1);
  wx.offline=true;c.perform('chew');assert.equal(await c.flush(),false);assert.equal(c.pendingCount,1);wx.offline=false;
  await pool.execute('DELETE FROM chew_sessions WHERE token_hash=?',[digestToken(c.session.token)]);
  assert.equal(await c.flush(),false);assert(c.expired);await c.login('login',{username:'wechat_native',password:'native-test-password'});assert.equal(c.pendingCount,0);assert.equal(c.stats.total.bites,2);
  await c.checkin({day:today(),nutFree:true,smokeFree:true});await c.saveSavings({nutTier:50,nutPriceCents:5000,nutsPerDay:3,smokePriceCents:2000,cigarettesPerDay:10});assert.equal(c.stats.savings.totalCents,2500);
  assert.equal((await web('stats',undefined,browser.cookie)).data.savings.totalCents,2500);
  const currentToken=c.session.token;await c.logout();await native('stats',undefined,currentToken,401);assert.equal(c.stats.total.bites,1);
  // Existing BIGINT users remain distinct in the native client too.
  await c.login('login',{username:'large_a',password:'large-id-test-password'});const largeA=c.user.id;assert.equal(typeof largeA,'string');
  c.perform('chew');wx.offline=true;await assert.rejects(c.logout(),/待同步/);wx.offline=false;
  await assert.rejects(c.login('login',{username:'large_b',password:'large-id-test-password'}),/原账号/);assert.equal(c.user.id,largeA);assert.equal(c.pendingCount,1);
  await c.refresh();await c.logout();await c.login('login',{username:'large_b',password:'large-id-test-password'});assert.notEqual(c.user.id,largeA);assert.equal(c.stats.total.bites,0);await c.logout();
  const [[row]]=await pool.query('SELECT COUNT(*) AS n FROM chew_users WHERE username=?',['wechat_native']);assert.equal(Number(row.n),1);
  console.log('PASS: native bearer/cookie isolation, shared web IDs/stats, real MySQL replay after lost response, expired-session recovery, offline queue ownership, BIGINT IDs and guest separation');
};
