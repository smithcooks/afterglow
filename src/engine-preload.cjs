const {ipcRenderer}=require('electron');
const hooked=new WeakSet();
let observedPlayer=null,treeTimer=null;
const playerObserver=new MutationObserver(guardAds);
// Network filters are the first layer. Suppress an in-stream ad if it gets through.
const adMedia=new Map();
function guardAds(){
  const player=document.querySelector('#movie_player');
  const active=!!(player?.classList.contains('ad-showing')||player?.classList.contains('ad-interrupting'));
  if(!active&&adMedia.size===0)return;
  for(const video of document.querySelectorAll('video')){
    if(active){
      if(!adMedia.has(video)){adMedia.set(video,{muted:video.muted,rate:video.playbackRate});ipcRenderer.send('engine-ad-suppressed');}
      video.muted=true;
      const skip=document.querySelector('.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytp-ad-skip-button');
      if(skip&&!skip.disabled)skip.click();
      if(Number.isFinite(video.duration)&&video.duration>0){try{video.currentTime=Math.max(0,video.duration-.01);}catch{}}
      try{video.playbackRate=16;}catch{}
    }else if(adMedia.has(video)){
      const original=adMedia.get(video);video.muted=original.muted;video.playbackRate=original.rate;adMedia.delete(video);
    }
  }
  for(const video of adMedia.keys())if(!video.isConnected)adMedia.delete(video);
}
function connect(){
  const player=document.querySelector('#movie_player');
  if(player!==observedPlayer){playerObserver.disconnect();observedPlayer=player;if(player)playerObserver.observe(player,{attributes:true,attributeFilter:['class']});}
  for(const video of document.querySelectorAll('video')){
    for(let ancestor=video.parentElement;ancestor&&ancestor!==document.body;ancestor=ancestor.parentElement)if(!ancestor.hasAttribute('data-afterglow-video-parent'))ancestor.setAttribute('data-afterglow-video-parent','');
    if(hooked.has(video))continue;hooked.add(video);
    video.addEventListener('volumechange',guardAds);
    video.addEventListener('ended',()=>{const player=document.querySelector('#movie_player');if(adMedia.has(video)||player?.classList.contains('ad-showing')||player?.classList.contains('ad-interrupting'))return;ipcRenderer.send('engine-ended',{id:new URL(location.href).searchParams.get('v')||''});});
  }
}
window.addEventListener('DOMContentLoaded',()=>{connect();guardAds();new MutationObserver(()=>{if(treeTimer!==null)return;treeTimer=setTimeout(()=>{treeTimer=null;connect();guardAds();},100);}).observe(document.documentElement,{childList:true,subtree:true});setInterval(guardAds,150);},{once:true});
