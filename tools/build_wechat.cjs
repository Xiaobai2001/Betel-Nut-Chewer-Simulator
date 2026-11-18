// Generate shared logic and deterministic PCM assets; no npm build is needed to import.
const fs=require('node:fs'),path=require('node:path');
const {synthesize,durations}=require('../app/sound.js');
const root=path.resolve(__dirname,'..'),target=path.join(root,'wechat/miniprogram');
const check=process.argv.includes('--check');
function write(name,content){const file=path.join(target,name),bytes=Buffer.isBuffer(content)?content:Buffer.from(content);if(check){if(!fs.existsSync(file)||!fs.readFileSync(file).equals(bytes))throw Error('Stale native asset: '+name);}else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}}
for(const [from,to] of [['app/model.js','lib/model.js'],['server/progress.cjs','lib/progress.js'],['server/savings.cjs','lib/savings.js'],['app/assets/icon.png','assets/icon.png']]){
  write(to,fs.readFileSync(path.join(root,from)));
}
for(const kind of Object.keys(durations)){
  const rate=22050,samples=synthesize(kind,rate),wav=Buffer.alloc(44+samples.length*2);
  wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);
  samples.forEach((value,index)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),44+index*2));write('assets/audio/'+kind+'.wav',wav);
}
// Reuse the website scene verbatim through an injected platform boundary.
// Only the import/export shell changes; all geometry, textures, wear and particles
// remain owned by src/immersive-scene.js.
const source=fs.readFileSync(path.join(root,'src/immersive-scene.js'),'utf8').replace(/\r\n/g,'\n');
if(!source.startsWith("import * as THREE from 'three';")||!source.includes('window.ImmersiveScene = ImmersiveScene;'))throw Error('Website scene entry changed; review native adapter');
const body=source.replace("import * as THREE from 'three';",'').replace('window.ImmersiveScene = ImmersiveScene;','return ImmersiveScene;');
write('lib/web-scene.js',"// Generated from src/immersive-scene.js. Do not edit.\nmodule.exports=function(THREE,platform){\nconst document={createElement:platform.createCanvas};\nconst performance={now:platform.now};\nconst devicePixelRatio=platform.pixelRatio;\nconst matchMedia=()=>({matches:platform.reduced});\n"+body+'\n};\n');
const visuals=fs.readFileSync(path.join(root,'app/visuals.js'),'utf8').replace(/\r\n/g,'\n');
const helpers=visuals.slice(visuals.indexOf('  const TAU'),visuals.indexOf('  class Visuals'));
const nut=visuals.slice(visuals.indexOf('    nut(ctx'),visuals.indexOf('    mouth(ctx')).trim();
if(!helpers||!nut.startsWith('nut(ctx'))throw Error('Website flat renderer changed; review native export');
write('lib/web-nut.js','// Generated from app/visuals.js; same website artwork.\n'+helpers+'\nmodule.exports=function '+nut+';\n');
const flatBody=visuals.slice(visuals.indexOf('  const TAU'),visuals.indexOf('  window.SimulatorVisuals'));
if(!flatBody.includes('drawMain(now)')||!flatBody.includes('drawSmoke(now)'))throw Error('Website 2D scene changed; review native export');
write('lib/web-visuals.js','// Generated from app/visuals.js: the complete 2D mouth, tray and smoking scene.\nmodule.exports=function(platform){\nconst window={devicePixelRatio:platform.pixelRatio};\nconst performance={now:platform.now};\nconst matchMedia=()=>({matches:platform.reduced});\n'+flatBody+'\nreturn Visuals;\n};\n');
write('lib/three-mini.js',fs.readFileSync(path.join(root,'node_modules/threejs-miniprogram/dist/index.js')));
write('lib/THREE-MINI-LICENSE.txt',fs.readFileSync(path.join(root,'node_modules/threejs-miniprogram/LICENSE')));
// The bundled adapter embeds Three.js r108, whose license is retained separately.
write('lib/THREE-LICENSE.txt',fs.readFileSync(path.join(root,'node_modules/three/LICENSE')));
console.log(check?'PASS: WeChat shared modules and audio match sources':'Built WeChat shared modules and audio');
