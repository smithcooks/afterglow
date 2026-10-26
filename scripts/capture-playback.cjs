const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
const {origin}=JSON.parse(fs.readFileSync(path.join(root,'.afterglow-data/runtime.json'),'utf8'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function get(route){const response=await fetch(origin+route);const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
async function action(action,payload){const response=await fetch(origin+'/api/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Afterglow-Request':'1'},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(60000)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data.result;}
(async()=>{
  const initial=await get('/api/bootstrap');if(!initial.desktop)throw new Error('The Windows app must be running');
  await action('settings',{volume:25});
  const {tracks}=await get('/api/search?q=Juice%20WRLD%20Bandit&kind=video');const track=tracks.find(t=>/Juice WRLD/i.test(t.artist)&&/Bandit/i.test(t.title))||tracks[0];
  console.log('Playing:',track.title,track.id);await action('queue',[track]);await action('play',track);
  const deadline=Date.now()+150000;let s;
  while(Date.now()<deadline){s=(await get('/api/bootstrap')).state;if(s.playing&&!s.ad&&s.duration>90&&s.position>1)break;if(s.error)throw new Error(s.error);await delay(1000);}
  if(!s?.playing||s.ad||s.duration<90)throw new Error('The song did not start');
  const lyrics=await get('/api/lyrics?'+new URLSearchParams({title:s.track.title,artist:s.track.artist,duration:s.duration}));
  console.log('Playing music video; synced lines:',lyrics.lines.length);
  await action('seek',30);await action('resume');await delay(1400);
  await action('verify-snapshot','playing-full');
  const line=lyrics.lines.find(l=>l.time>32&&l.time<100);const transition=(line?.time||45);
  await action('seek',Math.max(0,transition-.15));await action('resume');
  for(let i=0;i<7;i++){await delay(i===0?80:160);const capture=await action('verify-snapshot','lyric-motion-'+i);console.log('Captured',i,capture.state.position.toFixed(2));}
  console.log('Native playback screenshots saved in',path.join(root,'screenshots'));
})().catch(error=>{console.error(error);process.exitCode=1;});
