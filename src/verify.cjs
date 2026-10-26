// Read-only diagnostics for the local development verifier. Never enabled in normal launches.
function inspectVideo(){
  const video=document.querySelector('video');
  const bounds=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const ancestors=[];
  for(let element=video;element;element=element.parentElement){
    const style=getComputedStyle(element),css={};
    for(const key of ['position','display','transform','translate','rotate','scale','contain','contentVisibility','containerType','filter','backdropFilter','perspective','willChange','zoom','inset','margin','padding','border','overflow','visibility'])css[key]=style[key];
    ancestors.push({tag:element.tagName,id:element.id,className:String(element.className).slice(0,220),bounds:bounds(element),css});
  }
  return {viewport:{width:innerWidth,height:innerHeight},video:video?bounds(video):null,ancestors};
}
function inspectUI(){
  const rect=selector=>{const element=document.querySelector(selector);if(!element)return null;const r=element.getBoundingClientRect(),style=getComputedStyle(element);return {x:r.x,y:r.y,width:r.width,height:r.height,visible:!!(r.width&&r.height)&&!element.hidden&&style.visibility!=='hidden',fontSize:style.fontSize,transform:style.transform,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth};};
  return {viewport:{width:innerWidth,height:innerHeight},layout:document.body.dataset.layout,fonts:document.fonts.status,clock:rect('#clock-block'),cover:rect('.album-card'),lyrics:rect('#lyrics-panel'),dock:rect('#player-dock'),rail:rect('#desktop-rail'),search:rect('#gallery-search'),library:rect('#library-panel'),panels:[...document.querySelectorAll('.glass-panel')].filter(e=>e.getClientRects().length&&(!e.matches('dialog')||e.open)).map(e=>e.id),controls:[...document.querySelectorAll('#player-dock button')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,...rect('#'+e.id)}))};
}
function sampleMotion(){
  return new Promise(resolve=>{
    const start=performance.now(),intervals=[],phrases=[];let last=null,lastSample=0,done=false;
    const cover=()=>{const r=document.querySelector('#album-card')?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
    const before=cover();
    const finish=()=>{if(done)return;done=true;const sorted=[...intervals].sort((a,b)=>a-b);resolve({durationMs:performance.now()-start,frames:intervals.length,p95FrameMs:sorted[Math.floor(sorted.length*.95)]||null,longFrames:intervals.filter(t=>t>50).length,maxFrameMs:sorted.at(-1)||null,phrases,coverBefore:before,coverAfter:cover(),visibility:document.visibilityState,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});};
    const timeout=setTimeout(finish,6500);
    const frame=t=>{if(done)return;if(last!==null)intervals.push(t-last);last=t;if(t-lastSample>200){lastSample=t;const node=document.querySelector('.lyric-line.active');const line=node?.dataset.line;if(line&&phrases.at(-1)?.line!==line)phrases.push({line,atMs:t-start,animatedWords:node.querySelectorAll('.lyric-word').length});}if(t-start>=5000){clearTimeout(timeout);finish();}else requestAnimationFrame(frame);};
    requestAnimationFrame(frame);
  });
}
module.exports={inspectVideo,inspectUI,sampleMotion};
