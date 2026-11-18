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
console.log(check?'PASS: WeChat shared modules and audio match sources':'Built WeChat shared modules and audio');
