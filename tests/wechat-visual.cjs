// Visual adapter for compiled WXML and the exact Canvas renderer in Chromium.
// This checks layout/renderer only; it is not a WeChat device/runtime substitute.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve('wechat/miniprogram'),output=path.resolve('.build/wechat-validation');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tagMap={view:'div',text:'span',image:'img',canvas:'canvas',picker:'div','scroll-view':'div','page':'main',virtual:'section'};
function html(node){
  if(typeof node!=='object')return escape(node);if(node.tag==='virtual')return(node.children||[]).map(html).join('');
  const type=node.tag.replace(/^wx-/,''),tag=tagMap[type]||type;
  const attrs=Object.entries(node.attr||{}).filter(([key])=>['class','id','style','src','disabled','placeholder','value','type'].includes(key)).map(([key,value])=>{
    if(key==='src'&&String(value).startsWith('/assets'))value='data:image/png;base64,'+fs.readFileSync(path.join(root,value)).toString('base64');
    if(key==='disabled')return value?'disabled':'';return key+'="'+escape(value)+'"';
  }).join(' ');
  if(type==='switch')return '<input type="checkbox" '+(node.attr.checked?'checked':'')+'>';
  if(type==='slider')return '<input class="range-adapter" type="range">';
  return '<'+tag+' '+attrs+'>'+((node.children||[]).map(html).join(''))+'</'+tag+'>';
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const template={window:{},console};vm.createContext(template);vm.runInContext(fs.readFileSync(path.join(output,'wxml.js'),'utf8'),template);
 try{
  for(const width of [320,360,390])for(const name of ['index','immersive','progress','account','guide']){
    // Usable window heights exclude the native navigation/tab bars, not device pixels.
    const height=name==='index'?{320:430,360:560,390:670}[width]:name==='immersive'?{320:479,360:609,390:753}[width]:740;
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const pageName=name==='immersive'?'index':name,compiled=JSON.parse(fs.readFileSync(path.join(output,name+'.json')));
    Object.assign(compiled.data,{pageWidth:width,viewportHeight:height,compact:height<560,bottomInset:name==='immersive'&&width===390?34:0});
    compiled.tree=template.$gwx('pages/'+pageName+'/index.wxml')(compiled.data,{});
    let css=fs.readFileSync(path.join(root,'app.wxss'),'utf8')+'\n'+fs.readFileSync(path.join(root,'pages',pageName,'index.wxss'),'utf8');
    css=css.replace(/\bpage\b/g,'body').replace(/(?<![.#\w-])view(?=[\s,:.>\[{])/g,'div').replace(/(?<![.#\w-])text(?=[\s,:.>\[{])/g,'span').replace(/([\d.]+)rpx/g,(_,n)=>Number(n)*width/750+'px');
    await page.setContent('<meta charset="utf-8"><style>body{margin:0}div,span,button,input,main{box-sizing:border-box}button{display:block;border:0}button:not([size=mini]){width:184px}input{width:100%}input[type=checkbox]{width:35px}canvas{display:block}slider,.range-adapter{width:40%;flex:1}'+css+'</style>'+html(compiled.tree));
    if(pageName==='index'){
      await page.addScriptTag({content:fs.readFileSync(path.join(root,'lib/model.js'),'utf8')});
      if(name==='index'){
        await page.addScriptTag({content:'var module={exports:{}};'+fs.readFileSync(path.join(root,'lib/web-visuals.js'),'utf8')+';window.FlatCore=module.exports;'});
        await page.addScriptTag({content:'var module={exports:{}};var require=()=>FlatCore;'+fs.readFileSync(path.join(root,'utils/flat-scene.js'),'utf8')+';window.NativeScene=module.exports;'});
        await page.evaluate(()=>{const item=id=>{const node=document.getElementById(id),bounds=node.getBoundingClientRect();node.requestAnimationFrame=requestAnimationFrame.bind(window);node.cancelAnimationFrame=cancelAnimationFrame.bind(window);return {node,width:bounds.width,height:bounds.height};};window.model=new Simulator();window.scene=new NativeScene(item('home-canvas'),item('smoke-preview'),model,1,false);window.mouthFrames=0;const mouth=scene.mouth;scene.mouth=function(...args){mouthFrames++;return mouth.apply(this,args);};scene.start();});
      }else{
      await page.addScriptTag({content:'var exports={};'+fs.readFileSync(path.join(root,'lib/three-mini.js'),'utf8')+';window.MiniThree=exports;'});
      await page.addScriptTag({content:'var module={exports:{}};'+fs.readFileSync(path.join(root,'lib/web-scene.js'),'utf8')+';window.WebCore=module.exports;'});
      await page.addScriptTag({content:'var module={exports:{}};var require=name=>name.includes("three-mini")?MiniThree:WebCore;'+fs.readFileSync(path.join(root,'utils/webgl-scene.js'),'utf8')+';window.NativeScene=module.exports;'});
      await page.evaluate(()=>{const canvas=document.querySelector('canvas'),bounds=canvas.getBoundingClientRect();canvas.createImage=()=>new Image();window.wx={createOffscreenCanvas:()=>document.createElement('canvas')};canvas.requestAnimationFrame=requestAnimationFrame.bind(window);canvas.cancelAnimationFrame=cancelAnimationFrame.bind(window);window.model=new Simulator();window.scene=new NativeScene(canvas,bounds.width,bounds.height,1,model);scene.start();});
      }
      await page.waitForTimeout(200);
      if(name==='immersive')assert.match(await page.evaluate(()=>{const gl=scene.renderer.getContext();return gl.getParameter(gl.VERSION);}),/WebGL/);
      else{assert(await page.evaluate(()=>mouthFrames>0));assert.equal(await page.evaluate(()=>document.querySelector('canvas').getContext('webgl')),null);}
      await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});
      const initial=await page.locator('canvas').first().evaluate(canvas=>canvas.toDataURL());
      await page.evaluate(()=>{for(let i=0;i<15;i++)model.chew();model.light();model.inhale();scene.inhale?.();model.exhale();scene.exhale();scene.spit(false,model.nut);if(scene.touchStart){scene.yaw+=.7;const b=scene.smokeBounds;scene.touchStart(b.x+b.width/2,b.y+b.height/2);scene.touchMove(b.x+b.width/2+10,b.y+b.height/2-10);scene.touchEnd();}});
      await page.waitForTimeout(130);assert.equal(await page.evaluate(()=>model.nut.wear),100);
      if(name==='index')assert.notEqual(await page.locator('canvas').first().evaluate(canvas=>canvas.toDataURL()),initial,'2D wear/particles must visibly change');
      await page.screenshot({path:path.join(output,name+'-worn-'+width+'.png'),fullPage:true});
      const outside=await page.locator('.experience button,.scene-canvas,.bottom-row,.pack-card').evaluateAll((items,h)=>items.filter(el=>{const r=el.getBoundingClientRect();return r.top<0||r.bottom>h+1;}).map(el=>el.id||el.className),height);
      assert.deepEqual(outside,[],name+' '+width+' vertical overflow');
      assert(await page.locator('.experience').evaluate(el=>el.scrollHeight<=el.clientHeight+1),name+' needs scrolling');
      assert(await page.locator('.scene-canvas').evaluate(el=>el.clientHeight)>=105,'canvas is too small');
      await page.evaluate(()=>scene.destroy());
    }else await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth)<=width,name+' horizontal overflow');
    const clipped=await page.locator('button').evaluateAll((buttons,w)=>buttons.filter(button=>{const r=button.getBoundingClientRect();return r.height>0&&(r.left < -1 || r.right > w+1 || r.width<30);}).map(button=>button.textContent),width);
    assert.deepEqual(clipped,[],name+' clipped native buttons');
    if(pageName==='index'){assert.equal(await page.locator('.account-pill').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'visitor badge wrapped/clipped');}
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: compiled WXML at 320/360/390 px; 2D home mouth/tray/smoke, full-only WebGL, wear/rotation/drag/spit; all primary/pack controls within usable portrait height without scrolling');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
