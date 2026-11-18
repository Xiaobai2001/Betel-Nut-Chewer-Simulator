// Visual adapter for compiled WXML and the exact Canvas renderer in Chromium.
// This checks layout/renderer only; it is not a WeChat device/runtime substitute.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
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
 try{
  for(const width of [360,390])for(const name of ['index','immersive','progress','account','guide']){
    const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const pageName=name==='immersive'?'index':name,compiled=JSON.parse(fs.readFileSync(path.join(output,name+'.json')));
    let css=fs.readFileSync(path.join(root,'app.wxss'),'utf8')+'\n'+fs.readFileSync(path.join(root,'pages',pageName,'index.wxss'),'utf8');
    css=css.replace(/\bpage\b/g,'body').replace(/(?<![.#\w-])view(?=[\s,:.>\[{])/g,'div').replace(/(?<![.#\w-])text(?=[\s,:.>\[{])/g,'span').replace(/([\d.]+)rpx/g,(_,n)=>Number(n)*width/750+'px');
    await page.setContent('<meta charset="utf-8"><style>body{margin:0}div,span,button,input,main{box-sizing:border-box}button{display:block;width:100%;border:0}input{width:100%}input[type=checkbox]{width:35px}canvas{display:block}slider,.range-adapter{width:40%;flex:1}'+css+'</style>'+html(compiled.tree));
    if(pageName==='index'){
      await page.addScriptTag({content:fs.readFileSync(path.join(root,'lib/model.js'),'utf8')});
      await page.addScriptTag({content:'var module={exports:{}};'+fs.readFileSync(path.join(root,'utils/scene.js'),'utf8')+';window.NativeScene=module.exports;'});
      await page.evaluate(()=>{const canvas=document.querySelector('canvas'),bounds=canvas.getBoundingClientRect();canvas.requestAnimationFrame=requestAnimationFrame.bind(window);canvas.cancelAnimationFrame=cancelAnimationFrame.bind(window);window.model=new Simulator();window.scene=new NativeScene(canvas,bounds.width,bounds.height,1,model);scene.start();});
      await page.waitForTimeout(120);await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});
      await page.evaluate(()=>{for(let i=0;i<15;i++)model.chew();scene.yaw+=.7;model.light();model.inhale();scene.exhale();scene.spit(false,model.nut);});
      await page.waitForTimeout(130);assert.equal(await page.evaluate(()=>model.nut.wear),100);
      await page.screenshot({path:path.join(output,name+'-worn-'+width+'.png'),fullPage:true});
      if(name==='immersive')assert(await page.locator('.health-note').evaluate(el=>el.getBoundingClientRect().bottom)<=844,'Immersive bottom controls overflow');
    }else await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth)<=width,name+' horizontal overflow');assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: compiled WXML visual adapter at 360/390 px, immersive bottom controls, Canvas render/rotation/wear/smoke/spit without JS errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
