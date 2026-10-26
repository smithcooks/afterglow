const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const {origin}=JSON.parse(fs.readFileSync(path.join(root,'.afterglow-data/runtime.json'),'utf8'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function get(route){const response=await fetch(origin+route,{signal:AbortSignal.timeout(45000)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
async function action(action,payload){const response=await fetch(origin+'/api/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Afterglow-Request':'1'},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(60000)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
async function waitFor(predicate,timeout=45000){const start=Date.now();while(Date.now()-start<timeout){const data=await get('/api/bootstrap');if(predicate(data.state))return data.state;if(data.state.error)throw new Error(data.state.error);await delay(1000);}throw new Error('Playback verification timed out');}
(async()=>{
  const initial=await get('/api/bootstrap');assert.equal(initial.desktop,true);console.log('Native app service: ready');
  const results=await get('/api/search?q=Juice%20WRLD%20Righteous&kind=video');assert.ok(results.tracks.length);const track=results.tracks.find(t=>t.artist==='Juice WRLD')||results.tracks[0];console.log('Live video search:',track.title,track.id);
  const report={date:new Date().toISOString(),native:true,search:true,track};
  try{await action('verify-snapshot','player-idle');report.nativeScreenshot=true;}catch{}
  await action('settings',{volume:20});await action('queue',[track]);
  console.log('Starting YouTube Music playback…');await action('play',track);
  const playing=await waitFor(s=>s.status==='playing'&&!s.ad&&s.playing&&s.position>1&&s.duration>100,150000);console.log('Song playback:',playing.status,playing.position.toFixed(1),'seconds, video:',playing.video);assert.ok(/righteous/i.test(playing.track.title));report.playback=true;report.video=playing.video;
  await delay(2000);const advanced=(await get('/api/bootstrap')).state;assert.ok(advanced.position>playing.position);report.clockAdvances=true;
  await action('toggle');const paused=await waitFor(s=>!s.playing&&s.status==='paused');await delay(1400);const pausedAgain=(await get('/api/bootstrap')).state;assert.ok(Math.abs(paused.position-pausedAgain.position)<.5);report.pause=true;console.log('Pause: stable');
  await action('seek',45);await waitFor(s=>Math.abs(s.position-45)<2);await delay(1200);assert.equal((await get('/api/bootstrap')).state.playing,false);report.seek=true;console.log('Seek: 45 seconds; pause preserved');
  await action('resume');await waitFor(s=>s.playing&&s.position>45.3);report.resume=true;await action('pause');await waitFor(s=>!s.playing);console.log('Resume and pause: passed');
  try{await action('verify-snapshot','player-verified');report.nativeScreenshot=true;}catch{}
  const lyrics=await get('/api/lyrics?'+new URLSearchParams({title:track.title,artist:track.artist,duration:track.duration}));report.syncedLyrics=lyrics.lines.length;console.log('Synced lyric lines:',lyrics.lines.length);
  await action('settings',{volume:initial.library.settings.volume});
  fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(report,null,2));console.log('Live verification passed. Playback is paused.');
})().catch(error=>{console.error(error);process.exitCode=1;});
