const fs=require('node:fs');const path=require('node:path');
function enableAdBlocking(session,directory){
  const previous=process.env.ELECTRON_DISABLE_SECURITY_WARNINGS;
  const {ElectronBlocker}=require('@ghostery/adblocker-electron');
  if(previous===undefined)delete process.env.ELECTRON_DISABLE_SECURITY_WARNINGS;else process.env.ELECTRON_DISABLE_SECURITY_WARNINGS=previous;
  const bundled=path.join(__dirname,'../ui/assets/adblock.bin');
  const cached=path.join(directory,'adblock.bin');
  const state={enabled:false,blockedRequests:0,blockedAdRequests:0,source:'bundled'};
  const ready=(async()=>{
    let blocker;
    for(const file of [cached,bundled]){try{blocker=ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(file)));state.source=file===cached?'cached':'bundled';break;}catch{}}
    if(!blocker){blocker=await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);fs.writeFileSync(cached,blocker.serialize());state.source='updated';}
    blocker.on('request-blocked',request=>{state.blockedRequests++;if(/doubleclick|googleads|pagead|\/api\/stats\/ads|adservice/i.test(request.url||''))state.blockedAdRequests++;});
    blocker.enableBlockingInSession(session);state.enabled=true;return blocker;
  })();
  return {ready,state};
}
module.exports={enableAdBlocking};
