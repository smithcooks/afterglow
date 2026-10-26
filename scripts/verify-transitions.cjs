const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {origin}=JSON.parse(fs.readFileSync(path.join(root,'.afterglow-data/runtime.json'),'utf8'));
const report={at:new Date().toISOString(),transitions:[],complete:false};
const save=()=>fs.writeFileSync(path.join(root,'screenshots/transition-verification.json'),JSON.stringify(report,null,2));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(route,body){const response=await fetch(origin+route,{method:body?'POST':'GET',headers:body?{Origin:origin,'X-Afterglow-Request':'1','Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});const data=await response.json();if(!response.ok)throw Error(data.error);return data;}
const action=(action,payload)=>request('/api/action',{action,payload});
async function check(track){
  await action('play',track);
  const deadline=Date.now()+60000;let state;
  while(Date.now()<deadline){state=(await request('/api/bootstrap')).state;if(state.error)throw Error(state.error);if(state.track?.id===track.id&&state.playing&&!state.ad&&state.position>1)break;await delay(750);}
  assert.equal(state.track?.id,track.id,'Playback identity differs from requested song');
  assert.ok(state.playing&&!state.ad&&state.position>1,'Requested song did not start');
  for(let sample=0;sample<2;sample++){
    const {result}=await action('verify-inspect');const {video,viewport}=result.engine;
    assert.ok(video,'Video element missing');
    assert.ok(Math.abs(video.x)<1&&Math.abs(video.y)<1,'Video shifted off screen: '+JSON.stringify(video));
    assert.ok(Math.abs(video.width-viewport.width)<1&&Math.abs(video.height-viewport.height)<1,'Video does not fill viewport');
    assert.equal(result.state.protection.enabled,true);
    report.transitions.push({track:track.title,id:track.id,sample,position:result.state.position,video,viewport,protection:result.state.protection});save();
    if(sample===0)await delay(3000);
  }
  console.log('Verified requested song and full-window video:',track.title);
}
(async()=>{
  const tracks=[];
  for(const title of ['Righteous','Bandit']){const found=await request('/api/search?q='+encodeURIComponent('Juice WRLD '+title)+'&kind=video');const track=found.tracks.find(t=>/^Juice WRLD(?:,|$)/.test(t.artist)&&t.title.toLowerCase().includes(title.toLowerCase()));assert.ok(track,'Reference song not found');tracks.push(track);}
  await action('queue',tracks);await action('settings',{volume:20,layout:'albums'});
  for(const track of [tracks[0],tracks[1],tracks[0]])await check(track);
  report.complete=true;save();
})().catch(error=>{report.error=error.message;save();console.error(error);process.exitCode=1;});
