const {test}=require('node:test');const assert=require('node:assert/strict');const {reconcilePlayback}=require('../src/playback.cjs');
const song={id:'ZengOKCUBHo',title:'Righteous',artist:'Juice WRLD',duration:229,image:'https://i.ytimg.com/vi/ZengOKCUBHo/hqdefault.jpg'};
test('pre-roll and mid-roll ads preserve song metadata and progress',()=>{
  const before={track:song,position:40,duration:229,status:'playing',playing:true,video:true};
  const ad=reconcilePlayback({ad:true,id:'6h38AY5scSM',title:'Advertisement',artist:'Advertiser',playing:true,position:4,duration:15,ended:false},before);
  assert.equal(ad.track.title,'Righteous');assert.equal(ad.track.id,song.id);assert.equal(ad.duration,229);assert.equal(ad.position,40);assert.equal(ad.status,'advertisement');assert.equal(ad.adDuration,15);
  const resumed=reconcilePlayback({...song,ad:false,position:41,duration:229,ready:4,playing:true,video:true},ad);
  assert.equal(resumed.ad,false);assert.equal(resumed.status,'playing');assert.equal(resumed.position,41);assert.equal(resumed.track.title,'Righteous');
});
test('a naturally advancing YouTube queue updates the song identity',()=>{
  const next=reconcilePlayback({id:'mzB1VGEGcSU',title:'Lucid Dreams',artist:'Juice WRLD',position:1,duration:240,ready:4,playing:true,video:true},{track:song,duration:229});
  assert.equal(next.track.id,'mzB1VGEGcSU');assert.equal(next.duration,240);assert.equal(next.status,'playing');
});
test('selected artwork and clean titles remain stable during same-song player updates',()=>{
  const next=reconcilePlayback({id:song.id,title:'Juice WRLD - Righteous (Official Video)',artist:'JuiceWRLDVEVO',image:'https://i.ytimg.com/vi/ZengOKCUBHo/default.jpg',position:30,duration:228,ready:4,playing:true},{track:song});
  assert.equal(next.track.image,song.image);assert.equal(next.track.title,song.title);assert.equal(next.track.artist,song.artist);assert.equal(next.position,30);
});

// Run the real desktop poll/transport functions, with only Electron's async boundary mocked.
function desktopTransportHarness({executeCommand=()=>Promise.resolve(true)}={}){
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8');
  const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  let releaseObservation;
  const broadcasts=[],commands=[];let observations=0;
  const context={reconcilePlayback,initial:{track:song,position:80,duration:229,status:'playing',playing:true},
    engine:{webContents:{isDestroyed:()=>false,getURL:()=>`https://music.youtube.com/watch?v=${song.id}`,
      executeJavaScript:(script,userGesture)=>userGesture?(commands.push(script),executeCommand()):new Promise(resolve=>{observations++;releaseObservation=resolve;})}},
    store:{remember:()=>{},snapshot:()=>({})},emit:()=>{},log:()=>{},navigateQueue:async()=>{},
    setState:patch=>{context.setSnapshot(patch);broadcasts.push(patch);}};
  vm.runInNewContext(`let state=initial,playSequence=0,transportSequence=0,transportPending=0,pollBusy=false,quitting=false,pendingTrackId=null,queueFinished=false,sourceMode=false,lastEndedSequence=-1;
    ${extract('async function remoteCommand(','async function playTrack(')}
    ${extract('async function poll(){','function applySettings(){')}
    globalThis.api={poll,remoteCommand,getState:()=>state};globalThis.setSnapshot=patch=>{state={...state,...patch};};`,context);
  return {api:context.api,broadcasts,commands,get observations(){return observations;},observe:info=>releaseObservation({...song,ad:false,duration:229,ready:4,playing:true,video:true,ended:false,...info})};
}

test('a seek rejects an older in-flight desktop poll without blocking fresh backward seeks',async()=>{
  const h=desktopTransportHarness();
  const stale=h.api.poll();
  await h.api.remoteCommand('seek',100);
  h.observe({position:79.5});await stale;
  assert.equal(h.broadcasts.length,0,'A poll started before the seek must not publish its old position');
  assert.equal(h.api.getState().position,80);
  const fresh=h.api.poll();h.observe({position:100.4});await fresh;
  assert.equal(h.api.getState().position,100.4);
  await h.api.remoteCommand('seek',25);
  const backward=h.api.poll();h.observe({position:25});await backward;
  assert.equal(h.api.getState().position,25,'A fresh intentional backward seek must still be accepted');
});

test('pause rejects an older playing observation; changing volume preserves a valid poll',async()=>{
  const h=desktopTransportHarness();
  const stale=h.api.poll();await h.api.remoteCommand('pause');h.observe({position:80.5});await stale;
  assert.equal(h.broadcasts.length,0);
  const fresh=h.api.poll();h.observe({position:80.6,playing:false});await fresh;
  assert.equal(h.api.getState().playing,false);
  const unchanged=h.api.poll();await h.api.remoteCommand('volume',30);h.observe({position:80.6,playing:false});await unchanged;
  assert.equal(h.broadcasts.length,2,'Volume does not invalidate the song timeline');
});


test('polling waits for transport completion and recovers after a failed command',async()=>{
  let resolveCommand,rejectCommand;
  const h=desktopTransportHarness({executeCommand:()=>new Promise((resolve,reject)=>{resolveCommand=resolve;rejectCommand=reject;})});
  const pending=h.api.remoteCommand('seek',100);
  await h.api.poll();
  assert.equal(h.observations,0,'No observation is issued while transport is pending');
  assert.equal(h.broadcasts.length,0);
  resolveCommand(true);await pending;
  const fresh=h.api.poll();h.observe({position:100});await fresh;
  assert.equal(h.api.getState().position,100);
  const failed=h.api.remoteCommand('pause');rejectCommand(new Error('Player navigated'));await failed;
  const recovered=h.api.poll();h.observe({position:101});await recovered;
  assert.equal(h.api.getState().position,101,'A rejected command must release polling');
});
