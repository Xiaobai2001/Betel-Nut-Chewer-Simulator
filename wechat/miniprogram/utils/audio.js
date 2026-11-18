class Sounds {
  constructor(){this.nodes=[];}
  play(kind,enabled){
    if(!enabled)return;
    if(this.nodes.length>=3){const old=this.nodes.shift();old.stop();old.destroy();}
    const audio=wx.createInnerAudioContext();audio.src='/assets/audio/'+kind+'.wav';audio.volume=.7;audio.obeyMuteSwitch=true;
    this.nodes.push(audio);
    const release=()=>{const index=this.nodes.indexOf(audio);if(index>=0){this.nodes.splice(index,1);audio.destroy();}};
    audio.onEnded(release);audio.onError(release);audio.play();
  }
  stop(){const nodes=this.nodes.splice(0);nodes.forEach(audio=>{audio.stop();audio.destroy();});}
}
module.exports=Sounds;
