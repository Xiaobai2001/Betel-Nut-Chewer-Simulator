// Small platform adapter shared by offline and real-MySQL client tests.
module.exports=function platform(origin){
  const storage=new Map();
  return {storage,failStorage:false,offline:false,dropAfterCommit:false,calls:[],
    getStorageSync(key){return storage.has(key)?structuredClone(storage.get(key)):'';},
    setStorageSync(key,value){if(this.failStorage)throw Error('full');storage.set(key,structuredClone(value));},
    getAccountInfoSync(){return {miniProgram:{envVersion:'develop'}};},
    request(options){
      this.calls.push(options);if(this.offline){queueMicrotask(()=>options.fail());return;}
      fetch(options.url,{method:options.method,headers:options.header,body:options.data===undefined?undefined:JSON.stringify(options.data)}).then(async response=>{
        const data=await response.json();if(this.dropAfterCommit&&options.url.endsWith('/events-v2')){this.dropAfterCommit=false;options.fail();}else options.success({statusCode:response.status,data});
      }).catch(options.fail);
    }
  };
};
