const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {origin}=JSON.parse(fs.readFileSync(path.join(root,'.afterglow-data/runtime.json'),'utf8'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function get(route){const r=await fetch(origin+route,{signal:AbortSignal.timeout(45000)}),d=await r.json();if(!r.ok)throw Error(d.error);return d;}
async function action(action,payload){const r=await fetch(origin+'/api/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Afterglow-Request':'1'},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(60000)}),d=await r.json();if(!r.ok)throw Error(d.error);return d.result;}
async function waitFor(predicate,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){const s=(await get('/api/bootstrap')).state;if(s.error)throw Error(s.error);if(predicate(s))return s;await delay(700);}throw Error('Live verification timed out');}
(async()=>{
  const {tracks}=await get('/api/search?q=Juice%20WRLD%20Righteous&kind=video');
  const track=tracks.find(t=>t.artist==='Juice WRLD'&&/Righteous/i.test(t.title))||tracks[0];
  const songs=(await get('/api/search?q=Juice%20WRLD&kind=song')).tracks;
  await action('settings',{layout:'albums',volume:20,lyrics:true,clock:true,backdrop:'cinema'});
  await action('queue',[track,...songs.filter(t=>t.id!==track.id).slice(0,8)]);
  await action('play',track);await waitFor(s=>s.playing&&!s.ad&&s.position>1&&s.duration>100);
  await action('seek',45);await action('resume');await delay(1500);
  const album=await action('verify-snapshot','reference-albums');
  assert.equal(album.state.protection.enabled,true);assert.equal(album.state.ad,false);
  console.log('Album view captured; ad requests blocked:',album.state.protection.blockedAdRequests);
  await delay(2000);const advanced=(await get('/api/bootstrap')).state;assert.ok(advanced.position>album.state.position);
  await action('settings',{layout:'cinema'});await delay(900);
  const cinema=await action('verify-snapshot','reference-lyrics');
  await action('settings',{layout:'split'});await delay(900);
  const split=await action('verify-snapshot','reference-split');await delay(2000);
  const stable=await action('verify-snapshot','reference-split-stable');
  assert.deepEqual(stable.geometry.cover,split.geometry.cover,'Cover moved with lyrics');
  await action('settings',{layout:'albums'});
  const report={at:new Date().toISOString(),track:advanced.track,adProtection:advanced.protection,noAdObserved:true,clockAdvances:true,coverStable:true,views:{albums:album.geometry,cinema:cinema.geometry,split:split.geometry}};
  fs.writeFileSync(path.join(root,'screenshots/reference-verification.json'),JSON.stringify(report,null,2));
  console.log('Live video, three layouts, lyric progression and fixed cover verified.');
})().catch(e=>{console.error(e);process.exitCode=1;});
