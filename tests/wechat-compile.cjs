// Run with WECHAT_COMPILER_DIR pointing to Developer Tools' wcc-exec directory.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const compiler=process.env.WECHAT_COMPILER_DIR;
if(!compiler)throw Error('Set WECHAT_COMPILER_DIR to the installed wcc-exec directory.');
const root=path.resolve('wechat/miniprogram'),build=path.resolve('.build/wechat-validation');fs.mkdirSync(build,{recursive:true});
const pages=JSON.parse(fs.readFileSync(path.join(root,'app.json'))).pages;
for(const [exe,files,dest] of [['wcc',pages.map(p=>p+'.wxml'),'wxml.js'],['wcsc',['app.wxss',...pages.map(p=>p+'.wxss')],'wxss.js']]){
  const result=spawnSync(path.join(compiler,exe+(process.platform==='win32'?'.exe':'')),['-o',path.join(build,dest),...files],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||String(result.error));assert(fs.statSync(path.join(build,dest)).size>0);
}
const errors=[],context={window:{},console:{log:message=>errors.push(String(message)),warn:message=>errors.push(String(message))}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(build,'wxml.js'),'utf8'),context);
const {Client}=require('../wechat/miniprogram/utils/client'),client=new Client(require('./wechat-platform.cjs')(),{});
global.getApp=()=>({client});global.wx={getWindowInfo:()=>({windowWidth:390,windowHeight:760,pixelRatio:2,statusBarHeight:24})};
for(const p of pages){
  let definition;global.Page=value=>definition=value;require(path.join(root,p+'.js'));definition.data=structuredClone(definition.data);definition.setData=function(value){Object.assign(this.data,value);};definition.onLoad?.();
  const render=context.$gwx(p+'.wxml');assert.equal(typeof render,'function');
  function check(node){if(!node||typeof node!=='object')return;for(const [key,value] of Object.entries(node.attr||{})){if(/^bind|^catch/.test(key))assert.equal(typeof definition[value],'function',p+' handler '+value);}for(const child of node.children||[])check(child);}
  const tree=render(definition.data,{});assert(tree.children.length);check(tree);fs.writeFileSync(path.join(build,p.split('/')[1]+'.json'),JSON.stringify({data:definition.data,tree}));
  if(p.includes('/index/')){definition.data.full=true;const full=render(definition.data,{});fs.writeFileSync(path.join(build,'immersive.json'),JSON.stringify({data:definition.data,tree:full}));}
  if(p.includes('/progress/')){assert(JSON.stringify(tree).includes('未设置')||JSON.stringify(tree).includes('填写以前'));assert(!JSON.stringify(tree).includes('NaN'));}
  definition.unsubscribe?.();
}
assert.deepEqual(errors,[]);delete global.Page;delete global.wx;delete global.getApp;
console.log('PASS: official WXML/WXSS compilers and all four compiled page templates, bindings and guest data rendering');
