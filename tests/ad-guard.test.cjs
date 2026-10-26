const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
  let ad=false,skipped=0;const video={muted:false,playbackRate:1.25,duration:30,currentTime:7,isConnected:true};
  const player={classList:{contains:name=>ad&&name==='ad-showing'}};
  const context=vm.createContext({require:()=>({ipcRenderer:{send(){}}}),window:{addEventListener(){}},document:{querySelector:s=>s==='#movie_player'?player:{disabled:false,click(){skipped++;}},querySelectorAll:()=>[video]},setInterval(){},MutationObserver:class{}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/engine-preload.cjs'),'utf8'),context);
  return {video,setAd:value=>ad=value,run:()=>vm.runInContext('guardAds()',context),skipped:()=>skipped};
}
test('leaked ads are muted and skipped; user playback rate and mute restore for the song',()=>{
  const s=setup();s.setAd(true);s.run();assert.equal(s.video.muted,true);assert.equal(s.video.playbackRate,16);assert.ok(s.video.currentTime>29);assert.equal(s.skipped(),1);
  s.run();s.setAd(false);s.run();assert.equal(s.video.muted,false);assert.equal(s.video.playbackRate,1.25);
});
test('ordinary songs are untouched and an originally muted player remains muted',()=>{
  const s=setup();s.run();assert.equal(s.video.currentTime,7);assert.equal(s.video.playbackRate,1.25);assert.equal(s.skipped(),0);
  s.video.muted=true;s.setAd(true);s.run();s.setAd(false);s.run();assert.equal(s.video.muted,true);
});
